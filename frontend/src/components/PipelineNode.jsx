import { Check, Loader2 } from 'lucide-react';

const STATE_STYLES = {
  idle: 'border-brand-200 dark:border-ink-500',
  running: 'border-brand-500 shadow-[0_0_0_3px_var(--tw-shadow-color)] shadow-brand-500/10',
  done: 'border-emerald-500',
};

const NUM_STYLES = {
  idle: 'bg-brand-50 dark:bg-ink-600 border-brand-200 dark:border-ink-500 text-[#55698c] dark:text-[#8ca0c2]',
  running: 'bg-brand-500 border-brand-500 text-white',
  done: 'bg-emerald-500 border-emerald-500 text-white',
};

const BADGE_STYLES = {
  idle: 'text-slate-400 dark:text-ink-400',
  running: 'text-brand-500',
  done: 'text-emerald-500',
};

export default function PipelineNode({ number, title, description, state, detail, children }) {
  return (
    <div
      className={`flex-1 bg-white dark:bg-ink-700 border rounded-2xl p-5 shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] transition-colors min-w-0 ${STATE_STYLES[state]}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className={`w-[26px] h-[26px] rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 ${NUM_STYLES[state]}`}
        >
          {number}
        </div>
        <div
          className={`text-[10.5px] font-bold tracking-wide uppercase flex items-center gap-1.5 ${BADGE_STYLES[state]}`}
        >
          {state === 'running' && <Loader2 className="w-[11px] h-[11px] animate-spin" />}
          {state === 'done' && <Check className="w-[11px] h-[11px]" strokeWidth={3} />}
          {state === 'idle' ? 'Idle' : state === 'running' ? 'Running' : 'Done'}
        </div>
      </div>
      <h3 className="text-[15px] font-semibold mb-1.5">{title}</h3>
      <p className="text-[12.8px] text-[#55698c] dark:text-[#8ca0c2] leading-relaxed mb-2.5">
        {description}
      </p>
      {children}
      {detail && (
        <div
          className={`text-xs text-brand-500 bg-brand-100 dark:bg-brand-500/10 rounded-lg px-2.5 py-2 leading-relaxed transition-all duration-400 ${
            state === 'done' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          }`}
        >
          {detail}
        </div>
      )}
    </div>
  );
}
