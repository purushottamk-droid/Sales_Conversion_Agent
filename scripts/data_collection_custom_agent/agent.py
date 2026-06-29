import asyncio
import json
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.adk.runners import InMemoryRunner
from google.cloud import bigquery

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
GCP_PROJECT_ID = "atgeir-moae-dev"
DATASET_ID     = "Agentic_AI_Demo"

TABLE_EVERSTAGE  = f"{GCP_PROJECT_ID}.{DATASET_ID}.Everstage_Data"
TABLE_SALESFORCE = f"{GCP_PROJECT_ID}.{DATASET_ID}.Salesforce_Sales_Recipe_Data"
TABLE_GONG       = f"{GCP_PROJECT_ID}.{DATASET_ID}.Gong_Calls_Data"


# ─────────────────────────────────────────────
# SYNC FETCH FUNCTIONS
# ─────────────────────────────────────────────

def _fetch_everstage_sync(sales_rep_id: str) -> dict:
    """
    Fetch rep quota metrics from Everstage.
    Columns: REVENUE_TYPE, REP_EMAIL, REP_NAME,
             RAMPED_CAPACITY, TARGET, QUOTA_PERIOD
    Joined via REP_EMAIL using SALES_REP_EMAIL from Gong.
    → Feeds rep_quota_metrics state key (for Agent 3 - Rep Assessment)
    """
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            e.REVENUE_TYPE,
            e.REP_EMAIL,
            e.REP_NAME,
            e.RAMPED_CAPACITY,
            e.TARGET,
            e.QUOTA_PERIOD
        FROM `{TABLE_EVERSTAGE}` e
        WHERE e.REP_EMAIL = (
            SELECT SALES_REP_EMAIL
            FROM `{TABLE_GONG}`
            WHERE PRIMARY_USER_ID = @sales_rep_id
            LIMIT 1
        )
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("sales_rep_id", "STRING", sales_rep_id)
        ]
    )
    results = client.query(query, job_config=job_config).result()
    rows = [dict(row) for row in results]
    return {
        "sales_rep_id": sales_rep_id,
        "rep_name":     rows[0]["REP_NAME"]  if rows else None,
        "rep_email":    rows[0]["REP_EMAIL"] if rows else None,
        "quota_data":   rows
    }


def _fetch_salesforce_sync(sales_rep_id: str) -> list[dict]:
    """
    Fetch all opportunity columns from Salesforce.
    → Feeds account_details state key (for Agent 2 - Account Analysis)
    """
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            `Opportunity ID`            AS opportunity_id,
            `Opportunity Name`          AS opportunity_name,
            `Account ID`                AS account_id,
            `Account Name`              AS account_name,
            `Opportunity Stage`         AS opportunity_stage,
            `Opportunity Close Date`    AS close_date,
            `Opportunity Risks`         AS risks,
            `Opportunity Next Step`     AS next_step,
            `Opportunity Deal Size`     AS deal_size,
            `Opportunity Type`          AS opportunity_type,
            `Opportunity Source`        AS opportunity_source,
            `Sales Rep Name`            AS sales_rep_name,
            `Opportunity Owner ID`      AS opportunity_owner_id
        FROM `{TABLE_SALESFORCE}`
        WHERE `Opportunity Owner ID` = @sales_rep_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("sales_rep_id", "STRING", sales_rep_id)
        ]
    )
    results = client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]


def _fetch_gong_sync(sales_rep_id: str) -> list[dict]:
    """
    Fetch specific call columns from Gong (as per mentor's spec).
    Columns: ID, CUSTOM_DATA, TITLE, PURPOSE, SCHEDULED,
             COMPANY_QUESTION_COUNT, BRIEF, CALL_OUTCOME_CATEGORY,
             CALL_OUTCOME_NAME, MEETING_STAGE_CONTEXT,
             CUSTOMER_SENTIMENT, PRIMARY_OBJECTION,
             NEXT_STEP, KEY_MEETING_DISCUSSIONS
    → Feeds account_details state key (for Agent 2 - Account Analysis)
    """
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            ID,
            CUSTOM_DATA,
            TITLE,
            PURPOSE,
            SCHEDULED,
            COMPANY_QUESTION_COUNT,
            BRIEF,
            CALL_OUTCOME_CATEGORY,
            CALL_OUTCOME_NAME,
            MEETING_STAGE_CONTEXT,
            CUSTOMER_SENTIMENT,
            PRIMARY_OBJECTION,
            NEXT_STEP,
            KEY_MEETING_DISCUSSIONS,
            ACCOUNT_ID,
            ACCOUNT_NAME,
            OPPORTUNITY_ID
        FROM `{TABLE_GONG}`
        WHERE PRIMARY_USER_ID = @sales_rep_id
        ORDER BY SCHEDULED DESC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("sales_rep_id", "STRING", sales_rep_id)
        ]
    )
    results = client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]


# ─────────────────────────────────────────────
# ASYNC WRAPPERS
# ─────────────────────────────────────────────

async def fetch_everstage(sales_rep_id: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_everstage_sync, sales_rep_id)

async def fetch_salesforce(sales_rep_id: str) -> list[dict]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_salesforce_sync, sales_rep_id)

async def fetch_gong(sales_rep_id: str) -> list[dict]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_gong_sync, sales_rep_id)


# ─────────────────────────────────────────────
# BUILD STATE KEY 1 — rep_quota_metrics
# ─────────────────────────────────────────────

def build_rep_quota_metrics(everstage: dict) -> dict:
    """
    Consumed by: Rep Assessment Agent (Agent 3) — cross-account reasoning.

    Structure:
    {
        sales_rep_id,
        rep_name,
        rep_email,
        quota_data: [ { REVENUE_TYPE, REP_EMAIL, REP_NAME,
                        RAMPED_CAPACITY, TARGET, QUOTA_PERIOD } ]
    }
    """
    return {
        "sales_rep_id": everstage.get("sales_rep_id"),
        "rep_name":     everstage.get("rep_name"),
        "rep_email":    everstage.get("rep_email"),
        "quota_data":   everstage.get("quota_data", [])
    }


# ─────────────────────────────────────────────
# BUILD STATE KEY 2 — account_details
# ─────────────────────────────────────────────

def build_account_details(salesforce: list[dict], gong: list[dict]) -> list[dict]:
    """
    Consumed by: Account Analysis Agent (Agent 2) — per-account LLM reasoning.

    Structure:
    [
        {
            account_id,
            account_name,
            opportunities: [ ...all salesforce columns... ],
            calls:         [ ...selected gong columns... ]
        }
    ]
    """
    # Group Gong calls by account_id
    calls_by_account: dict[str, list] = {}
    for call in gong:
        acc_id = call["ACCOUNT_ID"]
        calls_by_account.setdefault(acc_id, []).append(call)

    # Group Salesforce opportunities by account_id, attach calls
    accounts: dict[str, dict] = {}
    for opp in salesforce:
        acc_id = opp["account_id"]
        if acc_id not in accounts:
            accounts[acc_id] = {
                "account_id":    acc_id,
                "account_name":  opp["account_name"],
                "opportunities": [],
                "calls":         calls_by_account.get(acc_id, [])
            }
        accounts[acc_id]["opportunities"].append(opp)

    return list(accounts.values())


# ─────────────────────────────────────────────
# CUSTOM ADK AGENT
# ─────────────────────────────────────────────

class DataCollectionAgent(BaseAgent):
    """
    Agent 1 — Custom non-LLM data collection agent.

    Input  (session state): sales_rep_id
    Output (session state):
        rep_quota_metrics  → for Rep Assessment Agent (Agent 3)
        account_details    → for Account Analysis Agent (Agent 2)
    """

    async def _run_async_impl(self, ctx):

        # ── Step 1: Read input from session state ──
        sales_rep_id: str = ctx.session.state.get("sales_rep_id")
        if not sales_rep_id:
            raise ValueError("sales_rep_id not found in session state")

        print(f"\n[DataCollectionAgent] Starting for rep: {sales_rep_id}")

        # ── Step 2: Fetch all 3 BigQuery tables in parallel ──
        everstage, salesforce, gong = await asyncio.gather(
            fetch_everstage(sales_rep_id),   # Everstage_Data
            fetch_salesforce(sales_rep_id),  # Salesforce_Sales_Recipe_Data
            fetch_gong(sales_rep_id),        # Gong_Calls_Data
        )

        print(f"[DataCollectionAgent] Fetched → "
              f"quota_records={len(everstage.get('quota_data', []))} | "
              f"opportunities={len(salesforce)} | "
              f"calls={len(gong)}")

        # ── Step 3: Build two separate state keys ──
        rep_quota_metrics = build_rep_quota_metrics(everstage)
        account_details   = build_account_details(salesforce, gong)

        # ── Step 4: Save both keys to session state ──
        ctx.session.state["rep_quota_metrics"] = rep_quota_metrics
        ctx.session.state["account_details"]   = account_details

        # ── Step 5: Print state for verification ──
        print(f"\n[DataCollectionAgent] Done →")
        print(f"  rep_quota_metrics : rep={rep_quota_metrics['rep_name']} | "
              f"quota_records={len(rep_quota_metrics['quota_data'])}")
        print(f"  account_details   : {len(account_details)} accounts")

        print("\n── rep_quota_metrics ──")
        print(json.dumps(rep_quota_metrics, indent=2, default=str))

        print("\n── account_details (first account only) ──")
        print(json.dumps(account_details[0] if account_details else {}, indent=2, default=str))

        # ── Step 6: Tell ADK this agent is finished ──
        yield Event(author=self.name, content=None)


# ─────────────────────────────────────────────
# LOCAL TEST
# ─────────────────────────────────────────────

async def test():
    from google.genai import types

    runner = InMemoryRunner(
        agent=DataCollectionAgent(name="DataCollectionAgent"),
        app_name="sales_rep_pipeline",
    )

    session_service = runner.session_service

    session = await session_service.create_session(
        app_name="sales_rep_pipeline",
        user_id="test_user",
        state={"sales_rep_id": "005DMO000000000300000"},  # Maya Chen
    )

    async for event in runner.run_async(
        user_id="test_user",
        session_id=session.id,
        new_message=types.Content(
            role="user",
            parts=[types.Part(text="start")]
        ),
    ):
        print("\nEvent received from:", event.author)


if __name__ == "__main__":
    asyncio.run(test())