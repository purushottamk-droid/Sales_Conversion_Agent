import { User, Play } from 'lucide-react';
// import { REP_OPTIONS } from '../data/accounts';

export default function Hero({ repName, setRepName, onRun, disabled }) {
  return (
    <section className="text-center mb-14">
      <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-brand-500 bg-brand-100 dark:bg-brand-500/10 px-3.5 py-1.5 rounded-full mb-[18px]">
        4-Agent Sequential Pipeline
      </div>
      <h1 className="text-[clamp(30px,5vw,46px)] font-bold leading-tight mb-3.5 tracking-tight">
        Turn scattered CRM signals
        <br />
        into a manager-ready verdict
      </h1>
      <p className="text-base text-[#55698c] dark:text-[#8ca0c2] max-w-[560px] mx-auto mb-[30px] leading-relaxed">
        Enter a sales rep to run the pipeline: collect accounts, extract Gong &amp; Salesforce
        &amp; transcript data, then reason over deal health and quota risk.
      </p>

      <div className="flex gap-2.5 justify-center flex-wrap mb-3.5">
        <div className="flex items-center gap-2.5 bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-xl pl-4 pr-1.5 shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] w-[340px] max-w-full">
          <User className="w-4 h-4 text-slate-400 dark:text-ink-400 shrink-0" strokeWidth={2} />
          <input
            type="text"
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
            placeholder="Sales rep ID or name"
            className="border-none outline-none bg-transparent text-[14.5px] py-3.5 px-1 w-full text-[#10233f] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-ink-400"
          />
        </div>
        <button
          onClick={onRun}
          disabled={disabled}
          className="flex items-center gap-2 bg-gradient-to-br from-brand-500 to-brand-400 text-white border-none rounded-xl px-[22px] text-[14.5px] font-semibold cursor-pointer shadow-[0_8px_22px_-6px_rgba(46,111,224,0.4)] transition-transform hover:-translate-y-px disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 whitespace-nowrap"
        >
          <Play className="w-[15px] h-[15px]" fill="white" strokeWidth={2} />
          Run pipeline
        </button>
      </div>

      <div className="flex gap-2 justify-center flex-wrap">
        {/* {REP_OPTIONS.map((rep) => (
          <button
            key={rep}
            onClick={() => setRepName(rep)}
            className="text-[12.5px] text-[#55698c] dark:text-[#8ca0c2] bg-brand-100/70 dark:bg-ink-700 border border-brand-200 dark:border-ink-500 px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:border-brand-500 hover:text-brand-500"
          >
            {rep}
          </button>
        ))} */}
      </div>
    </section>
  );
}
