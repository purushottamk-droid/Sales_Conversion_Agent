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

  const finalResult = await getResult({ sessionId, userId, signal });

  // Guarantee session_id is present on the returned object regardless of
  // whether /agent/result echoes it back — usePipeline.js relies on this
  // to power the follow-up chat widget after the pipeline completes.
  return { ...finalResult, session_id: sessionId };
}

/**
 * Sends a chat message tied to an existing session (created during the
 * pipeline run). Used for follow-up Q&A about a rep's analysis after the
 * pipeline has completed.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.sessionId
 * @param {string} opts.message
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Object>} the backend's chat response
 */
export async function sendChatMessage({ userId, sessionId, message, signal }) {
  const res = await fetch(`${BASE_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
      message,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sendChatMessage failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}