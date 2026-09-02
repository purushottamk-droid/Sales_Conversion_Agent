// src/utils/adaptMarketingResult.js
//
// Normalizes the REAL Marketing Agent result into the camelCase shape
// MarketingDashboard.jsx / MarketingChannelCard.jsx / MarketingCampaignCard.jsx
// expect. Only this file should need to change if the backend's field names
// shift — components stay the same.
//
// Per-campaign data is merged from FOUR sources, keyed by campaign_id:
//   1. campaign_analysis_results.campaigns      -> health, efficiency_score,
//      growth_potential, high_intent_segments, performance_issues,
//      recommended_action, analysis_summary
//   2. growth_assessment_result.campaign_assessments -> performance_category,
//      budget_direction, budget_change_percent, growth_outlook, recommendation
//   3. growth_assessment_result.budget_recommendations -> direction/percent/
//      amount/reason (falls back for assessments where this is more specific)
//   4. marketing_payload.overall_performance     -> spend, platform
//      conversions, sf leads/opportunities
//   5. marketing_dataset.campaigns[].derived_metrics -> ctr, cpc, cpl, cpo,
//      roas, pipeline_roi (real computed metrics, not the mostly-null ones
//      on overall_performance)
//
// Channel-level data is grouped by the raw platform key ('google_ads',
// 'linkedin_ads', ...), merging channel_efficiency (-> portfolio),
// channel_forecasts (-> forecast), and channel_budget_allocation (->
// budgetAllocation, confirmed shape: current_spend, recommended_spend,
// change_amount, change_percent, rationale).

const PLATFORM_LABELS = {
  google_ads: 'Google Ads',
  linkedin_ads: 'LinkedIn Ads',
  microsoft_ads: 'Microsoft Ads',
  capterra: 'Capterra',
};

const HEALTH_TO_LEVEL = {
  healthy: 'High',
  at_risk: 'Medium',
  critical: 'Low',
  watch: 'Medium',
};

const HEALTH_LABELS = {
  healthy: 'Healthy',
  at_risk: 'At risk',
  critical: 'Critical',
  watch: 'Watch',
};

function parseFencedJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const unfenced = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

export function normalizeMarketingResult(rawResult) {
  if (!rawResult) return null;

  const rawCampaigns = rawResult.campaign_analysis_results?.campaigns ?? [];
  const growth = rawResult.growth_assessment_result ?? {};
  const datasetCampaigns = rawResult.marketing_dataset?.campaigns ?? [];
  const overallPerformance = rawResult.marketing_payload?.overall_performance ?? [];

  const assessmentById = new Map((growth.campaign_assessments ?? []).map((a) => [a.campaign_id, a]));
  const budgetById = new Map((growth.budget_recommendations ?? []).map((b) => [b.campaign_id, b]));
  const datasetById = new Map(datasetCampaigns.map((c) => [c.campaign_id, c]));
  const overallPerfById = new Map(overallPerformance.map((p) => [p.campaign_id, p]));

  const campaigns = rawCampaigns.map((c, i) => {
    const assessment = assessmentById.get(c.campaign_id);
    const budget = budgetById.get(c.campaign_id);
    const datasetCampaign = datasetById.get(c.campaign_id);
    const derived = datasetCampaign?.derived_metrics ?? {};
    const overallPerf = overallPerfById.get(c.campaign_id);

    return {
      key: c.campaign_id || `campaign-${i}`,
      campaignId: c.campaign_id,
      campaignName: c.campaign_name,
      platformKey: c.platform, // raw key, e.g. 'google_ads' — used to group into channels
      channel: PLATFORM_LABELS[c.platform] || c.platform,

      // --- 1. From campaign_analysis_results (health/analysis step) ---
      health: c.campaign_health, // 'critical' | 'at_risk' | 'watch' | 'healthy'
      healthLabel: HEALTH_LABELS[c.campaign_health] || c.campaign_health,
      performanceLevel: HEALTH_TO_LEVEL[c.campaign_health] || 'Medium',
      isUnderperforming: c.campaign_health === 'critical' || c.campaign_health === 'at_risk',
      efficiencyScore: c.efficiency_score,
      growthPotential: c.growth_potential, // 'low' | 'medium' | 'high'
      recommendedAction: c.recommended_action,
      analysisSummary: c.analysis_summary,
      issues: c.performance_issues ?? [],
      highIntentSegments: (c.high_intent_segments ?? []).map((s) => s.segment).filter(Boolean),

      // --- 2 & 3. From growth_assessment_result (forecasting step) ---
      performanceCategory: assessment?.performance_category ?? null, // e.g. 'Top Performers'
      growthOutlook: assessment?.growth_outlook ?? null, // 'Low' | 'Medium' | 'High'
      growthRecommendation: assessment?.recommendation ?? null, // may add detail beyond recommendedAction
      budgetDirection: budget?.direction ?? assessment?.budget_direction ?? null, // 'pause' | 'increase' | 'decrease' | 'hold'
      budgetChangePercent: budget?.percent ?? assessment?.budget_change_percent ?? null,
      budgetAmount: budget?.amount ?? null,
      budgetReason: budget?.reason ?? null,
      forecastAvailable: !!assessment?.forecast_available,
      dataGap: assessment?.data_gap ?? null,

      // --- 4. From marketing_payload.overall_performance ---
      spend: datasetCampaign?.spend ?? overallPerf?.total_spend ?? null,
      platformConversions: overallPerf?.platform_conversions ?? datasetCampaign?.conversions ?? null,
      sfLeads: overallPerf?.total_sf_leads ?? null,
      sfOpportunities: overallPerf?.total_sf_opportunities ?? null,

      // --- 5. From marketing_dataset.campaigns[].derived_metrics ---
      ctr: derived.ctr ?? null,
      cpc: derived.cpc ?? null,
      cpl: derived.cpl ?? null,
      cpo: derived.cpo ?? null,
      roas: derived.roas ?? null,
      pipelineRoi: derived.pipeline_roi ?? null,
    };
  });

  // --- Channel-level grouping -------------------------------------------
  const rawChannelEfficiency = growth.channel_efficiency ?? [];
  const rawChannelForecasts = growth.channel_forecasts ?? [];
  const rawChannelBudgetAllocation = growth.channel_budget_allocation ?? [];

  const efficiencyByChannel = new Map(rawChannelEfficiency.map((e) => [e.channel, e]));
  const forecastByChannel = new Map(rawChannelForecasts.map((f) => [f.channel, f]));
  const budgetAllocByChannel = new Map(rawChannelBudgetAllocation.map((b) => [b.channel, b]));

  const channelKeys = new Set(
    [
      ...campaigns.map((c) => c.platformKey),
      ...rawChannelEfficiency.map((e) => e.channel),
      ...rawChannelForecasts.map((f) => f.channel),
      ...rawChannelBudgetAllocation.map((b) => b.channel),
    ].filter(Boolean)
  );

  const channels = Array.from(channelKeys)
    .map((platformKey) => {
      const channelCampaigns = campaigns.filter((c) => c.platformKey === platformKey);
      const efficiency = efficiencyByChannel.get(platformKey);
      const forecast = forecastByChannel.get(platformKey);
      const budgetAlloc = budgetAllocByChannel.get(platformKey);

      const totalSpend = channelCampaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);
      const pauseRecommendedCount = channelCampaigns.filter((c) => c.budgetDirection === 'pause').length;

      return {
        key: platformKey,
        channel: PLATFORM_LABELS[platformKey] || platformKey,
        campaigns: channelCampaigns,
        campaignCount: channelCampaigns.length,
        totalSpend,
        pauseRecommendedCount,
        portfolio: efficiency
          ? {
              cpl: efficiency.cpl ?? null,
              cpo: efficiency.cpo ?? null,
              ctr: efficiency.ctr ?? null,
              cpc: efficiency.cpc ?? null,
              leadToOpportunityRate: efficiency.lead_to_opportunity_rate ?? null,
              qualityAssessment: efficiency.quality_assessment ?? null,
            }
          : null,
        forecast: forecast
          ? {
              rank: forecast.rank ?? null,
              openLeads: forecast.open_leads ?? null,
              historicalLeadToOpportunityRate: forecast.historical_lead_to_opportunity_rate ?? null,
              projectedOpportunities: forecast.projected_opportunities ?? null,
              projectedPipelineValue: forecast.projected_pipeline_value ?? null,
              assumedStageWinRate: forecast.assumed_stage_win_rate ?? null,
              spend: forecast.spend ?? null,
              forecastedRoi: forecast.forecasted_roi ?? null,
              assumptions: forecast.assumptions ?? null,
            }
          : null,
        // Confirmed real shape: { channel, current_spend, recommended_spend,
        // change_amount, change_percent, rationale }
        budgetAllocation: budgetAlloc
          ? {
              currentSpend: budgetAlloc.current_spend ?? null,
              recommendedSpend: budgetAlloc.recommended_spend ?? null,
              changeAmount: budgetAlloc.change_amount ?? null,
              changePercent: budgetAlloc.change_percent ?? null,
              rationale: budgetAlloc.rationale ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => {
      const rankA = a.forecast?.rank ?? Infinity;
      const rankB = b.forecast?.rank ?? Infinity;
      if (rankA !== rankB) return rankA - rankB;
      return b.totalSpend - a.totalSpend;
    });

  const notifications = parseFencedJson(rawResult.decision_action_results)?.notifications ?? [];

  return {
    summary: {
      period: rawResult.marketing_dataset?.period ?? null,
      pipelineTarget: rawResult.marketing_dataset?.pipeline_target ?? null,
      forecastedPipeline: growth.forecasted_pipeline ?? null,
      forecastedQualifiedLeads: growth.forecasted_qualified_leads ?? null,
      forecastedOpportunities: growth.forecasted_opportunities ?? null,
      targetAttainment: growth.target_attainment ?? null,
      overallGrowthRisk: growth.overall_growth_risk ?? null,
      needsManagerAttention: !!growth.needs_manager_attention,
      executiveSummary: growth.executive_summary ?? null,
    },
    campaigns,
    channels,
    channelEfficiency: growth.channel_efficiency ?? [],
    performanceGroups: growth.performance_groups ?? [],
    recommendedNextSteps: growth.recommended_next_steps ?? [],
    notifications,
    salesforceStatus: rawResult.marketing_payload?.salesforce_status ?? null,
    sourceErrors: rawResult.marketing_payload?.source_errors ?? null,
  };
}