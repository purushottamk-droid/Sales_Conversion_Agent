"""
output_schema.py — Agent 2: Account Analysis Agent
Pydantic models for structured LLM output.

Changes from v1:
- AccountAnalysisResult gains opportunity_type, opportunity_category,
  close_date, conversion_score_ceiling, and conversion_score_reasoning.
- conversion_score description enforces type-category ceilings so
  Cancellation/Downsell/Concession can never score as healthy deals.
- deal_health description updated to factor in opportunity type.
- recommended_action split into two fields:
    risk_action        — defensive: fix blockers, mitigate contraction
    opportunity_action — offensive: accelerate deals with genuine upside
  These are kept separate so Agent 3 and the UI can treat them
  independently (risk triage vs. pipeline acceleration).
- AllAccountsAnalysisResult unchanged.
"""

from pydantic import BaseModel, Field, model_validator
from typing import List, Literal, Optional


OpportunityCategory = Literal[
    "growth",        # New Logo, Partner, New Product Introduction,
                     # Product Migration, Cross Sell, Upsell
    "retention",     # Renewal, Legacy Contract
    "contraction",   # Downsell, Cancellation, Concession
    "administrative" # Change Order, Transfer, Services Only
]


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
    All fields are required unless marked Optional.

    Scoring order of precedence (most important to least):
      1. opportunity_category  — sets hard ceiling on conversion_score
      2. opportunity_stage     — sets baseline within that ceiling
      3. Gong signals          — fine-tune within stage baseline
    Gong signals alone must never override the category ceiling.
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

    # ------------------------------------------------------------------
    # Opportunity type — established FIRST, before any scoring
    # ------------------------------------------------------------------
    opportunity_type: str = Field(
        description=(
            "Raw opportunity_type value from Salesforce. "
            "E.g. 'New Logo', 'Renewal', 'Cancellation', 'Upsell'. "
            "Copy exactly as it appears in the data — do not normalise."
        )
    )
    opportunity_category: OpportunityCategory = Field(
        description=(
            "Category bucket derived from opportunity_type. "
            "growth     = New Logo, Partner, New Product Introduction, "
            "             Product Migration, Cross Sell, Upsell. "
            "retention  = Renewal, Legacy Contract. "
            "contraction= Downsell, Cancellation, Concession. "
            "administrative = Change Order, Transfer, Services Only."
        )
    )
    opportunity_stage: str = Field(
        description=(
            "Current Salesforce opportunity stage. "
            "Copy exactly as it appears in the data."
        )
    )
    close_date: str = Field(
        description=(
            "Opportunity close date from Salesforce. Format: YYYY-MM-DD. "
            "Used to flag urgency — if close_date is within 30 days, "
            "factor that into risk_action."
        )
    )

    # ------------------------------------------------------------------
    # Deal health
    # ------------------------------------------------------------------
    deal_health: Literal["healthy", "at_risk", "critical", "stalled"] = Field(
        description=(
            "Overall health of the deal. "
            "Interpret in context of opportunity_category. "
            "For contraction (Cancellation/Downsell/Concession): "
            "  'healthy' means rep has an active mitigation plan — NOT that the deal is growing. "
            "  'critical' means the contraction is proceeding uncontested. "
            "For growth/retention: "
            "  healthy=progressing well, at_risk=has blockers, "
            "  critical=likely to be lost, stalled=no movement."
        )
    )

    # ------------------------------------------------------------------
    # Conversion score
    # ------------------------------------------------------------------
    conversion_score_ceiling: int = Field(
        ge=0, le=100,
        description=(
            "Hard ceiling applied before stage and Gong adjustments. "
            "Derived from opportunity_category: "
            "  growth=100, retention=90, contraction=40, administrative=60. "
            "The final conversion_score must never exceed this value."
        )
    )
    conversion_score: int = Field(
        ge=0, le=100,
        description=(
            "Likelihood of a POSITIVE outcome for this opportunity type. "
            "For growth/retention: likelihood of closing/renewing. "
            "For contraction: likelihood of SAVING or REDUCING the loss. "
            "For administrative: likelihood of completion. "
            "\n"
            "SCORING ALGORITHM — apply in this exact order: "
            "\n"
            "STEP 1 — ceiling from opportunity_category: "
            "  growth=100, retention=90, contraction=40, administrative=60. "
            "\n"
            "STEP 2 — stage baseline (capped at ceiling): "
            "  Closed Won / Closed Retained=95, Procurement / Contracting=80, "
            "  Evaluation / Negotiation=65, Proposal / Quote=50, "
            "  Demo / Presentation=40, Discovery / Qualifying=25, "
            "  Cancellation Requested / Downgrade Requested=15. "
            "  baseline = min(stage_value, ceiling). "
            "\n"
            "STEP 3 — Gong fine-tune (total delta bounded -30 to +10): "
            "  +5 per call with Positive CALL_OUTCOME_CATEGORY (max +10). "
            "  -10 per unresolved high-severity objection. "
            "  -5  per unresolved medium-severity objection. "
            "  -5  per missed commitment with status=overdue. "
            "  -10 if CUSTOMER_SENTIMENT trend Negative (last 2 calls both Negative). "
            "  +5  if CUSTOMER_SENTIMENT trend Positive (last 2 calls both Positive). "
            "  -5  per SF risk field entry not addressed in any Gong call. "
            "\n"
            "ABSOLUTE RULE: final score = min(step3_result, ceiling)."
        )
    )
    conversion_score_reasoning: str = Field(
        description=(
            "Explanation of how the score was reached. "
            "Must follow the template: "
            "'Category: {category} -> ceiling {ceiling}. "
            "Stage: {stage} -> baseline {baseline} (capped to {capped_baseline}). "
            "Gong adjustments: {list each adjustment and its value}. "
            "Final score: {score}.'"
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
    # Actions — split into defensive (risk) and offensive (opportunity)
    # ------------------------------------------------------------------
    risk_action: str = Field(
        description=(
            "The single most urgent DEFENSIVE action for the rep — "
            "fix a blocker, address a contraction, close a communication gap, "
            "or mitigate a known risk. "
            "Be specific: name the person, the action, and the deadline. "
            "For contraction types (Cancellation, Downsell, Concession) this is "
            "always the primary action — focus on save/mitigate, not deal progression. "
            "If close_date is within 30 days, that urgency must appear here. "
            "If there are no material risks or gaps, set to: "
            "'No urgent risk action — deal is progressing cleanly.' "
            "E.g. 'Budget objection unresolved across 3 calls — schedule exec call "
            "with Anil Shah before Jul 15. Close date is Jul 31.'"
        )
    )
    opportunity_action: Optional[str] = Field(
        default=None,
        description=(
            "The single best OFFENSIVE action to accelerate a deal that has "
            "genuine upside momentum. "
            "\n"
            "ONLY populate when ALL of the following are true: "
            "  (a) opportunity_category is growth or retention — never contraction "
            "      or administrative. "
            "  (b) conversion_score >= 55 OR opportunity_stage is Proposal/Evaluation "
            "      or later with no high-severity objections. "
            "  (c) At least one positive signal exists: Positive sentiment trend, "
            "      a resolved objection, customer-initiated next step in Gong, "
            "      or late deal stage with no blockers. "
            "\n"
            "If any condition is not met, leave null. "
            "\n"
            "When populated, include: "
            "  - The specific positive signal that justifies acceleration. "
            "  - One concrete action to capitalise on that momentum. "
            "  - A timeline tied to close_date or the next stage gate. "
            "  - The stakeholder to engage. "
            "\n"
            "E.g. 'Positive sentiment across last 2 calls and pricing objection "
            "resolved — send contract draft to Maya Patel by Jul 10 to target "
            "Procurement stage before close date Aug 1.' "
            "\n"
            "Do NOT populate for contraction types regardless of score or sentiment."
        )
    )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    analysis_summary: str = Field(
        description=(
            "2-3 sentence plain English summary of this account's situation. "
            "Written as if briefing a sales manager. "
            "Must mention the opportunity type and category in the first sentence. "
            "E.g. 'This is a Cancellation (contraction) opportunity — the customer "
            "has requested to cancel citing budget constraints raised in 3 consecutive "
            "calls. Rep has not yet proposed a mitigation plan. Recommend exec escalation "
            "before close date Jul 31.'"
        )
    )

    # ------------------------------------------------------------------
    # Validator — enforce ceiling as a safety net
    # ------------------------------------------------------------------
    @model_validator(mode="after")
    def enforce_score_ceiling(self) -> "AccountAnalysisResult":
        if self.conversion_score > self.conversion_score_ceiling:
            self.conversion_score = self.conversion_score_ceiling
        return self

    @model_validator(mode="after")
    def block_contraction_opportunity_action(self) -> "AccountAnalysisResult":
        """Contraction/administrative types must never have an opportunity_action."""
        if self.opportunity_category in ("contraction", "administrative"):
            self.opportunity_action = None
        return self


class AllAccountsAnalysisResult(BaseModel):
    """
    Top-level schema — Gemini analyzes ALL accounts in one call and
    returns one AccountAnalysisResult per account.
    Agent 3 reads ctx.session.state["account_analysis_results"].
    """
    accounts: List[AccountAnalysisResult] = Field(
        description=(
            "One AccountAnalysisResult for every account in account_details. "
            "Do not skip any account."
        )
    )
