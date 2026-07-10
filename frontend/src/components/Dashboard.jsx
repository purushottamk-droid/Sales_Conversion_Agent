// import { useRef, useEffect } from 'react';
// import { Download, Mail, Check, Briefcase } from 'lucide-react';
// import AccountCard from './AccountCard';

// const RISK_STYLES = {
//   High: 'bg-rose-500/10 text-rose-500',
//   Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
//   Low: 'bg-emerald-500/10 text-emerald-500',
// };

// export default function Dashboard({
//   visible,
//   repName,
//   summary, // from normalizeRepProfile().summary
//   accounts = [], // from normalizeRepProfile().accounts
//   totalGongCalls = 0,
//   actionsTaken = [], // guessed shape until decision_action_agent sample is shared
//   onDownload,
//   onEmailClick,
// }) {
//   const ref = useRef(null);

//   useEffect(() => {
//     if (visible && ref.current) {
//       ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
//     }
//   }, [visible]);

//   // Nothing to render yet if the pipeline hasn't produced a profile.
//   if (!summary) return null;

//   return (
//     <section
//       ref={ref}
//       className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden'}`}
//     >
//       <div className="mb-6">
//         <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
//           Result
//         </div>
//         <h2 className="text-[23px] font-semibold">
//           Performance dashboard — {summary.repName || repName}
//         </h2>
//         {summary.repTier && (
//           <div className="flex items-center gap-1.5 text-[12.5px] text-slate-400 dark:text-ink-400 mt-1">
//             <Briefcase className="w-3.5 h-3.5" strokeWidth={2} />
//             {summary.repTier}
//           </div>
//         )}
//       </div>

//       <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 mb-7">
//         <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
//           <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
//             Monthly ARR target
//           </div>
//           <div className="font-display text-2xl font-semibold">{summary.quarterTarget}</div>
//         </div>
//         <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
//           <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
//             Current attainment
//           </div>
//           <div className="font-display text-2xl font-semibold">{summary.currentAttainment}</div>
//         </div>
//         <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
//           <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
//             Open pipeline ARR
//           </div>
//           <div className="font-display text-2xl font-semibold">{summary.openPipelineArr}</div>
//           <div className="text-[11.5px] text-slate-400 dark:text-ink-400 mt-0.5">
//             {summary.openOpportunityCount} open opps · {totalGongCalls} gong calls
//           </div>
//         </div>
//         <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
//           <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
//             Risk (preliminary)
//           </div>
//           <span
//             className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
//               RISK_STYLES[summary.risk] || RISK_STYLES.Medium
//             }`}
//           >
//             {summary.risk}
//           </span>
//         </div>
//       </div>

//       <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 mb-7">
//         {accounts.map((account, i) => (
//           <AccountCard key={account.id || account.name} account={account} revealed={visible} delay={120 + i * 120} />
//         ))}
//       </div>

//       {actionsTaken.length > 0 && (
//         <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[22px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-7">
//           <h3 className="text-[15px] font-semibold mb-3">Actions taken automatically</h3>
//           {actionsTaken.map((action, i) => (
//             <div
//               key={action.title + i}
//               className={`flex gap-2.5 items-start py-2.5 text-[13px] text-[#55698c] dark:text-[#8ca0c2] ${
//                 i !== 0 ? 'border-t border-brand-200 dark:border-ink-500' : ''
//               }`}
//             >
//               <Check className="w-[15px] h-[15px] text-emerald-500 shrink-0 mt-0.5" strokeWidth={2} />
//               <div>
//                 <b className="text-[#10233f] dark:text-slate-100 font-semibold">{action.title}</b>{' '}
//                 {action.detail}
//               </div>
//             </div>
//           ))}
//         </div>
//       )}

//       <div className="flex gap-3 justify-center flex-wrap mb-16">
//         <button
//           onClick={onDownload}
//           className="flex items-center gap-2 text-sm font-semibold px-[22px] py-3 rounded-xl cursor-pointer bg-gradient-to-br from-brand-500 to-brand-400 text-white border-none shadow-[0_8px_22px_-6px_rgba(46,111,224,0.4)] transition-transform hover:-translate-y-px"
//         >
//           <Download className="w-4 h-4" strokeWidth={2} />
//           Download report (.doc)
//         </button>
//         <button
//           onClick={onEmailClick}
//           className="flex items-center gap-2 text-sm font-semibold px-[22px] py-3 rounded-xl cursor-pointer bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 transition-transform hover:-translate-y-px"
//         >
//           <Mail className="w-4 h-4" strokeWidth={2} />
//           Email report
//         </button>
//       </div>
//     </section>
//   );
// }

import { useRef, useEffect } from 'react';
import { Check, Briefcase, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';
import AccountCard from './AccountCard';

const RISK_STYLES = {
  High: 'bg-rose-500/10 text-rose-500',
  Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Low: 'bg-emerald-500/10 text-emerald-500',
};

const ACTION_STATUS_STYLES = {
  SENT: 'text-emerald-500',
  ERROR: 'text-rose-500',
  SKIPPED: 'text-slate-400 dark:text-ink-400',
};

export default function Dashboard({
  visible,
  repName,
  summary, // from normalizeAccountAnalysis().summary
  accounts = [], // from normalizeAccountAnalysis().accounts
  actionsTaken = [], // from normalizeActions()
  onDownload,
  onEmailClick,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [visible]);

  // Nothing to render yet if the pipeline hasn't produced an analysis.
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

      <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3.5 mb-4">
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Target attainment score
          </div>
          <div className="font-display text-2xl font-semibold">
            {summary.attainmentScore ?? '—'}
            <span className="text-sm font-normal text-slate-400 dark:text-ink-400">/100</span>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Risk
          </div>
          <span
            className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
              RISK_STYLES[summary.risk] || RISK_STYLES.Medium
            }`}
          >
            {summary.risk}
          </span>
        </div>
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)]">
          <div className="text-[11.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-2">
            Deals in scope
          </div>
          <div className="font-display text-2xl font-semibold">{accounts.length}</div>
          <div className="text-[11.5px] text-slate-400 dark:text-ink-400 mt-0.5">
            {summary.criticalDeals?.length ?? 0} critical · {summary.bestDealsToPursue?.length ?? 0} best-to-pursue
          </div>
        </div>
      </div>

      {summary.performanceSummary && (
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[22px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-4">
          <h3 className="text-[15px] font-semibold mb-2">Performance summary</h3>
          <p className="text-[13px] text-[#55698c] dark:text-[#8ca0c2] leading-relaxed">
            {summary.performanceSummary}
          </p>
        </div>
      )}

      {summary.criticalDeals?.length > 0 && (
        <div className="bg-white dark:bg-ink-700 border border-rose-200 dark:border-rose-500/30 rounded-2xl p-[22px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-4">
          <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" strokeWidth={2} />
            Critical deals
          </h3>
          {summary.criticalDeals.map((deal, i) => (
            <div
              key={(deal.opportunity_id || deal.opportunity_name) + i}
              className={`py-2.5 text-[13px] text-[#55698c] dark:text-[#8ca0c2] ${
                i !== 0 ? 'border-t border-brand-200 dark:border-ink-500' : ''
              }`}
            >
              <b className="text-[#10233f] dark:text-slate-100 font-semibold">
                {deal.opportunity_name}
              </b>{' '}
              <span className="text-slate-400 dark:text-ink-400">({deal.account_name})</span>
              <div className="mt-0.5">{deal.reason}</div>
            </div>
          ))}
        </div>
      )}

      {summary.bestDealsToPursue?.length > 0 && (
        <div className="bg-white dark:bg-ink-700 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-[22px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-4">
          <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" strokeWidth={2} />
            Best deals to pursue
          </h3>
          {summary.bestDealsToPursue.map((deal, i) => (
            <div
              key={(deal.opportunity_id || deal.opportunity_name) + i}
              className={`py-2.5 text-[13px] text-[#55698c] dark:text-[#8ca0c2] ${
                i !== 0 ? 'border-t border-brand-200 dark:border-ink-500' : ''
              }`}
            >
              <b className="text-[#10233f] dark:text-slate-100 font-semibold">
                {deal.opportunity_name}
              </b>{' '}
              <span className="text-slate-400 dark:text-ink-400">({deal.account_name})</span>
              <div className="mt-0.5">{deal.reason}</div>
            </div>
          ))}
        </div>
      )}

      {summary.keySuggestions?.length > 0 && (
        <div className="bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[22px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] mb-7">
          <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-brand-500" strokeWidth={2} />
            Key suggestions
          </h3>
          <ul className="flex flex-col gap-2">
            {summary.keySuggestions.map((s, i) => (
              <li key={i} className="text-[13px] text-[#55698c] dark:text-[#8ca0c2] flex gap-2">
                <span className="text-brand-500 font-bold shrink-0">{i + 1}.</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

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
              key={action.type + i}
              className={`flex gap-2.5 items-start py-2.5 text-[13px] text-[#55698c] dark:text-[#8ca0c2] ${
                i !== 0 ? 'border-t border-brand-200 dark:border-ink-500' : ''
              }`}
            >
              <Check className={`w-[15px] h-[15px] shrink-0 mt-0.5 ${ACTION_STATUS_STYLES[action.status] || 'text-slate-400'}`} strokeWidth={2} />
              <div>
                <b className="text-[#10233f] dark:text-slate-100 font-semibold">
                  {action.type.replace(/_/g, ' ')}
                </b>{' '}
                <span className={`font-semibold ${ACTION_STATUS_STYLES[action.status] || ''}`}>
                  [{action.status}]
                </span>{' '}
                {action.reason}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* <div className="flex gap-3 justify-center flex-wrap mb-16">
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
      </div> */}
    </section>
  );
}