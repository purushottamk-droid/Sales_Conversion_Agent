import { Phone, Cloud, FileText, Loader2 } from 'lucide-react';
import PipelineNode from './PipelineNode';
import Connector from './Connector';
import SourceChip from './SourceChip';

export default function Pipeline({
  nodeStates,
  nodeDetails, // { 1: string|null, 3: string|null, 4: string|null } — real text computed in usePipeline.js
  activeSources,
  keysShown,
  connectorActive,
  outputStatus,
}) {
  return (
    <section className="mb-16">
      <div className="mb-6">
        <div className="text-xs font-bold tracking-wide uppercase text-brand-500 mb-1.5">
          Pipeline
        </div>
        <h2 className="text-[23px] font-semibold">Four agents, one run</h2>
      </div>

      <div className="flex items-stretch gap-0 max-md:flex-col">
        <PipelineNode
          number={1}
          title="Data Collection Agent"
          description="Looks up the rep's profile and pulls the full account list from the sales database."
          state={nodeStates[1]}
          detail={nodeDetails?.[1] ?? null}
        />

        <Connector active={connectorActive} />

        <PipelineNode
          number={2}
          title="Extraction Agent"
          description="Pulls call intelligence, CRM records, and transcripts, then packages two context keys."
          state={nodeStates[2]}
        >
          <div className="flex gap-2 flex-wrap mb-4">
            <SourceChip icon={Phone} label="Gong" active={activeSources.gong} />
            <SourceChip icon={Cloud} label="Salesforce" active={activeSources.sf} />
            <SourceChip icon={FileText} label="Transcripts" active={activeSources.tr} />
          </div>
          <div className="flex gap-3.5 flex-wrap justify-center">
            <div
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg border border-dashed transition-all duration-400 ${
                keysShown.A
                  ? 'opacity-100 translate-y-0 text-brand-500 border-brand-500'
                  : 'opacity-0 -translate-y-1 text-slate-400 border-brand-200 dark:border-ink-500'
              }`}
            >
              Key A → Account Analysis
            </div>
            <div
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg border border-dashed transition-all duration-400 ${
                keysShown.B
                  ? 'opacity-100 translate-y-0 text-brand-500 border-brand-500'
                  : 'opacity-0 -translate-y-1 text-slate-400 border-brand-200 dark:border-ink-500'
              }`}
            >
              Key B → Sales Rep Agent
            </div>
          </div>
        </PipelineNode>
      </div>

      <div className="flex gap-[22px] mt-3.5 max-md:flex-col">
        <PipelineNode
          number={3}
          title="Account Analysis Agent"
          description="Reads Key A, one account at a time — deal health, missed commitments, objections, sentiment."
          state={nodeStates[3]}
          detail={nodeDetails?.[3] ?? null}
        />
        <PipelineNode
          number={4}
          title="Sales Rep Agent"
          description="Reads Key B plus every account score to judge quota risk and coaching needs."
          state={nodeStates[4]}
          detail={nodeDetails?.[4] ?? null}
        />
      </div>

      <div className="mt-[22px] bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl shadow-[0_10px_30px_-12px_rgba(30,70,140,0.18)] p-[26px] text-center transition-colors">
        <h3 className="text-[17px] font-semibold mb-1.5">Consolidated Report</h3>
        <p className="text-[13px] text-[#55698c] dark:text-[#8ca0c2]">
          Rep summary, per-account scores, and recommended actions — ready to view, download, or
          send.
        </p>
        <div className="inline-flex items-center gap-2 mt-3.5 text-[12.5px] font-semibold text-slate-400 dark:text-ink-400">
          {outputStatus === 'idle' && <span>Waiting for pipeline to run</span>}
          {outputStatus === 'assembling' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
              <span className="text-brand-500">Assembling report…</span>
            </>
          )}
          {outputStatus === 'ready' && <span className="text-emerald-500">✓ Report ready</span>}
        </div>
      </div>
    </section>
  );
}