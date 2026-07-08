import { Layers, Sun, Moon } from 'lucide-react';

export default function Navbar({ theme, toggleTheme, pipelineStatus }) {
  const statusLabel =
    pipelineStatus === 'running' ? 'Running' : pipelineStatus === 'done' ? 'Complete' : 'Idle';

  return (
    <nav className="fixed top-0 left-0 right-0 z-100 flex items-center justify-between px-7 py-3.5 bg-white/80 dark:bg-ink-800/80 backdrop-blur-md border-b border-brand-200 dark:border-ink-500 transition-colors duration-300">
      <div className="flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-400 shadow-[0_4px_16px_rgba(46,111,224,0.3)] shrink-0">
          <Layers className="w-[18px] h-[18px] text-white" strokeWidth={2} />
        </div>
        <div className="flex flex-col leading-tight">
          <b className="font-display text-[15px] font-semibold tracking-tight">
            Sales Conversion Agent
          </b>
          <span className="text-[11px] text-[#55698c] dark:text-[#8ca0c2]">
            Multi-agent pipeline console
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#55698c] dark:text-[#8ca0c2] px-3 py-1.5 rounded-full border border-brand-200 dark:border-ink-500 bg-brand-100/60 dark:bg-ink-700">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              pipelineStatus === 'running'
                ? 'bg-brand-500 animate-pulse'
                : pipelineStatus === 'done'
                ? 'bg-emerald-500'
                : 'bg-slate-300 dark:bg-ink-400'
            }`}
          />
          {statusLabel}
        </div>

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="relative w-14 h-[30px] rounded-full border border-brand-200 dark:border-ink-500 bg-brand-100 dark:bg-ink-700 flex items-center p-[3px] cursor-pointer"
        >
          <span
            className={`w-[22px] h-[22px] rounded-full flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-400 shadow-[0_2px_8px_rgba(46,111,224,0.35)] transition-transform duration-300 ${
              theme === 'dark' ? 'translate-x-[26px]' : 'translate-x-0'
            }`}
          >
            {theme === 'dark' ? (
              <Moon className="w-3 h-3 text-white" strokeWidth={2.4} />
            ) : (
              <Sun className="w-3 h-3 text-white" strokeWidth={2.4} />
            )}
          </span>
        </button>
      </div>
    </nav>
  );
}
