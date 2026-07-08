"""
test_agent2.py — Test Agent 2 in isolation
No need to run Agent 1 — we mock the session state directly using the
current rep_performance_profile shape Agent 1 actually produces.
"""

import asyncio
from google.adk.runners import InMemoryRunner
from google.genai import types

from scripts.account_analysis_agent import account_analysis_agent

async def test():
    runner = InMemoryRunner(
        agent=account_analysis_agent,
        app_name="sales_rep_pipeline",
    )

    session = await runner.session_service.create_session(
        app_name="sales_rep_pipeline",
        user_id="test_user",
        # Mock Agent 1 output — paste real data here
        state={
            "rep_performance_profile": {
                "rep_id": "005DMO000000000300000",
                "rep_name": "Maya Chen",
                "rep_experience_tier": "Mid-Market AE",
                "historical_targets": {
                    "monthly_arr_target_past_3_months": 50000,
                },
                "quota_attainment": {
                    "monthly_attainment_pct": 42.0,
                    "quarterly_attainment_pct": 55.0,
                    "pipeline_attainment_pct": 30.0,
                },
                "active_pipeline": {
                    "total_open_pipeline_arr": 18000,
                    "open_opportunity_count": 1,
                },
                "assigned_accounts": [
                    {
                        "account_id": "001DMO000000000200000",
                        "account_name": "Pioneer Logistics",
                        "industry": "Logistics",
                        "account_segment": "Mid-Market",
                        "opportunity_data": {
                            "opportunity_id": "006DMO000000000100000",
                            "opportunity_name": "Pioneer Logistics - Quality Management",
                            "opportunity_type": "New Logo",
                            "current_stage": "Evaluation",
                            "forecast_category": "Best Case",
                            "deal_value_arr": 18000,
                            "discount_pct": 0,
                            "timeline_and_velocity": {
                                "days_open": 34,
                                "current_stage_duration_days": 12,
                                "historical_stage_benchmark_days": 9,
                                "close_date_target": "2026-07-25",
                                "target_date_pushes": None,
                            },
                            "critical_business_issue": {
                                "cbi_identified": "Manual QA process causing shipment delays",
                                "quantified_impact": "~$40K/month in late-delivery penalties",
                                "buyer_alignment": "Salesforce contact of record: Dana Whit (VP Operations)",
                                "previous_solution": "Spreadsheet-based tracking",
                                "manager_notes": None,
                            },
                            "engagement_signals": {
                                "days_since_last_touch": 3,
                                "next_scheduled_event": "2026-07-14T15:00:00Z",
                            },
                            "risks": "Executive sponsor not yet confirmed",
                            "next_step": "Complete security review",
                            "gong_interaction_analytics": {
                                "latest_call_date": "2026-07-06",
                                "next_scheduled_event": "2026-07-14T15:00:00Z",
                                "recent_calls": [
                                    {
                                        "title": "Close Plan Review - Pioneer Logistics",
                                        "scheduled_date": "2026-07-06",
                                        "purpose": "Close plan review",
                                        "meeting_stage_context": "Evaluation",
                                        "meeting_summary": "Maya Chen discussed Quality Management during close plan review.",
                                        "key_meeting_discussions": "Business Pain: manual QA causing delays. Objection: budget approval timeline. Next Step: complete security review.",
                                        "customer_sentiment": "Positive",
                                        "primary_objection": "budget approval timeline",
                                        "call_outcome_category": "Positive",
                                        "call_outcome_name": "Progressed to security review",
                                        "next_step": "complete security review",
                                    }
                                ],
                            },
                        },
                    }
                ],
            }
        }
    )

    print("\n── Starting Agent 2 Test ──\n")

    async for event in runner.run_async(
        user_id="test_user",
        session_id=session.id,
        new_message=types.Content(
            role="user",
            parts=[types.Part(text="start")]
        ),
    ):
        print(f"Event from: {event.author}")
        if event.content and event.content.parts:
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    print(f"Output: {part.text}")

    # Print what Agent 2 wrote to session state
    session_data = await runner.session_service.get_session(
        app_name="sales_rep_pipeline",
        user_id="test_user",
        session_id=session.id,
    )

    print("\n── Agent 2 session state output ──")
    import json
    result = session_data.state.get("account_analysis_results")
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(test())
