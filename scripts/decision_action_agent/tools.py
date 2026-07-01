"""
scripts/decision_action_agent/tools.py

Tools for the Decision & Action Agent (Agent 4 of 4).

Both tools have real side effects (send a calendar invite, send an
email) and therefore ALWAYS require explicit human confirmation before
executing — gated via tool_context.tool_confirmation.confirmed.

rep_email and manager_email are expected to already be present in
session state (rep_quota_metrics.rep_email / rep_quota_metrics.manager_email),
sourced from Agent 1. They must NEVER be invented or guessed by the model.
"""

from datetime import datetime, timedelta

from google.adk.tools import FunctionTool, ToolContext

from auth.auth import build_gmail_service, build_calendar_service

import base64
from email.mime.text import MIMEText


# ---------------------------------------------------------------------
# Helper — fixed scheduling rule (Option A, per manager's decision)
# ---------------------------------------------------------------------

def _next_business_day_10am() -> tuple[str, str]:
    """
    Returns (start_iso, end_iso) for a 30-min meeting at 10:00 AM
    on the next business day (skips Sat/Sun).
    """
    now = datetime.now()
    next_day = now + timedelta(days=1)
    while next_day.weekday() >= 5:  # 5=Sat, 6=Sun
        next_day += timedelta(days=1)

    start = next_day.replace(hour=10, minute=0, second=0, microsecond=0)
    end = start + timedelta(minutes=30)
    return start.isoformat(), end.isoformat()


# ---------------------------------------------------------------------
# TOOL 1 — Schedule manager review meeting (Calendar API)
# ---------------------------------------------------------------------

async def schedule_review_meeting(
    rep_id: str,
    rep_email: str,
    manager_email: str,
    reason: str,
    tool_context: ToolContext,
) -> dict:
    """Schedule a manager review meeting for an at-risk rep via Calendar API.

    Both rep_email and manager_email are added as attendees, so this is
    an actual review conversation between the rep and their manager —
    not just a reminder for the manager alone.

    rep_email and manager_email MUST come from session state
    (rep_quota_metrics.rep_email / rep_quota_metrics.manager_email) —
    never invented or guessed by the model.

    Time is fixed: next business day at 10:00 AM, 30-minute meeting.

    Always requires human confirmation before the calendar invite is
    actually sent.
    """
    if not tool_context.tool_confirmation.confirmed:
        return {"status": "CANCELLED", "rep_id": rep_id}

    start_iso, end_iso = _next_business_day_10am()

    try:
        service = build_calendar_service()

        event = {
            "summary": f"Manager Review: {rep_id}",
            "description": reason,
            "start": {"dateTime": start_iso, "timeZone": "Asia/Kolkata"},
            "end": {"dateTime": end_iso, "timeZone": "Asia/Kolkata"},
            "attendees": [
                {"email": rep_email},
                {"email": manager_email},
            ],
            "conferenceData": {
                "createRequest": {
                    "requestId": f"review-{rep_id}-{int(datetime.utcnow().timestamp())}",
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }

        created_event = (
            service.events()
            .insert(calendarId="primary", body=event, conferenceDataVersion=1)
            .execute()
        )

        event_id = created_event.get("id")
        meet_link = None
        if "conferenceData" in created_event:
            for ep in created_event["conferenceData"].get("entryPoints", []):
                if ep.get("entryPointType") == "video":
                    meet_link = ep.get("uri")

        return {
            "status": "SCHEDULED",
            "type": "schedule_manager_review",
            "rep_id": rep_id,
            "rep_email": rep_email,
            "manager_email": manager_email,
            "reason": reason,
            "scheduled_time": start_iso,
            "calendar_event_id": event_id,
            "meet_link": meet_link,
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "schedule_manager_review",
            "rep_id": rep_id,
            "error_message": str(e),
        }


# ---------------------------------------------------------------------
# TOOL 2 — Message the rep directly (Gmail API)
# ---------------------------------------------------------------------

# async def message_rep(
#     rep_id: str,
#     rep_email: str,
#     account_id: str,
#     subject: str,
#     message: str,
#     tool_context: ToolContext,
# ) -> dict:
    # """Send a direct email nudge to the rep about a specific account
    # (e.g. missed commitment, communication gap).

    # rep_email MUST come from session state (rep_quota_metrics.rep_email) —
    # never invented or guessed by the model.

    # Always requires human confirmation before sending.
    # """
#     if not tool_context.tool_confirmation.confirmed:
#         return {"status": "CANCELLED", "rep_id": rep_id, "account_id": account_id}

#     try:
#         service = build_gmail_service()

#         mime_message = MIMEText(message, "plain")
#         mime_message["to"] = rep_email
#         mime_message["subject"] = subject

#         raw_message = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

#         sent = (
#             service.users()
#             .messages()
#             .send(userId="me", body={"raw": raw_message})
#             .execute()
#         )

#         return {
#             "status": "SENT",
#             "type": "message_rep",
#             "rep_id": rep_id,
#             "account_id": account_id,
#             "rep_email": rep_email,
#             "subject": subject,
#             "message": message,
#             "message_id": sent.get("id"),
#         }

#     except Exception as e:
#         return {
#             "status": "ERROR",
#             "type": "message_rep",
#             "rep_id": rep_id,
#             "account_id": account_id,
#             "error_message": str(e),
#         }

async def message_rep(
    rep_id: str,
    rep_email: str,
    account_ids: list[str],
    accounts_summary: str,
    tool_context: ToolContext,
) -> dict:
    """Send a direct email nudge to the rep about a specific account
    (e.g. missed commitment, communication gap).

    rep_email MUST come from session state (rep_quota_metrics.rep_email) —
    never invented or guessed by the model.

    Always requires human confirmation before sending.
    """
    if not tool_context.tool_confirmation.confirmed:
        return {"status": "CANCELLED", "rep_id": rep_id, "account_ids": account_ids}

    try:
        service = build_gmail_service()
        subject = "Action Required: Overdue Commitments Across Your Accounts"
        mime_message = MIMEText(accounts_summary, "plain")
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
            "type": "message_rep",
            "rep_id": rep_id,
            "account_ids": account_ids,
            "rep_email": rep_email,
            "subject": subject,
            "message_id": sent.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "message_rep",
            "rep_id": rep_id,
            "account_ids": account_ids,
            "error_message": str(e),
        }


# ---------------------------------------------------------------------
# TOOL 3 — Notify manager about multiple at-risk accounts (Gmail API)
# ---------------------------------------------------------------------

async def notify_manager(
    rep_id: str,
    manager_email: str,
    reason: str,
    tool_context: ToolContext,
) -> dict:
    """Notify the manager that this rep has multiple accounts at risk.

    manager_email MUST come from session state — never invented or guessed.

    Always requires human confirmation before sending.
    """
    if not tool_context.tool_confirmation.confirmed:
        return {"status": "CANCELLED", "rep_id": rep_id}

    try:
        service = build_gmail_service()

        subject = f"Multiple at-risk accounts — {rep_id}"
        mime_message = MIMEText(reason, "plain")
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
            "type": "notify_manager",
            "rep_id": rep_id,
            "manager_email": manager_email,
            "subject": subject,
            "reason": reason,
            "message_id": sent.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "notify_manager",
            "rep_id": rep_id,
            "error_message": str(e),
        }


# ---------------------------------------------------------------------
# TOOL 4 — Recommend coaching to manager (Gmail API)
# ---------------------------------------------------------------------

async def recommend_coaching(
    rep_id: str,
    manager_email: str,
    reason: str,
    tool_context: ToolContext,
) -> dict:
    """Recommend coaching for this rep to their manager, based on
    recurring communication gaps across accounts.

    manager_email MUST come from session state — never invented or guessed.

    Always requires human confirmation before sending.
    """
    if not tool_context.tool_confirmation.confirmed:
        return {"status": "CANCELLED", "rep_id": rep_id}

    try:
        service = build_gmail_service()

        subject = f"Coaching recommended — {rep_id}"
        mime_message = MIMEText(reason, "plain")
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
            "type": "recommend_coaching",
            "rep_id": rep_id,
            "manager_email": manager_email,
            "subject": subject,
            "reason": reason,
            "message_id": sent.get("id"),
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "type": "recommend_coaching",
            "rep_id": rep_id,
            "error_message": str(e),
        }


# ---------------------------------------------------------------------
# Register as FunctionTools — confirmation required for both
# ---------------------------------------------------------------------

schedule_review_meeting_tool = FunctionTool(
    func=schedule_review_meeting,
    require_confirmation=True,
)

message_rep_tool = FunctionTool(
    func=message_rep,
    require_confirmation=True,
)

schedule_review_meeting_tool = FunctionTool(
    func=schedule_review_meeting,
    require_confirmation=True,
)

message_rep_tool = FunctionTool(
    func=message_rep,
    require_confirmation=True,
)

notify_manager_tool = FunctionTool(
    func=notify_manager,
    require_confirmation=True,
)

recommend_coaching_tool = FunctionTool(
    func=recommend_coaching,
    require_confirmation=True,
)