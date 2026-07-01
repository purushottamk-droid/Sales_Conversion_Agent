"""
agent.py — Rep Quota/Performance Analysis Agent

WHAT THIS AGENT DOES:
  Reads ONLY rep_quota_metrics from session state (written by Agent 1).
  Does NOT read account_details or account_analysis_results.
  Sends quota data to Gemini in ONE call for rep-level quota/capacity analysis.
  Writes structured result to session state.

 
"""

from google.adk.agents import LlmAgent
from .prompt import REP_QUOTA_ANALYSIS_PROMPT
from .output_schema import RepQuotaAssessmentResult


rep_quota_analysis_agent = LlmAgent(

    # Agent identity — used by ADK pipeline to identify this agent
    name="rep_quota_analysis_agent",

    # Gemini model — flash is fast and cost effective for this analysis
    model="gemini-2.5-flash",

    # The prompt — tells Gemini exactly what to analyze
    # Reads only rep_quota_metrics from session state
    # Full prompt logic is in prompt.py
    instruction=REP_QUOTA_ANALYSIS_PROMPT,

    # Pydantic schema — Gemini MUST return output matching this structure
    # Defined in output_schema.py
    output_schema=RepQuotaAssessmentResult,

    # Where LlmAgent writes the result in session state
    output_key="rep_quota_assessment",
)