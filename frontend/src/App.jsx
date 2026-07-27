import { useState, useRef } from 'react';
import AmbientBackground from './components/AmbientBackground';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Pipeline from './components/Pipeline';
import Dashboard from './components/Dashboard';
import EmailModal from './components/EmailModal';
import Toast from './components/Toast';
import ChatWidget from './components/ChatWidget';
import NpsHero from './components/NpsHero';
import NpsPipeline from './components/NpsPipeline';
import NpsDashboard from './components/NpsDashboard';
import MarketingHero from './components/MarketingHero';
import MarketingPipeline from './components/MarketingPipeline';
import MarketingDashboard from './components/MarketingDashboard';
import { useTheme } from './hooks/useTheme';
import { usePipeline } from './hooks/usePipeline';
import { useNpsPipeline } from './hooks/useNpsPipeline';
import { useMarketingPipeline } from './hooks/useMarketingPipeline';
import { downloadReport, emailReport } from './utils/report';
import { normalizeAccountAnalysis, normalizeActions } from './utils/adaptResult';
import { normalizeNpsResult } from './utils/adaptNpsResult';
import { normalizeMarketingResult } from './utils/adaptMarketingResult';

// Hardcoded per the current test setup — swap for real fields once
// rep_email / manager_email come from an actual rep-picker/CRM lookup.
const REP_EMAIL = 'sayali.mahulkar@atgeirsolutions.com';
const MANAGER_EMAIL = 'sayali.mahulkar@atgeirsolutions.com';
const USER_ID = 'test_user';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const pipeline = usePipeline();               // Sales Conversion Agent — separate backend
  const npsPipeline = useNpsPipeline();          // NPS Improvement Agent — separate backend
  const marketingPipeline = useMarketingPipeline(); // Marketing Agent — dummy/simulated for now
  const [repName, setRepName] = useState('');
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'nps' | 'marketing'

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false });
  const toastTimer = useRef(null);

  const showToast = (message) => {
    clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3200);
  };

  const handleRun = () => {
    if (!repName.trim()) {
      showToast('Enter a sales rep name first');
      return;
    }
    pipeline.run({
      repName: repName.trim(),
      repEmail: REP_EMAIL,
      managerEmail: MANAGER_EMAIL,
    });
  };

  const handleRunNps = () => {
    npsPipeline.run({ userId: USER_ID });
  };

  const handleRunMarketing = () => {
    marketingPipeline.run();
  };

  // --- Sales tab data ---
  const analysis = normalizeAccountAnalysis({
    ...pipeline.result?.account_analysis_results,
    current_target_arr: pipeline.result?.current_target_arr,
    current_month_arr_achieved: pipeline.result?.current_month_arr_achieved,
    forecasted_arr_this_month: pipeline.result?.forecasted_arr_this_month,
  });
  const actionsTaken = normalizeActions(pipeline.result?.actions_taken);

  const handleDownload = () => {
    if (!analysis) return;
    downloadReport(repName, analysis.accounts, analysis.summary, actionsTaken);
    showToast('Report downloaded');
  };

  const handleEmailSend = (email) => {
    if (!analysis) return;
    emailReport(email, repName, analysis.accounts, analysis.summary, actionsTaken);
    setEmailModalOpen(false);
    showToast(`Email client opened for ${email}`);
  };

  const chatAvailable = activeTab === 'sales' && pipeline.pipelineStatus === 'done' && !!pipeline.sessionId;

  // --- NPS tab data ---
  const npsResult = normalizeNpsResult(npsPipeline.result);

  // --- Marketing tab data ---
  const marketingResult = normalizeMarketingResult(marketingPipeline.result);

  // --- Navbar status: reflects whichever tab is active ---
  const navbarStatus =
    activeTab === 'sales'
      ? pipeline.pipelineStatus
      : activeTab === 'nps'
      ? npsPipeline.pipelineStatus
      : marketingPipeline.pipelineStatus;

  return (
    <>
      <AmbientBackground />
      <Navbar
        theme={theme}
        toggleTheme={toggleTheme}
        pipelineStatus={navbarStatus}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="relative z-10 max-w-[1180px] mx-auto px-7 pt-36 pb-20">
        {activeTab === 'sales' && (
          <>
            <Hero
              repName={repName}
              setRepName={setRepName}
              onRun={handleRun}
              disabled={pipeline.pipelineStatus === 'running'}
            />

            <Pipeline
              nodeStates={pipeline.nodeStates}
              nodeDetails={pipeline.nodeDetails}
              outputStatus={pipeline.outputStatus}
            />

            {pipeline.error && (
              <div className="mt-4 text-sm text-red-500 text-center">
                Pipeline error: {pipeline.error}
              </div>
            )}

            <Dashboard
              visible={pipeline.dashboardVisible}
              repName={repName}
              summary={analysis?.summary}
              accounts={analysis?.accounts ?? []}
              actionsTaken={actionsTaken}
              onDownload={handleDownload}
              onEmailClick={() => setEmailModalOpen(true)}
            />
          </>
        )}

        {activeTab === 'nps' && (
          <>
            <NpsHero onRun={handleRunNps} disabled={npsPipeline.pipelineStatus === 'running'} />

            <NpsPipeline
              nodeStates={npsPipeline.nodeStates}
              resultReady={npsPipeline.dashboardVisible}
            />

            {npsPipeline.error && (
              <div className="mt-4 text-sm text-red-500 text-center">
                NPS pipeline error: {npsPipeline.error}
              </div>
            )}

            <NpsDashboard visible={npsPipeline.dashboardVisible} result={npsResult} />
          </>
        )}

        {activeTab === 'marketing' && (
          <>
            <MarketingHero
              onRun={handleRunMarketing}
              disabled={marketingPipeline.pipelineStatus === 'running'}
            />

            <MarketingPipeline
              nodeStates={marketingPipeline.nodeStates}
              resultReady={marketingPipeline.dashboardVisible}
            />

            {marketingPipeline.error && (
              <div className="mt-4 text-sm text-red-500 text-center">
                Marketing pipeline error: {marketingPipeline.error}
              </div>
            )}

            <MarketingDashboard
              visible={marketingPipeline.dashboardVisible}
              result={marketingResult}
            />
          </>
        )}
      </main>

      <EmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        onSend={handleEmailSend}
      />

      <Toast message={toast.message} visible={toast.visible} />

      {chatAvailable && <ChatWidget sessionId={pipeline.sessionId} userId={USER_ID} />}
    </>
  );
}