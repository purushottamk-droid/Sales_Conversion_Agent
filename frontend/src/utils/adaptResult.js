// // src/utils/adaptResult.js
// //
// // Two generations of adapters live here:
// //
// // 1. normalizeRepProfile() — parses the REAL, confirmed shape returned by
// //    DataCollectionAgent (see rep_performance_profile in main.py output).
// //    This is what currently drives the Dashboard.
// //
// // 2. normalizeAccounts / normalizeSummary / normalizeActions — defensive
// //    guesses for the LATER agents (AccountAnalysisAgent, SalesRepAgent,
// //    decision_action_agent) whose real output shape we don't have yet.
// //    Once you share a sample of account_analysis_results /
// //    rep_assessment_result / actions_taken, replace these with exact
// //    field mappings the same way normalizeRepProfile below is exact.

// export function formatCurrency(value) {
//   if (value === null || value === undefined || value === '') return '—';
//   const num = Number(value);
//   if (Number.isNaN(num)) return String(value);
//   return num.toLocaleString('en-US', {
//     style: 'currency',
//     currency: 'USD',
//     maximumFractionDigits: 0,
//   });
// }

// export function formatPercent(value) {
//   if (value === null || value === undefined || value === '') return '—';
//   const num = Number(value);
//   if (Number.isNaN(num)) return String(value);
//   // quota_attainment.current_month_attainment_pct arrives as a fraction (0.0 = 0%)
//   return `${Math.round(num * 100)}%`;
// }

// // Heuristic only — the real risk verdict will come from SalesRepAgent
// // (rep_assessment_result) once we have a sample of it. Until then this
// // derives a rough risk label purely from current attainment so the
// // dashboard isn't blank.
// function deriveRiskFromAttainment(attainmentPct) {
//   const pct = Number(attainmentPct) * 100;
//   if (Number.isNaN(pct)) return 'Medium';
//   if (pct < 40) return 'High';
//   if (pct < 75) return 'Medium';
//   return 'Low';
// }

// function extractCallTags(calls = []) {
//   // Unique primary objections across an account's recent calls — used as
//   // the "issues" list on the account card.
//   const seen = new Set();
//   const tags = [];
//   for (const call of calls) {
//     if (call.primary_objection && !seen.has(call.primary_objection)) {
//       seen.add(call.primary_objection);
//       tags.push(call.primary_objection);
//     }
//   }
//   return tags;
// }

// /**
//  * Parses the exact rep_performance_profile shape emitted by
//  * DataCollectionAgent into what the Dashboard/AccountCard components render.
//  */
// export function normalizeRepProfile(raw) {
//   if (!raw) return null;

//   const assignedAccounts = raw.assigned_accounts ?? [];

//   const accounts = assignedAccounts.map((acc) => {
//     const opp = acc.opportunity_data ?? {};
//     const timeline = opp.timeline_and_velocity ?? {};
//     const cbi = opp.critical_business_issue ?? {};
//     const engagement = opp.engagement_signals ?? {};
//     const gong = opp.gong_interaction_analytics ?? {};
//     const calls = gong.recent_calls ?? [];

//     return {
//       id: acc.account_id,
//       name: acc.account_name,
//       industry: acc.industry,
//       segment: acc.account_segment,

//       opportunityName: opp.opportunity_name,
//       opportunityType: opp.opportunity_type,
//       stage: opp.current_stage,
//       forecastCategory: opp.forecast_category,
//       dealValueArr: opp.deal_value_arr,
//       discountPct: opp.discount_pct,

//       daysOpen: timeline.days_open,
//       stageDurationDays: timeline.current_stage_duration_days,
//       closeDateTarget: timeline.close_date_target,

//       cbiIdentified: cbi.cbi_identified,
//       previousSolution: cbi.previous_solution,
//       managerNotes: cbi.manager_notes,

//       risks: opp.risks,
//       nextStep: opp.next_step,
//       daysSinceLastTouch: engagement.days_since_last_touch,

//       latestCallDate: gong.latest_call_date,
//       calls: calls.map((c) => ({
//         title: c.title,
//         date: c.scheduled_date,
//         purpose: c.purpose,
//         summary: c.meeting_summary,
//         sentiment: c.customer_sentiment,
//         objection: c.primary_objection,
//         outcome: c.call_outcome_name,
//         nextStep: c.next_step,
//       })),
//       issues: extractCallTags(calls),
//     };
//   });

//   const totalGongCalls = accounts.reduce((sum, a) => sum + (a.calls?.length ?? 0), 0);

//   const attainmentPct = raw.quota_attainment?.current_month_attainment_pct;

//   const summary = {
//     repName: raw.rep_name,
//     repTier: raw.rep_experience_tier,
//     quarterTarget: formatCurrency(raw.historical_targets?.monthly_arr_target_past_3_months),
//     currentAttainment: formatPercent(attainmentPct),
//     openPipelineArr: formatCurrency(raw.active_pipeline?.total_open_pipeline_arr),
//     openOpportunityCount: raw.active_pipeline?.open_opportunity_count ?? accounts.length,
//     risk: deriveRiskFromAttainment(attainmentPct),
//   };

//   return { summary, accounts, totalGongCalls };
// }

// // ---------------------------------------------------------------------
// // Guesses for later-stage agents — tighten once real samples are shared.
// // ---------------------------------------------------------------------

// function normalizeRisk(value) {
//   const v = String(value ?? '').toLowerCase();
//   if (v.includes('high')) return 'High';
//   if (v.includes('low')) return 'Low';
//   if (v.includes('med')) return 'Medium';
//   return value || 'Medium';
// }

// export function normalizeAccounts(raw) {
//   if (!Array.isArray(raw)) return [];
//   return raw.map((a, i) => ({
//     name: a.name ?? a.account_name ?? a.accountName ?? `Account ${i + 1}`,
//     score: a.score ?? a.health_score ?? a.deal_score ?? a.overall_score ?? '—',
//     health: a.health ?? a.deal_health ?? a.status ?? a.rating ?? 'Unknown',
//     issues: a.issues ?? a.objections ?? a.flags ?? a.missed_commitments ?? [],
//   }));
// }

// export function normalizeSummary(raw) {
//   if (!raw) return null;
//   return {
//     quarterTarget: raw.quarterTarget ?? raw.quarter_target ?? raw.target ?? '—',
//     currentSales: raw.currentSales ?? raw.current_sales ?? raw.sales_to_date ?? '—',
//     forecast: raw.forecast ?? raw.forecast_percentage ?? raw.forecast_pct ?? '—',
//     risk: normalizeRisk(raw.risk ?? raw.risk_level ?? raw.overall_risk),
//   };
// }

// export function normalizeActions(raw) {
//   if (!raw) return [];
//   if (Array.isArray(raw)) {
//     return raw.map((a, i) => {
//       if (typeof a === 'string') return { title: `Action ${i + 1}`, detail: a };
//       return {
//         title: a.title ?? a.action ?? a.name ?? `Action ${i + 1}`,
//         detail: a.detail ?? a.description ?? a.reason ?? '',
//       };
//     });
//   }
//   return Object.entries(raw).map(([key, value]) => ({
//     title: key.replace(/_/g, ' '),
//     detail: typeof value === 'string' ? value : JSON.stringify(value),
//   }));
// }

// src/utils/adaptResult.js
//
// Normalizes the REAL, confirmed backend output shapes (captured from
// live SSE + /agent/result responses) into what the Dashboard/AccountCard
// components render.
//
// Two real shapes to handle:
//
// 1. account_analysis_results (from GET /agent/result) — a single object
//    with rep-level summary fields plus a nested `accounts` array. This
//    replaces the old, incorrect normalizeRepProfile (which was built
//    around a different, unused DataCollectionAgent payload shape that
//    never actually streams).
//
// 2. actions_taken (from GET /agent/result) — a STRING wrapped in
//    ```json ... ``` markdown fences, not parsed JSON. Must be
//    fence-stripped and JSON.parse'd before use.

export function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `${Math.round(num)}%`;
}

// Strips ```json ... ``` (or bare ``` ... ```) fences if present, then
// parses. Safe to call on already-clean JSON strings too (no-op strip).
function stripFencesAndParse(text) {
  if (typeof text !== 'string') return null;
  const raw = text.trim();
  if (!raw) return null;

  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

function deriveRiskFromAttainment(score) {
  const num = Number(score);
  if (Number.isNaN(num)) return 'Medium';
  if (num < 40) return 'High';
  if (num < 70) return 'Medium';
  return 'Low';
}

/**
 * Parses the exact account_analysis_results shape returned by
 * GET /agent/result into what the Dashboard/AccountCard components render.
 *
 * Confirmed real fields (from live capture):
 *   rep_id, rep_name, rep_experience_tier, rep_performance_summary,
 *   rep_target_attainment_score, rep_target_attainment_reasoning,
 *   critical_deals[], best_deals_to_pursue[], key_suggestions[],
 *   accounts[] — each with account_id, account_name, opportunity_id,
 *   opportunity_name, opportunity_type, recent_meeting_summary,
 *   deal_health ('healthy'|'at_risk'|'critical'), conversion_score,
 *   conversion_score_reasoning, missed_commitments[], customer_objections[],
 *   communication_gaps[], risk_action, opportunity_action, analysis_summary
 */
export function normalizeAccountAnalysis(raw) {
  if (!raw) return null;

  const accounts = (raw.accounts ?? []).map((acc) => ({
    id: acc.account_id,
    name: acc.account_name,
    opportunityId: acc.opportunity_id,
    opportunityName: acc.opportunity_name,
    opportunityType: acc.opportunity_type,
    recentMeetingSummary: acc.recent_meeting_summary,
    dealHealth: acc.deal_health, // 'healthy' | 'at_risk' | 'critical'
    conversionScore: acc.conversion_score,
    conversionScoreReasoning: acc.conversion_score_reasoning,
    missedCommitments: acc.missed_commitments ?? [],
    customerObjections: acc.customer_objections ?? [],
    communicationGaps: acc.communication_gaps ?? [],
    riskAction: acc.risk_action,
    opportunityAction: acc.opportunity_action,
    analysisSummary: acc.analysis_summary,
  }));

  const summary = {
    repId: raw.rep_id,
    repName: raw.rep_name,
    repTier: raw.rep_experience_tier,
    performanceSummary: raw.rep_performance_summary,
    attainmentScore: raw.rep_target_attainment_score,
    attainmentReasoning: raw.rep_target_attainment_reasoning,
    criticalDeals: raw.critical_deals ?? [],
    bestDealsToPursue: raw.best_deals_to_pursue ?? [],
    keySuggestions: raw.key_suggestions ?? [],
    risk: deriveRiskFromAttainment(raw.rep_target_attainment_score),
  };

  return { summary, accounts };
}

/**
 * Parses the fenced actions_taken string from GET /agent/result into a
 * flat array the Dashboard can render.
 *
 * Confirmed real shape once unfenced:
 *   { "actions": [ { type, status, rep_id, rep_name, reason }, ... ] }
 *
 * Also defensively handles the case where the backend later starts
 * returning already-parsed JSON (array or {actions:[...]}) instead of a
 * fenced string.
 */
export function normalizeActions(raw) {
  if (!raw) return [];

  let parsed = raw;
  if (typeof raw === 'string') {
    parsed = stripFencesAndParse(raw);
    if (!parsed) return [];
  }

  const list = Array.isArray(parsed) ? parsed : parsed.actions;
  if (!Array.isArray(list)) return [];

  return list.map((a, i) => ({
    type: a.type ?? `action_${i + 1}`,
    status: a.status ?? 'UNKNOWN', // 'SENT' | 'ERROR' | 'SKIPPED', confirmed from log
    repId: a.rep_id,
    repName: a.rep_name,
    reason: a.reason ?? '',
  }));
}