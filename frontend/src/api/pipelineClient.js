// src/api/pipelineClient.js
//
// Thin client around the Cloud Run "sales-conversion-agent" service.
// Three calls, used in sequence by usePipeline.js:
//   1. createSession()  -> POST /agent/sessions
//   2. runPipeline()    -> POST /agent/run       (SSE stream of progress/done events)
//   3. getResult()      -> GET  /agent/result/:session_id
//
// NOTE: /agent/run is a POST endpoint, so the native EventSource API (GET-only)
// can't be used. We consume the SSE body manually via fetch + ReadableStream.

const BASE_URL = 'https://sales-conversion-agent-7dmabce4qq-el.a.run.app';

/**
 * Create a new agent session.
 * @returns {Promise<{session_id: string, [key: string]: any}>}
 */
export async function createSession({ user_id, sales_rep_id, rep_email, manager_email }) {
  const res = await fetch(`${BASE_URL}/agent/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, sales_rep_id, rep_email, manager_email }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createSession failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Fetch the final structured result once the pipeline has finished.
 * Also defensively parses `actions_taken` if the backend still returns it
 * as a ```json-fenced string instead of a real object.
 */
export async function getResult(sessionId, userId) {
  const url = `${BASE_URL}/agent/result/${encodeURIComponent(sessionId)}?user_id=${encodeURIComponent(
    userId
  )}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getResult failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (typeof data.actions_taken === 'string') {
    try {
      const cleaned = data.actions_taken.replace(/```json\s*|```\s*$/g, '').trim();
      data.actions_taken = JSON.parse(cleaned);
    } catch (err) {
      console.warn('Could not parse actions_taken markdown-fenced JSON:', err);
      // leave as raw string if parsing fails, caller can handle
    }
  }

  return data;
}

/**
 * Parse a single raw SSE "chunk" (the text between two \n\n separators)
 * into { type, data }.
 */
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
 * Kick off a pipeline run and stream progress/done events to onEvent.
 * Resolves once the HTTP response stream ends (i.e. the connection closes).
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.sessionId
 * @param {(evt: {type: string, data: any}) => void} opts.onEvent
 * @param {AbortSignal} [opts.signal]
 */
export async function runPipeline({ userId, sessionId, onEvent, signal }) {
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
    buffer = chunks.pop(); // last piece may be incomplete, keep for next read

    for (const chunk of chunks) {
      const evt = parseSSEChunk(chunk);
      if (evt) onEvent(evt);
    }
  }

  // flush any trailing partial event
  if (buffer.trim()) {
    const evt = parseSSEChunk(buffer);
    if (evt) onEvent(evt);
  }
}

export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}