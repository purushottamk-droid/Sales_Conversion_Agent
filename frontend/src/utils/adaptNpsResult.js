// src/utils/adaptNpsResult.js
//
// Normalizes the REAL, confirmed NPS backend output shape:
//   { session_id, nps_payload, risk_classification_results: { classifications: [...] }, actions_taken }
//
// Confirmed from a live /agent/result capture:
//   - classifications[] DO include account_name directly (no lookup needed).
//   - actions_taken is a ```json-fenced string (same pattern/shape as the
//     sales agent's actions_taken): { actions: [{ type, status, rep_id,
//     rep_name, reason, detail }] } — note this is REP-scoped, not
//     account-scoped (a "notify_manager" action has no rep_id/rep_name at
//     all, since it's a single rollup email, not per-rep).
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
 *   { "actions": [ { type, status, rep_id?, rep_name?, reason, detail }, ... ] }
 * rep_id/rep_name are present for rep-scoped actions (e.g. message_rep) and
 * absent for rollup actions (e.g. notify_manager) — both are valid.
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
    repId: a.rep_id ?? null,
    repName: a.rep_name ?? null,
    reason: a.reason ?? '',
    detail: a.detail ?? null,
  }));
}

/**
 * Parses risk_classification_results.classifications[] into what
 * NpsDashboard/NpsAccountCard render. account_name arrives directly on
 * each entry — no cross-referencing against actions_taken needed.
 */
export function normalizeNpsClassifications(raw) {
  const list = raw?.classifications;
  if (!Array.isArray(list)) return [];

  return list.map((c, i) => ({
    key: `${c.account_id}-${i}`,
    accountId: c.account_id,
    accountName: c.account_name ?? c.account_id,
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
  const classifications = normalizeNpsClassifications(raw.risk_classification_results);

  return { classifications, actions, npsPayload: raw.nps_payload ?? null };
}