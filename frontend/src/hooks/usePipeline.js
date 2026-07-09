// // src/hooks/usePipeline.js
// //
// // Drives the 4-node pipeline UI from the real backend.
// //
// // Session-less flow (single request):
// //   runPipeline() -> POST /agent/run (SSE)
// //     - 'progress' / 'done' events update nodeStates/nodeDetails/
// //       activeSources/keysShown live
// //     - final 'result' event populates `result` and flips
// //       dashboardVisible on
// //
// // Node 1 (DataCollectionAgent)'s detail text is computed from the real
// // rep_performance_profile payload captured off its 'done' SSE event (see
// // extractRepProfile below). Nodes 3/4 detail text is still a generic
// // placeholder — plug in the same pattern once you share a sample of
// // AccountAnalysisAgent / SalesRepAgent's done-event payloads.

// import { useCallback, useRef, useState } from 'react';
// import { runPipeline } from '../api/pipelineClient';
// import { normalizeRepProfile } from '../utils/adaptResult';

// const NODES = [1, 2, 3, 4];

// const initialNodeStates = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending' };
// const initialNodeDetails = { 1: null, 3: null, 4: null };
// const initialActiveSources = { gong: false, sf: false, tr: false };
// const initialKeysShown = { A: false, B: false };

// // Maps the SSE event's `author` field to one of the 4 UI pipeline nodes.
// // The backend's actual agent graph has more steps than the UI shows
// // (e.g. a separate sales_rep_assessment_agent and decision_action_agent),
// // so anything past account_analysis collapses into node 4 ("Sales Rep Agent").
// function agentToNode(author = '') {
//   const a = author.toLowerCase();
//   if (a.includes('data_collection')) return 1;
//   if (a.includes('extraction')) return 2;
//   if (a.includes('account_analysis')) return 3;
//   return 4; // sales_rep_assessment_agent, decision_action_agent, etc.
// }

// // DataCollectionAgent's done event may carry the rep_performance_profile
// // under different possible keys depending on how the backend wraps it.
// // Try the known/likely spots defensively.
// function extractRepProfile(eventData) {
//   if (!eventData) return null;
//   return (
//     eventData.rep_performance_profile ??
//     eventData.content?.rep_performance_profile ??
//     eventData.output?.rep_performance_profile ??
//     (eventData.assigned_accounts ? eventData : null)
//   );
// }

// export function usePipeline() {
//   const [pipelineStatus, setPipelineStatus] = useState('idle'); // idle | running | done | error
//   const [nodeStates, setNodeStates] = useState(initialNodeStates);
//   const [nodeDetails, setNodeDetails] = useState(initialNodeDetails);
//   const [activeSources, setActiveSources] = useState(initialActiveSources);
//   const [keysShown, setKeysShown] = useState(initialKeysShown);
//   const [connectorActive, setConnectorActive] = useState(false);
//   const [outputStatus, setOutputStatus] = useState('idle'); // idle | assembling | ready
//   const [dashboardVisible, setDashboardVisible] = useState(false);
//   const [repProfile, setRepProfile] = useState(null); // raw rep_performance_profile
//   const [result, setResult] = useState(null); // final result payload (from 'result' SSE event)
//   const [error, setError] = useState(null);

//   const abortRef = useRef(null);

//   const reset = useCallback(() => {
//     setNodeStates(initialNodeStates);
//     setNodeDetails(initialNodeDetails);
//     setActiveSources(initialActiveSources);
//     setKeysShown(initialKeysShown);
//     setConnectorActive(false);
//     setOutputStatus('idle');
//     setDashboardVisible(false);
//     setRepProfile(null);
//     setResult(null);
//     setError(null);
//   }, []);

//   const markNodeActive = useCallback((node) => {
//     setNodeStates((prev) => {
//       const next = { ...prev };
//       NODES.forEach((n) => {
//         if (n < node && next[n] !== 'done') next[n] = 'done';
//       });
//       next[node] = 'active';
//       return next;
//     });
//     if (node >= 2) setConnectorActive(true);
//   }, []);

//   const markNodeDone = useCallback((node, eventData) => {
//     setNodeStates((prev) => ({ ...prev, [node]: 'done' }));

//     if (node === 1) {
//       const profile = extractRepProfile(eventData);
//       if (profile) {
//         setRepProfile(profile);
//         const { accounts, totalGongCalls } = normalizeRepProfile(profile);
//         setNodeDetails((d) => ({
//           ...d,
//           1: `Rep profile found · ${accounts.length} accounts loaded · ${totalGongCalls} gong calls`,
//         }));
//       } else {
//         setNodeDetails((d) => ({ ...d, 1: 'Rep profile loaded.' }));
//       }
//     }
//     if (node === 2) {
//       setActiveSources({ gong: true, sf: true, tr: true });
//       setKeysShown({ A: true, B: true });
//     }
//     if (node === 3) {
//       // Placeholder until AccountAnalysisAgent's done-event shape is known.
//       setNodeDetails((d) => ({ ...d, 3: 'Account analysis complete.' }));
//     }
//     if (node === 4) {
//       // Placeholder until SalesRepAgent / decision_action_agent's shape is known.
//       setNodeDetails((d) => ({ ...d, 4: 'Rep assessment complete.' }));
//     }
//   }, []);

//   const run = useCallback(
//     async (config = {}) => {
//       const { userId = 'test_user', salesRepId, repEmail, managerEmail } = config;

//       reset();
//       setPipelineStatus('running');

//       const controller = new AbortController();
//       abortRef.current = controller;

//       try {
//         await runPipeline({
//           userId,
//           salesRepId,
//           repEmail,
//           managerEmail,
//           signal: controller.signal,
//           onEvent: (evt) => {
//             const author = evt?.data?.author || '';
//             const node = agentToNode(author);

//             if (evt.type === 'progress') {
//               markNodeActive(node);
//             } else if (evt.type === 'done') {
//               markNodeDone(node, evt.data);
//             } else if (evt.type === 'result') {
//               setOutputStatus('assembling');
//               setResult(evt.data);
//               setOutputStatus('ready');
//               setDashboardVisible(true);
//               setPipelineStatus('done');
//             }
//           },
//         });
//       } catch (err) {
//         console.error('Pipeline run failed:', err);
//         setError(err.message || 'Pipeline failed');
//         setPipelineStatus('error');
//       }
//     },
//     [reset, markNodeActive, markNodeDone]
//   );

//   const cancel = useCallback(() => {
//     abortRef.current?.abort();
//   }, []);

//   return {
//     pipelineStatus,
//     nodeStates,
//     nodeDetails,
//     activeSources,
//     keysShown,
//     connectorActive,
//     outputStatus,
//     dashboardVisible,
//     repProfile,
//     result,
//     error,
//     run,
//     cancel,
//   };
// }


import { useCallback, useRef, useState } from 'react';
import { runPipeline } from '../api/pipelineClient';
import { normalizeRepProfile } from '../utils/adaptResult';

const NODES = [1, 2, 3];

const initialNodeStates = { 1: 'idle', 2: 'idle', 3: 'idle' };
const initialNodeDetails = { 1: null, 2: null, 3: null };

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

function extractRepProfile(eventData) {
  if (!eventData) return null;
  return (
    eventData.rep_performance_profile ??
    eventData.content?.rep_performance_profile ??
    eventData.output?.rep_performance_profile ??
    (eventData.assigned_accounts ? eventData : null)
  );
}

export function usePipeline() {
  const [pipelineStatus, setPipelineStatus] = useState('idle'); // idle | running | done | error
  const [nodeStates, setNodeStates] = useState(initialNodeStates);
  const [nodeDetails, setNodeDetails] = useState(initialNodeDetails);
  const [outputStatus, setOutputStatus] = useState('idle'); // idle | assembling | ready
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [repProfile, setRepProfile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setNodeStates(initialNodeStates);
    setNodeDetails(initialNodeDetails);
    setOutputStatus('idle');
    setDashboardVisible(false);
    setRepProfile(null);
    setResult(null);
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
      const profile = extractRepProfile(eventData);
      if (profile) {
        setRepProfile(profile);
        const { accounts, totalGongCalls } = normalizeRepProfile(profile);
        setNodeDetails((d) => ({
          ...d,
          1: `Rep profile found · ${accounts.length} accounts loaded · ${totalGongCalls} gong calls`,
        }));
      } else {
        setNodeDetails((d) => ({ ...d, 1: 'Rep profile loaded.' }));
      }
    }
    if (node === 2) {
      setNodeDetails((d) => ({ ...d, 2: 'Account analysis complete.' }));
    }
    if (node === 3) {
      setNodeDetails((d) => ({ ...d, 3: 'Actions executed.' }));
    }
  }, []);

  const run = useCallback(
    async (config = {}) => {
      const { userId = 'test_user', salesRepId, repEmail, managerEmail } = config;

      reset();
      setPipelineStatus('running');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await runPipeline({
          userId,
          salesRepId,
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
            } else if (evt.type === 'result') {
              setOutputStatus('assembling');
              setResult(evt.data);
              setOutputStatus('ready');
              setDashboardVisible(true);
              setPipelineStatus('done');
              setNodeStates((prev) => {
                const next = { ...prev };
                NODES.forEach((n) => { next[n] = 'done'; });
                return next;
              });
            }
          },
        });
      } catch (err) {
        console.error('Pipeline run failed:', err);
        setError(err.message || 'Pipeline failed');
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
    outputStatus,
    dashboardVisible,
    repProfile,
    result,
    error,
    run,
    cancel,
  };
}