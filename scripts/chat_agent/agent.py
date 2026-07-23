"""
agent.py — Chat Agent: conversational Q&A over a completed pipeline run

WHAT THIS AGENT DOES:
  Answers a rep's free-form questions about their own pipeline results —
  a read-only Q&A layer over data the 3-agent pipeline already collected
  and analyzed. Does not fetch new data, does not re-run analysis, does
  not take new actions (send emails, create Salesforce tasks).

SESSION STATE:
  Reads  → ctx.state["rep_performance_profile"]   (Agent 1's output)
  Reads  → ctx.state["account_analysis_results"]  (Agent 2's output)
  Reads  → ctx.state["actions_taken"]              (Agent 3's output)
  Reads  → ctx.state["chat_history"]               (prior turns in this chat)
  Writes → nothing itself — api.py owns updating chat_history after each
           turn, since a single output_key can only overwrite one state
           key, not append to a list.

include_contents='none' is deliberate, not copied by habit from the other
2 agents — this agent is invoked as its own top-level Runner.run_async()
call (not a sub-agent of the pipeline's SequentialAgent), so it has no
branch set on its invocation. Traced in the installed ADK source
(google/adk/flows/llm_flows/contents.py, _is_event_belongs_to_branch):
branch filtering is a no-op when the invoking agent has no branch, so
include_contents='default' would pull the pipeline's ENTIRE raw event
history (large RepAssessmentResult JSON dumps, Gmail/Salesforce tool-call
events) into every chat turn. Conversation memory is handled explicitly
instead, via the chat_history state key rendered into the prompt below.
"""

from google.adk.agents import LlmAgent
from .prompt import CHAT_PROMPT
# from google.genai import types

chat_agent = LlmAgent(

    # Agent identity — used by ADK to identify this agent
    name="chat_agent",

    # Same tier as account_analysis_agent — cheap/fast is fine for
    # grounded Q&A over an already-small JSON snapshot
    model="gemini-2.5-flash-lite",

    # InstructionProvider — embeds the 3 result payloads + chat_history
    # into the prompt fresh on every turn. Full logic in prompt.py
    instruction=CHAT_PROMPT,

    # No output_schema — this is a free-text conversational reply, not
    # structured extraction like the other 2 agents in the pipeline.
    # No output_key — api.py reads the reply directly off the event
    # stream, since it also needs to append to chat_history (a list),
    # which a single output_key can't do (it only ever overwrites one key).
    # No tools — confirmed scope: answers strictly from the 3 already-
    # collected session-state keys, never a live Salesforce/Gong re-query.

    include_contents='none',
)
