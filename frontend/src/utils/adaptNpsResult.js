// src/utils/adaptNpsResult.js
//
// Normalizes the REAL, confirmed NPS backend output shape:
//   { session_id, nps_payload, risk_classification_results: { classifications: [...] }, actions_taken }
//
// Confirmed from a live /agent/result capture:
//   - classifications[] do NOT include account_name, only account_id.
//   - actions_taken is a ```json-fenced string (same pattern as the sales
//     agent's actions_taken) — and its entries DO include account_name.
//     So we build an account_id -> account_name lookup from actions_taken
//     and use it to label classification cards, instead of a hardcoded map.
//   - account_id is NOT guaranteed unique across classifications — some
//     accounts have multiple survey responses (e.g. an NPS survey + a
//     separate CSAT survey) and appear as two separate entries with
//     different scores. We keep both and key by index, not account_id.

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

/**
 * Parses actions_taken into a flat array.
 * Confirmed real shape once unfenced:
 *   { "actions": [ { type, status, account_id, account_name, reason, detail }, ... ] }
 */
export function normalizeNpsActions(raw) {
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
    accountId: a.account_id,
    accountName: a.account_name,
    reason: a.reason ?? '',
    detail: a.detail ?? null,
  }));
}

function buildAccountNameMap(actions) {
  const map = {};
  for (const a of actions) {
    if (a.accountId && a.accountName && !map[a.accountId]) {
      map[a.accountId] = a.accountName;
    }
  }
  return map;
}

/**
 * Parses risk_classification_results.classifications[] into what
 * NpsDashboard/NpsAccountCard render.
 */
export function normalizeNpsClassifications(raw, nameMap = {}) {
  const list = raw?.classifications;
  if (!Array.isArray(list)) return [];

  return list.map((c, i) => ({
    key: `${c.account_id}-${i}`,
    accountId: c.account_id,
    accountName: nameMap[c.account_id] ?? c.account_id,
    riskLevel: c.risk_level,
    npsLabel: c.nps_label,
    drivers: c.drivers ?? [],
    isRenewalSoon: !!c.renewal?.is_renewal_soon,
    upsellCandidate: !!c.upsell_candidate,
    repPerformanceFlag: !!c.rep_performance_flag,
    recommendedAction: c.recommended_action,
  }));
}

/**
 * Top-level adapter: takes the raw GET /agent/result payload and returns
 * everything the NPS UI needs in one shot.
 */
export function normalizeNpsResult(raw) {
  if (!raw) return null;

  const actions = normalizeNpsActions(raw.actions_taken);
  const nameMap = buildAccountNameMap(actions);
  const classifications = normalizeNpsClassifications(raw.risk_classification_results, nameMap);

  return { classifications, actions, npsPayload: raw.nps_payload ?? null };
}