"""
output_schema.py — Agent 3: Rep Assessment Agent — Cross-Account Reasoning
Pydantic models for structured LLM output.


"""

from pydantic import BaseModel, Field
from typing import List, Literal


class RepAssessmentResult(BaseModel):
    """
    Cross-account reasoning output — effectively the sales manager's verdict
    on this rep, built from rep_quota_metrics + account_analysis_results.
    """

    rep_id: str = Field(
        description="Rep identifier, copied from rep_quota_metrics.sales_rep_id"
    )

    quota_attainment: int = Field(
        ge=0, le=200,
        description=(
            "Current quota attainment percentage. Computed from rep_quota_metrics "
            "(avg ramped_capacity vs avg target) as a % — e.g. 45 means 45% of "
            "quota met so far."
        )
    )

    forecasted_attainment: int = Field(
        ge=0, le=200,
        description=(
            "Forecasted end-of-period quota attainment percentage, projected by "
            "combining quota_attainment trend with the health/conversion_score of "
            "open (non-closed) accounts in account_analysis_results."
        )
    )

    overall_risk: Literal["Low", "Medium", "High"] = Field(
        description=(
            "Overall risk that this rep misses quota or has a problematic pipeline. "
            "High = forecasted_attainment well below 100% and/or many at_risk/critical "
            "accounts. Medium = some risk signals but not severe. Low = on track."
        )
    )

    patterns: List[str] = Field(
        default=[],
        description=(
            "Recurring patterns identified ACROSS multiple accounts in "
            "account_analysis_results — e.g. 'Repeated missed commitments', "
            "'Poor follow-up discipline', 'Recurring security review objections'. "
            "Only include patterns seen in 2+ accounts, not single-account issues."
        )
    )

    needs_manager_attention: bool = Field(
        description=(
            "True if overall_risk is High, OR if 3+ accounts are at_risk/critical/"
            "stalled, OR if forecasted_attainment is below 60. False otherwise."
        )
    )