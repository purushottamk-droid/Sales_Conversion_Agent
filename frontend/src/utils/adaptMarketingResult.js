// Normalizes the (currently dummy) Marketing Agent result into the
// camelCase shape MarketingDashboard.jsx expects. Once a real backend
// exists, only this file should need to change — components stay the same.
export function normalizeMarketingResult(rawResult) {
  if (!rawResult) return null;

  const rawCampaigns = rawResult.campaign_analysis_results ?? [];

  const campaigns = rawCampaigns.map((c, i) => ({
    key: c.campaign_id || `campaign-${i}`,
    campaignName: c.campaign_name,
    campaignId: c.campaign_id,
    channel: c.channel,
    performanceLevel: c.performance_level, // 'High' | 'Medium' | 'Low'
    sentiment: c.sentiment, // 'Positive' | 'Neutral' | 'Negative'
    isUnderperforming: !!c.is_underperforming,
    budgetReallocationSuggested: !!c.budget_reallocation_suggested,
    recommendedAction: c.recommended_action,
    drivers: c.drivers ?? [],
  }));

  return { campaigns };
}