"""
scripts/decision_action_agent/agent.py

Decision & Action Agent — Rules to Real Systems

WHAT THIS AGENT DOES:
  Reads AllAccountsAnalysisResult from session state (produced by the
  Account & Rep Assessment Agent). Applies fixed decision rules and calls
  two real-system tools (Gmail API) to notify the manager and message the rep.
  A third tool (create_salesforce_task) exists as a placeholder but is not
  used in the current flow.

SESSION STATE:
  Reads  → ctx.session.state["AllAccountsAnalysisResult"]  (previous agent)
  Reads  → ctx.session.state["rep_email"]
  Reads  → ctx.session.state["manager_email"]
  Writes → ctx.session.state["actions_taken"]
"""

from google.adk.agents import LlmAgent

from .prompt import DECISION_ACTION_PROMPT
from .tools import (
    notify_manager_tool,
    message_rep_tool,
    create_salesforce_task_tool,
)


decision_action_agent = LlmAgent(

    name="decision_action_agent",

    model="gemini-2.5-flash",

    instruction=DECISION_ACTION_PROMPT,

    tools=[
        notify_manager_tool,
        message_rep_tool,
        create_salesforce_task_tool,  # placeholder — not used in flow yet
    ],

    output_key="actions_taken",
)
