"""
output_schema.py — Agent 2: Account & Rep Assessment Agent
Pydantic models for structured LLM output.
"""

from pydantic import BaseModel, Field
from typing import List, Literal, Optional


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
    Structured output for a single opportunity (one per entry in
    rep_performance_profile.assigned_accounts).
    """

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------
    account_id: str = Field(
        description="Unique account identifier from Salesforce"
    )
    account_name: str = Field(
        description="Company name of the account"
    )
    opportunity_id: str = Field(
        description="Unique Salesforce opportunity ID for this specific deal"
    )
    opportunity_name: str = Field(
        description="Name of this specific opportunity"
    )

    # ------------------------------------------------------------------
    # Recent Gong context
    # ------------------------------------------------------------------
    recent_meeting_summary: str = Field(
        description=(
            "2-3 sentence synthesis of the most recent Gong call(s) for this "
            "opportunity (gong_interaction_analytics.recent_calls) — what was "
            "discussed, the customer's sentiment, and any outcome/next step. "
            "If recent_calls is empty, state that explicitly: "
            "'No Gong calls recorded in the lookback window.'"
        )
    )

    # ------------------------------------------------------------------
    # Deal health
    # ------------------------------------------------------------------
    deal_health: Literal["healthy", "at_risk", "critical", "stalled"] = Field(
        description=(
            "Overall health of the deal. "
            "healthy=progressing well, at_risk=has blockers, "
            "critical=likely to be lost, stalled=no movement."
        )
    )

    # ------------------------------------------------------------------
    # Conversion score
    # ------------------------------------------------------------------
    conversion_score: int = Field(
        ge=0, le=100,
        description=(
            "0-100 likelihood of a positive outcome for this opportunity. "
            "Base on deal stage, Gong signals, objections, sentiment, and velocity. "
            "\n"
            "Gong fine-tune adjustments (total delta bounded -30 to +10): "
            "  +5 per call with Positive call_outcome_category (max +10). "
            "  -10 per unresolved high-severity objection. "
            "  -5  per unresolved medium-severity objection. "
            "  -5  per missed commitment with status=overdue. "
            "  -10 if customer_sentiment trend Negative (last 2 calls both Negative). "
            "  +5  if customer_sentiment trend Positive (last 2 calls both Positive). "
            "  -5  per SF risk field entry not addressed in any Gong call."
        )
    )
    conversion_score_reasoning: str = Field(
        description=(
            "Explanation of how the score was reached — list each signal "
            "considered and its effect on the score."
        )
    )

    # ------------------------------------------------------------------
    # Qualitative analysis — Gong-driven signals
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------
    risk_action: str = Field(
        description=(
            "The single most urgent defensive action for the rep — "
            "fix a blocker, address a risk, or close a communication gap. "
            "Be specific: name the person, the action, and the deadline. "
            "If there are no material risks, set to: "
            "'No urgent risk action — deal is progressing cleanly.'"
        )
    )
    opportunity_action: Optional[str] = Field(
        default=None,
        description=(
            "The single best offensive action to accelerate a deal with genuine "
            "upside momentum. Only populate when conversion_score >= 55 and at "
            "least one positive signal exists (positive sentiment trend, resolved "
            "objection, customer-initiated next step). Include the specific signal, "
            "the action, the stakeholder, and a timeline. Leave null if conditions "
            "are not met."
        )
    )

    # ------------------------------------------------------------------
    # Proactive signals — NOT risk-based, kept separate from risk_action/
    # opportunity_action above
    # ------------------------------------------------------------------
    expansion_signal: Optional[str] = Field(
        default=None,
        description=(
            "Populate ONLY when this opportunity's opportunity_type is "
            "'Legacy Contract' AND has_expansion_opportunity is false — i.e. "
            "this account has no Migration/Upsell/Cross Sell opportunity open "
            "anywhere else. Name the account, state it's on a Legacy Contract "
            "with no expansion opportunity open, and suggest opening one — cite "
            "sentiment/tenure signals from gong_interaction_analytics if "
            "available. Leave null otherwise; this is upside, not risk."
        )
    )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    analysis_summary: str = Field(
        description=(
            "2-3 sentence plain English summary of this account's situation, "
            "written as if briefing a sales manager."
        )
    )


class DealReference(BaseModel):
    """Lightweight pointer to a specific opportunity, used in rep-level lists."""
    opportunity_id: str = Field(description="Salesforce opportunity ID being referenced")
    opportunity_name: str = Field(description="Opportunity name, for readability")
    account_name: str = Field(description="Account name, for readability")
    reason: str = Field(
        description=(
            "One sentence citing the specific signal that earns this deal a spot "
            "on the list (e.g. the objection, the sentiment trend, the stage gate)."
        )
    )


class RepAssessmentResult(BaseModel):
    """
    Root-level structured output for one rep.
    Rep identity and rep-level judgment live at the ROOT of the JSON;
    per-opportunity analyses are nested under `accounts`.
    Agent 3 reads ctx.session.state["rep_assessment_result"].
    """

    # ------------------------------------------------------------------
    # Rep identity (carried through from rep_performance_profile)
    # ------------------------------------------------------------------
    rep_id: str = Field(description="Salesforce/Gong rep ID")
    rep_name: str = Field(description="Rep's full name")
    rep_experience_tier: Optional[str] = Field(
        default=None, description="Rep's Everstage LEVEL, e.g. 'Mid-Market AE'"
    )

    # ------------------------------------------------------------------
    # Rep-level assessment
    # ------------------------------------------------------------------
    rep_performance_summary: str = Field(
        description=(
            "3-5 sentence plain-English briefing on this rep's overall "
            "performance this period — attainment trajectory, pipeline health, "
            "and the single biggest swing factor (positive or negative). "
            "Written as if briefing a sales manager."
        )
    )

    rep_target_attainment_score: int = Field(
        ge=0, le=100,
        description=(
            "0-100 score for the likelihood this rep hits their monthly ARR target. "
            "Base on current_month_attainment_pct already banked, the ARR gap remaining, "
            "and the realistic conversion potential of open pipeline. "
            "0-20=very unlikely, 21-45=unlikely, 46-65=possible with focused "
            "effort, 66-85=likely, 86-100=on track or already there."
        )
    )
    rep_target_attainment_reasoning: str = Field(
        description=(
            "Explain the score. State current_month_attainment_pct and the ARR "
            "gap remaining. Name the specific open opportunities that could "
            "realistically close in time, and separately name the ones that cannot "
            "and why."
        )
    )

    critical_deals: List[DealReference] = Field(
        default=[],
        description=(
            "Deals needing urgent rep/manager attention this week — deal_health "
            "critical or stalled, an unresolved high-severity objection, or open "
            "blockers close to the expected close date."
        )
    )
    best_deals_to_pursue: List[DealReference] = Field(
        default=[],
        description=(
            "Deals with genuine upside momentum the rep should prioritize this week. "
            "These should correspond to opportunities that have a populated opportunity_action."
        )
    )
    key_suggestions: List[str] = Field(
        default=[],
        description=(
            "3-5 concrete, prioritized suggestions for this rep, ordered by impact. "
            "Mix coaching (e.g. objection-handling patterns) with pipeline-management "
            "advice. Each must be specific and actionable."
        )
    )

    # ------------------------------------------------------------------
    # Per-opportunity analyses
    # ------------------------------------------------------------------
    accounts: List[AccountAnalysisResult] = Field(
        description=(
            "One AccountAnalysisResult per opportunity in "
            "rep_performance_profile.assigned_accounts. Do not skip any."
        )
    )
