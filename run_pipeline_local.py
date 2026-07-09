"""
run_pipeline_local.py (feature/sales_release variant)

Runs the full 3-agent pipeline end to end against a LOCALLY started
salesforce_mcp_server instead of a deployed Cloud Run service — one
command, no manual server-start step, no prompts during execution.

Starts salesforce_mcp_server/server.py as a subprocess, waits for it to
be ready, points the pipeline's MCP client at it, runs the pipeline for
one rep, prints the full final session state, then always tears the
server subprocess down (success or failure).

Auth note: unlike feature/gunjan, this branch's MCP client
(scripts/data_collection_custom_agent/agent.py's _call_mcp_tool) sends no
auth headers at all — Cloud Run IAM is what gates access in production,
not the server itself, so no identity-token bypass is needed here to hit
a local, unauthenticated instance.

MCP_SALESFORCE_SERVER_URL is read at MODULE IMPORT TIME by agent.py (a
module-level constant, not read lazily per-call), so it must be set
before scripts.SequentialAgent (or anything importing agent.py) is
imported — see main() below.

Usage:
    python run_pipeline_local.py ["Rep Name"]

Requires: BigQuery access (gcloud auth application-default login) and
Vertex AI access for the same GCP project, plus the usual .env Salesforce
JWT credentials.
"""

import os
import sys

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
_VENV_PYTHON = os.path.join(REPO_ROOT, ".venv", "bin", "python3")

# Re-exec under the project's venv if we weren't already launched with it —
# this repo's dependencies (httpx, google-adk, mcp, ...) live there, not in
# whatever `python3` happens to resolve to on PATH.
if os.path.exists(_VENV_PYTHON) and os.path.realpath(sys.executable) != os.path.realpath(_VENV_PYTHON):
    os.execv(_VENV_PYTHON, [_VENV_PYTHON] + sys.argv)

import atexit
import subprocess
import time

import httpx

LOCAL_MCP_PORT = 8080
LOCAL_MCP_URL = f"http://localhost:{LOCAL_MCP_PORT}/sse"
READY_TIMEOUT_SECONDS = 15


def _start_local_mcp_server() -> subprocess.Popen:
    env = {**os.environ, "PORT": str(LOCAL_MCP_PORT)}
    proc = subprocess.Popen(
        [sys.executable, "-m", "salesforce_mcp_server.server"],
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    atexit.register(_stop_local_mcp_server, proc)
    return proc


def _stop_local_mcp_server(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def _wait_until_ready(proc: subprocess.Popen) -> None:
    deadline = time.time() + READY_TIMEOUT_SECONDS
    while time.time() < deadline:
        if proc.poll() is not None:
            output = proc.stdout.read() if proc.stdout else ""
            raise RuntimeError(f"salesforce_mcp_server exited early (code {proc.returncode}):\n{output}")
        try:
            with httpx.Client(timeout=2) as client:
                with client.stream("GET", LOCAL_MCP_URL) as response:
                    if response.status_code == 200:
                        return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"salesforce_mcp_server did not become ready within {READY_TIMEOUT_SECONDS}s")


async def _run_pipeline_and_print_results(rep_name: str) -> None:
    import json

    from google.adk.runners import InMemoryRunner
    from google.genai import types

    from scripts.SequentialAgent import root_agent

    runner = InMemoryRunner(agent=root_agent, app_name="sales_rep_pipeline")
    session = await runner.session_service.create_session(
        app_name="sales_rep_pipeline",
        user_id="local_test_user",
        state={
            "sales_rep_name": rep_name,
            "rep_email": "kakadetalent@gmail.com",
            "manager_email": "kakade007k@gmail.com",
        },
    )

    async for event in runner.run_async(
        user_id="local_test_user",
        session_id=session.id,
        new_message=types.Content(role="user", parts=[types.Part(text="start")]),
    ):
        print(f"[{event.author}] event")

    final = await runner.session_service.get_session(
        app_name="sales_rep_pipeline", user_id="local_test_user", session_id=session.id,
    )

    print("\n\n════════════ FINAL SESSION STATE ════════════")
    print("\n--- rep_performance_profile (Agent 1) ---")
    print(json.dumps(final.state.get("rep_performance_profile"), indent=2, default=str))
    print("\n--- account_analysis_results (Agent 2) ---")
    print(json.dumps(final.state.get("account_analysis_results"), indent=2, default=str))
    print("\n--- actions_taken (Agent 3) ---")
    print(json.dumps(final.state.get("actions_taken"), indent=2, default=str))


def main() -> None:
    rep_name = sys.argv[1] if len(sys.argv) > 1 else "Maya Chen"

    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "1")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "atgeir-moae-dev")
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")
    # Must be set before scripts.SequentialAgent (or anything importing
    # scripts.data_collection_custom_agent.agent) is imported — see module
    # docstring, this branch reads it as a module-level constant.
    os.environ["MCP_SALESFORCE_SERVER_URL"] = LOCAL_MCP_URL

    from dotenv import load_dotenv
    load_dotenv(os.path.join(REPO_ROOT, ".env"))

    print(f"[run_pipeline_local] Starting local salesforce_mcp_server on port {LOCAL_MCP_PORT} ...")
    server_proc = _start_local_mcp_server()
    _wait_until_ready(server_proc)
    print("[run_pipeline_local] Local MCP server ready.")

    import asyncio

    print(f"[run_pipeline_local] Running pipeline for rep: {rep_name}\n")
    try:
        asyncio.run(_run_pipeline_and_print_results(rep_name))
    finally:
        _stop_local_mcp_server(server_proc)
        print("\n[run_pipeline_local] Local MCP server stopped.")


if __name__ == "__main__":
    main()
