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
 *
 * Per backend: only user_id is required — its value is the rep's name,
 * not a placeholder like 'test_user'. No separate sales_rep_name field.
 */
export async function createSession({ repName, repEmail, managerEmail, signal }) {
  const res = await fetch(`${BASE_URL}/agent/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
       user_id: repName,
        sales_rep_name: repName,
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
export async function runPipelineStream({ repName, sessionId, onEvent, signal }) {
  const res = await fetch(`${BASE_URL}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: repName,
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
export async function getResult({ sessionId, repName, signal }) {
  const url = `${BASE_URL}/agent/result/${sessionId}?user_id=${encodeURIComponent(repName)}`;
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
 * @param {string} opts.repName
 * @param {string} opts.repEmail
 * @param {string} opts.managerEmail
 * @param {(evt: {type: string, data: any}) => void} opts.onEvent - fired for every SSE event
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Object>} the final /agent/result payload
 */
export async function runFullPipeline({ repName, repEmail, managerEmail, onEvent, signal }) {
  const session = await createSession({ repName, repEmail, managerEmail, signal });
  const sessionId = session.session_id;
  const userId = session.user_id;

  let pipelineFinished = false;

  // Set when the backend streams `event: error` (see stream_events()'s
  // RepNotFoundError catch in api.py — fired when sales_rep_name doesn't
  // match anything in Everstage/Salesforce). Captured here instead of
  // thrown immediately so the raw event still reaches the caller's
  // onEvent first (e.g. so usePipeline.js can reset node states), and so
  // we can bail out BEFORE calling /agent/result below — that endpoint
  // would otherwise 404 or return an empty/stale payload for a rep that
  // was never actually resolved.
  let pipelineError = null;

  await runPipelineStream({
    repName : userId,
    sessionId,
    signal,
    onEvent: (evt) => {
      onEvent(evt);

      if (evt.type === 'error') {
        pipelineError = evt?.data?.message || 'Pipeline failed. Please try again.';
        return;
      }

      const author = (evt?.data?.author || '').toLowerCase();
      if (evt.type === 'done' && author.includes(FINAL_AGENT_MATCH)) {
        pipelineFinished = true;
      }
    },
  });

  if (pipelineError) {
    throw new Error(pipelineError);
  }

  if (!pipelineFinished) {
    // Stream closed without seeing the final agent's done event — still
    // attempt the result fetch, since the backend may have completed
    // the run server-side even if we missed the exact SSE marker.
    console.warn('Pipeline stream ended without a decision_action "done" event; fetching result anyway.');
  }

  const finalResult = await getResult({ sessionId, repName : userId, signal });

  // Guarantee session_id is present on the returned object regardless of
  // whether /agent/result echoes it back — usePipeline.js relies on this
  // to power the follow-up chat widget after the pipeline completes, and
  // to persist the session for reload/debugging purposes.
  return { ...finalResult, session_id: sessionId, user_id: userId };
}

/**
 * Sends a chat message tied to an existing session (created during the
 * pipeline run). Used for follow-up Q&A about a rep's analysis after the
 * pipeline has completed.
 *
 * @param {Object} opts
 * @param {string} opts.repName
 * @param {string} opts.sessionId
 * @param {string} opts.message
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Object>} the backend's chat response
 */
export async function sendChatMessage({ repName, sessionId, message, signal }) {
  const res = await fetch(`${BASE_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: repName,
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