import asyncio
import json
import os
from datetime import date

import httpx
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.adk.runners import InMemoryRunner
from google.cloud import bigquery
from mcp import ClientSession
from mcp.client.sse import sse_client

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
GCP_PROJECT_ID = "atgeir-moae-dev"
DATASET_ID     = "Agentic_AI_Demo"

TABLE_EVERSTAGE  = f"{GCP_PROJECT_ID}.{DATASET_ID}.Everstage_Data"
TABLE_GONG       = f"{GCP_PROJECT_ID}.{DATASET_ID}.Gong_Calls_Data"

# Salesforce data (opportunities, stage benchmarks, rep-name lookup,
# closed-won attainment) now comes from the custom Salesforce MCP server
# (salesforce_mcp_server/server.py), deployed as a Cloud Run endpoint,
# reached over SSE — NOT from BigQuery. No client-side auth token is sent;
# the Cloud Run endpoint handles authentication itself. Only Gong and
# Everstage remain on BigQuery.
MCP_SALESFORCE_SERVER_URL = os.environ.get("MCP_SALESFORCE_SERVER_URL", "https://your-cloud-run-service-url/sse")

# Gong recency window — "last activity 1-2 months backwards"
GONG_LOOKBACK_DAYS = 60

# How many most-recent calls per opportunity to carry into the payload
# (title / summary / sentiment context for the downstream LLM).
MAX_RECENT_CALLS_PER_OPPORTUNITY = 5


# ─────────────────────────────────────────────
# 0) MCP CLIENT — calls to the custom Salesforce MCP server
# ─────────────────────────────────────────────

async def _call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """
    Opens an SSE session to the Salesforce MCP server, calls one tool, and
    returns its parsed JSON result. Every Salesforce tool on that server
    (get_opportunities_by_rep_name, get_stage_duration_benchmark,
    get_closed_won_attainment) returns its payload as a single dict-shaped
    JSON content block — see server.py's tool docstrings for why (FastMCP
    emits one content block per list item for bare list[...] returns, so
    every tool wraps its payload in a dict).

    A fresh session per call, rather than one held open across the whole
    agent run, to keep this a simple drop-in replacement for the old
    per-call BigQuery client — no shared connection lifecycle to manage
    across the parallel asyncio.gather() calls below.

    No auth headers are sent — the Cloud Run endpoint handles
    authentication itself, confirmed by direct testing against it.
    """
    async with sse_client(MCP_SALESFORCE_SERVER_URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)
            if result.isError:
                raise RuntimeError(f"MCP tool '{tool_name}' returned an error: {result.content}")
            # Tool payloads are a single TextContent block containing JSON
            # (see server.py — everything is wrapped in a dict for this
            # reason), so content[0].text is the whole result.
            return json.loads(result.content[0].text)


# ─────────────────────────────────────────────
# 1) EVERSTAGE — trailing 3 monthly targets (quarterly removed)
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

async def _fetch_salesforce_attainment_mcp(sales_rep_name: str) -> dict:
    """
    Closed-won ARR for this rep, current month + trailing 3 months, via the
    MCP get_closed_won_attainment tool (see server.py / soql.py for the two
    SOQL aggregate queries this wraps — SOQL has no SUM(CASE WHEN ...), so
    the single BigQuery conditional-aggregation query this replaces became
    two separate SOQL queries server-side).

    Scoped by Sales_Rep_Name__c, not a Salesforce Owner ID — every
    Opportunity in this org shares one OwnerId (a shared/integration
    user), so OwnerId can't identify an individual rep.
    """
    mcp_result = await _call_mcp_tool("get_closed_won_attainment", {"rep_name": sales_rep_name})
    return {
        "closed_won_arr_current_month": mcp_result.get("closed_won_arr_current_month") or 0,
        "closed_won_arr_trailing_3_months": mcp_result.get("closed_won_arr_trailing_3_months") or 0,
    }


# ─────────────────────────────────────────────
# 4) SALESFORCE — open pipeline opportunities (the core per-account/opp data)
# ─────────────────────────────────────────────

async def _fetch_salesforce_pipeline_mcp(sales_rep_name: str) -> list[dict]:
    """
    "Still in pipeline" = not closed at all (is_closed is falsy), which
    excludes both Closed Won and Closed Lost. This is the strict reading
    of "not closed won, basically still open" — adjust the filter below if
    you instead want to *include* Closed Lost rows.

    get_opportunities_by_rep_name (MCP) returns every opportunity for this
    rep, open and closed alike, already in this pipeline's clean
    field-name shape (soql.FIELD_MAP / parse_opportunity_record) — so the
    open/closed filter that used to live in the SQL WHERE clause is applied
    here in Python instead.

    Scoped by Sales_Rep_Name__c, not a Salesforce Owner ID — every
    Opportunity in this org shares one OwnerId (a shared/integration
    user), so OwnerId can't identify an individual rep.

    Per requirement, the opportunity-created-date pipeline-start-date
    filter that used to live in the BigQuery WHERE clause is intentionally
    dropped here — not applied anywhere in this function anymore.
    """
    mcp_result = await _call_mcp_tool("get_opportunities_by_rep_name", {"rep_name": sales_rep_name})
    opportunities = mcp_result.get("opportunities", [])
    return [opp for opp in opportunities if not opp.get("is_closed")]


# ─────────────────────────────────────────────
# 5) SALESFORCE — historical stage-duration benchmark (for velocity comparison)
# ─────────────────────────────────────────────

async def _fetch_stage_benchmark_mcp() -> dict:
    """
    Benchmark = average days-in-stage across all historically Closed-Won
    opportunities, grouped by the stage they were won from, via the MCP
    get_stage_duration_benchmark tool. Already returned as {stage: avgDays}
    (rounded server-side) — see server.py's get_stage_duration_benchmark.
    """
    return await _call_mcp_tool("get_stage_duration_benchmark", {})


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


def build_quota_attainment(everstage: dict, attainment_actuals: dict, pipeline_opps: list[dict]) -> dict:
    """
    3 attainment metrics per spec:
      - monthly_attainment_pct   : this month's closed-won ARR vs this month's own target
      - quarterly_attainment_pct : trailing 3 months closed-won ARR vs trailing 3 months' summed target
      - pipeline_attainment_pct  : open pipeline ARR closing this month vs this month's target
    """
    today = date.today()
    current_month_key = today.strftime("%Y-%m")

    # {"YYYY-MM": target} built from the monthly rows already fetched from Everstage
    targets_by_month = {}
    for r in everstage.get("monthly_rows", []):
        sched = r.get("SCHEDULE_START")
        tgt = r.get("TARGET")
        if sched and tgt is not None:
            key = sched.strftime("%Y-%m") if hasattr(sched, "strftime") else str(sched)[:7]
            targets_by_month[key] = tgt

    current_month_target = targets_by_month.get(current_month_key)
    trailing_3_month_target = sum(targets_by_month.values()) if targets_by_month else None

    monthly_pct = None
    if current_month_target:
        monthly_pct = round(attainment_actuals["closed_won_arr_current_month"] / current_month_target * 100, 1)

    quarterly_pct = None
    if trailing_3_month_target:
        quarterly_pct = round(attainment_actuals["closed_won_arr_trailing_3_months"] / trailing_3_month_target * 100, 1)

    pipeline_arr_current_month = sum(
        o.get("deal_value_arr") or 0
        for o in pipeline_opps
        if o.get("close_date_target") and o["close_date_target"].strftime("%Y-%m") == current_month_key
    )
    pipeline_pct = None
    if current_month_target:
        pipeline_pct = round(pipeline_arr_current_month / current_month_target * 100, 1)

    return {
        "monthly_attainment_pct": monthly_pct,
        "quarterly_attainment_pct": quarterly_pct,
        "pipeline_attainment_pct": pipeline_pct,
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


def build_rep_profile(rep_id: str | None, everstage: dict, attainment_actuals: dict,
                       pipeline_opps: list[dict], stage_benchmarks: dict,
                       gong_calls: list[dict]) -> dict:
    """
    rep_id here is a real Salesforce User Id (from Opportunity.OwnerId),
    resolved from this rep's own fetched opportunities purely so
    decision_action_agent has a valid Id to assign Salesforce Tasks to —
    it is NOT unique per rep in this org (every Opportunity shares one
    OwnerId), unlike rep_name below, which is the actual per-rep identity.
    """

    historical_targets = build_historical_targets(everstage)
    quota_attainment = build_quota_attainment(everstage, attainment_actuals, pipeline_opps)

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
        "rep_id": rep_id,
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

    Input  (session state): sales_rep_name
    Output (session state):
        rep_performance_profile → full nested JSON (rep + quota + pipeline +
                                    per-account/opportunity + Gong analytics)
                                   for Agents 2 & 3 to consume.

    Scoped by Sales_Rep_Name__c, not a Salesforce User Id — every
    Opportunity in this org shares one OwnerId (a shared/integration
    user), so OwnerId can't identify an individual rep. Sales_Rep_Name__c
    is the real per-rep field, so it's the input this agent takes directly
    (no more resolving a name from an id — the caller already has it).
    """

    async def _run_async_impl(self, ctx):

        sales_rep_name: str = ctx.session.state.get("sales_rep_name")
        if not sales_rep_name:
            raise ValueError("sales_rep_name not found in session state")

        print(f"\n[DataCollectionAgent] Starting for rep: {sales_rep_name}")

        # Step 1: fetch Everstage targets, SFDC attainment actuals, SFDC pipeline,
        #         and the stage benchmark table in parallel — rep_name is
        #         already known, no resolution step needed before the
        #         Everstage fetch. Everstage stays on BigQuery (_run
        #         sync-wrapped); the three Salesforce fetches are native
        #         async MCP calls, no _run wrapping needed
        everstage, attainment_actuals, pipeline_opps, stage_benchmarks = await asyncio.gather(
            _run(_fetch_everstage_sync, sales_rep_name),
            _fetch_salesforce_attainment_mcp(sales_rep_name),
            _fetch_salesforce_pipeline_mcp(sales_rep_name),
            _fetch_stage_benchmark_mcp(),
        )

        # A real Salesforce User Id for decision_action_agent to assign
        # Tasks to — see build_rep_profile's docstring for why this can't
        # be per-rep. Derived from whichever opportunities this rep has.
        rep_id = pipeline_opps[0].get("owner_id") if pipeline_opps else None
        if not rep_id:
            print(f"[DataCollectionAgent] WARNING: could not resolve a Salesforce owner_id for "
                  f"{sales_rep_name} — this rep has zero open opportunities in the org.")

        # Step 2: fetch Gong calls, scoped to the open opportunities just fetched
        opportunity_ids = [o["opportunity_id"] for o in pipeline_opps if o.get("opportunity_id")]
        gong_calls = await _run(_fetch_gong_sync, opportunity_ids)

        print(f"[DataCollectionAgent] Fetched → "
              f"open_opps={len(pipeline_opps)} | gong_calls={len(gong_calls)}")

        # Step 3: assemble final nested profile
        rep_performance_profile = build_rep_profile(
            rep_id, everstage, attainment_actuals,
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
        state={"sales_rep_name": "Maya Chen"},
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
