import { useState, useRef, useCallback } from 'react';

// Dummy result shape — swap this out once a real Marketing Agent backend exists.
// Kept in the same "raw-ish" shape a real API might return, so
// normalizeMarketingResult() in adaptMarketingResult.js has something realistic to parse.
const DUMMY_RAW_RESULT = {
  campaign_analysis_results: [
    {
      campaign_name: 'Q3 Product Launch — Email',
      campaign_id: 'CMP-1042',
      channel: 'Email',
      performance_level: 'High',
      sentiment: 'Positive',
      is_underperforming: false,
      budget_reallocation_suggested: false,
      recommended_action: 'Scale send volume to lookalike segment; performance is above benchmark.',
      drivers: ['Open rate 34% above account average', 'Strong CTR on hero CTA', 'Low unsubscribe rate'],
    },
    {
      campaign_name: 'Retargeting — Paid Social',
      campaign_id: 'CMP-1088',
      channel: 'Paid Social',
      performance_level: 'Low',
      sentiment: 'Negative',
      is_underperforming: true,
      budget_reallocation_suggested: true,
      recommended_action: 'Pause underperforming ad sets and reallocate spend to the Email channel.',
      drivers: ['CPC up 42% week-over-week', 'Conversion rate below 0.6% threshold', 'Negative comment sentiment on 2 ads'],
    },
    {
      campaign_name: 'Spring Webinar Series',
      campaign_id: 'CMP-1103',
      channel: 'Webinar',
      performance_level: 'Medium',
      sentiment: 'Neutral',
      is_underperforming: false,
      budget_reallocation_suggested: false,
      recommended_action: 'Send a follow-up nurture sequence to registrants who did not attend.',
      drivers: ['Registration-to-attendance rate at 48%', 'Average watch time 22 minutes'],
    },
    {
      campaign_name: 'Loyalty Newsletter — Q3',
      campaign_id: 'CMP-1117',
      channel: 'Email',
      performance_level: 'Medium',
      sentiment: 'Positive',
      is_underperforming: false,
      budget_reallocation_suggested: true,
      recommended_action: 'Test a subject-line variant to lift the current 18% open rate.',
      drivers: ['Open rate steady but below 25% target', 'Click-through concentrated in 1 CTA block'],
    },
  ],
};

const initialNodeStates = { 1: 'idle', 2: 'idle', 3: 'idle' };

export function useMarketingPipeline() {
  const [pipelineStatus, setPipelineStatus] = useState('idle');
  const [nodeStates, setNodeStates] = useState(initialNodeStates);
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Simulated run — no real backend yet. Steps through node 1 -> 2 -> 3,
  // then reveals a dummy dashboard. Swap the setTimeout choreography for
  // real session creation / polling once the Marketing Agent API exists.
  const run = useCallback(() => {
    clearTimers();
    setError(null);
    setResult(null);
    setDashboardVisible(false);
    setNodeStates(initialNodeStates);
    setPipelineStatus('running');

    timers.current.push(
      setTimeout(() => setNodeStates((s) => ({ ...s, 1: 'running' })), 200),
      setTimeout(() => setNodeStates((s) => ({ ...s, 1: 'done', 2: 'running' })), 1400),
      setTimeout(() => setNodeStates((s) => ({ ...s, 2: 'done', 3: 'running' })), 2600),
      setTimeout(() => {
        setNodeStates((s) => ({ ...s, 3: 'done' }));
        setResult(DUMMY_RAW_RESULT);
        setPipelineStatus('done');
        setDashboardVisible(true);
      }, 3800)
    );
  }, []);

  return { pipelineStatus, nodeStates, dashboardVisible, result, error, run };
}