"""
output_schema.py — Agent 2: Account Analysis Agent
Pydantic models for structured LLM output.
Manager requirement: use Pydantic for output structure.
"""

from pydantic import BaseModel, Field
from typing import List, Literal


class MissedCommitment(BaseModel):
    """A promise the rep made on a call but has not fulfilled."""
    description: str = Field(
        description="What the rep promised. E.g. 'Send proposal by Friday'"
    )
    call_date: str = Field(
        description="Date of the call where commitment was made. Format: YYYY-MM-DD"
    )
    status: Literal["fulfilled", "pending", "overdue"] = Field(
        description="Current status of this commitment"
    )


class CustomerObjection(BaseModel):
    """A concern or blocker raised by the customer."""
    objection: str = Field(
        description="What the customer objected to. E.g. 'Budget needs approval'"
    )
    severity: Literal["low", "medium", "high"] = Field(
        description="How likely this objection is to block the deal"
    )


class AccountAnalysisResult(BaseModel):
    """
    Structured output for a single account analysis.
    Gemini returns this for EACH account separately.
    All fields are required — Gemini must populate every one.
    """

    account_id: str = Field(
        description="Unique account identifier from Salesforce"
    )
    account_name: str = Field(
        description="Company name of the account"
    )
    deal_health: Literal["healthy", "at_risk", "critical", "stalled"] = Field(
        description=(
            "Overall health of the deal. "
            "healthy=progressing well, at_risk=has blockers, "
            "critical=likely to be lost, stalled=no movement"
        )
    )
    conversion_score: int = Field(
        ge=0, le=100,
        description=(
            "Likelihood of closing this deal. 0=no chance, 100=certain. "
            "Base this on deal stage, transcript sentiment, and objections."
        )
    )
    missed_commitments: List[MissedCommitment] = Field(
        default=[],
        description="List of promises rep made on calls but has not fulfilled yet"
    )
    customer_objections: List[CustomerObjection] = Field(
        default=[],
        description="Concerns or blockers raised by the customer on calls"
    )
    communication_gaps: List[str] = Field(
        default=[],
        description=(
            "Topics customer asked about that rep never addressed. "
            "E.g. ['Security compliance docs never sent', 'Pricing breakdown not shared']"
        )
    )
    recommended_action: str = Field(
        description=(
            "Single most important next step for the rep. "
            "Be specific. E.g. 'Send security compliance doc to Anil by EOD Friday'"
        )
    )
    analysis_summary: str = Field(
        description=(
            "2-3 sentence plain English summary of this account's situation. "
            "Written as if briefing a sales manager."
        )
    )

# Add only this at the bottom of your existing output_schema.py
# Everything above stays unchanged

class AllAccountsAnalysisResult(BaseModel):
    """
    Top level schema for Option A.
    Gemini analyzes ALL accounts in one call.
    Returns one AccountAnalysisResult per account.
    Agent 3 reads ctx.session.state["account_analysis_results"]
    """
    accounts: List[AccountAnalysisResult] = Field(
        description=(
            "One AccountAnalysisResult for every account in account_details. "
            "Do not skip any account."
        )
    )
