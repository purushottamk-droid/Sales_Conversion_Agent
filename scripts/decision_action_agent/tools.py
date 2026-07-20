"""
scripts/decision_action_agent/tools.py

Tools for the Decision & Action Agent (Agent 3 of the pipeline).

Three tools:
  1. notify_manager  — Gmail email to the manager about rep performance + recommended actions
  2. message_rep     — Gmail email to the rep with a brief of key findings
  3. create_salesforce_task — creates a Salesforce Task via the Salesforce
     MCP server's create_task tool (Cloud Run endpoint, SSE, IAM-gated —
     see _call_mcp_tool below)

rep_email and manager_email are pulled from session state — never invented
by the model.
"""

import asyncio
import base64
import html
import json
import os
import re
from email.mime.text import MIMEText
from urllib.parse import urlsplit

from google.adk.tools import FunctionTool, ToolContext
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token
from mcp import ClientSession
from mcp.client.sse import sse_client

from auth.auth import build_gmail_service

# Same Salesforce MCP server (Cloud Run, SSE) used by the Data Collection
# Agent — see scripts/data_collection_custom_agent/agent.py's
# MCP_SALESFORCE_SERVER_URL / _call_mcp_tool for the reference pattern.
MCP_SALESFORCE_SERVER_URL = os.environ.get("MCP_SALESFORCE_SERVER_URL", "https://your-cloud-run-service-url/sse")

# Cloud Run's IAM proxy validates an identity token's `aud` claim against
# the service's base URL only (scheme + host) — a token minted with the
# /sse path as audience gets silently rejected with a 403, confirmed
# directly against the deployed service. The SSE connection itself still
# needs the full path, so these two are derived separately.
_mcp_url_parts = urlsplit(MCP_SALESFORCE_SERVER_URL)
MCP_SALESFORCE_SERVER_BASE_URL = f"{_mcp_url_parts.scheme}://{_mcp_url_parts.netloc}"


async def _get_gcp_identity_token(audience: str) -> str:
    """Fetch a GCP identity token scoped to our own Cloud Run service's
    URL, using this pipeline's Application Default Credentials — required
    because salesforce_mcp_server is deployed with
    --no-allow-unauthenticated (Cloud Run IAM gated, confirmed via a real
    403 without this token). Mirrors the Data Collection Agent's helper."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, id_token.fetch_id_token, google_auth_requests.Request(), audience
    )


async def _call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """Opens an SSE session to the Salesforce MCP server, calls one tool,
    and returns its parsed JSON result. Sends a GCP identity token — the
    Cloud Run endpoint is IAM-gated (--no-allow-unauthenticated), confirmed
    via a real 403 without one. Mirrors the Data Collection Agent's
    _call_mcp_tool helper."""
    identity_token = await _get_gcp_identity_token(MCP_SALESFORCE_SERVER_BASE_URL)
    async with sse_client(MCP_SALESFORCE_SERVER_URL, headers={"Authorization": f"Bearer {identity_token}"}) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)
            if result.isError:
                raise RuntimeError(f"MCP tool '{tool_name}' returned an error: {result.content}")
            return json.loads(result.content[0].text)


def _build_mime_email(to: str, subject: str, body_html: str) -> str:
    """Encode a MIME HTML email as a base64url string for the Gmail API."""
    msg = MIMEText(body_html, "html")
    msg["to"] = to
    msg["subject"] = subject
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


def _markdown_to_html(text: str) -> str:
    """Convert the lightweight markdown the model tends to produce
    (**bold**, '- ' bullet lines, numbered lines, blank-line paragraphs)
    into real HTML, so it renders properly in Gmail instead of showing
    literal asterisks/dashes.

    Also auto-bolds a leading 'Label:' at the start of a bullet/line even
    when the model forgot to wrap it in **...** itself, so deal names and
    field labels always stand out.
    """
    import re

    if not text:
        return ""

    def bold(s: str) -> str:
        # Explicit **bold** markers
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        # Fallback: auto-bold a leading "Label:" that wasn't already marked
        if "<strong>" not in s:
            s = re.sub(r"^([^:<]{2,60}:)", r"<strong>\1</strong>", s)
        return s

    # Strip a numbered-list prefix like "1. " down to a plain bullet
    def strip_number(ln: str) -> str:
        return re.sub(r"^\d+\.\s+", "", ln)

    raw_lines = [ln.strip() for ln in text.strip().split("\n")]
    html_parts = []
    para_buf, list_buf = [], []

    def flush_para():
        if para_buf:
            html_parts.append(
                f'<p style="margin:0 0 12px 0;">{bold("<br>".join(para_buf))}</p>'
            )
            para_buf.clear()

    def flush_list():
        if list_buf:
            items = "".join(f"<li style=\"margin-bottom:6px;\">{bold(x)}</li>" for x in list_buf)
            html_parts.append(
                f'<ul style="margin:0 0 14px 0; padding-left:20px;">{items}</ul>'
            )
            list_buf.clear()

    for raw in raw_lines:
        ln = strip_number(raw)
        if not ln:
            flush_para()
            flush_list()
            continue
        if ln.startswith("- "):
            flush_para()
            list_buf.append(ln[2:].strip())
        elif raw != ln:  # was a numbered line
            flush_para()
            list_buf.append(ln)
        else:
            flush_list()
            para_buf.append(ln)

    flush_para()
    flush_list()

    return "".join(html_parts)


# Shared font stack / base styles so every email looks consistent and
# renders with real typography (not default serif) across Gmail clients.
_FONT_STACK = (
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, "
    "Arial, sans-serif"
)


# ---------------------------------------------------------------------
# TOOL 1 — Notify manager (Gmail API)
# ---------------------------------------------------------------------

async def notify_manager(
    rep_id: str,
    rep_name: str,
    manager_email: str,
    performance_summary: str,
    recommended_actions: str,
    tool_context: ToolContext,
) -> dict:
    """Send a performance briefing email to the manager about this rep.

    Covers: overall attainment trajectory, critical deals, pipeline risks,
    and concrete recommended manager actions to move the needle.

    manager_email MUST come from session state — never invented or guessed.
    """
    subject = f"Rep Performance Alert — {rep_name} ({rep_id})"

    body_html = f"""
    <html>
    <body style="margin:0; padding:0; background:#f4f5f7; font-family:{_FONT_STACK};">
      <div style="max-width:640px; margin:0 auto; padding:24px 16px;">
        <div style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <div style="background:#c0392b; padding:20px 28px;">
            <div style="color:#ffffff; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85; margin-bottom:4px;">
              Rep Performance Alert
            </div>
            <div style="color:#ffffff; font-size:20px; font-weight:700;">
              {rep_name}
            </div>
            <div style="color:#ffffff; font-size:13px; opacity:0.85; margin-top:2px;">
              Rep ID: {rep_id}
            </div>
          </div>

          <div style="padding:28px;">
            <div style="font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#c0392b; margin-bottom:10px;">
              Performance Summary
            </div>
            <div style="font-size:14px; color:#2c3e50; line-height:1.55;">
              {_markdown_to_html(performance_summary)}
            </div>

            <div style="font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#2980b9; margin:20px 0 10px 0;">
              Recommended Actions
            </div>
            <div style="font-size:14px; color:#2c3e50; line-height:1.55; background:#f7f9fc; border-left:4px solid #2980b9; padding:14px 16px; border-radius:4px;">
              {_markdown_to_html(recommended_actions)}
            </div>
          </div>

          <div style="padding:16px 28px; background:#f9fafb; border-top:1px solid #eef0f2;">
            <div style="color:#9aa2ab; font-size:11px;">
              Generated by the Sales Conversion Agent pipeline &middot; Data sourced from Salesforce and Gong.
            </div>
          </div>

        </div>
      </div>
    </body>
    </html>
    """

    try:
        service = build_gmail_service()
        raw = _build_mime_email(manager_email, subject, body_html)
        sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()

        return {
            "status": "SENT",
            "type": "notify_manager",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "manager_email": manager_email,
            "subject": subject,
            "message_id": sent.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "notify_manager",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "error_message": str(e),
        }


# ---------------------------------------------------------------------
# TOOL 2 — Message rep (Gmail API)
# ---------------------------------------------------------------------

async def message_rep(
    rep_id: str,
    rep_name: str,
    rep_email: str,
    findings_summary: str,
    tool_context: ToolContext,
) -> dict:
    """Send a brief findings email directly to the rep.

    Covers: key risks flagged across their pipeline, missed commitments,
    and the top actions they should take this week.

    rep_email MUST come from session state — never invented or guessed.
    """
    subject = f"Your Pipeline — Key Actions This Week"

    body_html = f"""
    <html>
    <body style="margin:0; padding:0; background:#f4f5f7; font-family:{_FONT_STACK};">
      <div style="max-width:640px; margin:0 auto; padding:24px 16px;">
        <div style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <div style="background:#2980b9; padding:20px 28px;">
            <div style="color:#ffffff; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85; margin-bottom:4px;">
              Weekly Pipeline Brief
            </div>
            <div style="color:#ffffff; font-size:20px; font-weight:700;">
              Key Actions This Week
            </div>
          </div>

          <div style="padding:28px;">
            <p style="font-size:14px; color:#2c3e50; margin:0 0 8px 0;">Hi {rep_name},</p>
            <p style="font-size:14px; color:#2c3e50; margin:0 0 18px 0;">
              Here's a brief summary of key findings across your pipeline that need your attention:
            </p>

            <div style="background:#f7f9fc; border-left:4px solid #2980b9; padding:16px 18px; border-radius:4px; font-size:14px; color:#2c3e50; line-height:1.55;">
              {_markdown_to_html(findings_summary)}
            </div>

            <p style="font-size:14px; color:#2c3e50; margin:18px 0 0 0;">
              Please action these this week to keep your deals on track.
            </p>
            <p style="font-size:14px; color:#2c3e50; margin:16px 0 0 0;">
              Best,<br>Sales Ops
            </p>
          </div>

          <div style="padding:16px 28px; background:#f9fafb; border-top:1px solid #eef0f2;">
            <div style="color:#9aa2ab; font-size:11px;">
              Generated by the Sales Conversion Agent pipeline.
            </div>
          </div>

        </div>
      </div>
    </body>
    </html>
    """

    try:
        service = build_gmail_service()
        raw = _build_mime_email(rep_email, subject, body_html)
        sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()

        return {
            "status": "SENT",
            "type": "message_rep",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "rep_email": rep_email,
            "subject": subject,
            "message_id": sent.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "message_rep",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "error_message": str(e),
        }


# ---------------------------------------------------------------------
# TOOL 3 — Create Salesforce task (Salesforce MCP server, create_task)
# ---------------------------------------------------------------------

async def create_salesforce_task(
    rep_id: str,
    account_id: str,
    subject: str,
    description: str,
    tool_context: ToolContext,
) -> dict:
    """Create a Salesforce Task via the Salesforce MCP server's create_task
    tool. Anchored to the Account (not a specific Opportunity) — matches
    create_task's own design on the server side. rep_id is passed through
    as the task owner (OwnerId).

    WHEN THIS TOOL SHOULD BE CALLED, AND WITH WHAT ARGUMENTS, IS DECIDED BY
    THE AGENT'S PROMPT — see prompt.py's placeholder rule. This tool itself
    has no judgment; it just executes the create_task call it's given.
    """
    try:
        mcp_result = await _call_mcp_tool(
            "create_task",
            {
                "account_id": account_id,
                "owner_id": rep_id,
                "subject": subject,
                "description": description,
            },
        )
        return {
            "status": "SENT",
            "type": "create_salesforce_task",
            "rep_id": rep_id,
            "account_id": account_id,
            "subject": subject,
            "salesforce_task_id": mcp_result.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "create_salesforce_task",
            "rep_id": rep_id,
            "account_id": account_id,
            "error_message": str(e),
        }


# ---------------------------------------------------------------------
# FunctionTool wrappers
# ---------------------------------------------------------------------

notify_manager_tool = FunctionTool(func=notify_manager)
message_rep_tool = FunctionTool(func=message_rep)
create_salesforce_task_tool = FunctionTool(func=create_salesforce_task)