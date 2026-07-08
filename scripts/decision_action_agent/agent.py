
"""
scripts/decision_action_agent/agent.py

Agent 4 of 4 — Decision & Action Agent — Rules to Real Systems
  Reads rep_assessment_result, account_analysis_results, and
  account_details from session state. Applies fixed decision rules
  (see prompt.py) and sends two consolidated emails — one to the rep,
  one to the manager — via Gmail API.

SESSION STATE:
  Reads  → ctx.session.state["account_analysis_results"] (Agent 2)
  Reads  → ctx.session.state["rep_assessment_result"]    (Agent 3)
  Reads  → ctx.session.state["account_details"]          (Agent 1 — for recent meeting summaries)
  Writes → ctx.session.state["actions_taken"]             (final pipeline output)           
"""

from google.adk.agents import LlmAgent
from google.genai import types as genai_types

from .prompt import DECISION_ACTION_PROMPT
from .tools import (
    send_email_to_rep_tool,
    send_email_to_manager_tool,
)


decision_action_agent = LlmAgent(

    name="decision_action_agent",

    model="gemini-2.5-flash",

    instruction=DECISION_ACTION_PROMPT,

     tools=[
        send_email_to_rep_tool,
        send_email_to_manager_tool,
    ],

  
    output_key="actions_taken",

    #Exclude conversation history from Gemini API call — sends only
    # the current instruction + input, reducing token size and latency
    #include_contents='none', 

)