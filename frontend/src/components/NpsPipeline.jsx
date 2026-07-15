import PipelineNode from './PipelineNode';
import Connector from './Connector';

const initialNodeStates = { 1: 'idle', 2: 'idle', 3: 'idle' };

export default function NpsPipeline({ nodeStates = initialNodeStates, resultReady = false }) {
  return (
    <section className="mb-16">
      <div className="mb-6">
        <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
          Pipeline
        </div>
        <h2 className="text-[23px] font-semibold">Three agents, one run</h2>
      </div>

      <div className="flex items-stretch gap-0 max-md:flex-col">
        <PipelineNode
          number={1}
          title="Feedback Collection Agent"
          description="Looks up the customer's NPS survey responses and recent support interactions."
          state={nodeStates[1]}
          detail={nodeStates[1] === 'done' ? 'NPS survey responses and support history loaded.' : null}
        />

        <Connector active={nodeStates[1] === 'running' || nodeStates[1] === 'done'} />

        <PipelineNode
          number={2}
          title="Sentiment Analysis Agent"
          description="Reads each survey response and support ticket — sentiment, root cause, churn signals."
          state={nodeStates[2]}
          detail={nodeStates[2] === 'done' ? 'Sentiment and churn signals extracted.' : null}
        />

        <Connector active={nodeStates[2] === 'running' || nodeStates[2] === 'done'} />

        <PipelineNode
          number={3}
          title="Decision & Action Agent"
          description="Judges churn risk from every response, then notifies the account owner and logs follow-ups."
          state={nodeStates[3]}
          detail={nodeStates[3] === 'done' ? 'Risk classified and next steps logged.' : null}
        />
      </div>

      {!resultReady && (
        <div className="mt-[22px] bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] p-[26px] text-center transition-colors">
          <h3 className="text-[17px] font-semibold mb-1.5">Consolidated Report</h3>
          <p className="text-[13px] text-[#55698c] dark:text-[#8ca0c2]">
            Customer sentiment summary, per-response analysis, and recommended actions — ready to
            view once the NPS pipeline is live.
          </p>
          <div className="inline-flex items-center gap-2 mt-3.5 text-[12.5px] font-semibold text-slate-400 dark:text-ink-400">
            <span>Waiting for NPS backend integration</span>
          </div>
        </div>
      )}
    </section>
  );
}