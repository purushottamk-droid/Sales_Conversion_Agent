// import { useState } from 'react';
// import {
//   Building2,
//   ChevronDown,
//   Phone,
//   Calendar,
//   AlertTriangle,
//   ArrowRight,
// } from 'lucide-react';
// import { formatCurrency } from '../utils/adaptResult';

// const SENTIMENT_STYLES = {
//   Positive: 'bg-emerald-500/10 text-emerald-500',
//   Neutral: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
//   Negative: 'bg-rose-500/10 text-rose-500',
// };

// const FORECAST_STYLES = {
//   Commit: 'bg-emerald-500/10 text-emerald-500',
//   'Best Case': 'bg-brand-500/10 text-brand-500',
//   Pipeline: 'bg-slate-400/10 text-slate-500 dark:text-ink-400',
// };

// export default function AccountCard({ account, revealed, delay = 0 }) {
//   const [expanded, setExpanded] = useState(false);

//   return (
//     <div
//       className={`bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[18px] shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] transition-all duration-500 ${
//         revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
//       }`}
//       style={{ transitionDelay: revealed ? `${delay}ms` : '0ms' }}
//     >
//       <div className="flex items-start justify-between gap-3 mb-2.5">
//         <div className="flex items-start gap-2.5 min-w-0">
//           <Building2 className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" strokeWidth={2} />
//           <div className="min-w-0">
//             <div className="text-[15px] font-semibold truncate">{account.name}</div>
//             <div className="text-[12px] text-slate-400 dark:text-ink-400">
//               {account.industry} · {account.segment}
//             </div>
//           </div>
//         </div>
//         <span
//           className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${
//             FORECAST_STYLES[account.forecastCategory] || 'bg-slate-400/10 text-slate-500'
//           }`}
//         >
//           {account.forecastCategory || 'Unknown'}
//         </span>
//       </div>

//       <div className="text-[13px] text-[#55698c] dark:text-[#8ca0c2] mb-3">
//         {account.opportunityName}
//       </div>

//       <div className="grid grid-cols-2 gap-2.5 mb-3">
//         <div>
//           <div className="text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-0.5">
//             Deal value
//           </div>
//           <div className="text-[14px] font-semibold">{formatCurrency(account.dealValueArr)}</div>
//         </div>
//         <div>
//           <div className="text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-0.5">
//             Stage
//           </div>
//           <div className="text-[14px] font-semibold">{account.stage}</div>
//         </div>
//         <div>
//           <div className="text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-0.5">
//             Days in stage
//           </div>
//           <div className="text-[14px] font-semibold">{account.stageDurationDays ?? '—'}</div>
//         </div>
//         <div>
//           <div className="text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold mb-0.5">
//             Target close
//           </div>
//           <div className="text-[14px] font-semibold">{account.closeDateTarget ?? '—'}</div>
//         </div>
//       </div>

//       {account.risks && account.risks !== 'No major risk identified' && (
//         <div className="flex items-start gap-1.5 text-[12.5px] text-rose-500 mb-2.5">
//           <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
//           <span>{account.risks}</span>
//         </div>
//       )}

//       {account.issues?.length > 0 && (
//         <div className="flex gap-1.5 flex-wrap mb-2.5">
//           {account.issues.map((issue) => (
//             <span
//               key={issue}
//               className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
//             >
//               {issue}
//             </span>
//           ))}
//         </div>
//       )}

//       {account.nextStep && (
//         <div className="flex items-start gap-1.5 text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] mb-3">
//           <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-500" strokeWidth={2} />
//           <span>
//             <b className="text-[#10233f] dark:text-slate-100 font-semibold">Next step:</b>{' '}
//             {account.nextStep}
//           </span>
//         </div>
//       )}

//       <button
//         onClick={() => setExpanded((e) => !e)}
//         className="w-full flex items-center justify-between text-[12px] font-semibold text-brand-500 pt-2.5 border-t border-brand-200 dark:border-ink-500 cursor-pointer"
//       >
//         <span className="flex items-center gap-1.5">
//           <Phone className="w-3.5 h-3.5" strokeWidth={2} />
//           {account.calls?.length ?? 0} Gong calls
//         </span>
//         <ChevronDown
//           className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
//           strokeWidth={2}
//         />
//       </button>

//       {expanded && (
//         <div className="mt-2.5 flex flex-col gap-2.5">
//           {account.calls?.map((call, i) => (
//             <div
//               key={call.title + i}
//               className="bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px]"
//             >
//               <div className="flex items-center justify-between gap-2 mb-1">
//                 <div className="flex items-center gap-1.5 font-semibold text-[#10233f] dark:text-slate-100">
//                   <Calendar className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
//                   {call.date} · {call.purpose}
//                 </div>
//                 <span
//                   className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
//                     SENTIMENT_STYLES[call.sentiment] || 'bg-slate-400/10 text-slate-500'
//                   }`}
//                 >
//                   {call.sentiment}
//                 </span>
//               </div>
//               <div className="text-[#55698c] dark:text-[#8ca0c2]">
//                 <b className="text-[#10233f] dark:text-slate-100">Objection:</b> {call.objection} ·{' '}
//                 <b className="text-[#10233f] dark:text-slate-100">Outcome:</b> {call.outcome}
//               </div>
//               <div className="text-[#55698c] dark:text-[#8ca0c2] mt-1">
//                 <b className="text-[#10233f] dark:text-slate-100">Next:</b> {call.nextStep}
//               </div>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

import { useState } from 'react';
import {
  Building2,
  ChevronDown,
  AlertTriangle,
  ArrowRight,
  MessageSquareWarning,
  ClipboardX,
} from 'lucide-react';

const HEALTH_STYLES = {
  healthy: 'bg-emerald-500/10 text-emerald-500',
  at_risk: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  critical: 'bg-rose-500/10 text-rose-500',
};

const HEALTH_LABELS = {
  healthy: 'Healthy',
  at_risk: 'At risk',
  critical: 'Critical',
};

function scoreColor(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return 'text-slate-400 dark:text-ink-400';
  if (n < 40) return 'text-rose-500';
  if (n < 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-500';
}

export default function AccountCard({ account, revealed, delay = 0 }) {
  const [expanded, setExpanded] = useState(false);

  const healthKey = account.dealHealth || 'at_risk';

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
            <div className="text-[15px] font-semibold truncate">{account.name}</div>
            <div className="text-[12px] text-slate-400 dark:text-ink-400 truncate">
              {account.opportunityType || '—'}
            </div>
          </div>
        </div>
        <span
          className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${
            HEALTH_STYLES[healthKey] || HEALTH_STYLES.at_risk
          }`}
        >
          {HEALTH_LABELS[healthKey] || healthKey}
        </span>
      </div>

      <div className="text-[13px] text-[#55698c] dark:text-[#8ca0c2] mb-3">
        {account.opportunityName}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-ink-400 font-bold">
          Conversion score
        </div>
        <div className={`text-[14px] font-semibold ${scoreColor(account.conversionScore)}`}>
          {account.conversionScore ?? '—'}/100
        </div>
      </div>

      {account.recentMeetingSummary && (
        <div className="text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] mb-3 leading-relaxed">
          {account.recentMeetingSummary}
        </div>
      )}

      {account.customerObjections?.length > 0 && (
        <div className="flex flex-col gap-1 mb-2.5">
          {account.customerObjections.map((obj, i) => {
            const impact = Number(obj.scoreImpactIfResolved);
            const hasImpact = !Number.isNaN(impact) && impact !== 0;
            return (
              <div key={i} className="flex items-start gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
                <MessageSquareWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
                <span>
                  {obj.objection}
                  {obj.severity && (
                    <span className="text-slate-400 dark:text-ink-400"> ({obj.severity})</span>
                  )}
                  {hasImpact && (
                    <span className="font-semibold text-emerald-500">
                      {' '}{impact > 0 ? `+${impact}` : impact}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {account.missedCommitments?.length > 0 && (
        <div className="flex flex-col gap-1 mb-2.5">
          {account.missedCommitments.map((mc, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[12px] text-rose-500">
              <ClipboardX className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
              <span>
                {mc.description}
                {mc.status && <span className="text-slate-400 dark:text-ink-400"> — {mc.status}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {account.riskAction && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-rose-500 mb-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
          <span>{account.riskAction}</span>
        </div>
      )}

      {account.opportunityAction && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] mb-3">
          <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-500" strokeWidth={2} />
          <span>
            <b className="text-[#10233f] dark:text-slate-100 font-semibold">Next step:</b>{' '}
            {account.opportunityAction}
          </span>
        </div>
      )}

      {(account.analysisSummary || account.conversionScoreReasoning) && (
        <>
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
            <div className="mt-2.5 flex flex-col gap-2.5">
              {account.analysisSummary && (
                <div className="bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px] text-[#55698c] dark:text-[#8ca0c2]">
                  <div className="font-semibold text-[#10233f] dark:text-slate-100 mb-1">Summary</div>
                  {account.analysisSummary}
                </div>
              )}
              {account.conversionScoreReasoning && (
                <div className="bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px] text-[#55698c] dark:text-[#8ca0c2]">
                  <div className="font-semibold text-[#10233f] dark:text-slate-100 mb-1">
                    Why this score
                  </div>
                  {account.conversionScoreReasoning}
                </div>
              )}
              {account.communicationGaps?.length > 0 && (
                <div className="bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px] text-[#55698c] dark:text-[#8ca0c2]">
                  <div className="font-semibold text-[#10233f] dark:text-slate-100 mb-1">
                    Communication gaps
                  </div>
                  <ul className="list-disc list-inside">
                    {account.communicationGaps.map((gap, i) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}