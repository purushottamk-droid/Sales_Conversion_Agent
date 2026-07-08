export default function SourceChip({ icon: Icon, label, active }) {
  return (
    <div
      className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? 'text-brand-500 border-brand-500 bg-brand-100 dark:bg-brand-500/10'
          : 'text-[#55698c] dark:text-[#8ca0c2] border-brand-200 dark:border-ink-500 bg-brand-50 dark:bg-ink-600'
      }`}
    >
      <Icon className="w-[13px] h-[13px]" strokeWidth={2} />
      {label}
    </div>
  );
}
