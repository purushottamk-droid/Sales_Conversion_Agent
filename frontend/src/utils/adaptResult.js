// src/utils/adaptResult.js
//
// Normalizes the REAL, confirmed backend output shapes (captured from
// live SSE + /agent/result responses) into what the Dashboard/AccountCard
// components render.
//
// Real shapes handled:
//
// 1. account_analysis_results (from GET /agent/result) — a single object
//    with rep-level summary fields plus a nested `accounts` array.
//
// 2. actions_taken (from GET /agent/result) — a STRING wrapped in
//    ```json ... ``` markdown fences, not parsed JSON.
//
// 3. buyer_persona_profiles.personas[] — one entry per account, each with a
//    `profile_360` object (account_profile, company_profile,
//    customer_profile, salesrep_profile). Attached to each account as
//    `account.profile360`, matched by opportunity_id, then account_id,
//    then account name.

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

// ---------------------------------------------------------------------
// 360° profile
// ---------------------------------------------------------------------

// News items arrive as "Headline: long scraped body...". Split on the first
// ": " into a headline and a short, whitespace-collapsed snippet.
function splitNewsItem(item) {
  if (typeof item !== 'string') return { title: '', snippet: '' };
  const idx = item.indexOf(': ');
  const hasTitle = idx > 0 && idx < 160;
  const title = (hasTitle ? item.slice(0, idx) : item.slice(0, 100)).trim();
  let snippet = hasTitle ? item.slice(idx + 2) : '';
  snippet = snippet.replace(/\s+/g, ' ').trim();
  if (snippet.length > 160) snippet = snippet.slice(0, 160).trimEnd() + '…';
  return { title, snippet };
}

// descriptive_summary is a "•"-bulleted string with a header line. Return the
// bullet lines only, without the bullet character.
function splitNarrative(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*\u2022\s*/, '').trim())
    .filter(Boolean)
    .filter((l, i) => !(i === 0 && /^360/.test(l)));
}

// key_interests entries are one long " | "-separated string per call.
function splitInterests(list) {
  const out = [];
  for (const entry of list ?? []) {
    if (typeof entry !== 'string') continue;
    entry
      .split(' | ')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => out.push(s));
  }
  return out;
}

// ---- Lusha profile (customer_profile.lusha_profile_data) -------------
// Only populated when Lusha finds a match (e.g. Johns Hopkins); null for the
// COMPLIANCE_RESTRICTED rest. Lusha's field names vary by API version, so each
// field is read from several likely keys. Returns null when nothing usable.

function pickFirst(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return null;
}

function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (typeof v === 'object') {
    const t =
      v.name ?? v.email ?? v.number ?? v.internationalNumber ?? v.localNumber ??
      v.value ?? v.title ?? v.label ?? v.url;
    return t !== null && t !== undefined ? String(t).trim() : '';
  }
  return '';
}

function toList(v) {
  if (v === null || v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  const seen = new Set();
  return arr
    .map(toText)
    .filter((s) => {
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}

function labelFromUrl(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '').split('.')[0];
  } catch {
    return 'link';
  }
}

// Social links may be an object ({linkedin: url}), an array of urls, or an
// array of {type, url}. Only http(s) urls are kept (they become <a href>).
function toLinks(v) {
  if (!v) return [];
  const out = [];
  const add = (label, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
      out.push({ label: label || labelFromUrl(url), url: url.trim() });
    }
  };
  if (Array.isArray(v)) {
    v.forEach((item) => {
      if (typeof item === 'string') add(labelFromUrl(item), item);
      else if (item && typeof item === 'object') {
        add(item.type ?? item.network ?? item.name, item.url ?? item.link ?? item.value);
      }
    });
  } else if (typeof v === 'object') {
    Object.entries(v).forEach(([k, val]) => add(k, typeof val === 'string' ? val : val?.url));
  } else if (typeof v === 'string') {
    add(labelFromUrl(v), v);
  }
  return out;
}

function fmtDate(d) {
  if (!d) return '';
  if (typeof d === 'string' || typeof d === 'number') return String(d);
  if (typeof d === 'object' && d.year) return d.month ? `${d.month}/${d.year}` : String(d.year);
  return '';
}

function toPreviousEmployment(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((j) => {
      if (typeof j === 'string') return { company: j, title: '', period: '' };
      if (!j || typeof j !== 'object') return null;
      const company = toText(
        j.companyName ?? j.company_name ?? j.company ?? j.organization ?? j.employer
      );
      const title = toText(j.jobTitle ?? j.job_title ?? j.title ?? j.position);
      const start = fmtDate(j.startDate ?? j.start_date ?? j.start);
      const end = fmtDate(j.endDate ?? j.end_date ?? j.end);
      const period = [start, end].filter(Boolean).join(' – ');
      return company || title ? { company, title, period } : null;
    })
    .filter(Boolean);
}

function normalizeLushaProfile(raw) {
  let d = raw;
  if (typeof d === 'string') d = stripFencesAndParse(d);
  if (Array.isArray(d)) d = d.find((x) => x && typeof x === 'object') ?? null;
  if (d && typeof d === 'object' && d.data && typeof d.data === 'object') {
    d = Array.isArray(d.data) ? d.data[0] : d.data;
  }
  if (!d || typeof d !== 'object') return null;

  const lusha = {
    emails: toList(pickFirst(d, ['emailAddresses', 'email_addresses', 'emails', 'email'])),
    phones: toList(pickFirst(d, ['phoneNumbers', 'phone_numbers', 'phones', 'phone'])),
    seniority: toList(pickFirst(d, ['seniority'])),
    departments: toList(pickFirst(d, ['departments', 'department'])),
    socialLinks: toLinks(pickFirst(d, ['socialLinks', 'social_links', 'socials', 'social'])),
    skills: toList(pickFirst(d, ['skills'])),
    previousEmployment: toPreviousEmployment(
      pickFirst(d, ['previousJobs', 'previous_jobs', 'previousEmployment', 'previous_employment', 'previousCompanies', 'experience'])
    ),
  };

  const hasAny = Object.values(lusha).some((v) => v.length > 0);
  return hasAny ? lusha : null;
}

function normalizeProfile360(persona) {
  const p = persona?.profile_360;
  if (!p) return null;

  const company = p.company_profile ?? {};
  const account = p.account_profile ?? {};
  const customer = p.customer_profile ?? {};
  const rep = p.salesrep_profile ?? {};

  const news = (company.company_recent_news ?? []).map(splitNewsItem);

  // strategic_initiatives are mostly the same headlines as the news list —
  // only keep the ones that add something, and drop duplicates.
  const newsTitles = new Set(news.map((n) => n.title.toLowerCase()));
  const seen = new Set();
  const initiatives = (company.strategic_initiatives ?? []).filter((s) => {
    const key = String(s).trim().toLowerCase();
    if (!key || newsTitles.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const dept = customer.department;

  return {
    narrative: splitNarrative(p.descriptive_summary),
    company: {
      name: company.company_name,
      industry: company.industry,
      segment: company.account_segment,
      news,
      initiatives,
    },
    account: {
      opportunityName: account.opportunity_name,
      opportunityType: account.opportunity_type,
      currentStage: account.current_stage,
      dealValueArr: account.deal_value_arr,
      closeDateTarget: account.close_date_target,
      cbi: account.cbi_identified,
      sentiment: account.customer_sentiment,
      objections: account.primary_objections ?? [],
      keyInterests: splitInterests(account.key_interests),
    },
    customer: {
      name: customer.contact_name,
      title: customer.contact_title,
      email: customer.contact_email,
      linkedinUrl: customer.linkedin_url,
      seniority: customer.seniority,
      department: Array.isArray(dept) ? dept.join(', ') : dept,
      enrichmentStatus: customer.enrichment_status,
      lusha: normalizeLushaProfile(customer.lusha_profile_data),
    },
    salesRep: {
      name: rep.rep_name,
      tier: rep.rep_experience_tier,
      attainmentPct: rep.current_month_attainment_pct,
    },
  };
}

/**
 * Builds lookups from buyer_persona_profiles and returns accounts with a
 * `profile360` field (null when nothing matches). Accepts the raw object,
 * a bare personas array, or a fenced JSON string.
 */
function attachProfiles360(accounts, buyerPersonaProfiles) {
  let bpp = buyerPersonaProfiles;
  if (typeof bpp === 'string') bpp = stripFencesAndParse(bpp);

  const personas = Array.isArray(bpp) ? bpp : bpp?.personas;
  if (!Array.isArray(personas) || personas.length === 0) {
    return accounts.map((a) => ({ ...a, profile360: null }));
  }

  const byOpp = new Map();
  const byAccount = new Map();
  const byName = new Map();
  for (const persona of personas) {
    if (persona?.opportunity_id) byOpp.set(persona.opportunity_id, persona);
    if (persona?.account_id) byAccount.set(persona.account_id, persona);
    if (persona?.account_name) byName.set(persona.account_name.trim().toLowerCase(), persona);
  }

  return accounts.map((a) => {
    const persona =
      byOpp.get(a.opportunityId) ??
      byAccount.get(a.id) ??
      byName.get(String(a.name ?? '').trim().toLowerCase());
    return { ...a, profile360: normalizeProfile360(persona) };
  });
}

/**
 * Parses the exact account_analysis_results shape returned by
 * GET /agent/result into what the Dashboard/AccountCard components render.
 *
 * Pass result.buyer_persona_profiles as the second argument to attach the
 * 360° profile to each account.
 */
export function normalizeAccountAnalysis(raw, buyerPersonaProfiles) {
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
    customerObjections: (acc.customer_objections ?? []).map((obj) => ({
      objection: obj.objection,
      severity: obj.severity,
      scoreImpactIfResolved: obj.score_impact_if_resolved,
    })),
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
    currentTargetArr: raw.current_target_arr,
    currentMonthArrAchieved: raw.current_month_arr_achieved,
    forecastedArrThisMonth: raw.forecasted_arr_this_month,
  };

  return { summary, accounts: attachProfiles360(accounts, buyerPersonaProfiles) };
}

/**
 * Parses the fenced actions_taken string from GET /agent/result into a
 * flat array the Dashboard can render.
 *
 * Confirmed real shape once unfenced:
 *   { "actions": [ { type, status, rep_id, rep_name, reason }, ... ] }
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
    status: a.status ?? 'UNKNOWN', // 'SENT' | 'ERROR' | 'SKIPPED'
    repId: a.rep_id,
    repName: a.rep_name,
    reason: a.reason ?? '',
  }));
}

/**
 * Fallback for when account_analysis_results is null. Builds an equivalent
 * {summary, accounts} shape from rep_performance_profile + the top-level ARR
 * fields. Reads root.buyer_persona_profiles itself, so no extra argument is
 * needed to get 360° profiles here.
 */
export function normalizeRepProfileFallback(root) {
  const rpp = root?.rep_performance_profile;
  if (!rpp) return null;

  const assigned = rpp.assigned_accounts ?? [];
  const quota = rpp.quota_attainment ?? {};

  const attainmentPct = quota.monthly_attainment_pct ?? quota.quarterly_attainment_pct;

  const accounts = assigned.map((acc) => {
    const opp = acc.opportunity_data ?? {};
    const cbi = opp.critical_business_issue ?? {};
    const calls = opp.gong_interaction_analytics?.recent_calls ?? [];

    return {
      id: acc.account_id,
      name: acc.account_name,
      opportunityId: opp.opportunity_id,
      opportunityName: opp.opportunity_name,
      opportunityType: opp.opportunity_type,
      recentMeetingSummary: calls[0]?.meeting_summary ?? '',
      dealHealth:
        opp.current_stage === 'Closed Won'
          ? 'healthy'
          : opp.current_stage?.startsWith('Closed Lost') || opp.current_stage === 'Lost No Decision'
          ? 'critical'
          : 'at_risk',
      conversionScore: null,
      conversionScoreReasoning: '',
      missedCommitments: [],
      customerObjections: calls
        .filter((c) => c.primary_objection)
        .map((c) => ({ objection: c.primary_objection, severity: null, scoreImpactIfResolved: null })),
      communicationGaps: [],
      riskAction: opp.risks,
      opportunityAction: opp.next_step ?? cbi.manager_notes,
      analysisSummary: cbi.cbi_identified,
    };
  });

  const summary = {
    repId: rpp.rep_id,
    repName: rpp.rep_name,
    repTier: rpp.rep_experience_tier,
    performanceSummary: null,
    attainmentScore: attainmentPct != null ? Math.round(attainmentPct) : null,
    attainmentReasoning: '',
    criticalDeals: [],
    bestDealsToPursue: [],
    keySuggestions: [],
    risk: deriveRiskFromAttainment(attainmentPct),
    currentTargetArr: root?.current_target_arr,
    currentMonthArrAchieved: root?.current_month_arr_achieved,
    forecastedArrThisMonth: root?.forecasted_arr_this_month,
  };

  return { summary, accounts: attachProfiles360(accounts, root?.buyer_persona_profiles) };
}