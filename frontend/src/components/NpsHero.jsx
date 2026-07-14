import { User, Play, Construction } from 'lucide-react';

export default function NpsHero() {
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
        Enter a customer or account to run the pipeline: pull NPS survey responses &amp; support
        interactions, then reason over sentiment and churn risk — and act on it automatically.
      </p>

      <div className="flex gap-2.5 justify-center flex-wrap mb-3.5">
        <div className="flex items-center gap-2.5 bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-xl pl-4 pr-1.5 shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] w-[340px] max-w-full opacity-60">
          <User className="w-4 h-4 text-slate-400 dark:text-ink-400 shrink-0" strokeWidth={2} />
          <input
            type="text"
            disabled
            placeholder="Customer or account name"
            className="border-none outline-none bg-transparent text-[14.5px] py-3.5 px-1 w-full text-[#10233f] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-ink-400 cursor-not-allowed"
          />
        </div>
        <button
          disabled
          className="flex items-center gap-2 bg-gradient-to-br from-brand-500 to-brand-400 text-white border-none rounded-xl px-[22px] text-[14.5px] font-semibold opacity-55 cursor-not-allowed whitespace-nowrap"
        >
          <Play className="w-[15px] h-[15px]" fill="white" strokeWidth={2} />
          Run NPS Workflow
        </button>
      </div>

      <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full">
        <Construction className="w-3.5 h-3.5" strokeWidth={2} />
        NPS backend integration in progress
      </div>
    </section>
  );
}