// src/hooks/usePipeline.js
//
// Drives the 3-node pipeline UI from the real backend.
//
// Full flow (session_id shared across all 3 endpoints, via
// runFullPipeline in pipelineClient.js):
//   1. POST /agent/sessions   -> session_id
//   2. POST /agent/run        -> SSE 'progress'/'done' events, live per-agent
//   3. GET  /agent/result/:id -> final structured JSON, once agent 3 is done
//
// sessionId is now exposed from this hook's return value once the
// pipeline completes, so the chat widget (POST /agent/chat) can reuse
// the same session for follow-up Q&A about the rep it just analyzed.
//
// sessionId is also persisted to localStorage (SALES_SESSION_ID_KEY) so
// it survives a page reload and is easy to inspect while debugging
// "session not found" issues against the backend.
//
// Confirmed from real backend output:
//   - DataCollectionAgent's SSE text is always "" (it works via session
//     state, not streamed text) — node 1 detail is generic, not data-driven.
//   - account_analysis_agent's done text is clean JSON.
//   - decision_action_agent's done text is JSON wrapped in ```json fences.
//   - Final /agent/result.actions_taken is ALSO a ```json-fenced string,
//     not parsed JSON — handled in adaptResult.js, not here.

import { useCallback, useRef, useState } from 'react';
import { runFullPipeline } from '../api/pipelineClient';

const NODES = [1, 2, 3];

const initialNodeStates = { 1: 'idle', 2: 'idle', 3: 'idle' };
const initialNodeDetails = { 1: null, 2: null, 3: null };

// localStorage key used to persist the active session id across reloads.
const SALES_SESSION_ID_KEY = 'salesConversionAgent.sessionId';

// Maps the SSE event's `author` field (the ADK agent's `name`) to one of
// the 3 real pipeline nodes:
//   DataCollectionAgent -> account_analysis_agent -> decision_action_agent
function agentToNode(author = '') {
  const a = author.toLowerCase();
  if (a.includes('data_collection') || a.includes('datacollection')) return 1;
  if (a.includes('account_analysis')) return 2;
  if (a.includes('decision_action')) return 3;
  return null; // unrecognized author — ignore rather than mis-bucket
}

// account_analysis_agent's done text is plain JSON. decision_action_agent's
// done text is JSON wrapped in ```json ... ``` fences. This strips fences
// if present, then parses either shape safely.
function tryParseEventText(eventData) {
  if (!eventData || typeof eventData.text !== 'string') return null;
  const raw = eventData.text.trim();
  if (!raw) return null; // DataCollectionAgent's text is always ""

  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

// Persist (or clear, if null) the session id in localStorage. Wrapped in
// try/catch since localStorage can throw in some environments (e.g.
// private browsing mode with storage disabled).
function persistSessionId(sessionId) {
  try {
    if (sessionId) {
      window.localStorage.setItem(SALES_SESSION_ID_KEY, sessionId);
    } else {
      window.localStorage.removeItem(SALES_SESSION_ID_KEY);
    }
  } catch (err) {
    console.warn('Could not persist session id to localStorage:', err);
  }
}

export function usePipeline() {
  const [pipelineStatus, setPipelineStatus] = useState('idle'); // idle | running | done | error
  const [nodeStates, setNodeStates] = useState(initialNodeStates);
  const [nodeDetails, setNodeDetails] = useState(initialNodeDetails);
  const [outputStatus, setOutputStatus] = useState('idle'); // idle | assembling | ready
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [result, setResult] = useState(null); // final /agent/result payload
  const [sessionId, setSessionId] = useState(null); // shared session_id, for the chat widget
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setNodeStates(initialNodeStates);
    setNodeDetails(initialNodeDetails);
    setOutputStatus('idle');
    setDashboardVisible(false);
    setResult(null);
    setSessionId(null);
    setUserId(null);
    persistSessionId(null);
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
      // DataCollectionAgent never streams text — nothing to parse.
      setNodeDetails((d) => ({ ...d, 1: 'Rep profile and accounts loaded.' }));
    }
    if (node === 2) {
      const parsed = tryParseEventText(eventData);
      const count = parsed?.accounts?.length;
      setNodeDetails((d) => ({
        ...d,
        2: count != null ? `Analyzed ${count} account${count === 1 ? '' : 's'}.` : 'Account analysis complete.',
      }));
    }
    if (node === 3) {
      const parsed = tryParseEventText(eventData);
      const count = parsed?.actions?.length;
      setNodeDetails((d) => ({
        ...d,
        3: count != null ? `${count} action${count === 1 ? '' : 's'} executed.` : 'Actions executed.',
      }));
    }
  }, []);

  const run = useCallback(
    async (config = {}) => {
      const { repName, repEmail, managerEmail } = config;

      reset();
      setPipelineStatus('running');
      // Optimistically show node 1 as running the instant the user clicks
      // Run — otherwise the UI sits idle during session creation + the
      // network round trip before the first SSE 'progress' event arrives.
      markNodeActive(1);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const finalResult = await runFullPipeline({
          repName,
          repEmail,
          managerEmail,
          signal: controller.signal,
          onEvent: (evt) => {
            const author = evt?.data?.author || '';
            const node = agentToNode(author);
            if (node == null) return; // ignore events we can't attribute

            if (evt.type === 'progress') {
              markNodeActive(node);
            } else if (evt.type === 'done') {
              markNodeDone(node, evt.data);
            }
          },
        });

        // All 3 SSE-driven nodes are done by the time runFullPipeline
        // resolves (it internally waits for agent 3's 'done' before
        // fetching /agent/result). Force them to 'done' as a safety net.
        setNodeStates((prev) => {
          const next = { ...prev };
          NODES.forEach((n) => { next[n] = 'done'; });
          return next;
        });

        const finishedSessionId = finalResult?.session_id ?? null;
        const finishedUserId = finalResult?.user_id ?? null;

        setOutputStatus('assembling');
        setResult(finalResult);
        setSessionId(finishedSessionId);
        setUserId(finishedUserId);
        persistSessionId(finishedSessionId);
        setOutputStatus('ready');
        setDashboardVisible(true);
        setPipelineStatus('done');
      } catch (err) {
        console.error('Pipeline run failed:', err);
        setError(err.message || 'Pipeline failed');
        setPipelineStatus('error');
        setNodeStates(initialNodeStates);
        setNodeDetails(initialNodeDetails);
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
    outputStatus,
    dashboardVisible,
    result,
    sessionId,
    userId,
    error,
    run,
    cancel,
  };
}