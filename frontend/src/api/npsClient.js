// src/api/npsClient.js
//
// Same 3-endpoint pattern as pipelineClient.js (sales), pointed at the
// NPS Improvement Agent's own backend. Kept as a fully separate client —
// different base URL, different session payload, different result shape.

const BASE_URL = 'https://nps-improvement-agent-621913909275.asia-south1.run.app';

// ASSUMPTION — not yet confirmed from a live SSE capture (only /agent/run's
// final JSON result has been shared so far, not the streamed events).
// The sales agent's final-agent SSE author is 'decision_action_agent', and
// NPS's result is also produced by a decision/action step (actions_taken),
// so we match on the same substring here. If real SSE authors differ,
// update this constant and agentToNode() in useNpsPipeline.js — nothing
// else needs to change, since getResult() below doesn't depend on it.
const FINAL_AGENT_MATCH = 'decision_action';

function parseSSEChunk(chunk) {
  const lines = chunk.split('\n');
  let eventType = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join('\n');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  return { type: eventType, data };
}

/**
 * STEP 1 — Create a session. Confirmed real payload only needs user_id
 * (per the curl script you shared).
 */
export async function createSession({ userId, signal }) {
  const res = await fetch(`${BASE_URL}/agent/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createSession failed (${res.status}): ${text}`);
  }

  return res.json(); // { session_id, user_id, initial_state }
}

/**
 * STEP 2 — Run the pipeline for an existing session, streaming SSE events
 * live. Resolves once the stream closes.
 */
export async function runPipelineStream({ userId, sessionId, onEvent, signal }) {
  const res = await fetch(`${BASE_URL}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, session_id: sessionId }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`runPipeline failed (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop();

    for (const chunk of chunks) {
      const evt = parseSSEChunk(chunk);
      if (evt) onEvent(evt);
    }
  }

  if (buffer.trim()) {
    const evt = parseSSEChunk(buffer);
    if (evt) onEvent(evt);
  }
}

/**
 * STEP 3 — Fetch the final structured result once the pipeline is done.
 * Confirmed real shape:
 *   { session_id, nps_payload, risk_classification_results: { classifications: [...] }, actions_taken }
 */
export async function getResult({ sessionId, userId, signal }) {
  const url = `${BASE_URL}/agent/result/${sessionId}?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, { signal });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getResult failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Orchestrates all three endpoints in order, sharing one session_id:
 *   sessions -> run (SSE) -> result
 */
export async function runFullNpsPipeline({ userId, onEvent, signal }) {
  const session = await createSession({ userId, signal });
  const sessionId = session.session_id;

  let pipelineFinished = false;

  await runPipelineStream({
    userId,
    sessionId,
    signal,
    onEvent: (evt) => {
      onEvent(evt);
      const author = (evt?.data?.author || '').toLowerCase();
      if (evt.type === 'done' && author.includes(FINAL_AGENT_MATCH)) {
        pipelineFinished = true;
      }
    },
  });

  if (!pipelineFinished) {
    // Same safety net as the sales client: fetch the result anyway even if
    // we didn't recognize the final agent's "done" event.
    console.warn('NPS pipeline stream ended without a decision_action "done" event; fetching result anyway.');
  }

  const finalResult = await getResult({ sessionId, userId, signal });
  return { ...finalResult, session_id: sessionId };
}

export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}