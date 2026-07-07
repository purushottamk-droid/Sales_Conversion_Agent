
"""
scripts/decision_action_agent/agent.py

Agent 4 of 4 — Decision & Action Agent — Rules to Real Systems

WHAT THIS AGENT DOES:
  Reads rep_assessment_result, account_analysis_results, and
  rep_quota_metrics from session state. Applies fixed decision rules
  (see prompt.py) and calls real-system tools (Calendar API via
  schedule_review_meeting, Gmail API via message_rep) — both always
  gated behind explicit human confirmation before executing.

SESSION STATE:
  Reads  → ctx.session.state["account_analysis_results"] (Agent 2)
  Reads  → ctx.session.state["rep_assessment_result"]    (Agent 3)
  Writes → ctx.session.state["actions_taken"]             (final pipeline output)
"""

from google.adk.agents import LlmAgent
from google.genai import types as genai_types

from .prompt import DECISION_ACTION_PROMPT
from .tools import (
    schedule_review_meeting_tool,
    message_rep_tool,
    notify_manager_tool,
    recommend_coaching_tool,
)


decision_action_agent = LlmAgent(

    name="decision_action_agent",

    model="gemini-2.5-flash",

    instruction=DECISION_ACTION_PROMPT,

    tools=[
        schedule_review_meeting_tool,
        message_rep_tool,
        notify_manager_tool,
        recommend_coaching_tool,
    ],

  
    output_key="actions_taken",

    #Exclude conversation history from Gemini API call — sends only
    # the current instruction + input, reducing token size and latency
    include_contents='none', 

)