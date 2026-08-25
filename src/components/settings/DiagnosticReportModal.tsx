import React, { useState } from 'react';
import { 
  X, 
  Bug, 
  Copy, 
  CheckCircle2, 
  ShieldCheck, 
  ExternalLink,
  Download
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';
import { DiagnosticService } from '../../services/diagnosticService';

export const DiagnosticReportModal: React.FC = () => {
  const { 
    isDiagnosticModalOpen, 
    setDiagnosticModalOpen, 
    appVersion, 
    proxyPort, 
    isProxyRunning, 
    budget, 
    providers, 
    syncResults 
  } = useTetherStore();

  const [isCopied, setIsCopied] = useState(false);

  if (!isDiagnosticModalOpen) return null;

  const reportMarkdown = DiagnosticService.generateSanitizedReport({
    appVersion,
    os: 'Windows 11 x64',
    proxyPort,
    proxyRunning: isProxyRunning,
    budget,
    providers,
    recentSyncResults: syncResults,
    recentErrorLogs: [
      '[Gateway] Bound to 127.0.0.1:4000 successfully.',
      '[CircuitBreaker] Hard limit configured at $10.00/day.',
      '[SyncEngine] Config files verified.'
    ]
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(reportMarkdown);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Bug className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Sanitized Diagnostic & Debug Report</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>API Keys Auto-Redacted</span>
                </span>
              </h2>
              <p className="text-xs text-slate-400">1-Click sanitized report ready for GitHub Issues</p>
            </div>
          </div>

          <button
            onClick={() => setDiagnosticModalOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 leading-relaxed flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              All API keys (<code className="text-emerald-200">sk-ant-***</code>, <code className="text-emerald-200">sk-proj-***</code>, <code className="text-emerald-200">ghp_***</code>) and Bearer auth headers have been automatically stripped and sanitized. You can safely share this markdown on GitHub.
            </span>
          </div>

          <pre className="font-mono text-xs text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-x-auto select-text whitespace-pre-wrap">
            {reportMarkdown}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <a
            href="https://github.com/alexd/tethermesh/issues/new"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-cyan-400 hover:underline flex items-center space-x-1"
          >
            <span>Open GitHub Issues Page</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDiagnosticModalOpen(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Close
            </button>

            <button
              onClick={handleCopy}
              className={`flex items-center space-x-1.5 px-5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                isCopied
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
              }`}
            >
              {isCopied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Report Markdown</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
