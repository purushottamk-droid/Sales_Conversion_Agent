// src/hooks/useMarketingPipeline.js
//
// Same shape as usePipeline.js (sales) / useNpsPipeline.js (NPS), driving
// the Marketing 3-node pipeline UI from the real marketingClient backend.
//
// Full flow (session_id shared across all 3 endpoints via
// runFullMarketingPipeline in marketingClient.js):
//   1. POST /agent/sessions   -> session_id
//   2. POST /agent/run        -> SSE 'progress'/'done' events, live per-agent
//   3. GET  /agent/result/:id -> final structured JSON
//
// agentToNode() below is a BEST-EFFORT GUESS at the SSE author names for
// the 3 Marketing agents (Campaign Data Collection / Growth & Efficiency
// Analysis / Decision & Action) — we only have the final /agent/result
// JSON so far, not a captured SSE stream. The result's top-level keys
// (marketing_dataset+marketing_payload, campaign_analysis_results+
// growth_assessment_result, decision_action_results) strongly suggest this
// 3-stage split, which is what agentToNode() assumes. If live node
// highlighting looks wrong once you test it, paste the real SSE `author`
// values here and this is the only function that needs to change. Nothing
// else (result parsing, dashboard) depends on this guess.

import { useCallback, useRef, useState } from 'react';
import { runFullMarketingPipeline } from '../api/marketingClient';

const NODES = [1, 2, 3];

const initialNodeStates = { 1: 'idle', 2: 'idle', 3: 'idle' };
const initialNodeDetails = { 1: null, 2: null, 3: null };

function agentToNode(author = '') {
  const a = author.toLowerCase();
  if (a.includes('data_collection') || a.includes('marketing_data') || a.includes('campaign_data')) return 1;
  if (a.includes('growth_assessment') || a.includes('campaign_analysis') || a.includes('analysis')) return 2;
  if (a.includes('decision') || a.includes('action')) return 3;
  return null; // unrecognized author — ignore rather than mis-bucket
}

function tryParseEventText(eventData) {
  if (!eventData || typeof eventData.text !== 'string') return null;
  const raw = eventData.text.trim();
  if (!raw) return null;

  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

export function useMarketingPipeline() {
  const [pipelineStatus, setPipelineStatus] = useState('idle'); // idle | running | done | error
  const [nodeStates, setNodeStates] = useState(initialNodeStates);
  const [nodeDetails, setNodeDetails] = useState(initialNodeDetails);
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [result, setResult] = useState(null); // final /agent/result payload
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setNodeStates(initialNodeStates);
    setNodeDetails(initialNodeDetails);
    setDashboardVisible(false);
    setResult(null);
    setSessionId(null);
    setError(null);
  }, []);

  const markNodeActive = useCallback((node) => {
    setNodeStates((prev) => {
      const next = { ...prev };
      NODES.forEach((n) => {
        if (n < node && next[n] !== 'done') next[n] = 'done';
      });
      next[node] = 'running';
      return next;
    });
  }, []);

  const markNodeDone = useCallback((node, eventData) => {
    setNodeStates((prev) => ({ ...prev, [node]: 'done' }));

    if (node === 1) {
      setNodeDetails((d) => ({ ...d, 1: 'Campaign, spend, and pipeline data loaded across all channels.' }));
    }
    if (node === 2) {
      const parsed = tryParseEventText(eventData);
      const count = parsed?.campaigns?.length;
      setNodeDetails((d) => ({
        ...d,
        2: count != null ? `Scored ${count} campaign${count === 1 ? '' : 's'} for health and efficiency.` : 'Campaign health and growth risk assessed.',
      }));
    }
    if (node === 3) {
      setNodeDetails((d) => ({ ...d, 3: 'Budget actions decided and stakeholders notified.' }));
    }
  }, []);

  const run = useCallback(
    async (config = {}) => {
      const { userId = 'test_user' } = config;

      reset();
      setPipelineStatus('running');
      // Same as sales/NPS: show node 1 running immediately on click, don't
      // wait for the first SSE event.
      markNodeActive(1);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const finalResult = await runFullMarketingPipeline({
          userId,
          signal: controller.signal,
          onEvent: (evt) => {
            const author = evt?.data?.author || '';
            const node = agentToNode(author);
            if (node == null) return;

            if (evt.type === 'progress') {
              markNodeActive(node);
            } else if (evt.type === 'done') {
              markNodeDone(node, evt.data);
            }
          },
        });

        setNodeStates((prev) => {
          const next = { ...prev };
          NODES.forEach((n) => { next[n] = 'done'; });
          return next;
        });

        setResult(finalResult);
        setSessionId(finalResult?.session_id ?? null);
        setDashboardVisible(true);
        setPipelineStatus('done');
      } catch (err) {
        console.error('Marketing pipeline run failed:', err);
        setError(err.message || 'Marketing pipeline failed');
        setPipelineStatus('error');
      }
    },
    [reset, markNodeActive, markNodeDone]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    pipelineStatus,
    nodeStates,
    nodeDetails,
    dashboardVisible,
    result,
    sessionId,
    error,
    run,
    cancel,
  };
}