import { useState } from 'react';
import {
  ChevronDown,
  Layers,
  TrendingUp,
  TrendingDown,
  Wallet,
  Hash,
  PauseCircle,
} from 'lucide-react';
import MarketingCampaignCard, { formatMoney, formatPercent } from './MarketingCampaignCard';
import { METRIC_LABELS } from '../utils/marketingMetricLabels';

const CHANNEL_ICON_BG = 'bg-brand-500/10 text-brand-500';

function Stat({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="bg-brand-500/5 dark:bg-ink-600 rounded-xl px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wide font-bold text-slate-400 dark:text-ink-400 mb-0.5">
        {label}
      </div>
      <div className="text-[14px] font-semibold">{value}</div>
    </div>
  );
}

function formatRoi(value) {
  if (value == null) return null;
  return `${(Number(value) * 100).toFixed(0)}%`;
}

// `channel` is one entry from the NORMALIZED `channels` array produced by
// adaptMarketingResult.js: { key, channel, campaigns, portfolio, forecast,
// budgetAllocation, totalSpend, campaignCount, pauseRecommendedCount }
export default function MarketingChannelCard({ channel, revealed, delay = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const { portfolio, forecast, budgetAllocation } = channel;

  const changeIsNegative = budgetAllocation?.changeAmount != null && budgetAllocation.changeAmount < 0;

  return (
    <div
      className={`bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] transition-all duration-500 overflow-hidden ${
        revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ transitionDelay: revealed ? `${delay}ms` : '0ms' }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 p-[18px] cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${CHANNEL_ICON_BG}`}>
            <Layers className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="text-[15.5px] font-semibold truncate flex items-center gap-2">
              {channel.channel}
              {forecast?.rank != null && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                  <Hash className="w-2.5 h-2.5" strokeWidth={3} />
                  Rank {forecast.rank}
                </span>
              )}
            </div>
            <div className="text-[12px] text-slate-400 dark:text-ink-400 truncate">
              {channel.campaignCount} campaign{channel.campaignCount === 1 ? '' : 's'}
              {channel.totalSpend > 0 && ` · ${formatMoney(channel.totalSpend)} spend`}
              {channel.pauseRecommendedCount > 0 &&
                ` · ${channel.pauseRecommendedCount} flagged to pause`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {channel.pauseRecommendedCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-rose-500/10 text-rose-500">
              <PauseCircle className="w-3 h-3" strokeWidth={2.5} />
              {channel.pauseRecommendedCount}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 dark:text-ink-400 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            strokeWidth={2}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-[18px] pb-[18px] flex flex-col gap-5 border-t border-brand-200 dark:border-ink-500 pt-4">
          {portfolio && (
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-400 dark:text-ink-400 mb-2.5">
                Portfolio
              </h4>
              <div className="grid grid-cols-3 max-sm:grid-cols-2 gap-2">
                <Stat label={METRIC_LABELS.cpl} value={portfolio.cpl != null ? formatMoney(portfolio.cpl) : null} />
                <Stat label={METRIC_LABELS.cpc} value={portfolio.cpc != null ? formatMoney(portfolio.cpc) : null} />
                <Stat label={METRIC_LABELS.cpo} value={portfolio.cpo != null ? formatMoney(portfolio.cpo) : null} />
                <Stat label={METRIC_LABELS.ctr} value={portfolio.ctr != null ? formatPercent(portfolio.ctr) : null} />
                <Stat
                  label="Lead → Opp rate"
                  value={
                    portfolio.leadToOpportunityRate != null
                      ? formatPercent(portfolio.leadToOpportunityRate)
                      : null
                  }
                />
              </div>
              {portfolio.qualityAssessment && (
                <p className="text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] leading-relaxed mt-2.5">
                  {portfolio.qualityAssessment}
                </p>
              )}
            </div>
          )}

          {forecast && (
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-400 dark:text-ink-400 mb-2.5 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" strokeWidth={2.5} />
                Channel forecast
              </h4>
              <div className="grid grid-cols-3 max-sm:grid-cols-2 gap-2">
                <Stat label="Rank" value={forecast.rank ?? null} />
                <Stat label="Open leads" value={forecast.openLeads ?? null} />
                <Stat
                  label="Hist. lead → opp rate"
                  value={
                    forecast.historicalLeadToOpportunityRate != null
                      ? formatPercent(forecast.historicalLeadToOpportunityRate)
                      : null
                  }
                />
                <Stat label="Projected opportunities" value={forecast.projectedOpportunities ?? null} />
                <Stat
                  label="Projected pipeline"
                  value={forecast.projectedPipelineValue != null ? formatMoney(forecast.projectedPipelineValue) : null}
                />
                <Stat
                  label="Assumed win rate"
                  value={forecast.assumedStageWinRate != null ? formatPercent(forecast.assumedStageWinRate) : null}
                />
                <Stat label="Spend" value={forecast.spend != null ? formatMoney(forecast.spend) : null} />
                <Stat label="Forecasted ROI" value={formatRoi(forecast.forecastedRoi)} />
              </div>
              {forecast.assumptions && (
                <p className="text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] leading-relaxed mt-2.5">
                  {forecast.assumptions}
                </p>
              )}
            </div>
          )}

          {budgetAllocation && (
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-400 dark:text-ink-400 mb-2.5 flex items-center gap-1.5">
                <Wallet className="w-3 h-3" strokeWidth={2.5} />
                Channel budget allocation
              </h4>
              <div className="grid grid-cols-4 max-sm:grid-cols-2 gap-2">
                <Stat
                  label="Current spend"
                  value={budgetAllocation.currentSpend != null ? formatMoney(budgetAllocation.currentSpend) : null}
                />
                <Stat
                  label="Recommended spend"
                  value={
                    budgetAllocation.recommendedSpend != null ? formatMoney(budgetAllocation.recommendedSpend) : null
                  }
                />
                <Stat
                  label="Change"
                  value={
                    budgetAllocation.changeAmount != null
                      ? `${changeIsNegative ? '' : '+'}${formatMoney(budgetAllocation.changeAmount)}`
                      : null
                  }
                />
                <Stat
                  label="Change %"
                  value={
                    budgetAllocation.changePercent != null
                      ? `${changeIsNegative ? '' : '+'}${formatPercent(budgetAllocation.changePercent)}`
                      : null
                  }
                />
              </div>
              {budgetAllocation.rationale && (
                <p className="text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] leading-relaxed mt-2.5 flex items-start gap-1.5">
                  {changeIsNegative ? (
                    <TrendingDown className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" strokeWidth={2} />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" strokeWidth={2} />
                  )}
                  <span>{budgetAllocation.rationale}</span>
                </p>
              )}
            </div>
          )}

          <div>
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-400 dark:text-ink-400 mb-2.5">
              Campaigns
            </h4>
            <div className="flex flex-col gap-3">
              {channel.campaigns.map((campaign) => (
                <MarketingCampaignCard key={campaign.key} campaign={campaign} compact />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}