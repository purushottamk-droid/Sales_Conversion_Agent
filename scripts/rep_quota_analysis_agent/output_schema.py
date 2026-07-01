"""
output_schema.py — Rep Quota/Performance Analysis Agent
Pydantic models for structured LLM output.

Input source: rep_quota_metrics (from Agent 1, Everstage data)
Fields available per quota record:
  REVENUE_TYPE, REP_EMAIL, REP_NAME, RAMPED_CAPACITY, TARGET, QUOTA_PERIOD
"""

from pydantic import BaseModel, Field
from typing import List, Literal


class QuotaPeriodInsight(BaseModel):
    """
    Observation about a specific period's capacity vs target gap.
    Only included for periods worth flagging (notable gap or pattern).
    """
    quota_period: str = Field(
        description="The QUOTA_PERIOD value this insight refers to, e.g. 'Monthly'"
    )
    target: float = Field(
        description="TARGET value for this period"
    )
    ramped_capacity: float = Field(
        description="RAMPED_CAPACITY value for this period"
    )
    gap_percentage: float = Field(
        description=(
            "Percentage gap between ramped_capacity and target. "
            "Positive = capacity exceeds target, negative = capacity below target. "
            "Formula: ((ramped_capacity - target) / target) * 100"
        )
    )
    note: str = Field(
        description="Short note on why this period stands out, e.g. 'Largest shortfall in the dataset'"
    )


class RepQuotaAssessmentResult(BaseModel):
    """
    Structured output for rep-level quota/capacity analysis.
    Built ONLY from rep_quota_metrics — no account/deal data involved.
    """

    sales_rep_id: str = Field(
        description="Rep identifier, copied from rep_quota_metrics.sales_rep_id"
    )
    rep_name: str = Field(
        description="Rep's name, copied from rep_quota_metrics.rep_name"
    )
    rep_email: str = Field(
        description="Rep's email, copied from rep_quota_metrics.rep_email"
    )

    total_periods_analyzed: int = Field(
        description="Count of quota_data records analyzed"
    )

    avg_target: float = Field(
        description="Average TARGET value across all quota_data records"
    )
    avg_ramped_capacity: float = Field(
        description="Average RAMPED_CAPACITY value across all quota_data records"
    )
    avg_gap_percentage: float = Field(
        description=(
            "Average percentage gap between ramped_capacity and target across all periods. "
            "Positive = on average exceeding target, negative = on average falling short"
        )
    )

    capacity_trend: Literal["improving", "stable", "declining"] = Field(
        description=(
            "Trend of RAMPED_CAPACITY relative to TARGET across the sequence of "
            "quota_data records. improving=gap narrowing or staying positive, "
            "stable=consistent small gap, declining=gap widening negatively"
        )
    )

    revenue_types_covered: List[str] = Field(
        default=[],
        description="Distinct REVENUE_TYPE values found across quota_data"
    )

    notable_periods: List[QuotaPeriodInsight] = Field(
        default=[],
        description=(
            "Periods worth flagging — largest shortfalls, largest overachievements, "
            "or unusual jumps. Do not include every period, only standout ones (max 5)"
        )
    )

    quota_health: Literal["on_track", "at_risk", "underperforming"] = Field(
        description=(
            "Overall quota health assessment. on_track=consistently meeting/exceeding "
            "target, at_risk=mixed performance with some shortfalls, "
            "underperforming=consistently falling short of target"
        )
    )

    summary: str = Field(
        description=(
            "2-3 sentence plain English summary of this rep's quota performance, "
            "written as if briefing a sales manager"
        )
    )