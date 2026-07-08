import { CheckCircle2 } from 'lucide-react';

export default function Toast({ message, visible }) {
  return (
    <div
      className={`fixed bottom-[26px] left-1/2 bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-xl px-5 py-3.5 shadow-[0_10px_30px_-12px_rgba(30,70,140,0.25)] text-[13.5px] font-medium flex items-center gap-2.5 z-300 transition-all duration-300 ${
        visible
          ? 'opacity-100 -translate-x-1/2 translate-y-0'
          : 'opacity-0 -translate-x-1/2 translate-y-5'
      }`}
    >
      <CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={2} />
      <span>{message}</span>
    </div>
  );
}
