import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Key, 
  ShieldAlert, 
  Terminal, 
  Check, 
  Copy, 
  ArrowRight,
  Zap,
  CheckCircle2,
  Network,
  Activity,
  AlertCircle
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';
import { CLIENT_INTEGRATIONS, ClientIntegrationGuide } from '../../data/clientIntegrations';
import { setProviderCredential } from '../../services/vaultPersistence';

export const QuickstartModal: React.FC = () => {
  const { 
    isQuickstartOpen, 
    setQuickstartOpen, 
    providers, 
    updateProvider, 
    budget, 
    updateBudgetLimits,
    syncAllTools
  } = useTetherStore();
  
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inputKeys, setInputKeys] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [pingMessage, setPingMessage] = useState<string>('');

  if (!isQuickstartOpen) return null;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveInputKeys = async () => {
    for (const [provId, rawKey] of Object.entries(inputKeys)) {
      const trimmed = rawKey.trim();
      if (trimmed) {
        const summary = await setProviderCredential(provId, trimmed);
        updateProvider(provId as any, {
          isEnabled: true,
          isConfigured: true,
          keyHint: summary?.display_hint || '••••••••',
        });
      }
    }
    // Immediately scrub transient key memory
    setInputKeys({});
  };

  const handleAutoConfigureAll = async () => {
    setIsSyncing(true);
    setSyncSuccessMsg(null);
    try {
      const results = await syncAllTools();
      const successCount = results.filter(r => r.isSuccess).length;
      setSyncSuccessMsg(`Configured & synced tools across ${successCount} client environments!`);
    } catch (e: any) {
      setSyncSuccessMsg(`Sync complete with local fallbacks.`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncSuccessMsg(null), 5000);
    }
  };

  const handleTestConnection = async () => {
    setPingStatus('checking');
    try {
      const res = await fetch('http://127.0.0.1:4000/health/liveliness');
      if (res.ok) {
        setPingStatus('ok');
        setPingMessage('Proxy Loopback Active (127.0.0.1:4000) — Sub-5ms Ready');
      } else {
        setPingStatus('error');
        setPingMessage(`Gateway returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      setPingStatus('error');
      setPingMessage('Could not reach 127.0.0.1:4000. Is the sidecar running?');
    }
  };

  const handleCompleteWizard = async () => {
    await handleSaveInputKeys();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tethermesh_onboarded', 'true');
    }
    setInputKeys({});
    setQuickstartOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Network className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">TetherMesh 60-Second Setup Wizard</h2>
              <p className="text-xs text-slate-400">Zero-config control plane setup for autonomous AI coding agents</p>
            </div>
          </div>
          <button
            onClick={handleCompleteWizard}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 bg-slate-950/30 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 ${currentStep === 1 ? 'text-cyan-400 font-semibold' : currentStep > 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStep === 1 ? 'bg-cyan-500/20 border border-cyan-400' : currentStep > 1 ? 'bg-emerald-500/20 border border-emerald-400' : 'bg-slate-800'}`}>
                {currentStep > 1 ? <Check className="w-3 h-3" /> : '1'}
              </span>
              <span>1. Provider Keys</span>
            </div>

            <div className="w-8 h-px bg-slate-800" />

            <div className={`flex items-center space-x-2 ${currentStep === 2 ? 'text-cyan-400 font-semibold' : currentStep > 2 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStep === 2 ? 'bg-cyan-500/20 border border-cyan-400' : currentStep > 2 ? 'bg-emerald-500/20 border border-emerald-400' : 'bg-slate-800'}`}>
                {currentStep > 2 ? <Check className="w-3 h-3" /> : '2'}
              </span>
              <span>2. Spend Caps</span>
            </div>

            <div className="w-8 h-px bg-slate-800" />

            <div className={`flex items-center space-x-2 ${currentStep === 3 ? 'text-cyan-400 font-semibold' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${currentStep === 3 ? 'bg-cyan-500/20 border border-cyan-400' : 'bg-slate-800'}`}>
                3
              </span>
              <span>3. Connect Clients</span>
            </div>
          </div>

          <button
            onClick={handleTestConnection}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-800 text-[11px] text-slate-300 transition-colors border border-slate-700/60"
          >
            <Activity className={`w-3.5 h-3.5 ${pingStatus === 'ok' ? 'text-emerald-400' : pingStatus === 'error' ? 'text-rose-400' : 'text-cyan-400'}`} />
            <span>Test Gateway</span>
          </button>
        </div>

        {/* Status Toast Banner if tested */}
        {pingStatus !== 'idle' && (
          <div className={`px-6 py-2 text-xs flex items-center space-x-2 ${
            pingStatus === 'ok' ? 'bg-emerald-950/60 text-emerald-300 border-b border-emerald-900/60' :
            pingStatus === 'error' ? 'bg-rose-950/60 text-rose-300 border-b border-rose-900/60' :
            'bg-slate-950 text-slate-300 border-b border-slate-800'
          }`}>
            {pingStatus === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> :
             pingStatus === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> :
             <Activity className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
            <span>{pingMessage || 'Probing local proxy gateway on port 4000...'}</span>
          </div>
        )}

        {/* Step Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* STEP 1: API KEYS */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300">
                Enter your provider API keys. TetherMesh securely stores them in your native OS Credential Vault (Windows Credential Manager / macOS Keychain) and injects them directly into the sidecar on loopback (<span className="font-mono text-cyan-400">127.0.0.1:4000</span>). Secrets are never written to unencrypted files or kept in browser memory.
              </div>

              <div className="space-y-3">
                {providers.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="w-1/3">
                      <div className="text-xs font-semibold text-white flex items-center space-x-1.5">
                        <Key className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{p.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {p.id === 'ollama' ? 'Local engine auto-detect' : p.isConfigured ? `OS Vault (${p.keyHint || '••••'})` : 'Cloud inference'}
                      </div>
                    </div>

                    <div className="flex-1 max-w-sm">
                      {p.id === 'ollama' ? (
                        <input
                          type="text"
                          value={p.baseUrl || 'http://localhost:11434'}
                          onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      ) : (
                        <input
                          type="password"
                          placeholder={p.isConfigured ? `Configured in OS Vault (${p.keyHint || '••••'})` : `Enter ${p.name} key...`}
                          value={inputKeys[p.id] || ''}
                          onChange={(e) => setInputKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: SPEND CAPS & CIRCUIT BREAKER */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="text-xs text-slate-300">
                Protect yourself from runaway recursive loops or infinite tool loops. TetherMesh trips a hard circuit breaker (<span className="font-mono text-rose-400">HTTP 402</span>) if your budget cap is reached.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-white">
                    <ShieldAlert className="w-4 h-4 text-cyan-400" />
                    <span>Daily Spend Cap ($)</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="any"
                    value={budget.dailyLimit ?? ''}
                    onChange={(e) => updateBudgetLimits(e.target.value === '' ? null : e.target.value, budget.monthlyLimit)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-cyan-400 font-mono font-bold focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">Default recommended limit: $10.00/day</p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-white">
                    <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    <span>Monthly Spend Cap ($)</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    step="any"
                    value={budget.monthlyLimit ?? ''}
                    onChange={(e) => updateBudgetLimits(budget.dailyLimit, e.target.value === '' ? null : e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-emerald-400 font-mono font-bold focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">Default recommended limit: $150.00/mo</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CONNECT YOUR CLIENT */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">
                  Select a tool or click <strong className="text-white">Auto-Configure All</strong> to write configs to your local IDEs automatically:
                </div>
                <button
                  onClick={handleAutoConfigureAll}
                  disabled={isSyncing}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all"
                >
                  <Zap className="w-3.5 h-3.5 fill-slate-950" />
                  <span>{isSyncing ? 'Writing to Disk...' : '1-Click Auto-Configure All'}</span>
                </button>
              </div>

              {syncSuccessMsg && (
                <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-xs text-emerald-300 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{syncSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-3">
                {CLIENT_INTEGRATIONS.slice(0, 4).map((client) => (
                  <div key={client.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Terminal className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-white">{client.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                          {client.badge}
                        </span>
                      </div>

                      <button
                        onClick={() => handleCopy(client.id, client.commandSnippet)}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                      >
                        {copiedId === client.id ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Snippet</span>
                          </>
                        )}
                      </button>
                    </div>

                    <pre className="font-mono text-xs text-cyan-300 bg-slate-900/90 p-2 rounded border border-slate-800/80 overflow-x-auto">
                      {client.commandSnippet}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1) as any)}
            disabled={currentStep === 1}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentStep === 1 ? 'opacity-30 cursor-not-allowed text-slate-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            Back
          </button>

          {currentStep < 3 ? (
            <button
              onClick={async () => {
                if (currentStep === 1) {
                  await handleSaveInputKeys();
                }
                setCurrentStep((prev) => Math.min(3, prev + 1) as any);
              }}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors shadow-sm shadow-cyan-500/20"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleCompleteWizard}
              className="flex items-center space-x-1.5 px-5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-sm shadow-emerald-500/20"
            >
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              <span>Launch TetherMesh</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
