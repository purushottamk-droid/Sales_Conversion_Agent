"""
scripts/decision_action_agent/agent.py

Decision & Action Agent — Rules to Real Systems

WHAT THIS AGENT DOES:
  Reads AllAccountsAnalysisResult from session state (produced by the
  Account & Rep Assessment Agent). Applies fixed decision rules and calls
  real-system tools: two Gmail API tools (notify the manager, message the
  rep) and one Salesforce MCP tool (create_salesforce_task, backed by the
  Salesforce MCP server's create_task). create_salesforce_task fires once
  per opportunity with opportunity_type "Legacy Contract" (RULE 3 in
  prompt.py).

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
        create_salesforce_task_tool,  # MCP-backed (Salesforce create_task) — fires per RULE 3 (opportunity_type == "Legacy Contract")
    ],

    output_key="actions_taken",
)
