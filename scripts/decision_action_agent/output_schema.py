"""
scripts/decision_action_agent/output_schema.py

Pydantic schema for Agent 4 — Decision & Action Agent output.

Matches deck spec (Slide 7) output shape:
{
  "actions": [
    { "type": "schedule_manager_review", "rep_id": "...", "reason": "..." },
    { "type": "message_rep", "account_id": "...", "reason": "..." }
  ]
}
"""

from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class ActionRecord(BaseModel):
    """
    A single action taken (or attempted) by the Decision & Action agent.
    Covers both possible action types: schedule_manager_review, message_rep.
    """

    type: Literal["schedule_manager_review", "message_rep", "notify_manager", "recommend_coaching"] = Field(
        description="Which decision rule/action this record corresponds to"
    )

    status: Literal["SCHEDULED", "SENT", "CANCELLED", "ERROR", "SKIPPED"] = Field(
        description=(
            "Outcome of the action. SCHEDULED/SENT = tool executed successfully. "
            "CANCELLED = human did not confirm. ERROR = tool call failed. "
            "SKIPPED = rule condition not met, action not attempted at all."
        )
    )

    rep_id: str = Field(
        description="Rep identifier this action relates to"
    )

    account_id: Optional[str] = Field(
        default=None,
        description="Account identifier, only set for message_rep actions tied to a specific account"
    )

    account_ids: Optional[List[str]] = Field(
        default=None,
        description=(
            "List of account identifiers covered by this single action — "
            "used for the consolidated message_rep action which covers "
            "multiple accounts with missed commitments in one email. "
            "Null/unused for actions that aren't account-batched (e.g. "
            "schedule_manager_review, notify_manager, recommend_coaching)."
        )
    )

    reason: str = Field(
        description=(
            "Why this action was triggered — grounded in rep_assessment_result "
            "or account_analysis_results, e.g. 'Forecasted attainment 45% below "
            "60% threshold' or 'Missed commitment: ROI case not sent'"
        )
    )

    detail: Optional[str] = Field(
        default=None,
        description=(
            "Extra info about the executed action — e.g. calendar_event_id and "
            "scheduled_time for meetings, or message_id for emails. "
            "Null if action was CANCELLED, ERROR, or SKIPPED."
        )
    )


class DecisionActionResult(BaseModel):
    """
    Top-level structured output for Agent 4.
    A flat list of all actions evaluated — including ones that were
    triggered, cancelled by the human, errored, or skipped because the
    rule condition wasn't met.
    """

    actions: List[ActionRecord] = Field(
        default=[],
        description=(
            "One ActionRecord per decision rule evaluated against this rep's "
            "rep_assessment_result and account_analysis_results. Include "
            "SKIPPED entries for rules that did not trigger, so the full "
            "decision trail is auditable."
        )
    )