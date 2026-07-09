import os
os.environ["GOOGLE_CLOUD_PROJECT"] = "atgeir-moae-dev"
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai import types

from scripts.SequentialAgent import root_agent

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
    - account_analysis_results → per-account AI analysis (Agent 2)
    - rep_assessment_result    → cross-account rep verdict (Agent 3)
    - actions_taken            → real actions executed (Agent 4)
    """
    session = await session_service.get_session(
        app_name="sales_rep_pipeline",
        user_id=user_id,
        session_id=session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id":               session_id,
        "account_analysis_results": session.state.get("account_analysis_results"),
        # "rep_assessment_result":    session.state.get("rep_assessment_result"),
        "actions_taken":            session.state.get("actions_taken"),
    }