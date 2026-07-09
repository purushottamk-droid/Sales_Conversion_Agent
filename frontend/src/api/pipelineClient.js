// src/api/pipelineClient.js
//
// Thin client around the Cloud Run "sales-conversion-agent" service.
//
// Session-less flow: a single call runs everything in one HTTP request.
//   runPipeline() -> POST /agent/run
//     Streams SSE events:
//       - 'progress' : an agent step is in progress
//       - 'done'     : an agent step finished
//       - 'result'   : final consolidated pipeline output (last event)
//
// NOTE: /agent/run is a POST endpoint, so the native EventSource API (GET-only)
// can't be used. We consume the SSE body manually via fetch + ReadableStream.
//
// We intentionally do NOT call /agent/sessions or /agent/result separately
// anymore. Cloud Run can route requests to different container instances,
// and the backend's session store (InMemorySessionService) only lives in
// the memory of a single instance. Splitting session-creation, running,
// and result-fetching into separate requests risked each one landing on a
// different instance and failing to find the session. Combining
// everything into one streamed request/response guarantees it all runs
// on the same instance.

const BASE_URL = 'https://sales-conversion-agent-7dmabce4qq-el.a.run.app';

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
 * Runs the pipeline directly with rep info (no separate session-creation
 * call). Streams 'progress' / 'done' events live as each agent runs, then
 * a final 'result' event containing the full consolidated pipeline output.
 * Resolves once the HTTP response stream ends (i.e. the connection closes).
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.salesRepId
 * @param {string} opts.repEmail
 * @param {string} opts.managerEmail
 * @param {(evt: {type: string, data: any}) => void} opts.onEvent
 * @param {AbortSignal} [opts.signal]
 */
export async function runPipeline({ userId, salesRepId, repEmail, managerEmail, onEvent, signal }) {
  const res = await fetch(`${BASE_URL}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      sales_rep_id: salesRepId,
      rep_email: repEmail,
      manager_email: managerEmail,
    }),
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