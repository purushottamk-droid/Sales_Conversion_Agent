"""
scripts/decision_action_agent/tools.py

Tools for the Decision & Action Agent (Agent 4 of 4).



rep_email and manager_email are expected to already be present in
session state (rep_quota_metrics.rep_email / rep_quota_metrics.manager_email),
sourced from Agent 1. They must NEVER be invented or guessed by the model.
"""

from datetime import datetime, timedelta

from google.adk.tools import FunctionTool, ToolContext

from auth.auth import build_gmail_service

import base64
from email.mime.text import MIMEText


def _format_html_email(rep_name: str, rep_id: str, body_text: str) -> str:
    """
    Wraps plain-text content (which arrives from the LLM with \n line breaks)
    into basic HTML so Gmail renders it with proper line breaks/spacing
    instead of a flat wall of text.
    """
    body_html = body_text.replace("\n", "<br>")
    return f"""
    <html><body>
    <p>Hi,</p>
    <p>Regarding <b>{rep_name}</b> (Rep ID: {rep_id}):</p>
    <p>{body_html}</p>
    <p>Please follow up at your earliest convenience.</p>
    </body></html>
    """

def _format_html_email_rep(rep_name: str, body_text: str) -> str:
    """
    Rep-specific email formatter — greets the rep by name directly
    since this email goes TO the rep, not about them.
    """
    body_html = body_text.replace("\n", "<br>")
    return f"""
    <html><body>
    <p>Hi {rep_name},</p>
    <p>{body_html}</p>
    <p>Please review and take action at your earliest convenience.</p>
    </body></html>
    """

async def send_email_to_rep(
    rep_id: str,
    rep_name: str,
    rep_email: str,
    email_body: str,
    tool_context: ToolContext,
) -> dict:
    """
    Send a single consolidated email to the rep containing:
    - Assigned actions (risk_action per account)
    - Context (analysis_summary per account)
    - Recent meeting summaries (BRIEF from last 1-2 Gong calls per account)
    - Prescription for better conversion (opportunity_action per account)

    rep_email MUST come from session state — never invented or guessed.
    email_body is built by the LLM from account_analysis_results and
    account_details and passed in as a fully formatted string.
    """
    try:
        service = build_gmail_service()

        subject = f"Your Account Brief — Actions, Context & Prescriptions | {rep_name}"

        mime_message = MIMEText(
            _format_html_email_rep(rep_name, email_body), "html"
        )
        mime_message["to"] = rep_email
        mime_message["subject"] = subject

        raw_message = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

        sent = (
            service.users()
            .messages()
            .send(userId="me", body={"raw": raw_message})
            .execute()
        )

        return {
            "status": "SENT",
            "type": "send_email_to_rep",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "rep_email": rep_email,
            "subject": subject,
            "message_id": sent.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "send_email_to_rep",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "error_message": str(e),
        }


async def send_email_to_manager(
    rep_id: str,
    rep_name: str,
    manager_email: str,
    email_body: str,
    tool_context: ToolContext,
) -> dict:
    """
    Send a single consolidated email to the manager covering:
    - Rep's quota risk (forecasted_attainment, overall_risk)
    - At-risk accounts summary
    - Recurring patterns across accounts
    - Coaching signals

    manager_email MUST come from session state — never invented or guessed.
    email_body is built by the LLM from rep_assessment_result and
    account_analysis_results and passed in as a fully formatted string.
    """
    try:
        service = build_gmail_service()

        subject = f"Rep Performance Brief — {rep_name} ({rep_id})"

        mime_message = MIMEText(
            _format_html_email(rep_name, rep_id, email_body), "html"
        )
        mime_message["to"] = manager_email
        mime_message["subject"] = subject

        raw_message = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

        sent = (
            service.users()
            .messages()
            .send(userId="me", body={"raw": raw_message})
            .execute()
        )

        return {
            "status": "SENT",
            "type": "send_email_to_manager",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "manager_email": manager_email,
            "subject": subject,
            "message_id": sent.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "send_email_to_manager",
            "rep_id": rep_id,
            "rep_name": rep_name,
            "error_message": str(e),
        }

send_email_to_rep_tool = FunctionTool(func=send_email_to_rep)
send_email_to_manager_tool = FunctionTool(func=send_email_to_manager)