export const REP_OPTIONS = [
  'REP123 — Alicia Chen',
  'REP287 — Marcus Lee',
  'REP410 — Priya Nair',
];

export const ACCOUNTS = [
  {
    name: 'Company A',
    score: 25,
    health: 'Poor',
    issues: [
      'Pricing proposal promised but not sent',
      'Customer followed up twice',
      'Negative sentiment detected',
    ],
  },
  {
    name: 'Company B',
    score: 80,
    health: 'Good',
    issues: [],
  },
  {
    name: 'Company C',
    score: 52,
    health: 'Fair',
    issues: ['Slow response to last two emails'],
  },
  {
    name: 'Company D',
    score: 38,
    health: 'Poor',
    issues: ['No follow-up after demo call', 'Budget objection unresolved'],
  },
];

export const REP_SUMMARY = {
  quarterTarget: '$1.00M',
  currentSales: '$450K',
  forecast: '$580K',
  risk: 'High',
};

export const ACTIONS_TAKEN = [
  {
    title: 'Salesforce task created',
    detail: 'for Company A — pricing proposal was promised but never sent.',
  },
  {
    title: 'Manager review scheduled',
    detail: 'forecasted attainment is below the 60% threshold.',
  },
  {
    title: 'Coaching recommended',
    detail: 'repeated pattern of missed follow-ups across accounts.',
  },
];
