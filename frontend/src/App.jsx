import { useState, useRef } from 'react';
import AmbientBackground from './components/AmbientBackground';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Pipeline from './components/Pipeline';
import Dashboard from './components/Dashboard';
import EmailModal from './components/EmailModal';
import Toast from './components/Toast';
import { useTheme } from './hooks/useTheme';
import { usePipeline } from './hooks/usePipeline';
import { downloadReport, emailReport } from './utils/report';
import { normalizeRepProfile, normalizeActions } from './utils/adaptResult';

// Hardcoded per the current test setup — swap for real rep-picker fields
// once account selection is wired to actual CRM data.
const SALES_REP_ID = '005DMO000000000300000';
const REP_EMAIL = 'kakadetalent@gmail.com';
const MANAGER_EMAIL = 'kakade007k@gmail.com';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const pipeline = usePipeline();
  const [repName, setRepName] = useState('005DMO000000000300000');

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false });
  const toastTimer = useRef(null);

  const showToast = (message) => {
    clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3200);
  };

  const handleRun = () => {
    pipeline.run({
      userId: 'test_user',
      salesRepId: SALES_REP_ID,
      repEmail: REP_EMAIL,
      managerEmail: MANAGER_EMAIL,
    });
  };

  // Real, confirmed shape from DataCollectionAgent (rep_performance_profile).
  // This drives the Dashboard's summary stats + account cards.
  const profile = normalizeRepProfile(pipeline.repProfile);

  // Guessed shape for the final decision_action_agent output — tighten
  // once you share a sample of /agent/result's actions_taken.
  const actionsTaken = normalizeActions(pipeline.result?.actions_taken);

  const handleDownload = () => {
    if (!profile) return;
    downloadReport(repName, profile.accounts, profile.summary, actionsTaken);
    showToast('Report downloaded');
  };

  const handleEmailSend = (email) => {
    if (!profile) return;
    emailReport(email, repName, profile.accounts, profile.summary, actionsTaken);
    setEmailModalOpen(false);
    showToast(`Email client opened for ${email}`);
  };

  return (
    <>
      <AmbientBackground />
      <Navbar theme={theme} toggleTheme={toggleTheme} pipelineStatus={pipeline.pipelineStatus} />

      <main className="relative z-10 max-w-[1180px] mx-auto px-7 pt-28 pb-20">
        <Hero
          repName={repName}
          setRepName={setRepName}
          onRun={handleRun}
          disabled={pipeline.pipelineStatus === 'running'}
        />

        <Pipeline
          nodeStates={pipeline.nodeStates}
          nodeDetails={pipeline.nodeDetails}
          activeSources={pipeline.activeSources}
          keysShown={pipeline.keysShown}
          connectorActive={pipeline.connectorActive}
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
          summary={profile?.summary}
          accounts={profile?.accounts ?? []}
          totalGongCalls={profile?.totalGongCalls ?? 0}
          actionsTaken={actionsTaken}
          onDownload={handleDownload}
          onEmailClick={() => setEmailModalOpen(true)}
        />
      </main>

      <EmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        onSend={handleEmailSend}
      />

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}