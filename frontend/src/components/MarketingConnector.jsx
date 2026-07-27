// Dedicated connector for the Marketing Agent pipeline.
// Intentionally NOT shared with Sales/NPS Connector — kept independent
// so styling/behavior changes here never ripple into other agents.
export default function MarketingConnector({ active = false }) {
  return (
    <div className="flex items-center justify-center w-8 shrink-0 max-md:w-full max-md:h-8 max-md:rotate-90">
      <div
        className={`h-[2px] w-full rounded-full transition-colors duration-500 ${
          active ? 'bg-brand-500' : 'bg-brand-200 dark:bg-ink-500'
        }`}
      />
    </div>
  );
}