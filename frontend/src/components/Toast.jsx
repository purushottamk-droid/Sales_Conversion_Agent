import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function Toast({ message, visible, type = 'success' }) {
  const isError = type === 'error';

  return (
    <div
      className={`fixed bottom-[26px] left-1/2 bg-white dark:bg-ink-700 border rounded-xl px-5 py-3.5 shadow-[0_10px_30px_-12px_rgba(30,70,140,0.25)] text-[13.5px] font-medium flex items-center gap-2.5 z-300 transition-all duration-300 ${
        isError
          ? 'border-red-200 dark:border-red-500/40'
          : 'border-brand-200 dark:border-ink-500'
      } ${
        visible
          ? 'opacity-100 -translate-x-1/2 translate-y-0'
          : 'opacity-0 -translate-x-1/2 translate-y-5'
      }`}
    >
      {isError ? (
        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" strokeWidth={2} />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2} />
      )}
      <span>{message}</span>
    </div>
  );
}