import { useRef, useEffect } from 'react';
import { AlertTriangle, Target, Mail, CheckCircle2, ListChecks } from 'lucide-react';
import MarketingChannelCard from './MarketingChannelCard';
import { formatMoney, formatPercent } from './MarketingCampaignCard';

const RISK_STYLES = {
  Low: 'text-emerald-500',
  Medium: 'text-amber-600 dark:text-amber-400',
  High: 'text-rose-500',
};

// Parses simple **bold** markdown into React nodes — the backend sends
// recommendedNextSteps as markdown-flavored strings (e.g.
// "**Implement Robust Lead Qualification:** Prioritize..."), but we're
// not rendering a markdown library here, just this one inline pattern.
function renderBoldMarkdown(text) {
  if (typeof text !== 'string') return text;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[#10233f] dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}


// `result` is the NORMALIZED shape from normalizeMarketingResult() —
// { summary, campaigns, channels, channelEfficiency, performanceGroups,
//   recommendedNextSteps, notifications } — not a raw API response.
export default function MarketingDashboard({ visible, result }) {
  const ref = useRef(null);

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [visible]);

  const campaigns = result?.campaigns ?? [];
  const channels = result?.channels ?? [];
  const summary = result?.summary;

  if (!campaigns.length) return null;

  const healthy = campaigns.filter((c) => c.health === 'healthy');
  const atRisk = campaigns.filter((c) => c.health === 'at_risk' || c.health === 'watch');
  const critical = campaigns.filter((c) => c.health === 'critical');
  const pauseRecommended = campaigns.filter((c) => c.budgetDirection === 'pause');

  return (
    <section
      ref={ref}
      className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden'}`}
    >
      <div className="mb-6">
        <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
          Result
        </div>
        <h2 className="text-[23px] font-semibold">Campaign Performance Report</h2>
        <div className="text-[12.5px] text-slate-400 dark:text-ink-400 mt-1">
          {campaigns.length} campaigns across {channels.length} channels analyzed
          {summary?.period && ` · ${summary.period}`}
        </div>
      </div>

      {summary?.executiveSummary && (
        <div
          className={`mb-6 rounded-2xl border p-[18px] ${
            summary.needsManagerAttention
              ? 'border-rose-300 dark:border-rose-500/40 bg-rose-500/5'
              : 'border-brand-200 dark:border-ink-500 bg-brand-500/5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {summary.needsManagerAttention && (
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={2} />
            )}
            <h3 className="text-[14px] font-semibold">
              Executive summary
              {summary.overallGrowthRisk && (
                <span className={`ml-2 text-[12px] font-bold ${RISK_STYLES[summary.overallGrowthRisk] || ''}`}>
                  · {summary.overallGrowthRisk} growth risk
                </span>
              )}
            </h3>
          </div>
          <p className="text-[13px] text-[#55698c] dark:text-[#8ca0c2] leading-relaxed">
            {summary.executiveSummary}
          </p>
          {(summary.pipelineTarget != null || summary.forecastedPipeline != null || summary.targetAttainment != null) && (
            <div className="flex gap-5 flex-wrap mt-3.5 text-[12px]">
              {summary.pipelineTarget != null && (
                <div>
                  <span className="text-slate-400 dark:text-ink-400">Pipeline target: </span>
                  <b>{formatMoney(summary.pipelineTarget)}</b>
                </div>
              )}
              {summary.forecastedPipeline != null && (
                <div>
                  <span className="text-slate-400 dark:text-ink-400">Forecasted pipeline: </span>
                  <b>{formatMoney(summary.forecastedPipeline)}</b>
                </div>
              )}
              {summary.targetAttainment != null && (
                <div>
                  <span className="text-slate-400 dark:text-ink-400">Target attainment: </span>
                  <b>{formatPercent(summary.targetAttainment)}</b>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-[16px] font-semibold">Overall Campaign Health</h3>
        <p className="text-[12.5px] text-slate-400 dark:text-ink-400 mt-0.5">
          Portfolio-wide breakdown by health status and budget action.
        </p>
      </div>

      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 mb-10">
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Healthy
          </div>
          <div className="font-display text-2xl font-semibold text-emerald-500">
            {healthy.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            At risk / Watch
          </div>
          <div className="font-display text-2xl font-semibold text-amber-500">
            {atRisk.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Critical
          </div>
          <div className="font-display text-2xl font-semibold text-rose-500">
            {critical.length}
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2 flex items-center gap-1.5">
            <Target className="w-3 h-3" strokeWidth={2.5} />
            Pause recommended
          </div>
          <div className="font-display text-2xl font-semibold">{pauseRecommended.length}</div>
          <div className="text-[11.5px] text-slate-400 dark:text-ink-400 mt-0.5">campaigns flagged</div>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-[16px] font-semibold">Channels</h3>
        <p className="text-[12.5px] text-slate-400 dark:text-ink-400 mt-0.5">
          Click a channel to see its portfolio, forecast, budget allocation, and campaigns.
        </p>
      </div>

      <div className="flex flex-col gap-3.5 mb-10">
        {channels.map((channel, i) => (
          <MarketingChannelCard
            key={channel.key}
            channel={channel}
            revealed={visible}
            delay={120 + i * 120}
          />
        ))}
      </div>

      {result?.recommendedNextSteps?.length > 0 && (
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-10">
          <h3 className="text-[14px] font-semibold mb-3 flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-brand-500" strokeWidth={2} />
            Recommended Next Steps
          </h3>
          <ol className="flex flex-col gap-2.5">
            {result.recommendedNextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-500/10 text-brand-500 text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result?.notifications?.length > 0 && (
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-16">
          <h3 className="text-[14px] font-semibold mb-3 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-brand-500" strokeWidth={2} />
            Notifications Sent
          </h3>
          <div className="flex flex-col gap-2">
            {result.notifications.map((n, i) => (
              <div key={i} className="flex items-center gap-2 text-[12.5px] text-[#55698c] dark:text-[#8ca0c2]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2} />
                <span className="font-semibold text-[#10233f] dark:text-slate-100">
                  {{ notify_manager: 'Notified manager', notify_report: 'Notified Marketing rep' }[n.type] || n.type?.replace(/_/g, ' ')}:
                </span>
                <span>{n.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}