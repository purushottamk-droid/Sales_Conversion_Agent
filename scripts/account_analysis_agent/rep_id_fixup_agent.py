"""
scripts/account_analysis_agent/rep_id_fixup_agent.py

Deterministic fixup between Agent 2 (account_analysis_agent) and Agent 3
(decision_action_agent) in the pipeline.

Agent 2 is an LlmAgent that's supposed to carry rep_id/rep_name through
verbatim from rep_performance_profile into its own structured output
(account_analysis_results). Confirmed in production: the LLM subtly
corrupted rep_id by one character (005fj00000HdAk5AAF -> 005fj00001HdAk5AAF)
when copying it into its own output. notify_manager/message_rep only print
rep_id as text, so the corruption was invisible there — but
create_salesforce_task uses rep_id as the real Salesforce OwnerId, so the
wrong id caused every Legacy Contract Task creation to fail with an
"invalid owner" style error.

Fix is deterministic, not a prompt instruction — an LLM that garbled a
long id string once has no guarantee of copying it correctly if just told
"use the right field" again. This agent overwrites rep_id/rep_name in
account_analysis_results with the authoritative values from
rep_performance_profile (Agent 1's own data, never LLM-retyped) before
Agent 3 ever sees it.
"""

from google.adk.agents import BaseAgent
from google.adk.events import Event, EventActions


class RepIdFixupAgent(BaseAgent):
    """Overwrites account_analysis_results.rep_id/rep_name with the
    authoritative values from rep_performance_profile.rep_id/rep_name."""

    async def _run_async_impl(self, ctx):
        rep_performance_profile = ctx.session.state.get("rep_performance_profile") or {}
        account_analysis_results = ctx.session.state.get("account_analysis_results")

        real_rep_id = rep_performance_profile.get("rep_id")
        real_rep_name = rep_performance_profile.get("rep_name")

        if account_analysis_results and real_rep_id:
            corrected = dict(account_analysis_results)
            corrected["rep_id"] = real_rep_id
            if real_rep_name:
                corrected["rep_name"] = real_rep_name

            yield Event(
                author=self.name,
                content=None,
                actions=EventActions(
                    state_delta={"account_analysis_results": corrected}
                ),
            )
        else:
            yield Event(author=self.name, content=None)
