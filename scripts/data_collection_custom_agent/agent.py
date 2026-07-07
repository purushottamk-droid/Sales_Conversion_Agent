import asyncio
import json
from datetime import date
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

# Opportunity data window (per requirement: opportunity data from 2026-01-01 only)
PIPELINE_START_DATE = "2026-01-01"

# Gong recency window — "last activity 1-2 months backwards"
GONG_LOOKBACK_DAYS = 60

# How many most-recent calls per opportunity to carry into the payload
# (title / summary / sentiment context for the downstream LLM).
MAX_RECENT_CALLS_PER_OPPORTUNITY = 5


# ─────────────────────────────────────────────
# 1) REP IDENTITY  (sales_rep_id -> rep_name, used to join Everstage)
# ─────────────────────────────────────────────

def _fetch_rep_identity_sync(sales_rep_id: str) -> dict:
    """
    sales_rep_id is the Salesforce Owner ID (same ID used as Gong
    PRIMARY_USER_ID / SALES_REP_ID). We resolve REP_NAME from Salesforce
    first (source of truth for ownership), falling back to Gong.
    REP_NAME is what we use to join into Everstage (Everstage has no rep id).
    """
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT `Sales Rep Name` AS rep_name
        FROM `{TABLE_SALESFORCE}`
        WHERE `Opportunity Owner ID` = @sales_rep_id
        LIMIT 1
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("sales_rep_id", "STRING", sales_rep_id)]
    )
    rows = list(client.query(query, job_config=job_config).result())
    rep_name = rows[0]["rep_name"] if rows else None

    if not rep_name:
        # Fallback to Gong if this rep currently owns no Salesforce opps
        query2 = f"""
            SELECT SALES_REP_NAME AS rep_name
            FROM `{TABLE_GONG}`
            WHERE PRIMARY_USER_ID = @sales_rep_id
            LIMIT 1
        """
        rows2 = list(client.query(query2, job_config=job_config).result())
        rep_name = rows2[0]["rep_name"] if rows2 else None

    return {"sales_rep_id": sales_rep_id, "rep_name": rep_name}


# ─────────────────────────────────────────────
# 2) EVERSTAGE — trailing 3 monthly targets (quarterly removed)
# ─────────────────────────────────────────────

def _fetch_everstage_sync(rep_name: str) -> dict:
    """
    Joined on REP_NAME (per requirement). Pulls monthly quota rows for the
    current month and the 2 preceding months (used to derive the trailing
    3-month average monthly target).
    """
    if not rep_name:
        return {"rep_name": None, "rep_experience_tier": None, "monthly_rows": []}

    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            e.REP_NAME,
            e.LEVEL,
            e.QUOTA_PERIOD,
            e.TARGET,
            e.MONTH,
            e.SCHEDULE_START
            -- e.EFFECTIVE_START_DATE,
            -- e.EFFECTIVE_END_DATE
        FROM `{TABLE_EVERSTAGE}` e
        WHERE e.REP_NAME = @rep_name
          AND (
                -- current month + prior 2 months, monthly quota rows
                (UPPER(e.QUOTA_PERIOD) = 'MONTHLY'
                 AND DATE_TRUNC(e.SCHEDULE_START, MONTH) BETWEEN
                     DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 2 MONTH)
                     AND DATE_TRUNC(CURRENT_DATE(), MONTH))
                )
        ORDER BY e.SCHEDULE_START DESC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("rep_name", "STRING", rep_name)]
    )
    rows = [dict(r) for r in client.query(query, job_config=job_config).result()]

    monthly_rows = [r for r in rows if (r.get("QUOTA_PERIOD") or "").upper() == "MONTHLY"]
    rep_tier = rows[0]["LEVEL"] if rows else None

    return {
        "rep_name": rep_name,
        "rep_experience_tier": rep_tier,
        "monthly_rows": monthly_rows,
    }


# ─────────────────────────────────────────────
# 3) SALESFORCE — closed-won ARR this month (attainment numerator)
# ─────────────────────────────────────────────

def _fetch_salesforce_attainment_sync(sales_rep_id: str) -> dict:
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            SUM(CASE
                    WHEN DATE_TRUNC(`Opportunity Close Date`, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH)
                    THEN `Opportunity ARR` ELSE 0
                END) AS closed_won_arr_current_month
        FROM `{TABLE_SALESFORCE}`
        WHERE `Opportunity Owner ID` = @sales_rep_id
          AND `Opportunity is Won` = TRUE
          AND `Opportunity Created Date` >= DATE(@pipeline_start)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("sales_rep_id", "STRING", sales_rep_id),
            bigquery.ScalarQueryParameter("pipeline_start", "DATE", PIPELINE_START_DATE),
        ]
    )
    rows = list(client.query(query, job_config=job_config).result())
    if not rows:
        return {"closed_won_arr_current_month": 0}
    r = dict(rows[0])
    return {
        "closed_won_arr_current_month": r.get("closed_won_arr_current_month") or 0,
    }


# ─────────────────────────────────────────────
# 4) SALESFORCE — open pipeline opportunities (the core per-account/opp data)
# ─────────────────────────────────────────────

def _fetch_salesforce_pipeline_sync(sales_rep_id: str) -> list[dict]:
    """
    "Still in pipeline" = not closed at all (Opportunity is Closed = FALSE),
    which excludes both Closed Won and Closed Lost. This is the strict reading
    of "not closed won, basically still open" — adjust the filter below if you
    instead want to *include* Closed Lost rows.
    """
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            `Opportunity ID`                    AS opportunity_id,
            `Opportunity Name`                  AS opportunity_name,
            `Account ID`                        AS account_id,
            `Account Name`                       AS account_name,
            `Account Industry`                   AS industry,
            `Account Segment`                    AS account_segment,
            `Opportunity Type`                   AS opportunity_type,
            `Opportunity Stage`                  AS current_stage,
            `Opportunity Forecast Category`      AS forecast_category,
            `Opportunity ARR`                    AS deal_value_arr,
            `Opportunity Discount`               AS discount_pct,
            `Opportunity Created Date`           AS created_date,
            `Opportunity Close Date`             AS close_date_target,
            `Opportunity Days in Pipeline`       AS days_open,
            `Opportunity Days in Stage`          AS current_stage_duration_days,
            `Opportunity Days Since Last Activity` AS days_since_last_touch,
            `Opportunity Next Step`              AS next_step,
            `Opportunity Risks`                  AS risks,
            `Opportunity CBIs`                   AS cbi_raw_text,
            `Opportunity Manager Notes`          AS opportunity_manager_notes,
            `Sales Rep Name`                     AS sales_rep_name,
            `Opportunity Previous Solution`      AS opportunity_previous_solution
        FROM `{TABLE_SALESFORCE}`
        WHERE `Opportunity Owner ID` = @sales_rep_id
          AND COALESCE(`Opportunity is Closed`, FALSE) = FALSE
          AND `Opportunity Created Date` >= DATE(@pipeline_start)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("sales_rep_id", "STRING", sales_rep_id),
            bigquery.ScalarQueryParameter("pipeline_start", "DATE", PIPELINE_START_DATE),
        ]
    )
    results = client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]


# ─────────────────────────────────────────────
# 5) SALESFORCE — historical stage-duration benchmark (for velocity comparison)
# ─────────────────────────────────────────────

def _fetch_stage_benchmark_sync() -> dict:
    """
    Benchmark = average `Opportunity Days in Stage` across all historically
    Closed-Won opportunities, grouped by the stage they were won from.
    This reuses the existing generic "Opportunity Days in Stage" column
    rather than the per-stage Days-in-X columns, since that column already
    captures time-in-current-stage per opportunity.
    """
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            `Opportunity Stage` AS stage,
            AVG(`Opportunity Days in Stage`) AS avg_days
        FROM `{TABLE_SALESFORCE}`
        WHERE `Opportunity is Won` = TRUE
          AND `Opportunity Days in Stage` IS NOT NULL
        GROUP BY stage
    """
    results = client.query(query).result()
    return {row["stage"]: round(row["avg_days"], 1) for row in results if row["stage"]}


# ─────────────────────────────────────────────
# 6) GONG — recent calls for the fetched open opportunities only
# ─────────────────────────────────────────────

def _fetch_gong_sync(opportunity_ids: list[str]) -> list[dict]:
    """
    Restricted to:
      - opportunities returned by the pipeline query above (via OPPORTUNITY_ID)
      - calls scheduled within the last GONG_LOOKBACK_DAYS days
    """
    if not opportunity_ids:
        return []
    client = bigquery.Client(project=GCP_PROJECT_ID)
    query = f"""
        SELECT
            ID,
            OPPORTUNITY_ID,
            ACCOUNT_ID,
            TITLE,
            PURPOSE,
            SCHEDULED,
            DURATION,
            COMPANY_QUESTION_COUNT,
            NON_COMPANY_QUESTION_COUNT,
            BRIEF,
            CALL_OUTCOME_CATEGORY,
            CALL_OUTCOME_NAME,
            MEETING_STAGE_CONTEXT,
            CUSTOMER_SENTIMENT,
            PRIMARY_OBJECTION,
            NEXT_STEP,
            KEY_MEETING_DISCUSSIONS
        FROM `{TABLE_GONG}`
        WHERE OPPORTUNITY_ID IN UNNEST(@opportunity_ids)
          AND SCHEDULED >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookback_days DAY)
        ORDER BY SCHEDULED DESC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("opportunity_ids", "STRING", opportunity_ids),
            bigquery.ScalarQueryParameter("lookback_days", "INT64", GONG_LOOKBACK_DAYS),
        ]
    )
    results = client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]


# ─────────────────────────────────────────────
# ASYNC WRAPPERS
# ─────────────────────────────────────────────

async def _run(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn, *args)


# ─────────────────────────────────────────────
# DERIVED METRICS / JSON ASSEMBLY
# ─────────────────────────────────────────────

def build_historical_targets(everstage: dict) -> dict:
    monthly_targets = [r["TARGET"] for r in everstage["monthly_rows"] if r.get("TARGET") is not None]
    monthly_avg = round(sum(monthly_targets) / len(monthly_targets), 2) if monthly_targets else None

    return {
        "monthly_arr_target_past_3_months": monthly_avg,
    }


def build_quota_attainment(historical_targets: dict, attainment_actuals: dict) -> dict:
    monthly_target = historical_targets.get("monthly_arr_target_past_3_months")

    month_pct = None
    if monthly_target:
        month_pct = round(attainment_actuals["closed_won_arr_current_month"] / monthly_target * 100, 1)

    return {
        "current_month_attainment_pct": month_pct,
    }


def _call_summary(c: dict) -> dict:
    """Qualitative, LLM-readable summary of a single Gong call — no counts/regex."""
    return {
        "title": c.get("TITLE"),
        "scheduled_date": c["SCHEDULED"].date().isoformat() if c.get("SCHEDULED") else None,
        "purpose": c.get("PURPOSE"),
        "meeting_stage_context": c.get("MEETING_STAGE_CONTEXT"),
        "meeting_summary": c.get("BRIEF"),
        "key_meeting_discussions": c.get("KEY_MEETING_DISCUSSIONS"),
        "customer_sentiment": c.get("CUSTOMER_SENTIMENT"),
        "primary_objection": c.get("PRIMARY_OBJECTION"),
        "call_outcome_category": c.get("CALL_OUTCOME_CATEGORY"),
        "call_outcome_name": c.get("CALL_OUTCOME_NAME"),
        "next_step": c.get("NEXT_STEP"),
    }


def build_gong_analytics(calls: list[dict]) -> dict:
    """
    Qualitative Gong context for the downstream LLM — title, meeting summary,
    stage context, and customer sentiment/objection per call. No aggregate
    counts or regex-derived signals; the LLM reasons over the raw call
    summaries itself.
    """
    if not calls:
        return {
            "latest_call_date": None,
            "next_scheduled_event": None,
            "recent_calls": [],
        }

    today = date.today()
    past_calls = [c for c in calls if c.get("SCHEDULED") and c["SCHEDULED"].date() <= today]
    future_calls = [c for c in calls if c.get("SCHEDULED") and c["SCHEDULED"].date() > today]

    latest_call = past_calls[0] if past_calls else None
    next_event = (
        min(future_calls, key=lambda c: c["SCHEDULED"])["SCHEDULED"].isoformat()
        if future_calls else None
    )

    # `calls` already arrives ordered SCHEDULED DESC from the query.
    recent_calls = [_call_summary(c) for c in calls[:MAX_RECENT_CALLS_PER_OPPORTUNITY]]

    return {
        "latest_call_date": latest_call["SCHEDULED"].date().isoformat() if latest_call else None,
        "next_scheduled_event": next_event,
        "recent_calls": recent_calls,
    }


def build_opportunity_payload(opp: dict, stage_benchmarks: dict, calls_by_opp: dict) -> dict:
    days_open = opp.get("days_open")
    stage_duration = opp.get("current_stage_duration_days")
    benchmark = stage_benchmarks.get(opp.get("current_stage"))

    calls = calls_by_opp.get(opp["opportunity_id"], [])
    gong_analytics = build_gong_analytics(calls)  # computed once, reused below

    return {
        "opportunity_id": opp.get("opportunity_id"),
        "opportunity_name": opp.get("opportunity_name"),
        "opportunity_type": opp.get("opportunity_type"),
        "current_stage": opp.get("current_stage"),
        "forecast_category": opp.get("forecast_category"),
        "deal_value_arr": opp.get("deal_value_arr") or 0,
        "discount_pct": opp.get("discount_pct"),
        "timeline_and_velocity": {
            "days_open": days_open,
            "current_stage_duration_days": stage_duration,
            "historical_stage_benchmark_days": benchmark,
            "close_date_target": opp.get("close_date_target").isoformat() if opp.get("close_date_target") else None,
            # Not derivable — no close-date-change/push tracking column exists
            # in Salesforce_Sales_Recipe_Data. Would need a field-history table.
            "target_date_pushes": None,
        },
        "critical_business_issue": {
            # Raw text passed through for the downstream LLM to parse/quantify —
            # there is no structured "quantified impact" column in the schema.
            "cbi_identified": opp.get("cbi_raw_text"),
            "quantified_impact": None,
            # Approximate proxy only — Gong table has no attendee/participant
            # list, so we cannot state who has/hasn't joined calls.
            "buyer_alignment": (
                f"Salesforce contact of record: {opp.get('contact_name')} "
                f"({opp.get('contact_title')})" if opp.get("contact_name") else None
            ),
            "previous_solution": opp.get("opportunity_previous_solution"),
            "manager_notes": opp.get("opportunity_manager_notes"),
        },
        "engagement_signals": {
            "days_since_last_touch": opp.get("days_since_last_touch"),
            "next_scheduled_event": gong_analytics["next_scheduled_event"],
        },
        "risks": opp.get("risks"),
        "next_step": opp.get("next_step"),
        "gong_interaction_analytics": gong_analytics,
    }


def build_rep_profile(sales_rep_id: str, everstage: dict, attainment_actuals: dict,
                       pipeline_opps: list[dict], stage_benchmarks: dict,
                       gong_calls: list[dict]) -> dict:

    historical_targets = build_historical_targets(everstage)
    quota_attainment = build_quota_attainment(historical_targets, attainment_actuals)

    calls_by_opp: dict[str, list] = {}
    for call in gong_calls:
        calls_by_opp.setdefault(call["OPPORTUNITY_ID"], []).append(call)

    total_open_pipeline_arr = sum(o.get("deal_value_arr") or 0 for o in pipeline_opps)

    assigned_accounts = []
    for opp in pipeline_opps:
        assigned_accounts.append({
            "account_id": opp.get("account_id"),
            "account_name": opp.get("account_name"),
            "industry": opp.get("industry"),
            "account_segment": opp.get("account_segment"),
            "opportunity_data": build_opportunity_payload(opp, stage_benchmarks, calls_by_opp),
        })

    return {
        "rep_id": sales_rep_id,
        "rep_name": everstage.get("rep_name"),
        "rep_experience_tier": everstage.get("rep_experience_tier"),
        "historical_targets": historical_targets,
        "quota_attainment": quota_attainment,
        "active_pipeline": {
            "total_open_pipeline_arr": total_open_pipeline_arr,
            "open_opportunity_count": len(pipeline_opps),
        },
        "assigned_accounts": assigned_accounts,
    }


# ─────────────────────────────────────────────
# CUSTOM ADK AGENT
# ─────────────────────────────────────────────

class DataCollectionAgent(BaseAgent):
    """
    Agent 1 — Custom non-LLM data collection agent.

    Input  (session state): sales_rep_id
    Output (session state):
        rep_performance_profile → full nested JSON (rep + quota + pipeline +
                                    per-account/opportunity + Gong analytics)
                                   for Agents 2 & 3 to consume.
    """

    async def _run_async_impl(self, ctx):

        sales_rep_id: str = ctx.session.state.get("sales_rep_id")
        if not sales_rep_id:
            raise ValueError("sales_rep_id not found in session state")

        print(f"\n[DataCollectionAgent] Starting for rep: {sales_rep_id}")

        # Step 1: resolve rep_name (needed to join Everstage)
        identity = await _run(_fetch_rep_identity_sync, sales_rep_id)
        rep_name = identity["rep_name"]
        if not rep_name:
            print(f"[DataCollectionAgent] WARNING: could not resolve rep_name for {sales_rep_id}")

        # Step 2: fetch Everstage targets, SFDC attainment actuals, SFDC pipeline,
        #         and the stage benchmark table in parallel
        everstage, attainment_actuals, pipeline_opps, stage_benchmarks = await asyncio.gather(
            _run(_fetch_everstage_sync, rep_name),
            _run(_fetch_salesforce_attainment_sync, sales_rep_id),
            _run(_fetch_salesforce_pipeline_sync, sales_rep_id),
            _run(_fetch_stage_benchmark_sync),
        )

        # Step 3: fetch Gong calls, scoped to the open opportunities just fetched
        opportunity_ids = [o["opportunity_id"] for o in pipeline_opps if o.get("opportunity_id")]
        gong_calls = await _run(_fetch_gong_sync, opportunity_ids)

        print(f"[DataCollectionAgent] Fetched → "
              f"open_opps={len(pipeline_opps)} | gong_calls={len(gong_calls)}")

        # Step 4: assemble final nested profile
        rep_performance_profile = build_rep_profile(
            sales_rep_id, everstage, attainment_actuals,
            pipeline_opps, stage_benchmarks, gong_calls,
        )

        # Step 5: save to session state
        ctx.session.state["rep_performance_profile"] = rep_performance_profile

        print("\n── rep_performance_profile ──")
        print(json.dumps(rep_performance_profile, indent=2, default=str))

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
