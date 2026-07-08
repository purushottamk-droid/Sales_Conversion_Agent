import { useRef, useEffect } from 'react';
import { Download, Mail, Check, Briefcase } from 'lucide-react';
import AccountCard from './AccountCard';

const RISK_STYLES = {
  High: 'bg-rose-500/10 text-rose-500',
  Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Low: 'bg-emerald-500/10 text-emerald-500',
};

export default function Dashboard({
  visible,
  repName,
  summary, // from normalizeRepProfile().summary
  accounts = [], // from normalizeRepProfile().accounts
  totalGongCalls = 0,
  actionsTaken = [], // guessed shape until decision_action_agent sample is shared
  onDownload,
  onEmailClick,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [visible]);

  // Nothing to render yet if the pipeline hasn't produced a profile.
  if (!summary) return null;

  return (
    <section
      ref={ref}
      className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden'}`}
    >
      <div className="mb-6">
        <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
          Result
        </div>
        <h2 className="text-[23px] font-semibold">
          Performance dashboard — {summary.repName || repName}
        </h2>
        {summary.repTier && (
          <div className="flex items-center gap-1.5 text-[12.5px] text-slate-400 dark:text-ink-400 mt-1">
            <Briefcase className="w-3.5 h-3.5" strokeWidth={2} />
            {summary.repTier}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 mb-7">
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Monthly ARR target
          </div>
          <div className="font-display text-2xl font-semibold">{summary.quarterTarget}</div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Current attainment
          </div>
          <div className="font-display text-2xl font-semibold">{summary.currentAttainment}</div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Open pipeline ARR
          </div>
          <div className="font-display text-2xl font-semibold">{summary.openPipelineArr}</div>
          <div className="text-[11.5px] text-slate-400 dark:text-ink-400 mt-0.5">
            {summary.openOpportunityCount} open opps · {totalGongCalls} gong calls
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Risk (preliminary)
          </div>
          <span
            className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
              RISK_STYLES[summary.risk] || RISK_STYLES.Medium
            }`}
          >
            {summary.risk}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 mb-7">
        {accounts.map((account, i) => (
          <AccountCard key={account.id || account.name} account={account} revealed={visible} delay={120 + i * 120} />
        ))}
      </div>

      {actionsTaken.length > 0 && (
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[22px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-7">
          <h3 className="text-[15px] font-semibold mb-3">Actions taken automatically</h3>
          {actionsTaken.map((action, i) => (
            <div
              key={action.title + i}
              className={`flex gap-2.5 items-start py-2.5 text-[13px] text-[#55698c] dark:text-[#8ca0c2] ${
                i !== 0 ? 'border-t border-brand-200 dark:border-ink-500' : ''
              }`}
            >
              <Check className="w-[15px] h-[15px] text-emerald-500 shrink-0 mt-0.5" strokeWidth={2} />
              <div>
                <b className="text-[#10233f] dark:text-slate-100 font-semibold">{action.title}</b>{' '}
                {action.detail}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 justify-center flex-wrap mb-16">
        <button
          onClick={onDownload}
          className="flex items-center gap-2 text-sm font-semibold px-[22px] py-3 rounded-xl cursor-pointer bg-gradient-to-br from-brand-500 to-brand-400 text-white border-none shadow-[0_8px_22px_-6px_rgba(46,111,224,0.4)] transition-transform hover:-translate-y-px"
        >
          <Download className="w-4 h-4" strokeWidth={2} />
          Download report (.doc)
        </button>
        <button
          onClick={onEmailClick}
          className="flex items-center gap-2 text-sm font-semibold px-[22px] py-3 rounded-xl cursor-pointer bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 transition-transform hover:-translate-y-px"
        >
          <Mail className="w-4 h-4" strokeWidth={2} />
          Email report
        </button>
      </div>
    </section>
  );
}