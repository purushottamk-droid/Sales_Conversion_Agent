# """
# main.py — Run the full sales rep pipeline (root_agent from scripts.SequentialAgent)
# """

# import asyncio
# from google.adk.runners import InMemoryRunner
# from google.genai import types

# from scripts.SequentialAgent import root_agent


# async def run(sales_rep_id: str):
#     runner = InMemoryRunner(
#         agent=root_agent,
#         app_name="sales_rep_pipeline",
#     )

#     session = await runner.session_service.create_session(
#         app_name="sales_rep_pipeline",
#         user_id="test_user",
#         state={"sales_rep_id": sales_rep_id,
#         "rep_email": "pukakade2018@gmail.com",   # for testing
#         "manager_email": "purushottam.k@atgeirsolutions.com",
#         }  # Agent 1 reads this
#     )

#     print(f"\n── Running pipeline for rep: {sales_rep_id} ──\n")

#     async for event in runner.run_async(
#         user_id="test_user",
#         session_id=session.id,
#         new_message=types.Content(
#             role="user",
#             parts=[types.Part(text="start")]
#         ),
#     ):
#         print(f"[{event.author}]", end=" ")
#         if event.content and event.content.parts:
#             for part in event.content.parts:
#                 if hasattr(part, "text") and part.text:
#                     print(part.text)


# if __name__ == "__main__":
#     asyncio.run(run("005DMO000000000300000"))  # Maya Chen's rep ID

"""
main.py — Run the full sales rep pipeline (root_agent from scripts.SequentialAgent)

UPDATED: now auto-handles tool confirmation requests from decision_action_agent
(Agent 4) so the pipeline can actually complete instead of pausing forever.
"""
from dotenv import load_dotenv
load_dotenv()

import asyncio
from google.adk.runners import InMemoryRunner
from google.genai import types

from scripts.SequentialAgent import root_agent


# Set this to False if you want to manually approve each action via input()
AUTO_CONFIRM = False


async def run(sales_rep_id: str):
    runner = InMemoryRunner(
        agent=root_agent,
        app_name="sales_rep_pipeline",
    )

    session = await runner.session_service.create_session(
        app_name="sales_rep_pipeline",
        user_id="test_user",
        state={
            "sales_rep_id": sales_rep_id,
            "rep_email": "pukakade2018@gmail.com",   # for testing
            "manager_email": "purushottam.k@atgeirsolutions.com",
        }  # Agent 1 reads this
    )

    print(f"\n── Running pipeline for rep: {sales_rep_id} ──\n")

    new_message = types.Content(
        role="user",
        parts=[types.Part(text="start")]
    )

    # We may need multiple rounds: each round can surface new confirmation
    # requests (e.g. one per account that needs message_rep). Keep looping
    # until a run produces no more confirmation requests.
    while True:
        pending_confirmations = []  # list of (function_call_id, payload)

        async for event in runner.run_async(
            user_id="test_user",
            session_id=session.id,
            new_message=new_message,
        ):
            print(f"[{event.author}]", end=" ")

            if event.content and event.content.parts:
                for part in event.content.parts:
                    # Normal text output
                    if hasattr(part, "text") and part.text:
                        print(part.text)

                    # Detect a confirmation request from the model.
                    # ADK auto-names these function calls "adk_request_confirmation".
                    fc = getattr(part, "function_call", None)
                    if fc and fc.name == "adk_request_confirmation":
                        print(f"\n  >> Confirmation requested (id={fc.id}) args={fc.args}")
                        pending_confirmations.append(fc)

                    fr = getattr(part, "function_response", None)
                    if fr and fr.name != "adk_request_confirmation":
                        print(f"\n  >> Tool result from {fr.name}: {fr.response}")

        if not pending_confirmations:
            # No more confirmations pending — pipeline run is complete.
            print("\n── Pipeline finished — no more pending confirmations ──\n")
            break

        # Build a function_response for each pending confirmation.
        response_parts = []
        for fc in pending_confirmations:
            if AUTO_CONFIRM:
                confirmed = True
            else:
                ans = input(f"Approve action {fc.id}? (y/n): ").strip().lower()
                confirmed = ans == "y"

            response_parts.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        id=fc.id,
                        name="adk_request_confirmation",
                        response={"confirmed": confirmed},
                    )
                )
            )

        print(f"\n── Sending {len(response_parts)} confirmation response(s) ──\n")

        # Feed the confirmations back in as the next message and loop again,
        # in case more confirmations are still pending after this round.
        new_message = types.Content(role="user", parts=response_parts)


if __name__ == "__main__":
    asyncio.run(run("005DMO000000000300000"))  # Maya Chen's rep ID
