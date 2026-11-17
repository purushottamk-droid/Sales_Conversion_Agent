import { useState } from 'react';
import {
  Building2,
  ChevronDown,
  AlertTriangle,
  ArrowRight,
  MessageSquareWarning,
  ClipboardX,
  Contact,
} from 'lucide-react';
import Profile360 from './Profile360';

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
  const [profileOpen, setProfileOpen] = useState(false);

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

      {/* 360° Profile — sits directly below Analysis details. Hidden when no
          matching profile_360 was found for this account. */}
      {account.profile360 && (
        <>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full flex items-center justify-between text-[12px] font-semibold text-brand-500 pt-2.5 mt-2.5 border-t border-brand-200 dark:border-ink-500 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Contact className="w-3.5 h-3.5" strokeWidth={2} />
              360° Profile
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>

          {profileOpen && <Profile360 profile={account.profile360} />}
        </>
      )}
    </div>
  );
}