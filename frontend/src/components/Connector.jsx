export default function Connector({ active }) {
  return (
    <div className="w-[46px] shrink-0 relative flex items-center justify-center max-md:w-full max-md:h-[26px]">
      <div
        className={`absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 transition-colors max-md:top-0 max-md:bottom-0 max-md:left-1/2 max-md:w-0.5 max-md:h-full max-md:translate-y-0 max-md:-translate-x-1/2 ${
          active ? 'bg-brand-500' : 'bg-brand-200 dark:bg-ink-500'
        }`}
      />
      {active && (
        <span className="absolute top-1/2 left-[-6px] w-3 h-1.5 rounded-full -translate-y-1/2 bg-gradient-to-r from-transparent via-brand-500 to-transparent animate-flow max-md:left-1/2 max-md:top-[-6px] max-md:w-1.5 max-md:h-3 max-md:-translate-x-1/2 max-md:translate-y-0 max-md:animate-flow-v" />
      )}
    </div>
  );
}
