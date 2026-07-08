// src/utils/adaptResult.js
//
// Two generations of adapters live here:
//
// 1. normalizeRepProfile() — parses the REAL, confirmed shape returned by
//    DataCollectionAgent (see rep_performance_profile in main.py output).
//    This is what currently drives the Dashboard.
//
// 2. normalizeAccounts / normalizeSummary / normalizeActions — defensive
//    guesses for the LATER agents (AccountAnalysisAgent, SalesRepAgent,
//    decision_action_agent) whose real output shape we don't have yet.
//    Once you share a sample of account_analysis_results /
//    rep_assessment_result / actions_taken, replace these with exact
//    field mappings the same way normalizeRepProfile below is exact.

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
  // quota_attainment.current_month_attainment_pct arrives as a fraction (0.0 = 0%)
  return `${Math.round(num * 100)}%`;
}

// Heuristic only — the real risk verdict will come from SalesRepAgent
// (rep_assessment_result) once we have a sample of it. Until then this
// derives a rough risk label purely from current attainment so the
// dashboard isn't blank.
function deriveRiskFromAttainment(attainmentPct) {
  const pct = Number(attainmentPct) * 100;
  if (Number.isNaN(pct)) return 'Medium';
  if (pct < 40) return 'High';
  if (pct < 75) return 'Medium';
  return 'Low';
}

function extractCallTags(calls = []) {
  // Unique primary objections across an account's recent calls — used as
  // the "issues" list on the account card.
  const seen = new Set();
  const tags = [];
  for (const call of calls) {
    if (call.primary_objection && !seen.has(call.primary_objection)) {
      seen.add(call.primary_objection);
      tags.push(call.primary_objection);
    }
  }
  return tags;
}

/**
 * Parses the exact rep_performance_profile shape emitted by
 * DataCollectionAgent into what the Dashboard/AccountCard components render.
 */
export function normalizeRepProfile(raw) {
  if (!raw) return null;

  const assignedAccounts = raw.assigned_accounts ?? [];

  const accounts = assignedAccounts.map((acc) => {
    const opp = acc.opportunity_data ?? {};
    const timeline = opp.timeline_and_velocity ?? {};
    const cbi = opp.critical_business_issue ?? {};
    const engagement = opp.engagement_signals ?? {};
    const gong = opp.gong_interaction_analytics ?? {};
    const calls = gong.recent_calls ?? [];

    return {
      id: acc.account_id,
      name: acc.account_name,
      industry: acc.industry,
      segment: acc.account_segment,

      opportunityName: opp.opportunity_name,
      opportunityType: opp.opportunity_type,
      stage: opp.current_stage,
      forecastCategory: opp.forecast_category,
      dealValueArr: opp.deal_value_arr,
      discountPct: opp.discount_pct,

      daysOpen: timeline.days_open,
      stageDurationDays: timeline.current_stage_duration_days,
      closeDateTarget: timeline.close_date_target,

      cbiIdentified: cbi.cbi_identified,
      previousSolution: cbi.previous_solution,
      managerNotes: cbi.manager_notes,

      risks: opp.risks,
      nextStep: opp.next_step,
      daysSinceLastTouch: engagement.days_since_last_touch,

      latestCallDate: gong.latest_call_date,
      calls: calls.map((c) => ({
        title: c.title,
        date: c.scheduled_date,
        purpose: c.purpose,
        summary: c.meeting_summary,
        sentiment: c.customer_sentiment,
        objection: c.primary_objection,
        outcome: c.call_outcome_name,
        nextStep: c.next_step,
      })),
      issues: extractCallTags(calls),
    };
  });

  const totalGongCalls = accounts.reduce((sum, a) => sum + (a.calls?.length ?? 0), 0);

  const attainmentPct = raw.quota_attainment?.current_month_attainment_pct;

  const summary = {
    repName: raw.rep_name,
    repTier: raw.rep_experience_tier,
    quarterTarget: formatCurrency(raw.historical_targets?.monthly_arr_target_past_3_months),
    currentAttainment: formatPercent(attainmentPct),
    openPipelineArr: formatCurrency(raw.active_pipeline?.total_open_pipeline_arr),
    openOpportunityCount: raw.active_pipeline?.open_opportunity_count ?? accounts.length,
    risk: deriveRiskFromAttainment(attainmentPct),
  };

  return { summary, accounts, totalGongCalls };
}

// ---------------------------------------------------------------------
// Guesses for later-stage agents — tighten once real samples are shared.
// ---------------------------------------------------------------------

function normalizeRisk(value) {
  const v = String(value ?? '').toLowerCase();
  if (v.includes('high')) return 'High';
  if (v.includes('low')) return 'Low';
  if (v.includes('med')) return 'Medium';
  return value || 'Medium';
}

export function normalizeAccounts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((a, i) => ({
    name: a.name ?? a.account_name ?? a.accountName ?? `Account ${i + 1}`,
    score: a.score ?? a.health_score ?? a.deal_score ?? a.overall_score ?? '—',
    health: a.health ?? a.deal_health ?? a.status ?? a.rating ?? 'Unknown',
    issues: a.issues ?? a.objections ?? a.flags ?? a.missed_commitments ?? [],
  }));
}

export function normalizeSummary(raw) {
  if (!raw) return null;
  return {
    quarterTarget: raw.quarterTarget ?? raw.quarter_target ?? raw.target ?? '—',
    currentSales: raw.currentSales ?? raw.current_sales ?? raw.sales_to_date ?? '—',
    forecast: raw.forecast ?? raw.forecast_percentage ?? raw.forecast_pct ?? '—',
    risk: normalizeRisk(raw.risk ?? raw.risk_level ?? raw.overall_risk),
  };
}

export function normalizeActions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((a, i) => {
      if (typeof a === 'string') return { title: `Action ${i + 1}`, detail: a };
      return {
        title: a.title ?? a.action ?? a.name ?? `Action ${i + 1}`,
        detail: a.detail ?? a.description ?? a.reason ?? '',
      };
    });
  }
  return Object.entries(raw).map(([key, value]) => ({
    title: key.replace(/_/g, ' '),
    detail: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}