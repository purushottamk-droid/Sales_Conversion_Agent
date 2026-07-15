import { useRef, useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  AlertTriangle,
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
  Minus,
  ShieldAlert,
} from 'lucide-react';

const RISK_STYLES = {
  High: 'bg-rose-500/10 text-rose-500',
  Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Low: 'bg-emerald-500/10 text-emerald-500',
};

const NPS_LABEL_STYLES = {
  Promoter: 'bg-emerald-500/10 text-emerald-500',
  Passive: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Detractor: 'bg-rose-500/10 text-rose-500',
};

const NPS_LABEL_ICONS = {
  Promoter: ThumbsUp,
  Passive: Minus,
  Detractor: ThumbsDown,
};

// classification here is the NORMALIZED shape from adaptNpsResult.js
// (camelCase fields), not the raw API shape.
function NpsAccountCard({ classification, revealed, delay = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const LabelIcon = NPS_LABEL_ICONS[classification.npsLabel] || Minus;

  return (
    <div
      className={`bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] transition-all duration-500 ${
        revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ transitionDelay: revealed ? `${delay}ms` : '0ms' }}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <Building2 className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" strokeWidth={2} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{classification.accountName}</div>
            <div className="text-[12px] text-slate-400 dark:text-ink-400 truncate">
              {classification.accountId}
            </div>
          </div>
        </div>
        <span
          className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${
            RISK_STYLES[classification.riskLevel] || RISK_STYLES.Medium
          }`}
        >
          {classification.riskLevel} risk
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
            NPS_LABEL_STYLES[classification.npsLabel] || NPS_LABEL_STYLES.Passive
          }`}
        >
          <LabelIcon className="w-3 h-3" strokeWidth={2.5} />
          {classification.npsLabel}
        </span>
        {classification.upsellCandidate && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
            Upsell candidate
          </span>
        )}
        {classification.isRenewalSoon && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            Renewal soon
          </span>
        )}
      </div>

      {classification.repPerformanceFlag && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-amber-600 dark:text-amber-400 mb-2.5">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
          <span>Rep performance flagged for this account.</span>
        </div>
      )}

      {classification.riskLevel === 'High' && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-rose-500 mb-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
          <span>High churn risk detected — see recommended action below.</span>
        </div>
      )}

      {classification.recommendedAction && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] mb-3">
          <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-500" strokeWidth={2} />
          <span>
            <b className="text-[#10233f] dark:text-slate-100 font-semibold">Next step:</b>{' '}
            {classification.recommendedAction}
          </span>
        </div>
      )}

      {classification.drivers?.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between text-[12px] font-semibold text-brand-500 pt-2.5 border-t border-brand-200 dark:border-ink-500 cursor-pointer"
          >
            <span>Classification drivers</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>

          {expanded && (
            <div className="mt-2.5 bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px] text-[#55698c] dark:text-[#8ca0c2]">
              <ul className="list-disc list-inside flex flex-col gap-1">
                {classification.drivers.map((driver, i) => (
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

// `result` is the NORMALIZED shape from normalizeNpsResult() —
// { classifications, actions, npsPayload } — not the raw API response.
export default function NpsDashboard({ visible, result }) {
  const ref = useRef(null);

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [visible]);

  const classifications = result?.classifications ?? [];

  if (!classifications.length) return null;

  const promoters = classifications.filter((c) => c.npsLabel === 'Promoter');
  const detractors = classifications.filter((c) => c.npsLabel === 'Detractor');
  const passives = classifications.filter((c) => c.npsLabel === 'Passive');
  const highRisk = classifications.filter((c) => c.riskLevel === 'High');
  const upsellCandidates = classifications.filter((c) => c.upsellCandidate);

  return (
    <section
      ref={ref}
      className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden'}`}
    >
      <div className="mb-6">
        <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
          Result
        </div>
        <h2 className="text-[23px] font-semibold">NPS &amp; risk classification report</h2>
        <div className="text-[12.5px] text-slate-400 dark:text-ink-400 mt-1">
          {classifications.length} accounts analyzed
        </div>
      </div>

      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 mb-7">
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Promoters
          </div>
          <div className="font-display text-2xl font-semibold text-emerald-500">
            {promoters.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Passives
          </div>
          <div className="font-display text-2xl font-semibold text-amber-500">
            {passives.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Detractors
          </div>
          <div className="font-display text-2xl font-semibold text-rose-500">
            {detractors.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            High risk accounts
          </div>
          <div className="font-display text-2xl font-semibold">{highRisk.length}</div>
          <div className="text-[11.5px] text-slate-400 dark:text-ink-400 mt-0.5">
            {upsellCandidates.length} upsell candidates
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 mb-16">
        {classifications.map((classification, i) => (
          <NpsAccountCard
            key={classification.key}
            classification={classification}
            revealed={visible}
            delay={120 + i * 120}
          />
        ))}
      </div>
    </section>
  );
}