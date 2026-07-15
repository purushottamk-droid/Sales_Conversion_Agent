// Dummy response for the NPS Insight Agent (risk_classification_agent output).
// Wire this in via NpsHero's onRun until the real NPS backend is live.
// Account names are mapped locally here since accounts.js only holds
// Sales Agent data and should not be touched.

const ACCOUNT_NAMES = {
  '001fj00001QbtDAAAZ': 'Jasper Health',
  '001fj00001QbtDTAAZ': 'Meridian Foods',
  '001fj00001QcFRVAA3': 'Jasper Utilities',
  '001fj00001QbtCpAAJ': 'Redwood Utilities',
  '001fj00001QbtDDAAZ': 'Vertex Pharma',
};

export const NPS_DUMMY_RESULT = {
  classifications: [
    {
      account_id: '001fj00001QbtDAAAZ',
      risk_level: 'Low',
      nps_label: 'Promoter',
      drivers: [
        'NPS score of 9 indicates a Promoter.',
        'Customer comment expresses satisfaction with platform reliability and proactive CS.',
        'Account is active with a tenure of 436 days.',
        'No open cases or high-priority issues.',
        'No open opportunities, indicating no immediate upsell signals.',
      ],
      renewal: { is_renewal_soon: false },
      upsell_candidate: false,
      rep_performance_flag: false,
      recommended_action:
        'Continue proactive engagement with Jasper Health, highlighting their positive feedback in upcoming QBRs and exploring potential case studies.',
    },
    {
      account_id: '001fj00001QbtDTAAZ',
      risk_level: 'Low',
      nps_label: 'Promoter',
      drivers: [
        'NPS score of 10 indicates a Promoter.',
        'Customer comment indicates strong overall experience and willingness to recommend.',
        'Account is active with a tenure of 393 days.',
        'No open cases or high-priority issues.',
        'No open opportunities, indicating no immediate upsell signals.',
      ],
      renewal: { is_renewal_soon: false },
      upsell_candidate: false,
      rep_performance_flag: false,
      recommended_action:
        'Schedule a QBR with Meridian Foods to discuss their continued success and explore any emerging needs or potential expansion opportunities based on their positive feedback.',
    },
    {
      account_id: '001fj00001QcFRVAA3',
      risk_level: 'High',
      nps_label: 'Detractor',
      drivers: [
        'NPS score of 0 indicates a Detractor.',
        'Customer comment cites slow support response and unresolved issues.',
        'Primary churn score is 18.0, indicating a high risk of churn.',
        "Two open cross-sell opportunities are in stages ('Lost No Decision', 'Demo') with risk factors like 'Executive sponsor not yet confirmed'.",
        'Despite a low score, there are no open high-priority cases, suggesting issues may not be formally tracked or escalated.',
      ],
      renewal: { is_renewal_soon: false },
      upsell_candidate: false,
      rep_performance_flag: false,
      recommended_action:
        "Immediately escalate the support issues mentioned in the NPS comment to the support lead for urgent resolution, and schedule a call with Jasper Utilities' primary contact to discuss their concerns and re-align on value.",
    },
    {
      account_id: '001fj00001QbtCpAAJ',
      risk_level: 'Low',
      nps_label: 'Promoter',
      drivers: [
        'NPS score of 9 indicates a Promoter.',
        'Customer comment expresses satisfaction with platform reliability and proactive CS.',
        'Account has a long tenure of 497 days.',
        'No open cases or high-priority issues.',
        'No open opportunities, indicating no immediate upsell signals.',
      ],
      renewal: { is_renewal_soon: false },
      upsell_candidate: false,
      rep_performance_flag: false,
      recommended_action:
        "Leverage Redwood Utilities' Promoter status by requesting them as a reference, and proactively discuss their upcoming renewal with a focus on demonstrating continued value.",
    },
    {
      account_id: '001fj00001QbtDDAAZ',
      risk_level: 'Low',
      nps_label: 'Promoter',
      drivers: [
        'NPS score of 10 indicates a Promoter.',
        'Customer comment indicates strong overall experience and willingness to recommend.',
        'Account is active with a tenure of 438 days.',
        'No open cases or high-priority issues.',
        'No open opportunities, indicating no immediate upsell signals.',
      ],
      renewal: { is_renewal_soon: false },
      upsell_candidate: false,
      rep_performance_flag: false,
      recommended_action:
        'Engage Vertex Pharma to explore opportunities for case study participation or joint marketing initiatives, capitalizing on their high satisfaction score.',
    },
  ],
};

export function getAccountName(accountId) {
  return ACCOUNT_NAMES[accountId] || accountId;
}