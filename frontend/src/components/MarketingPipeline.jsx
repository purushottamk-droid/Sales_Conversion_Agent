import MarketingPipelineNode from './MarketingPipelineNode';
import MarketingConnector from './MarketingConnector';

const initialNodeStates = { 1: 'idle', 2: 'idle', 3: 'idle' };

export default function MarketingPipeline({ nodeStates = initialNodeStates, resultReady = false }) {
  return (
    <section className="mb-16">
      <div className="mb-6">
        <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
          Pipeline
        </div>
        <h2 className="text-[23px] font-semibold">Three agents, one run</h2>
      </div>

      <div className="flex items-stretch gap-0 max-md:flex-col">
        <MarketingPipelineNode
          number={1}
          title="Campaign Data Agent"
          description="Pulls campaign performance, audience segments, and engagement metrics from connected channels (email, social, ads)."
          state={nodeStates[1]}
          detail={nodeStates[1] === 'done' ? 'Campaign performance and audience data loaded.' : null}
        />

        <MarketingConnector active={nodeStates[1] === 'running' || nodeStates[1] === 'done'} />

        <MarketingPipelineNode
          number={2}
          title="Engagement & Sentiment Agent"
          description="Reads click-throughs, conversions, and sentiment for each campaign — flags underperformance and drop-off points."
          state={nodeStates[2]}
          detail={nodeStates[2] === 'done' ? 'Engagement scored and drop-off points identified.' : null}
        />

        <MarketingConnector active={nodeStates[2] === 'running' || nodeStates[2] === 'done'} />

        <MarketingPipelineNode
          number={3}
          title="Optimization & Action Agent"
          description="Turns the assessment into next-best actions — budget reallocation, audience retargeting, and campaign tweaks."
          state={nodeStates[3]}
          detail={nodeStates[3] === 'done' ? 'Recommended actions generated and logged.' : null}
        />
      </div>

      {!resultReady && (
        <div className="mt-[22px] bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] p-[26px] text-center transition-colors">
          <h3 className="text-[17px] font-semibold mb-1.5">Consolidated Report</h3>
          <p className="text-[13px] text-[#55698c] dark:text-[#8ca0c2]">
            Campaign performance summary, per-campaign scores, and recommended actions — ready to
            view, download, or send.
          </p>
          <div className="inline-flex items-center gap-2 mt-3.5 text-[12.5px] font-semibold text-slate-400 dark:text-ink-400">
            <span>Waiting for pipeline to run</span>
          </div>
        </div>
      )}
    </section>
  );
}