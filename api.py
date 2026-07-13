import os
os.environ["GOOGLE_CLOUD_PROJECT"] = "atgeir-moae-dev"
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

import copy
import json
from datetime import date
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.events import Event, EventActions
from google.genai import types

from scripts.SequentialAgent import root_agent
from scripts.chat_agent import chat_agent

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────

api = FastAPI(title="Sales Rep Performance Agent — SSE API")

session_service = InMemorySessionService()

runner = Runner(
    agent=root_agent,
    app_name="sales_rep_pipeline",
    session_service=session_service,
)

# Separate Runner for the chat agent — Runner is bound to one fixed agent,
# and root_agent is a SequentialAgent permanently wired to the 3-step
# pipeline, not the conversational chat_agent. Shares the same
# session_service/app_name as `runner` above so it reads/writes the SAME
# sessions the pipeline already created — no second state system.
chat_runner = Runner(
    agent=chat_agent,
    app_name="sales_rep_pipeline",
    session_service=session_service,
)

CHAT_HISTORY_MAX_TURNS = 20


# ─────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    user_id: str
    sales_rep_name: str
    rep_email: str
    manager_email: str


class RunRequest(BaseModel):
    user_id: str
    session_id: str


class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str


# ─────────────────────────────────────────────
# Helper — SSE formatter
# ─────────────────────────────────────────────

def sse(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, default=str)}\n\n"


async def stream_events(event_gen):
    """
    Stream all agent events as SSE.
    No confirmation/resume logic — pipeline runs straight through.
    """
    async for event in event_gen:

        # Extract text content if available
        text = ""
        if event.content and event.content.parts:
            text = "".join(
                p.text for p in event.content.parts
                if hasattr(p, "text") and p.text
            )

        yield sse("progress", {
            "author": event.author,
            "id":     event.id,
            "text":   text,
        })

        if event.is_final_response():
            yield sse("done", {
                "author": event.author,
                "text":   text,
            })


# ─────────────────────────────────────────────
# Helpers — /agent/result enrichment
#
# Both of these are deliberately plain Python, not LLM-computed: the
# severity->points mapping is a trivial deterministic lookup (no reason to
# risk the model forgetting/misapplying it on some objections), and the
# forecast is a multi-deal sum a flash-lite model isn't reliable enough to
# be trusted with. See account_analysis_agent's conversion_score rubric
# (output_schema.py / prompt.py STEP 3) — these numbers must stay in sync
# with it, since this is describing the effect of that same rubric.
# ─────────────────────────────────────────────

SEVERITY_SCORE_IMPACT = {"high": 10, "medium": 5, "low": 2}


def _with_score_impact_if_resolved(account_analysis_results: dict | None) -> dict | None:
    """Returns a deep copy of account_analysis_results with
    score_impact_if_resolved set on every customer_objections[] entry,
    across every account — never mutates session state, so the raw LLM
    output stays exactly as produced for audit purposes."""
    if not account_analysis_results:
        return account_analysis_results

    enriched = copy.deepcopy(account_analysis_results)
    for account in enriched.get("accounts", []):
        for objection in account.get("customer_objections", []):
            objection["score_impact_if_resolved"] = SEVERITY_SCORE_IMPACT.get(
                objection.get("severity"), 0
            )
    return enriched


def _compute_forecasted_arr_this_month(
    rep_performance_profile: dict | None, account_analysis_results: dict | None
) -> float | None:
    """Already-closed-won ARR this month + Σ deal_value_arr × conversion_score/100
    across open deals closing this calendar month — a probability-weighted
    pipeline forecast. Cross-references the two payloads by opportunity_id."""
    if not rep_performance_profile or not account_analysis_results:
        return None

    already_closed = (
        rep_performance_profile.get("quota_attainment", {}).get("closed_won_arr_current_month") or 0
    )

    deals_by_opp_id = {
        acc["opportunity_data"]["opportunity_id"]: acc["opportunity_data"]
        for acc in rep_performance_profile.get("assigned_accounts", [])
        if acc.get("opportunity_data", {}).get("opportunity_id")
    }

    current_month_key = date.today().strftime("%Y-%m")
    weighted_pipeline = 0.0
    for account in account_analysis_results.get("accounts", []):
        deal = deals_by_opp_id.get(account.get("opportunity_id"))
        if not deal:
            continue
        close_date_target = deal.get("timeline_and_velocity", {}).get("close_date_target")
        if not close_date_target or close_date_target[:7] != current_month_key:
            continue
        deal_value_arr = deal.get("deal_value_arr") or 0
        conversion_score = account.get("conversion_score") or 0
        weighted_pipeline += deal_value_arr * (conversion_score / 100)

    return round(already_closed + weighted_pipeline, 2)


# ─────────────────────────────────────────────
# ENDPOINT 1 — Health check
# ─────────────────────────────────────────────

@api.get("/health")
async def healthz():
    """Confirm the server is alive."""
    return {"status": "ok"}


# ─────────────────────────────────────────────
# ENDPOINT 2 — Create a session
# ─────────────────────────────────────────────

@api.post("/agent/sessions")
async def create_session(req: CreateSessionRequest):
    """
    Creates a session and seeds rep identity fields upfront:
    - sales_rep_name → Agent 1 uses this to query Salesforce (Sales_Rep_Name__c)
                        and Everstage (REP_NAME) — Salesforce OwnerId can't
                        identify an individual rep in this org, so the rep's
                        name is the real per-rep key, not an Id.
    - rep_email     → Agent 4 uses this to message the rep
    - manager_email → Agent 4 uses this to notify the manager
    Call this FIRST before /agent/run.
    """
    session = await session_service.create_session(
        app_name="sales_rep_pipeline",
        user_id=req.user_id,
        state={
            "sales_rep_name": req.sales_rep_name,
            "rep_email":     req.rep_email,
            "manager_email": req.manager_email,
        },
    )
    return {
        "session_id":    session.id,
        "user_id":       req.user_id,
        "initial_state": session.state,
    }


# ─────────────────────────────────────────────
# ENDPOINT 3 — Run the full pipeline
# ─────────────────────────────────────────────

@api.post("/agent/run")
async def run_agent(req: RunRequest):
    """
    Runs the full 4-agent pipeline for an existing session.
    Streams live progress via SSE as each agent finishes.
    No pausing or confirmation — pipeline runs end to end.
    Must call /agent/sessions first to get a session_id.
    """
    content = types.Content(role="user", parts=[types.Part(text="start")])

    event_gen = runner.run_async(
        user_id=req.user_id,
        session_id=req.session_id,
        new_message=content,
        run_config=RunConfig(streaming_mode=StreamingMode.SSE),
    )

    return StreamingResponse(stream_events(event_gen), media_type="text/event-stream")


# ─────────────────────────────────────────────
# ENDPOINT 4 — Get final pipeline result
# ─────────────────────────────────────────────

@api.get("/agent/result/{session_id}")
async def get_result(session_id: str, user_id: str):
    """
    Returns the final pipeline output after /agent/run completes.
    Call this AFTER you receive event: done from /agent/run.

    Returns:
    - rep_performance_profile   → rep + quota + pipeline + Gong data (Agent 1)
    - account_analysis_results  → rep-level verdict + per-account analysis
                                   (Agent 2), with score_impact_if_resolved
                                   filled in on every customer_objections[]
                                   entry (deterministic, see helpers above)
    - actions_taken             → real actions executed (Agent 3)
    - current_target_arr         → rep's THIS-MONTH ARR quota (same figure
                                    as rep_performance_profile.quota_attainment.
                                    current_month_quota_arr, surfaced at the
                                    top level for convenience — NOT the
                                    3-month average from historical_targets)
    - current_month_arr_achieved → ARR already closed-won this month (same
                                    figure as rep_performance_profile.
                                    quota_attainment.closed_won_arr_current_month)
    - forecasted_arr_this_month  → probability-weighted revenue projection
                                    for the current month (see helpers above)
    """
    session = await session_service.get_session(
        app_name="sales_rep_pipeline",
        user_id=user_id,
        session_id=session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    rep_performance_profile = session.state.get("rep_performance_profile")
    account_analysis_results = session.state.get("account_analysis_results")
    quota_attainment = (rep_performance_profile or {}).get("quota_attainment", {})

    return {
        "session_id":                session_id,
        "rep_performance_profile":   rep_performance_profile,
        "account_analysis_results":  _with_score_impact_if_resolved(account_analysis_results),
        "actions_taken":             session.state.get("actions_taken"),
        "current_target_arr":        quota_attainment.get("current_month_quota_arr"),
        "current_month_arr_achieved": quota_attainment.get("closed_won_arr_current_month"),
        "forecasted_arr_this_month": _compute_forecasted_arr_this_month(
            rep_performance_profile, account_analysis_results
        ),
    }


# ─────────────────────────────────────────────
# ENDPOINT 5 — Chat with the completed pipeline result
# ─────────────────────────────────────────────

@api.post("/agent/chat")
async def chat(req: ChatRequest):
    """
    Free-form Q&A grounded in a completed pipeline run — the rep asks a
    question, chat_agent answers using only rep_performance_profile /
    account_analysis_results / actions_taken already in this session's
    state (no new data fetching, no new actions). Synchronous JSON reply,
    not SSE — a single grounded LLM turn is fast enough not to need it.

    Must call /agent/sessions + /agent/run first — this reuses that SAME
    session_id so chat_agent can read what the pipeline already wrote.
    """
    session = await session_service.get_session(
        app_name="sales_rep_pipeline",
        user_id=req.user_id,
        session_id=req.session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.state.get("account_analysis_results") is None:
        raise HTTPException(
            status_code=409,
            detail="Run the pipeline first via /agent/run before starting a chat.",
        )

    content = types.Content(role="user", parts=[types.Part(text=req.message)])

    reply_text = ""
    async for event in chat_runner.run_async(
        user_id=req.user_id,
        session_id=req.session_id,
        new_message=content,
    ):
        if event.is_final_response() and event.content and event.content.parts:
            reply_text = "".join(
                p.text for p in event.content.parts
                if hasattr(p, "text") and p.text
            )

    chat_history = session.state.get("chat_history", []) + [
        {"role": "rep", "text": req.message},
        {"role": "assistant", "text": reply_text},
    ]
    chat_history = chat_history[-(CHAT_HISTORY_MAX_TURNS * 2):]

    await session_service.append_event(
        session,
        Event(
            author="chat_agent",
            actions=EventActions(state_delta={"chat_history": chat_history}),
        ),
    )

    return {
        "session_id": req.session_id,
        "reply": reply_text,
        "turn_count": len(chat_history) // 2,
    }