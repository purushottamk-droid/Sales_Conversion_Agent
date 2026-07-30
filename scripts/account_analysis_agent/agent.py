"""
agent.py — Agent 2: Account Analysis Agent

WHAT THIS AGENT DOES:
  Reads all account data from session state (written by Agent 1).
  Sends all accounts to Gemini in ONE call 
  Gemini analyzes every account and returns structured Pydantic output.
  Writes results to session state for Agent 3 to read.

SESSION STATE:
  Reads  → ctx.session.state["account_details"]          (Agent 1 writes this)
  Writes → ctx.session.state["account_analysis_results"] (Agent 3 reads this)

"""

from google.adk.agents import LlmAgent
from google.genai import types
from .prompt import ACCOUNT_ANALYSIS_PROMPT
from .output_schema import RepAssessmentResult


account_analysis_agent = LlmAgent(

    # Agent identity — used by ADK pipeline to identify this agent
    name="account_analysis_agent",

    # Gemini model — flash is fast and cost effective for this analysis
    model="gemini-2.5-flash-lite",

    # The crucial prompt — tells Gemini exactly what to analyze
    # Gemini reads account_details from session state automatically
    # Full prompt logic is in prompt.py
    instruction=ACCOUNT_ANALYSIS_PROMPT,

    # Pydantic schema — Gemini MUST return output matching this structure
    # RepAssessmentResult holds the rep-level roll-up at its root, plus
    # accounts: List[AccountAnalysisResult] — one entry per opportunity
    # Defined in output_schema.py
    output_schema=RepAssessmentResult,

    # Where LlmAgent writes the result in session state
    # Agent 3 reads ctx.session.state["account_analysis_results"]
    output_key="account_analysis_results",

    #Exclude conversation history from Gemini API call — sends only
    # the current instruction + input, reducing token size and latency
    include_contents='none',    
    generate_content_config=types.GenerateContentConfig(
        temperature=0,   # near-deterministic scoring/classification
        top_p=0.9,
        # Explicit ceiling well above the model default — this agent's
        # output grows with the rep's account count (one full
        # AccountAnalysisResult per opportunity), and reps with many
        # accounts (e.g. 15) were hitting the implicit default and
        # getting silently truncated mid-JSON, which then failed Pydantic
        # validation entirely (confirmed reproducible at temperature=0 —
        # same truncation point every run for the same rep).
        max_output_tokens=65535,  # API's supported range is 1 to 65536 EXCLUSIVE
    ),
)