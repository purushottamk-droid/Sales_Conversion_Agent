// // src/api/pipelineClient.js
// //
// // Thin client around the Cloud Run "sales-conversion-agent" service.
// //
// // Session-less flow: a single call runs everything in one HTTP request.
// //   runPipeline() -> POST /agent/run
// //     Streams SSE events:
// //       - 'progress' : an agent step is in progress
// //       - 'done'     : an agent step finished
// //       - 'result'   : final consolidated pipeline output (last event)
// //
// // NOTE: /agent/run is a POST endpoint, so the native EventSource API (GET-only)
// // can't be used. We consume the SSE body manually via fetch + ReadableStream.
// //
// // We intentionally do NOT call /agent/sessions or /agent/result separately
// // anymore. Cloud Run can route requests to different container instances,
// // and the backend's session store (InMemorySessionService) only lives in
// // the memory of a single instance. Splitting session-creation, running,
// // and result-fetching into separate requests risked each one landing on a
// // different instance and failing to find the session. Combining
// // everything into one streamed request/response guarantees it all runs
// // on the same instance.

// const BASE_URL = 'https://sales-conversion-agent-7dmabce4qq-el.a.run.app';

// /**
//  * Parse a single raw SSE "chunk" (the text between two \n\n separators)
//  * into { type, data }.
//  */
// function parseSSEChunk(chunk) {
//   const lines = chunk.split('\n');
//   let eventType = 'message';
//   const dataLines = [];

//   for (const line of lines) {
//     if (line.startsWith('event:')) {
//       eventType = line.slice(6).trim();
//     } else if (line.startsWith('data:')) {
//       dataLines.push(line.slice(5).trim());
//     }
//   }

//   if (dataLines.length === 0) return null;

//   const raw = dataLines.join('\n');
//   let data;
//   try {
//     data = JSON.parse(raw);
//   } catch {
//     data = raw;
//   }

//   return { type: eventType, data };
// }

// /**
//  * Runs the pipeline directly with rep info (no separate session-creation
//  * call). Streams 'progress' / 'done' events live as each agent runs, then
//  * a final 'result' event containing the full consolidated pipeline output.
//  * Resolves once the HTTP response stream ends (i.e. the connection closes).
//  *
//  * @param {Object} opts
//  * @param {string} opts.userId
//  * @param {string} opts.salesRepId
//  * @param {string} opts.repEmail
//  * @param {string} opts.managerEmail
//  * @param {(evt: {type: string, data: any}) => void} opts.onEvent
//  * @param {AbortSignal} [opts.signal]
//  */
// export async function runPipeline({ userId, salesRepId, repEmail, managerEmail, onEvent, signal }) {
//   const res = await fetch(`${BASE_URL}/agent/run`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       user_id: userId,
//       sales_rep_id: salesRepId,
//       rep_email: repEmail,
//       manager_email: managerEmail,
//     }),
//     signal,
//   });

//   if (!res.ok || !res.body) {
//     const text = await res.text().catch(() => '');
//     throw new Error(`runPipeline failed (${res.status}): ${text}`);
//   }

//   const reader = res.body.getReader();
//   const decoder = new TextDecoder();
//   let buffer = '';

//   while (true) {
//     const { value, done } = await reader.read();
//     if (done) break;

//     buffer += decoder.decode(value, { stream: true });

//     const chunks = buffer.split('\n\n');
//     buffer = chunks.pop(); // last piece may be incomplete, keep for next read

//     for (const chunk of chunks) {
//       const evt = parseSSEChunk(chunk);
//       if (evt) onEvent(evt);
//     }
//   }

//   // flush any trailing partial event
//   if (buffer.trim()) {
//     const evt = parseSSEChunk(buffer);
//     if (evt) onEvent(evt);
//   }
// }

// export async function checkHealth() {
//   const res = await fetch(`${BASE_URL}/health`);
//   return res.ok;
// }

// src/api/pipelineClient.js
//
// Client for the 3-agent Sales Rep Performance pipeline.
//
// Full flow (per your spec) — all three endpoints share one session_id:
//   1. POST /agent/sessions   -> { session_id }
//   2. POST /agent/run        -> SSE stream (progress / done events)
//   3. GET  /agent/result/:id -> final structured JSON
//
// runFullPipeline() below drives all three in order and reports progress
// via onEvent, so the caller (usePipeline.js) never has to juggle the
// session_id itself.

const BASE_URL = 'https://sales-conversion-agent-621913909275.asia-south1.run.app';

// The last agent in the sequence — its 'done' event is our signal that
// the whole pipeline has finished and it's safe to call /agent/result.
const FINAL_AGENT_MATCH = 'decision_action';

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
 * STEP 1 — Create a session. Must be called before /agent/run.
 */
export async function createSession({ userId, salesRepName, repEmail, managerEmail, signal }) {
  const res = await fetch(`${BASE_URL}/agent/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      sales_rep_name: salesRepName,
      rep_email: repEmail,
      manager_email: managerEmail,
    }),
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
 *
 * @param {(evt: {type: string, data: any}) => void} onEvent
 */
export async function runPipelineStream({ userId, sessionId, onEvent, signal }) {
  const res = await fetch(`${BASE_URL}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
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
 */
export async function getResult({ sessionId, userId, signal }) {
  const url = `${BASE_URL}/agent/result/${sessionId}?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, { signal });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getResult failed (${res.status}): ${text}`);
  }

  return res.json(); // { session_id, account_analysis_results, actions_taken }
}

/**
 * Orchestrates all three endpoints in order, using one shared session_id
 * throughout, exactly as the spec requires:
 *   sessions -> run (SSE) -> result
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.salesRepName
 * @param {string} opts.repEmail
 * @param {string} opts.managerEmail
 * @param {(evt: {type: string, data: any}) => void} opts.onEvent - fired for every SSE event
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Object>} the final /agent/result payload
 */
export async function runFullPipeline({ userId, salesRepName, repEmail, managerEmail, onEvent, signal }) {
  const session = await createSession({ userId, salesRepName, repEmail, managerEmail, signal });
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
    // Stream closed without seeing the final agent's done event — still
    // attempt the result fetch, since the backend may have completed
    // the run server-side even if we missed the exact SSE marker.
    console.warn('Pipeline stream ended without a decision_action "done" event; fetching result anyway.');
  }

  return getResult({ sessionId, userId, signal });
}

export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}