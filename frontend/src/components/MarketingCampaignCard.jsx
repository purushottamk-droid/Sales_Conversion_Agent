import { useState } from 'react';
import {
  Megaphone,
  ChevronDown,
  AlertTriangle,
  ArrowRight,
  Gauge,
  PauseCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { METRIC_LABELS } from '../utils/marketingMetricLabels';

export const HEALTH_STYLES = {
  healthy: 'bg-emerald-500/10 text-emerald-500',
  at_risk: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  watch: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  critical: 'bg-rose-500/10 text-rose-500',
};

const BUDGET_DIRECTION_STYLES = {
  pause: 'bg-rose-500/10 text-rose-500',
  decrease: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  increase: 'bg-emerald-500/10 text-emerald-500',
  hold: 'bg-slate-500/10 text-slate-400 dark:text-ink-400',
  maintain: 'bg-slate-500/10 text-slate-400 dark:text-ink-400',
};

const BUDGET_DIRECTION_ICONS = {
  pause: PauseCircle,
  decrease: TrendingDown,
  increase: TrendingUp,
  hold: Minus,
  maintain: Minus,
};

export function formatMoney(value) {
  if (value == null) return null;
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value) {
  if (value == null) return null;
  return `${Number(value)}%`;
}

export function formatRatio(value) {
  if (value == null) return null;
  return `${Number(value).toFixed(2)}x`;
}

function MetricStat({ metricKey, value }) {
  if (value == null) return null;
  return (
    <div className="bg-brand-500/5 dark:bg-ink-600 rounded-lg px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 dark:text-ink-400 mb-0.5">
        {METRIC_LABELS[metricKey] || metricKey}
      </div>
      <div className="text-[13px] font-semibold">{value}</div>
    </div>
  );
}

// `campaign` here is the NORMALIZED shape from adaptMarketingResult.js
// (camelCase fields), not the raw API shape.
export default function MarketingCampaignCard({ campaign, revealed = true, delay = 0, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const BudgetIcon = BUDGET_DIRECTION_ICONS[campaign.budgetDirection] || Minus;

  return (
    <div
      className={`bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl ${
        compact ? 'p-4' : 'p-[18px]'
      } shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] transition-all duration-500 ${
        revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ transitionDelay: revealed ? `${delay}ms` : '0ms' }}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <Megaphone className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" strokeWidth={2} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{campaign.campaignName}</div>
            <div className="text-[12px] text-slate-400 dark:text-ink-400 truncate">
              {campaign.channel}
              {campaign.spend != null && ` · ${formatMoney(campaign.spend)} spend`}
              {campaign.performanceCategory && ` · ${campaign.performanceCategory}`}
            </div>
          </div>
        </div>
        <span
          className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${
            HEALTH_STYLES[campaign.health] || HEALTH_STYLES.at_risk
          }`}
        >
          {campaign.healthLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-brand-500/10 text-brand-500">
          <Gauge className="w-3 h-3" strokeWidth={2.5} />
          Efficiency {campaign.efficiencyScore ?? '—'}
        </span>
        {campaign.budgetDirection && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
              BUDGET_DIRECTION_STYLES[campaign.budgetDirection] || BUDGET_DIRECTION_STYLES.hold
            }`}
          >
            <BudgetIcon className="w-3 h-3" strokeWidth={2.5} />
            {campaign.budgetDirection === 'pause'
              ? 'Pause budget'
              : `${campaign.budgetDirection} ${formatPercent(campaign.budgetChangePercent) ?? ''}`.trim()}
          </span>
        )}
        {campaign.growthOutlook && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
            {campaign.growthOutlook} growth outlook
          </span>
        )}
        {campaign.highIntentSegments?.length > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
            {campaign.highIntentSegments.join(', ')}
          </span>
        )}
      </div>

      {campaign.isUnderperforming && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-rose-500 mb-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
          <span>{campaign.healthLabel} campaign — see recommended action below.</span>
        </div>
      )}

      {campaign.recommendedAction && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] mb-3">
          <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-500" strokeWidth={2} />
          <span>
            <b className="text-[#10233f] dark:text-slate-100 font-semibold">Next step:</b>{' '}
            {campaign.recommendedAction}
          </span>
        </div>
      )}

      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-[12px] font-semibold text-brand-500 pt-2.5 border-t border-brand-200 dark:border-ink-500 cursor-pointer"
      >
        <span>Analysis details</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        <div className="mt-2.5 flex flex-col gap-3">
          {(campaign.analysisSummary || campaign.issues?.length > 0) && (
            <div className="bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px] text-[#55698c] dark:text-[#8ca0c2] flex flex-col gap-2.5">
              {campaign.analysisSummary && <p className="leading-relaxed">{campaign.analysisSummary}</p>}
              {campaign.issues?.length > 0 && (
                <ul className="list-disc list-inside flex flex-col gap-1">
                  {campaign.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {campaign.growthRecommendation && (
            <div className="text-[12px] text-[#55698c] dark:text-[#8ca0c2]">
              <b className="text-[#10233f] dark:text-slate-100 font-semibold">Growth assessment: </b>
              {campaign.growthRecommendation}
            </div>
          )}

          <div>
            <div className="text-[10.5px] uppercase tracking-wide font-bold text-slate-400 dark:text-ink-400 mb-1.5">
              Performance metrics
            </div>
            <div className="grid grid-cols-3 max-sm:grid-cols-2 gap-1.5">
              <MetricStat metricKey="ctr" value={campaign.ctr != null ? formatPercent(campaign.ctr) : null} />
              <MetricStat metricKey="cpc" value={campaign.cpc != null ? formatMoney(campaign.cpc) : null} />
              <MetricStat metricKey="cpl" value={campaign.cpl != null ? formatMoney(campaign.cpl) : null} />
              <MetricStat metricKey="cpo" value={campaign.cpo != null ? formatMoney(campaign.cpo) : null} />
              <MetricStat metricKey="roas" value={campaign.roas != null ? formatRatio(campaign.roas) : null} />
              <MetricStat
                metricKey="pipelineRoi"
                value={campaign.pipelineRoi != null ? formatRatio(campaign.pipelineRoi) : null}
              />
            </div>
          </div>

          {(campaign.platformConversions != null || campaign.sfLeads != null || campaign.sfOpportunities != null) && (
            <div className="grid grid-cols-3 max-sm:grid-cols-2 gap-1.5">
              {campaign.platformConversions != null && (
                <div className="bg-brand-500/5 dark:bg-ink-600 rounded-lg px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 dark:text-ink-400 mb-0.5">
                    Conversions
                  </div>
                  <div className="text-[13px] font-semibold">{campaign.platformConversions}</div>
                </div>
              )}
              {campaign.sfLeads != null && (
                <div className="bg-brand-500/5 dark:bg-ink-600 rounded-lg px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 dark:text-ink-400 mb-0.5">
                    SF Leads
                  </div>
                  <div className="text-[13px] font-semibold">{campaign.sfLeads}</div>
                </div>
              )}
              {campaign.sfOpportunities != null && (
                <div className="bg-brand-500/5 dark:bg-ink-600 rounded-lg px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 dark:text-ink-400 mb-0.5">
                    SF Opportunities
                  </div>
                  <div className="text-[13px] font-semibold">{campaign.sfOpportunities}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}