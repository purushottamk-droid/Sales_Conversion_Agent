"""
agent.py — Agent 3: Rep Assessment Agent — Cross-Account Reasoning

WHAT THIS AGENT DOES:
  Reasons across ALL account analyses plus rep quota/target data,
  effectively acting as the sales manager — per Slide 6 of the design deck.
  Answers: is the rep likely to hit quota, are too many deals at risk,
  is there a pattern of missed follow-ups, is coaching required.

SESSION STATE:
  Reads  → ctx.session.state["rep_quota_metrics"]        (Agent 1 writes this)
  Reads  → ctx.session.state["account_analysis_results"] (Agent 2 writes this)
  Writes → ctx.session.state["rep_assessment_result"]    (Agent 4 reads this)
"""

from google.adk.agents import LlmAgent
from .prompt import REP_ASSESSMENT_PROMPT
from .output_schema import RepAssessmentResult


rep_assessment_agent = LlmAgent(

    # Agent identity — used by ADK pipeline to identify this agent
    name="rep_assessment_agent",

    # Gemini model — flash is fast and cost effective for this analysis
    model="gemini-2.5-flash",

    # The prompt — tells Gemini to reason across account_analysis_results
    # and rep_quota_metrics together (cross-account reasoning)
    # Full prompt logic is in prompt.py
    instruction=REP_ASSESSMENT_PROMPT,

    # Pydantic schema — Gemini MUST return output matching this structure
    # Defined in output_schema.py
    output_schema=RepAssessmentResult,

    # Where LlmAgent writes the result in session state
    output_key="rep_assessment_result",

    #Exclude conversation history from Gemini API call — sends only
    # the current instruction + input, reducing token size and latency
    include_contents='none', 
)