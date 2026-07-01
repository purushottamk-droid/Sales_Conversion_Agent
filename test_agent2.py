"""
test_agent2.py — Test Agent 2 in isolation
No need to run Agent 1 — we mock the session state directly
using real data from Agent 1's output
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
            "account_details": [
                {
                    "account_id": "001DMO000000000200000",
                    "account_name": "Pioneer Logistics",
                    "opportunities": [
                        {
                            "opportunity_id": "006DMO000000000100000",
                            "opportunity_name": "Pioneer Logistics - Quality Management",
                            "opportunity_stage": "Closed Won",
                            "close_date": "2025-03-09",
                            "risks": "Executive sponsor not yet confirmed",
                            "next_step": "Complete security review",
                            "deal_size": "Small",
                        }
                    ],
                    "calls": [
                        {
                            "TITLE": "Close Plan Review - Pioneer Logistics",
                            "PURPOSE": "Close plan review",
                            "SCHEDULED": "2025-03-07 12:45:00+00:00",
                            "BRIEF": "Maya Chen discussed Quality Management during close plan review.",
                            "CALL_OUTCOME_CATEGORY": "Positive",
                            "CALL_OUTCOME_NAME": "Closed won handoff",
                            "CUSTOMER_SENTIMENT": "Positive",
                            "PRIMARY_OBJECTION": "budget approval timeline",
                            "NEXT_STEP": "complete closed-won handoff and implementation kickoff",
                            "KEY_MEETING_DISCUSSIONS": "Business Pain: Pioneer Logistics needs Quality Management. | Objection: Customer raised budget approval timeline. | Next Step: complete closed-won handoff.",
                        }
                    ]
                }
            ]
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