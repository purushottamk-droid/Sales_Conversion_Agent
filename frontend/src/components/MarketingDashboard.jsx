import { useRef, useEffect, useState } from 'react';
import {
  Megaphone,
  ChevronDown,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
} from 'lucide-react';

const PERFORMANCE_STYLES = {
  High: 'bg-emerald-500/10 text-emerald-500',
  Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Low: 'bg-rose-500/10 text-rose-500',
};

const SENTIMENT_STYLES = {
  Positive: 'bg-emerald-500/10 text-emerald-500',
  Neutral: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Negative: 'bg-rose-500/10 text-rose-500',
};

const SENTIMENT_ICONS = {
  Positive: TrendingUp,
  Neutral: Minus,
  Negative: TrendingDown,
};

// `campaign` here is the NORMALIZED shape from adaptMarketingResult.js
// (camelCase fields), not a raw API shape.
function MarketingCampaignCard({ campaign, revealed, delay = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const SentimentIcon = SENTIMENT_ICONS[campaign.sentiment] || Minus;

  return (
    <div
      className={`bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] transition-all duration-500 ${
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
            </div>
          </div>
        </div>
        <span
          className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${
            PERFORMANCE_STYLES[campaign.performanceLevel] || PERFORMANCE_STYLES.Medium
          }`}
        >
          {campaign.performanceLevel} performance
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
            SENTIMENT_STYLES[campaign.sentiment] || SENTIMENT_STYLES.Neutral
          }`}
        >
          <SentimentIcon className="w-3 h-3" strokeWidth={2.5} />
          {campaign.sentiment}
        </span>
        {campaign.budgetReallocationSuggested && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
            Budget reallocation suggested
          </span>
        )}
        {campaign.isUnderperforming && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500">
            Underperforming
          </span>
        )}
      </div>

      {campaign.isUnderperforming && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-rose-500 mb-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
          <span>Conversion drop-off detected — see recommended action below.</span>
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

      {campaign.drivers?.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between text-[12px] font-semibold text-brand-500 pt-2.5 border-t border-brand-200 dark:border-ink-500 cursor-pointer"
          >
            <span>Performance drivers</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>

          {expanded && (
            <div className="mt-2.5 bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px] text-[#55698c] dark:text-[#8ca0c2]">
              <ul className="list-disc list-inside flex flex-col gap-1">
                {campaign.drivers.map((driver, i) => (
                  <li key={i}>{driver}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// `result` is the NORMALIZED shape from normalizeMarketingResult() —
// { campaigns } — not a raw API response.
export default function MarketingDashboard({ visible, result }) {
  const ref = useRef(null);

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [visible]);

  const campaigns = result?.campaigns ?? [];

  if (!campaigns.length) return null;

  const highPerforming = campaigns.filter((c) => c.performanceLevel === 'High');
  const mediumPerforming = campaigns.filter((c) => c.performanceLevel === 'Medium');
  const underperforming = campaigns.filter((c) => c.isUnderperforming);
  const budgetFlags = campaigns.filter((c) => c.budgetReallocationSuggested);

  return (
    <section
      ref={ref}
      className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden'}`}
    >
      <div className="mb-6">
        <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
          Result
        </div>
        <h2 className="text-[23px] font-semibold">Campaign performance report</h2>
        <div className="text-[12.5px] text-slate-400 dark:text-ink-400 mt-1">
          {campaigns.length} campaigns analyzed
        </div>
      </div>

      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 mb-7">
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            High performing
          </div>
          <div className="font-display text-2xl font-semibold text-emerald-500">
            {highPerforming.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Medium performing
          </div>
          <div className="font-display text-2xl font-semibold text-amber-500">
            {mediumPerforming.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Underperforming
          </div>
          <div className="font-display text-2xl font-semibold text-rose-500">
            {underperforming.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2 flex items-center gap-1.5">
            <Target className="w-3 h-3" strokeWidth={2.5} />
            Budget flags
          </div>
          <div className="font-display text-2xl font-semibold">{budgetFlags.length}</div>
          <div className="text-[11.5px] text-slate-400 dark:text-ink-400 mt-0.5">
            campaigns flagged
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 mb-16">
        {campaigns.map((campaign, i) => (
          <MarketingCampaignCard
            key={campaign.key}
            campaign={campaign}
            revealed={visible}
            delay={120 + i * 120}
          />
        ))}
      </div>
    </section>
  );
}