import { Play } from 'lucide-react';

export default function NpsHero({ onRun, disabled }) {
  return (
    <section className="text-center mb-14">
      <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-brand-500 bg-brand-100 dark:bg-brand-500/10 px-3.5 py-1.5 rounded-full mb-[18px]">
        3-Agent Sequential Workflow
      </div>
      <h1 className="text-[clamp(30px,5vw,46px)] font-bold leading-tight mb-3.5 tracking-tight">
        Turn raw survey signals
        <br />
        into next-best action
      </h1>
      <p className="text-base text-[#55698c] dark:text-[#8ca0c2] max-w-[560px] mx-auto mb-[30px] leading-relaxed">
        Pull NPS survey responses &amp; support
        interactions, then reason over sentiment and churn risk — and act on it automatically.
      </p>

      <div className="flex gap-2.5 justify-center flex-wrap mb-3.5">
        <button
          onClick={onRun}
          disabled={disabled}
          className="flex items-center gap-2 bg-gradient-to-br from-brand-500 to-brand-400 text-white border-none rounded-xl px-[22px] py-3.5 text-[14.5px] font-semibold disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <Play className="w-[15px] h-[15px]" fill="white" strokeWidth={2} />
          {disabled ? 'Running...' : 'Run NPS Workflow'}
        </button>
      </div>
    </section>  
  );
}