"""
agent.py — Agent 2: Account Analysis Agent

Manager requirements:
- Use Pydantic for output structure       ✅ (output_schema.py)
- Get data from session state             ✅ (ctx.session.state["collected_data"])
- Prompt is the crucial part              ✅ (prompt.py)
- No tools needed — Gemini reasons        ✅
- Run PER ACCOUNT, not one giant prompt   ✅ (loop through accounts)
- Store results back in session state     ✅ (ctx.session.state["account_analysis"])

How session state works:
  session state = shared Python dict for the entire pipeline run.
  Agent 1 writes "collected_data" into it.
  This agent reads "collected_data", analyzes each account,
  then writes "account_analysis" back into it.
  Agent 3 will then read "account_analysis".
"""

import json
import asyncio
from typing import AsyncGenerator

from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types
import google.generativeai as genai

from .prompt import ACCOUNT_ANALYSIS_PROMPT
from .output_schema import AccountAnalysisResult


class AccountAnalysisAgent(BaseAgent):
    """
    Agent 2 — Analyzes each account independently using Gemini.

    Reads:  ctx.session.state["collected_data"]   (written by Agent 1)
    Writes: ctx.session.state["account_analysis"] (read by Agent 3)

    Critical design: runs ONE Gemini call PER account.
    If rep has 20 accounts → 20 Gemini calls run concurrently.
    """

    name: str = "account_analysis_agent"
    description: str = (
        "Analyzes each account's transcripts and opportunities using Gemini. "
        "Identifies missed commitments, objections, deal health, and recommended actions."
    )

    # Gemini model to use — flash is fast and cost-effective for per-account analysis
    model_name: str = "gemini-2.0-flash-001"

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        """
        Main execution logic.
        1. Read collected_data from session state (Agent 1's output)
        2. Loop through every account concurrently
        3. Call Gemini once per account
        4. Parse Pydantic output
        5. Write all results to session state
        """

        # ── Step 1: Read Agent 1's output from session state ──────────────────
        collected_data = ctx.session.state.get("collected_data")

        if not collected_data:
            # Agent 1 did not run or failed — emit error event and stop
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text="ERROR: No collected_data in session state. Agent 1 may have failed.")]
                )
            )
            return

        accounts = collected_data.get("accounts", [])
        rep_id = collected_data.get("rep_id", "unknown")

        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=f"Starting account analysis for rep {rep_id}. Total accounts: {len(accounts)}")]
            )
        )

        # ── Step 2: Analyze all accounts concurrently ─────────────────────────
        # This is the KEY design — all accounts run in parallel, not one by one.
        # asyncio.gather fires all Gemini calls simultaneously.
        analysis_tasks = [
            self._analyze_single_account(account)
            for account in accounts
        ]

        results = await asyncio.gather(*analysis_tasks, return_exceptions=True)

        # ── Step 3: Collect valid results, log failures ────────────────────────
        account_analysis_results = []
        failed_accounts = []

        for account, result in zip(accounts, results):
            if isinstance(result, Exception):
                # One account failing should not stop the whole pipeline
                failed_accounts.append(account.get("account_name", "unknown"))
            else:
                account_analysis_results.append(result.model_dump())

        # ── Step 4: Write results to session state for Agent 3 ────────────────
        ctx.session.state["account_analysis"] = account_analysis_results

        # Build summary message
        summary = (
            f"Account analysis complete. "
            f"Analyzed: {len(account_analysis_results)} accounts. "
            f"Failed: {len(failed_accounts)} accounts."
        )
        if failed_accounts:
            summary += f" Failed accounts: {', '.join(failed_accounts)}"

        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=summary)]
            )
        )

    async def _analyze_single_account(self, account: dict) -> AccountAnalysisResult:
        """
        Calls Gemini once for a single account.
        Returns a validated Pydantic AccountAnalysisResult.

        This runs concurrently for all accounts via asyncio.gather above.
        """

        # Build the prompt with this account's data injected
        prompt = ACCOUNT_ANALYSIS_PROMPT.format(
            account_data=json.dumps(account, indent=2)
        )

        # Initialize Gemini client
        client = genai.GenerativeModel(
            model_name=self.model_name,
            generation_config=genai.GenerationConfig(
                # Tell Gemini to return JSON so we can parse into Pydantic
                response_mime_type="application/json",
                response_schema=AccountAnalysisResult,
            )
        )

        response = await client.generate_content_async(prompt)

        # Parse response text into Pydantic model — this validates all fields
        raw_json = response.text
        result = AccountAnalysisResult.model_validate_json(raw_json)

        # Ensure account_id and account_name are set correctly
        result.account_id = account.get("account_id", result.account_id)
        result.account_name = account.get("account_name", result.account_name)

        return result


# ── Instantiate the agent (imported by main.py to wire into pipeline) ──────
account_analysis_agent = AccountAnalysisAgent()
