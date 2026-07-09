"""
scripts/decision_action_agent/agent.py

Decision & Action Agent — Rules to Real Systems

WHAT THIS AGENT DOES:
  Reads the RepAssessmentResult (produced by the Account & Rep Assessment
  Agent) from session state. Applies fixed decision rules and calls three
  real-system tools: Gmail (notify_manager, message_rep) and a Salesforce
  Task write (create_salesforce_task) — the last one fires per-account for
  the expansion-whitespace signal (Rule 3), unlike the other two which
  fire once per rep.

SESSION STATE:
  Reads  → ctx.session.state["account_analysis_results"]  (RepAssessmentResult, previous agent)
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
        create_salesforce_task_tool,
    ],

    output_key="actions_taken",
)
