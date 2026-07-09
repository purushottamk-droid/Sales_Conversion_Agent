"""
scripts/decision_action_agent/output_schema.py

Pydantic schema for the Decision & Action Agent output.
"""

from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class ActionRecord(BaseModel):
    """A single action taken (or skipped) by the Decision & Action agent."""

    type: Literal["notify_manager", "message_rep", "create_salesforce_task"] = Field(
        description="Which action this record corresponds to"
    )

    status: Literal["SENT", "ERROR", "SKIPPED"] = Field(
        description=(
            "Outcome of the action. "
            "SENT = tool executed successfully. "
            "ERROR = tool call failed. "
            "SKIPPED = required session state value missing."
        )
    )

    rep_id: str = Field(description="Rep identifier this action relates to")

    rep_name: Optional[str] = Field(
        default=None,
        description="Rep's full name, for readability in the audit trail"
    )

    account_id: Optional[str] = Field(
        default=None,
        description=(
            "Account identifier this action relates to — only set for "
            "create_salesforce_task, which is per-account (0 to N per run), "
            "unlike notify_manager/message_rep which are once per rep."
        )
    )

    account_name: Optional[str] = Field(
        default=None,
        description="Account name, for readability — only set for create_salesforce_task"
    )

    reason: str = Field(
        description="One sentence — why this action was taken or skipped"
    )

    detail: Optional[str] = Field(
        default=None,
        description=(
            "Extra info about the executed action — e.g. Gmail message_id. "
            "Null if status is ERROR or SKIPPED."
        )
    )


class DecisionActionResult(BaseModel):
    """Top-level output for the Decision & Action Agent."""

    actions: List[ActionRecord] = Field(
        default=[],
        description=(
            "One ActionRecord per rule evaluated. Includes SKIPPED entries "
            "so the full decision trail is auditable."
        )
    )
