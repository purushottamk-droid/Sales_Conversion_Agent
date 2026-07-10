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
import { normalizeAccountAnalysis, normalizeActions } from './utils/adaptResult';

// Hardcoded per the current test setup — swap for real fields once
// rep_email / manager_email come from an actual rep-picker/CRM lookup.
const REP_EMAIL = 'sayali.mahulkar@atgeirsolutions.com';
const MANAGER_EMAIL = 'sayali.mahulkar@atgeirsolutions.com';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const pipeline = usePipeline();
  const [repName, setRepName] = useState('');

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
      userId: 'test_user',
      salesRepName: repName.trim(),
      repEmail: REP_EMAIL,
      managerEmail: MANAGER_EMAIL,
    });
  };

  // Real, confirmed shape from GET /agent/result -> account_analysis_results.
  // Drives the Dashboard's summary stats + account cards.
  const analysis = normalizeAccountAnalysis(pipeline.result?.account_analysis_results);

  // Real, confirmed shape: actions_taken is a ```json-fenced string;
  // normalizeActions strips fences and parses it.
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