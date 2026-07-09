from __future__ import annotations

import asyncio
import json
from datetime import date

from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.adk.runners import InMemoryRunner
from google.cloud import bigquery

from scripts.salesforce_mcp_client import call_salesforce_mcp_tool

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
GCP_PROJECT_ID = "atgeir-moae-dev"
DATASET_ID     = "Agentic_AI_Demo"

TABLE_EVERSTAGE = f"{GCP_PROJECT_ID}.{DATASET_ID}.Everstage_Data"
TABLE_GONG      = f"{GCP_PROJECT_ID}.{DATASET_ID}.Gong_Calls_Data"
# NOTE: Salesforce no longer lives in BigQuery — see the MCP section below.
# TABLE_SALESFORCE removed along with the queries that used it.

# Opportunity data window (per requirement: opportunity data from 2026-01-01 only)
PIPELINE_START_DATE = "2026-01-01"
PIPELINE_START_DATE_OBJ = date.fromisoformat(PIPELINE_START_DATE)

# Gong recency window — "last activity 1-2 months backwards"
GONG_LOOKBACK_DAYS = 60

# How many most-recent calls per opportunity to carry into the payload
# (title / summary / sentiment context for the downstream LLM).
MAX_RECENT_CALLS_PER_OPPORTUNITY = 5


# ─────────────────────────────────────────────
# SALESFORCE DATA SOURCE — via our own GCP-hosted MCP server
#
# salesforce_mcp_server/ (this repo) is a custom, self-hosted MCP server
# wrapping Salesforce's REST/SOQL API directly, deployed as its own Cloud
# Run service. We do NOT use Salesforce's official hosted MCP server —
# its OAuth Identity Passthrough auth model is built for a per-user
# copilot scenario, not this unattended, org-wide backend pipeline. See
# the plan doc ("Build a Custom Salesforce MCP Server on GCP") for why.
#
# Access to our own server is gated by Cloud Run IAM, not Salesforce
# OAuth — Salesforce auth (JWT Bearer) happens server-side, inside
# salesforce_mcp_server. The client-side connection logic (GCP identity
# token + MCP session) is shared with decision_action_agent's tools, so it
# lives in scripts/salesforce_mcp_client.py rather than duplicated here.
# ─────────────────────────────────────────────


def _parse_date(value) -> date | None:
    """Normalize a flow-returned date/datetime value (string or already a
    date/datetime) into a plain date — build_quota_attainment/build_opportunity_payload
    both assume real date objects, the way BigQuery's client returned them."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if hasattr(value, "date"):  # datetime
        return value.date()
    return date.fromisoformat(str(value)[:10])


def _normalize_opportunity(raw: dict) -> dict:
    """
    Coerce one flow-returned opportunity into the exact shape the rest of
    this file already expects (same field names the old BigQuery `AS`
    aliases produced), with date fields parsed into real `date` objects.

    PLACEHOLDER: assumes the flow already returns these clean field names
    (opportunity_id, opportunity_name, ...) plus is_won/is_closed booleans.
    If the real flow instead returns raw Salesforce API labels (e.g.
    "Opportunity ID" with a space), add the rename mapping here.
    """
    return {
        "opportunity_id":               raw.get("opportunity_id"),
        "opportunity_name":              raw.get("opportunity_name"),
        "account_id":                    raw.get("account_id"),
        "account_name":                  raw.get("account_name"),
        "industry":                      raw.get("industry"),
        "opportunity_type":              raw.get("opportunity_type"),
        "current_stage":                 raw.get("current_stage"),
        "forecast_category":             raw.get("forecast_category"),
        "deal_value_arr":                raw.get("deal_value_arr"),
        "created_date":                  _parse_date(raw.get("created_date")),
        "close_date_target":             _parse_date(raw.get("close_date_target")),
        "current_stage_duration_days":   raw.get("current_stage_duration_days"),
        "days_since_last_touch":         raw.get("days_since_last_touch"),
        "next_step":                     raw.get("next_step"),
        "risks":                         raw.get("risks"),
        "cbi_raw_text":                  raw.get("cbi_raw_text"),
        "opportunity_manager_notes":     raw.get("opportunity_manager_notes"),
        "sales_rep_name":                raw.get("sales_rep_name"),
        "contact_name":                  raw.get("contact_name"),
        "contact_title":                 raw.get("contact_title"),
        "is_won":                        bool(raw.get("is_won")),
        "is_closed":                     bool(raw.get("is_closed")),
        "owner_id":                      raw.get("owner_id"),
    }


async def _get_opportunities_by_rep_name(sales_rep_name: str) -> list[dict]:
    """
    Replaces the 3 owner-scoped BigQuery queries this file used to run
    against Salesforce (identity lookup, attainment sum, open-pipeline
    fetch). Fetched once here and reused by _compute_attainment_from_opportunities /
    _filter_open_pipeline below, instead of 3 separate round trips.

    Scoped by Sales_Rep_Name__c, not OwnerId — every Opportunity in this
    org shares one OwnerId (a shared/integration user), so OwnerId can't
    identify an individual rep; Sales_Rep_Name__c is the real per-rep field.

    Calls the get_opportunities_by_rep_name tool on our own salesforce_mcp_server.
    """
    result = await call_salesforce_mcp_tool("get_opportunities_by_rep_name", {"rep_name": sales_rep_name})
    return [_normalize_opportunity(r) for r in result["opportunities"]]


async def _get_stage_duration_benchmark() -> dict:
    """
    Org-wide average Opportunity Days in Stage per stage, across all
    historically closed-won opportunities. Not owner-scoped, unlike the
    tool above.

    Calls the get_stage_duration_benchmark tool on our own salesforce_mcp_server.
    """
    try:
        return await call_salesforce_mcp_tool("get_stage_duration_benchmark", {})
    except Exception as e:
        print(f"[DataCollectionAgent] WARNING: get_stage_duration_benchmark call failed ({e}) — "
              f"velocity comparison will be skipped for this run.")
        return {}


# Opportunity types that count as "this account is already being expanded"
# for whitespace detection below. Matched against this org's ACTUAL Type
# values (verified via SOQL GROUP BY — see verify_field_map.py-style checks),
# not the abstract labels from the original design discussion: this org has
# no "Product Migration" type at all, and real Upsell/Cross-sell values are
# numbered-prefix strings, not plain words. Exact string match, so this MUST
# stay in sync with real data — re-verify if the org's Type values change.
EXPANSION_OPPORTUNITY_TYPES = {"4 - Upsell", "3 - Cross-sell"}


async def _get_opportunities_by_account(account_id: str) -> list[dict]:
    """
    Every opportunity on this account, regardless of owner or open/closed
    status — used only for expansion-whitespace detection below, a
    different question than "this rep's own open pipeline."

    Calls the get_opportunities_by_account tool on our own salesforce_mcp_server.
    """
    result = await call_salesforce_mcp_tool("get_opportunities_by_account", {"account_id": account_id})
    return [_normalize_opportunity(r) for r in result["opportunities"]]


async def _check_expansion_whitespace(account_id: str) -> bool:
    """
    True if this account already has a Migration/Upsell/Cross Sell
    opportunity anywhere (any owner, any status) — i.e. NOT whitespace.
    False means no such opportunity exists yet, the whitespace signal
    account_analysis_agent looks for when paired with a Legacy Contract
    type opportunity.
    """
    try:
        account_opportunities = await _get_opportunities_by_account(account_id)
    except Exception as e:
        print(f"[DataCollectionAgent] WARNING: get_opportunities_by_account failed for "
              f"account {account_id} ({e}) — expansion-whitespace check skipped for this account.")
        return False
    return any(o.get("opportunity_type") in EXPANSION_OPPORTUNITY_TYPES for o in account_opportunities)


async def _build_expansion_whitespace_map(pipeline_opps: list[dict]) -> dict[str, bool]:
    """
    {account_id: has_expansion_opportunity} for every unique account in
    this rep's open pipeline. Accounts with no account_id (currently every
    opportunity in the demo org — see plan doc) are skipped and default to
    False rather than calling the tool with an empty ID.
    """
    account_ids = sorted({o["account_id"] for o in pipeline_opps if o.get("account_id")})
    if not account_ids:
        return {}

    results = await asyncio.gather(*(_check_expansion_whitespace(account_id) for account_id in account_ids))
    return dict(zip(account_ids, results))


# ─────────────────────────────────────────────
# CLIENT-SIDE FILTERS — replace the WHERE-clause logic the old Salesforce
# SQL used to do server-side, now applied to the one fetched opportunity list.
# ─────────────────────────────────────────────

def _shift_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _compute_attainment_from_opportunities(opportunities: list[dict]) -> dict:
    """
    Replaces _fetch_salesforce_attainment_sync's SQL SUM(CASE...) logic.
    Same base filter (is_won AND created_date >= PIPELINE_START_DATE),
    same two conditional sums.
    """
    won = [
        o for o in opportunities
        if o.get("is_won")
        and o.get("created_date") is not None
        and o["created_date"] >= PIPELINE_START_DATE_OBJ
    ]

    today = date.today()
    current_month_start = today.replace(day=1)
    trailing_window_start = _shift_months(current_month_start, -3)

    closed_won_arr_current_month = sum(
        o.get("deal_value_arr") or 0
        for o in won
        if o.get("close_date_target") and o["close_date_target"].replace(day=1) == current_month_start
    )
    closed_won_arr_trailing_3_months = sum(
        o.get("deal_value_arr") or 0
        for o in won
        if o.get("close_date_target") and o["close_date_target"] >= trailing_window_start
    )

    return {
        "closed_won_arr_current_month": closed_won_arr_current_month,
        "closed_won_arr_trailing_3_months": closed_won_arr_trailing_3_months,
    }


def _filter_open_pipeline(opportunities: list[dict]) -> list[dict]:
    """
    Replaces _fetch_salesforce_pipeline_sync's WHERE clause: not closed,
    created on/after PIPELINE_START_DATE.
    """
    return [
        o for o in opportunities
        if not o.get("is_closed")
        and o.get("created_date") is not None
        and o["created_date"] >= PIPELINE_START_DATE_OBJ
    ]


# ─────────────────────────────────────────────
# EVERSTAGE + GONG — unchanged, still BigQuery
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
        FROM `{TABLE_EVERSTAGE}` e
        WHERE e.REP_NAME = @rep_name
          AND (
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


def _fetch_gong_sync(opportunity_ids: list[str]) -> list[dict]:
    """
    Restricted to:
      - opportunities returned by the pipeline fetch above (via OPPORTUNITY_ID)
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
# ASYNC WRAPPER — for the remaining sync (BigQuery) calls
# ─────────────────────────────────────────────

async def _run(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn, *args)


# ─────────────────────────────────────────────
# DERIVED METRICS / JSON ASSEMBLY — unchanged
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
        "timeline_and_velocity": {
            "current_stage_duration_days": stage_duration,
            "historical_stage_benchmark_days": benchmark,
            "close_date_target": opp.get("close_date_target").isoformat() if opp.get("close_date_target") else None,
            # Not derivable — no close-date-change/push tracking column exists
            # in the Salesforce source. Would need a field-history table.
            "target_date_pushes": None,
        },
        "critical_business_issue": {
            # Raw text passed through for the downstream LLM to parse/quantify —
            # there is no structured "quantified impact" field in the schema.
            "cbi_identified": opp.get("cbi_raw_text"),
            "quantified_impact": None,
            "buyer_alignment": (
                f"Salesforce contact of record: {opp.get('contact_name')} "
                f"({opp.get('contact_title')})" if opp.get("contact_name") else None
            ),
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
                       gong_calls: list[dict], expansion_whitespace_map: dict[str, bool]) -> dict:
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
            "has_expansion_opportunity": expansion_whitespace_map.get(opp.get("account_id"), False),
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

    Salesforce data now comes from an MCP server (see the MCP section
    above) instead of BigQuery. Everstage and Gong are unchanged.

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

        # Step 1: fetch this rep's full opportunity list from the Salesforce
        # MCP server, Everstage targets (BigQuery), and the org-wide
        # stage-duration benchmark (MCP), all in parallel — rep_name is
        # already known, no resolution step needed before the Everstage fetch.
        opportunities, everstage, stage_benchmarks = await asyncio.gather(
            _get_opportunities_by_rep_name(sales_rep_name),
            _run(_fetch_everstage_sync, sales_rep_name),
            _get_stage_duration_benchmark(),
        )

        attainment_actuals = _compute_attainment_from_opportunities(opportunities)
        pipeline_opps = _filter_open_pipeline(opportunities)

        # A real Salesforce User Id for decision_action_agent to assign
        # Tasks to — see build_rep_profile's docstring for why this can't
        # be per-rep. Derived from whichever opportunities this rep has,
        # falling back to the full (unfiltered) fetch if none are open.
        owner_source = pipeline_opps or opportunities
        rep_id = owner_source[0].get("owner_id") if owner_source else None
        if not rep_id:
            print(f"[DataCollectionAgent] WARNING: could not resolve a Salesforce owner_id for "
                  f"{sales_rep_name} — this rep has zero opportunities in the org.")

        # Step 2: Gong calls, scoped to the open opportunities just resolved
        # (unchanged — still BigQuery), and the expansion-whitespace check
        # per unique account (MCP, not owner-scoped), in parallel.
        opportunity_ids = [o["opportunity_id"] for o in pipeline_opps if o.get("opportunity_id")]
        gong_calls, expansion_whitespace_map = await asyncio.gather(
            _run(_fetch_gong_sync, opportunity_ids),
            _build_expansion_whitespace_map(pipeline_opps),
        )

        print(f"[DataCollectionAgent] Fetched → "
              f"open_opps={len(pipeline_opps)} | gong_calls={len(gong_calls)}")

        # Step 3: assemble final nested profile
        rep_performance_profile = build_rep_profile(
            rep_id, everstage, attainment_actuals,
            pipeline_opps, stage_benchmarks, gong_calls, expansion_whitespace_map,
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
