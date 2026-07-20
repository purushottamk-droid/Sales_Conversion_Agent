"""
test_chat_agent_adk_vertex.py — local test for the REAL chat_agent
(scripts/chat_agent/agent.py + prompt.py), over Vertex AI.

Drop this file inside scripts/chat_agent/ (next to agent.py and prompt.py)
and run it from there.

WHAT THIS DOES
  Builds the exact same LlmAgent as agent.py (name, model, instruction=
  CHAT_PROMPT, include_contents='none'), runs it standalone via
  Runner.run_async() the same way it's invoked in production (its own
  top-level call, not a pipeline sub-agent), and seeds session.state
  with fixture data for the 3 payloads this agent reads.

  Since this agent has no output_key and writes nothing itself
  (per its own docstring — api.py owns chat_history), this harness
  plays the role of api.py: after each turn it appends {role, text}
  to chat_history itself and re-seeds it into session.state before the
  next turn.

SETUP
  gcloud auth application-default login
  pip install google-adk google-genai --break-system-packages

USAGE
  GCP_PROJECT=your-project GCP_LOCATION=us-central1 python3 test_chat_agent_adk_vertex.py
"""

import asyncio
import os
import sys
import uuid

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", os.environ.get("GCP_PROJECT", "atgeir-moae-dev"))
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", os.environ.get("GCP_LOCATION", "us-central1"))

if os.environ["GOOGLE_CLOUD_PROJECT"] == "atgeir-moae-dev":
    print("!! Set GCP_PROJECT env var before running.", file=sys.stderr)

import json as _json

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.events import Event, EventActions
from google.genai import types

from prompt import CHAT_PROMPT  # the real, unmodified prompt.py

APP_NAME = "sales_conversion_agent"
USER_ID = "test_user"

# ---------------------------------------------------------------------
# Real pipeline output — loaded from salesresults.txt (a real
# session_id's output: rep_performance_profile, account_analysis_results,
# actions_taken). Put salesresults.txt next to this script.
# ---------------------------------------------------------------------

DATA_FILE = os.environ.get("SALES_RESULTS_FILE", "salesresults.txt")

with open(DATA_FILE, "r", encoding="utf-8") as f:
    _pipeline_output = _json.load(f)

REP_PERFORMANCE_PROFILE = _pipeline_output["rep_performance_profile"]
ACCOUNT_ANALYSIS_RESULTS = _pipeline_output["account_analysis_results"]
ACTIONS_TAKEN = _pipeline_output["actions_taken"]  # NOTE: markdown-fenced JSON string in the real data, passed through as-is


def build_chat_agent() -> LlmAgent:
    # identical construction to agent.py
    return LlmAgent(
        name="chat_agent",
        model="gemini-2.5-flash-lite",
        instruction=CHAT_PROMPT,
        include_contents="none",
    )


async def main():
    print(f"Vertex AI project : {os.environ['GOOGLE_CLOUD_PROJECT']}")
    print(f"Vertex AI location: {os.environ['GOOGLE_CLOUD_LOCATION']}\n")

    session_service = InMemorySessionService()
    session_id = str(uuid.uuid4())

    session = await session_service.create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id,
    )
    async def apply_state_delta(delta: dict):
        """Persist a state change the way ADK expects — via an Event with
        EventActions(state_delta=...), not by mutating session.state
        directly. Direct mutation on a session object returned by
        get_session() is NOT guaranteed to write back into the
        SessionService's internal store; this was the bug that made the
        agent see empty account_analysis_results earlier."""
        await session_service.append_event(
            session,
            Event(
                author="test_harness",
                actions=EventActions(state_delta=delta),
            ),
        )

    await apply_state_delta({
        "rep_performance_profile": REP_PERFORMANCE_PROFILE,
        "account_analysis_results": ACCOUNT_ANALYSIS_RESULTS,
        "actions_taken": ACTIONS_TAKEN,
        "chat_history": [],
    })

    agent = build_chat_agent()
    runner = Runner(agent=agent, app_name=APP_NAME, session_service=session_service)

    print("Type your messages as the rep. 'quit' to exit.\n")
    while True:
        try:
            user_msg = input("Rep: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if user_msg.lower() in ("quit", "exit"):
            break
        if not user_msg:
            continue

        # re-fetch session so state from prior turn is visible
        session = await session_service.get_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        chat_history = list(session.state.get("chat_history", []))
        chat_history.append({"role": "rep", "text": user_msg})
        await apply_state_delta({"chat_history": chat_history})

        content = types.Content(role="user", parts=[types.Part(text=user_msg)])

        reply_text = ""
        async for event in runner.run_async(
            user_id=USER_ID, session_id=session_id, new_message=content
        ):
            if event.is_final_response() and event.content and event.content.parts:
                reply_text = event.content.parts[0].text

        print(f"\nAssistant: {reply_text}\n")

        # api.py's job in prod: append the assistant turn too
        session = await session_service.get_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        chat_history = list(session.state.get("chat_history", []))
        chat_history.append({"role": "assistant", "text": reply_text})
        await apply_state_delta({"chat_history": chat_history})


if __name__ == "__main__":
    asyncio.run(main())