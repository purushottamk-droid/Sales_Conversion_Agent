// src/hooks/useNpsPipeline.js
//
// Same shape as usePipeline.js (sales), driving the NPS 3-node pipeline UI
// from the real npsClient backend.
//
// Full flow (session_id shared across all 3 endpoints via
// runFullNpsPipeline in npsClient.js):
//   1. POST /agent/sessions   -> session_id
//   2. POST /agent/run        -> SSE 'progress'/'done' events, live per-agent
//   3. GET  /agent/result/:id -> final structured JSON
//
// agentToNode() below is a BEST-EFFORT GUESS at the SSE author names for
// the 3 NPS agents (Feedback Collection / Sentiment Analysis /
// Decision & Action) — we only have the final /agent/result JSON so far,
// not a captured SSE stream. If live node highlighting looks wrong once
// you test it, paste the real SSE `author` values here and this is the
// only function that needs to change. Nothing else (result parsing,
// dashboard) depends on this guess.

import { useCallback, useRef, useState } from 'react';
import { runFullNpsPipeline } from '../api/npsClient';

const NODES = [1, 2, 3];

const initialNodeStates = { 1: 'idle', 2: 'idle', 3: 'idle' };
const initialNodeDetails = { 1: null, 2: null, 3: null };

function agentToNode(author = '') {
  const a = author.toLowerCase();
  if (a.includes('feedback') || a.includes('data_collection') || a.includes('nps_collection')) return 1;
  if (a.includes('sentiment') || a.includes('risk_classification') || a.includes('classification')) return 2;
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

export function useNpsPipeline() {
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
      setNodeDetails((d) => ({ ...d, 1: 'NPS survey responses and support history loaded.' }));
    }
    if (node === 2) {
      const parsed = tryParseEventText(eventData);
      const count = parsed?.classifications?.length;
      setNodeDetails((d) => ({
        ...d,
        2: count != null ? `Classified ${count} account${count === 1 ? '' : 's'}.` : 'Sentiment and churn signals extracted.',
      }));
    }
    if (node === 3) {
      setNodeDetails((d) => ({ ...d, 3: 'Risk classified and next steps logged.' }));
    }
  }, []);

  const run = useCallback(
    async (config = {}) => {
      const { userId = 'test_user' } = config;

      reset();
      setPipelineStatus('running');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const finalResult = await runFullNpsPipeline({
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
        console.error('NPS pipeline run failed:', err);
        setError(err.message || 'NPS pipeline failed');
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