"""
run_api_local.py

Starts the FULL FastAPI app (api.py — /agent/sessions, /agent/run,
/agent/result, /agent/chat) locally, backed by a locally-started
salesforce_mcp_server, so you can hit every endpoint with your own curl
commands instead of a deployed Cloud Run service. One command, no manual
server-start step.

Runs in the foreground — Ctrl+C stops both the API server and the local
MCP server cleanly.

Auth note: same as run_pipeline_local.py — api.py's agents mint a real
GCP identity token for Cloud Run IAM when calling salesforce_mcp_server,
which needs service-account/Cloud-Run-metadata credentials this shell
doesn't have. The local server has no IAM check to satisfy anyway, so
this script patches that one function in-process to a dummy token.
Nothing on disk is modified.

Usage:
    python run_api_local.py [api_port]   # defaults to 8081

Requires: BigQuery access (gcloud auth application-default login) and
Vertex AI access for the same GCP project, plus the usual .env Salesforce
JWT credentials.
"""

import os
import sys

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
_VENV_PYTHON = os.path.join(REPO_ROOT, ".venv", "bin", "python3")

# Re-exec under the project's venv if we weren't already launched with it —
# this repo's dependencies (fastapi, uvicorn, google-adk, mcp, ...) live
# there, not in whatever `python3` happens to resolve to on PATH.
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


def main() -> None:
    api_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081

    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "1")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "atgeir-moae-dev")
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")
    # Must be set before scripts.SequentialAgent (or anything importing
    # scripts.data_collection_custom_agent.agent) is imported — that
    # module reads it as a module-level constant, not lazily per-call.
    os.environ["MCP_SALESFORCE_SERVER_URL"] = LOCAL_MCP_URL

    from dotenv import load_dotenv
    load_dotenv(os.path.join(REPO_ROOT, ".env"))

    print(f"[run_api_local] Starting local salesforce_mcp_server on port {LOCAL_MCP_PORT} ...")
    mcp_proc = _start_local_mcp_server()
    _wait_until_ready(mcp_proc)
    print("[run_api_local] Local MCP server ready.")

    # Local-only auth bypass — see module docstring.
    async def _dummy_identity_token(audience: str) -> str:
        return "local-dev-dummy-token"

    import scripts.data_collection_custom_agent.agent as dc_agent
    import scripts.decision_action_agent.tools as da_tools
    dc_agent._get_gcp_identity_token = _dummy_identity_token
    da_tools._get_gcp_identity_token = _dummy_identity_token

    import api  # noqa: E402  (must come after the patches above)
    import uvicorn

    print(f"[run_api_local] Starting api.py on http://localhost:{api_port}")
    print(f"""
[run_api_local] Example curl sequence:

  RESPONSE=$(curl -s -X POST http://localhost:{api_port}/agent/sessions \\
       -H "Content-Type: application/json" \\
       -d '{{"user_id":"local1","sales_rep_name":"Maya Chen","rep_email":"rep@example.com","manager_email":"mgr@example.com"}}')
  echo "$RESPONSE"
  SESSION_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")

  curl -N -X POST http://localhost:{api_port}/agent/run \\
       -H "Content-Type: application/json" \\
       -d "{{\\"user_id\\":\\"local1\\",\\"session_id\\":\\"$SESSION_ID\\"}}"

  curl -s http://localhost:{api_port}/agent/result/$SESSION_ID?user_id=local1

  curl -s -X POST http://localhost:{api_port}/agent/chat \\
       -H "Content-Type: application/json" \\
       -d "{{\\"user_id\\":\\"local1\\",\\"session_id\\":\\"$SESSION_ID\\",\\"message\\":\\"Which of my deals is most at risk?\\"}}"

[run_api_local] Ctrl+C to stop.
""")

    try:
        uvicorn.run(api.api, host="0.0.0.0", port=api_port)
    finally:
        _stop_local_mcp_server(mcp_proc)
        print("\n[run_api_local] Local MCP server stopped.")


if __name__ == "__main__":
    main()
