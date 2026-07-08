# """
# scripts/decision_action_agent/prompt.py

# Agent 4 — Decision & Action Agent — Rules to Real Systems

# Reads:
#   - rep_assessment_result      (from Agent 3, session state)
#   - account_analysis_results   (from Agent 2, session state)
#   - account_details            (from Agent 1, session state — for recent meeting summaries)

# Two tools only:
#   - send_email_to_rep     → consolidated email to rep (actions, context, summaries, prescription)
#   - send_email_to_manager → consolidated email to manager (quota risk, at-risk accounts, patterns)

# Decision logic is RULE-BASED — the model applies fixed rules,
# builds email bodies from the data, and calls exactly one tool per turn.
# """

# import json


# def DECISION_ACTION_PROMPT(ctx) -> str:
#     """
#     InstructionProvider — called by ADK at runtime.
#     Reads account_analysis_results, rep_assessment_result,
#     account_details, rep_email, and manager_email from session state.
#     """
#     account_analysis_results = ctx.state.get("account_analysis_results", {})
#     rep_assessment_result = ctx.state.get("rep_assessment_result", {})
#     rep_email = ctx.state.get("rep_email")
#     manager_email = ctx.state.get("manager_email")

#     # Extract recent meeting summaries — last 2 calls per account from account_details
#     account_details = ctx.state.get("account_details", [])
#     recent_summaries = {}
#     for account in account_details:
#         acc_id = account.get("account_id")
#         acc_name = account.get("account_name")
#         calls = account.get("calls", [])
#         # Sort by SCHEDULED descending, take last 2
#         sorted_calls = sorted(
#             calls,
#             key=lambda c: c.get("SCHEDULED", ""),
#             reverse=True
#         )[:2]
#         recent_summaries[acc_id] = {
#             "account_name": acc_name,
#             "recent_calls": [
#                 {
#                     "date": str(c.get("SCHEDULED", ""))[:10],
#                     "brief": c.get("BRIEF", ""),
#                     "outcome": c.get("CALL_OUTCOME_NAME", ""),
#                     "sentiment": c.get("CUSTOMER_SENTIMENT", ""),
#                 }
#                 for c in sorted_calls
#             ]
#         }

#     return f"""
# You are the Decision & Action agent in a sales rep performance pipeline.
# You apply FIXED, RULE-BASED decision logic.
# Your job is to build two consolidated emails and send them using exactly the two tools available.

# REP_EMAIL (use exactly as-is, never invent): {rep_email}
# MANAGER_EMAIL (use exactly as-is, never invent): {manager_email}

# REP_ASSESSMENT_RESULT (from Agent 3):
# {json.dumps(rep_assessment_result, indent=2, default=str)}

# ACCOUNT_ANALYSIS_RESULTS (from Agent 2):
# {json.dumps(account_analysis_results, indent=2, default=str)}

# RECENT_MEETING_SUMMARIES (last 2 Gong calls per account — from Agent 1):
# {json.dumps(recent_summaries, indent=2, default=str)}

# ═══════════════════════════════════════════════════════
# ## TOOL 1 — send_email_to_rep (ALWAYS execute first)
# ═══════════════════════════════════════════════════════

# Always send this email regardless of any thresholds.
# Build the email_body as a plain-text string covering ALL accounts,
# structured in exactly these 4 sections:

# ### SECTION 1 — ASSIGNED ACTIONS
# For each account in account_analysis_results.accounts:
#   - Account name + risk_action from that account's analysis
#   - Only include accounts where risk_action is NOT "No urgent risk action — deal is progressing cleanly."
#   - If all accounts are clean, write: "No urgent actions required across your accounts."

# ### SECTION 2 — ACCOUNT CONTEXT
# For each account in account_analysis_results.accounts:
#   - Account name + analysis_summary from that account's analysis
#   - Include every account — this is the full context brief for the rep

# ### SECTION 3 — RECENT MEETING SUMMARIES
# For each account in RECENT_MEETING_SUMMARIES:
#   - Account name
#   - For each recent call: date, brief, outcome, sentiment
#   - Keep each summary concise — one short paragraph per call

# ### SECTION 4 — PRESCRIPTIONS FOR BETTER CONVERSION
# For each account in account_analysis_results.accounts:
#   - Only include accounts where opportunity_action is NOT null
#   - Account name + opportunity_action
#   - If no accounts have an opportunity_action, write:
#     "No acceleration opportunities identified at this time."

# Build the full email_body string from these 4 sections, then call:
#   send_email_to_rep(rep_id, rep_name, rep_email, email_body)

# rep_id and rep_name come from rep_assessment_result.rep_id and rep_assessment_result.rep_name.
# rep_email comes from session state — use exactly as given above, never invent.

# ═══════════════════════════════════════════════════════
# ## TOOL 2 — send_email_to_manager (execute after Tool 1 completes)
# ═══════════════════════════════════════════════════════

# Always send this email regardless of any thresholds.
# Build the email_body as a plain-text string covering the rep's overall
# performance, structured in exactly these sections:

# ### SECTION 1 — QUOTA PERFORMANCE
# From rep_assessment_result:
#   - quota_attainment: current attainment %
#   - forecasted_attainment: projected end-of-period attainment %
#   - overall_risk: Low / Medium / High
#   - If forecasted_attainment < 60: flag as "URGENT — below 60% threshold"

# ### SECTION 2 — AT-RISK ACCOUNTS
# List all accounts from account_analysis_results.accounts where
# deal_health is at_risk, critical, or stalled:
#   - Account name, deal_health, conversion_score, risk_action
#   - If none: "No accounts currently at risk."

# ### SECTION 3 — RECURRING PATTERNS
# From rep_assessment_result.patterns:
#   - List every pattern identified across accounts
#   - If none: "No recurring patterns detected."

# ### SECTION 4 — COACHING SIGNALS
# From account_analysis_results.accounts:
#   - List accounts with non-empty communication_gaps
#   - For each: account name + the specific gap(s)
#   - If none: "No coaching signals detected."

# Build the full email_body string from these 4 sections, then call:
#   send_email_to_manager(rep_id, rep_name, manager_email, email_body)

# rep_id and rep_name come from rep_assessment_result.rep_id and rep_assessment_result.rep_name.
# manager_email comes from session state — use exactly as given above, never invent.

# ═══════════════════════════════════════════════════════
# ## TOOL CALL ORDER — CRITICAL
# ═══════════════════════════════════════════════════════
# 1. Call send_email_to_rep FIRST. Wait for the tool result.
# 2. Then call send_email_to_manager. Wait for the tool result.
# 3. Only after BOTH tool calls complete, return the final JSON output.
# Never batch both tools in the same turn — call exactly one tool per turn.

# ## FINAL OUTPUT:
# After BOTH tool calls complete, return ONLY this JSON — no natural language:
# {{
#   "actions": [
#     {{
#       "type": "send_email_to_rep",
#       "status": "SENT or ERROR",
#       "rep_id": "...",
#       "rep_email": "...",
#       "reason": "Consolidated rep brief sent covering actions, context, summaries, prescriptions"
#     }},
#     {{
#       "type": "send_email_to_manager",
#       "status": "SENT or ERROR",
#       "rep_id": "...",
#       "manager_email": "...",
#       "reason": "Manager performance brief sent covering quota risk, at-risk accounts, patterns, coaching"
#     }}
#   ]
# }}

# ## CRITICAL RULES:
# - ALWAYS call both tools — there are no thresholds that skip either email
# - Never invent rep_id, rep_name, rep_email, or manager_email
# - rep_email and manager_email must be used exactly as given in session state
# - The only valid tool calls are: send_email_to_rep, send_email_to_manager
# - Never call any other function not in this list
# - SKIPPED status does not apply here — both emails always send
# - Do NOT return natural language — return ONLY the JSON object after both tools complete
# """

import json
def DECISION_ACTION_PROMPT(ctx) -> str:
    account_analysis_results = ctx.state.get("account_analysis_results", {})
    rep_assessment_result = ctx.state.get("rep_assessment_result", {})
    rep_email = ctx.state.get("rep_email")
    manager_email = ctx.state.get("manager_email")
    account_details = ctx.state.get("account_details", [])

    rep_id = rep_assessment_result.get("rep_id", "")
    rep_name = rep_assessment_result.get("rep_name", "")

    # ── Build rep email body in Python ──
    accounts = account_analysis_results.get("accounts", [])

    # Section 1 — Assigned Actions
    actions_lines = ["SECTION 1 — ASSIGNED ACTIONS\n"]
    for acc in accounts:
        risk = acc.get("risk_action", "")
        if risk and risk != "No urgent risk action — deal is progressing cleanly.":
            actions_lines.append(f"• {acc['account_name']}: {risk}")
    if len(actions_lines) == 1:
        actions_lines.append("No urgent actions required across your accounts.")

    # Section 2 — Account Context
    context_lines = ["\n\nSECTION 2 — ACCOUNT CONTEXT\n"]
    for acc in accounts:
        context_lines.append(f"• {acc['account_name']}: {acc.get('analysis_summary', '')}")

    # Section 3 — Recent Meeting Summaries (last 2 calls per account)
    summary_lines = ["\n\nSECTION 3 — RECENT MEETING SUMMARIES\n"]
    acc_map = {a.get("account_id"): a.get("account_name") for a in accounts}
    for account in account_details:
        acc_id = account.get("account_id")
        acc_name = account.get("account_name", acc_map.get(acc_id, acc_id))
        calls = sorted(
            account.get("calls", []),
            key=lambda c: str(c.get("SCHEDULED", "")),
            reverse=True
        )[:2]
        if calls:
            summary_lines.append(f"\n{acc_name}:")
            for c in calls:
                date = str(c.get("SCHEDULED", ""))[:10]
                brief = c.get("BRIEF", "")
                outcome = c.get("CALL_OUTCOME_NAME", "")
                sentiment = c.get("CUSTOMER_SENTIMENT", "")
                summary_lines.append(f"  [{date}] {brief} | Outcome: {outcome} | Sentiment: {sentiment}")

    # Section 4 — Prescriptions
    prescription_lines = ["\n\nSECTION 4 — PRESCRIPTIONS FOR BETTER CONVERSION\n"]
    for acc in accounts:
        opp_action = acc.get("opportunity_action")
        if opp_action:
            prescription_lines.append(f"• {acc['account_name']}: {opp_action}")
    if len(prescription_lines) == 1:
        prescription_lines.append("No acceleration opportunities identified at this time.")

    rep_email_body = "\n".join(
        actions_lines + context_lines +
        summary_lines + prescription_lines
    )

    # ── Build manager email body in Python ──
    manager_lines = ["SECTION 1 — QUOTA PERFORMANCE\n"]
    fa = rep_assessment_result.get("forecasted_attainment", 0)
    qa = rep_assessment_result.get("quota_attainment", 0)
    risk = rep_assessment_result.get("overall_risk", "")
    manager_lines.append(f"Quota Attainment: {qa}%")
    manager_lines.append(f"Forecasted Attainment: {fa}%")
    manager_lines.append(f"Overall Risk: {risk}")
    if fa < 60:
        manager_lines.append("⚠ URGENT — Forecasted attainment below 60% threshold.")

    manager_lines.append("\n\nSECTION 2 — AT-RISK ACCOUNTS\n")
    at_risk = [a for a in accounts if a.get("deal_health") in ("at_risk", "critical", "stalled")]
    if at_risk:
        for a in at_risk:
            manager_lines.append(
                f"• {a['account_name']} | Health: {a['deal_health']} | "
                f"Score: {a.get('conversion_score', 'N/A')} | "
                f"Action: {a.get('risk_action', '')}"
            )
    else:
        manager_lines.append("No accounts currently at risk.")

    manager_lines.append("\n\nSECTION 3 — RECURRING PATTERNS\n")
    patterns = rep_assessment_result.get("patterns", [])
    if patterns:
        for p in patterns:
            manager_lines.append(f"• {p}")
    else:
        manager_lines.append("No recurring patterns detected.")

    manager_lines.append("\n\nSECTION 4 — COACHING SIGNALS\n")
    coaching_accounts = [a for a in accounts if a.get("communication_gaps")]
    if coaching_accounts:
        for a in coaching_accounts:
            gaps = ", ".join(a["communication_gaps"])
            manager_lines.append(f"• {a['account_name']}: {gaps}")
    else:
        manager_lines.append("No coaching signals detected.")

    manager_email_body = "\n".join(manager_lines)

    return f"""
You are the Decision & Action agent in a sales rep performance pipeline.
Your ONLY job is to call exactly two tools in sequence with the arguments provided below.
Do NOT write code. Do NOT build email content. Just call the tools.

REP_ID: {rep_id}
REP_NAME: {rep_name}
REP_EMAIL: {rep_email}
MANAGER_EMAIL: {manager_email}

## STEP 1 — Call send_email_to_rep with these EXACT arguments:
  rep_id = "{rep_id}"
  rep_name = "{rep_name}"
  rep_email = "{rep_email}"
  email_body = {json.dumps(rep_email_body)}

## STEP 2 — After Step 1 completes, call send_email_to_manager with these EXACT arguments:
  rep_id = "{rep_id}"
  rep_name = "{rep_name}"
  manager_email = "{manager_email}"
  email_body = {json.dumps(manager_email_body)}

## RULES:
- Call tools ONE AT A TIME — Step 1 first, then Step 2.
- Never batch both tools in the same turn.
- Do NOT write Python code — call the tools directly.
- Do NOT invent or modify any argument values — use exactly what is provided above.
- After BOTH tools complete, return ONLY this JSON:
{{
  "actions": [
    {{"type": "send_email_to_rep", "status": "SENT or ERROR", "rep_id": "{rep_id}"}},
    {{"type": "send_email_to_manager", "status": "SENT or ERROR", "rep_id": "{rep_id}"}}
  ]
}}
"""