import React, { useState, useEffect } from 'react';
import { X, Key, ShieldCheck, ExternalLink, Zap, DollarSign, Loader2, CheckCircle2, AlertTriangle, Trash2, Lock } from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';
import { BillingMode } from '../../types/routing';
import { listCredentialSummaries, setProviderCredential, deleteProviderCredential, CredentialSummary } from '../../services/vaultPersistence';

export const KeyManagerModal: React.FC = () => {
  const { isKeyManagerOpen, setKeyManagerOpen, providers, updateProvider } = useTetherStore();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { isValid: boolean | null; verification?: string; message: string; latencyMs?: number }>>({});
  
  // Component-local form inputs only (never stored in global state)
  const [localInputs, setLocalInputs] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<Record<string, CredentialSummary>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (isKeyManagerOpen) {
      listCredentialSummaries().then(list => {
        const map: Record<string, CredentialSummary> = {};
        for (const s of list) {
          map[s.provider] = s;
        }
        setSummaries(map);
      });
    }
  }, [isKeyManagerOpen]);

  if (!isKeyManagerOpen) return null;

  const handleSaveKey = async (providerId: string) => {
    const rawKey = localInputs[providerId]?.trim();
    if (!rawKey) return;

    setSavingId(providerId);
    try {
      const summary = await setProviderCredential(providerId, rawKey);
      if (summary) {
        setSummaries(prev => ({ ...prev, [providerId]: summary }));
        // Immediately clear local form state for security
        setLocalInputs(prev => ({ ...prev, [providerId]: '' }));
        // Restart sidecar to reload environment
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('restart_litellm_sidecar');
        }
      }
    } catch (e) {
      console.error('Failed to save key:', e);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteKey = async (providerId: string) => {
    try {
      await deleteProviderCredential(providerId);
      setSummaries(prev => ({
        ...prev,
        [providerId]: {
          provider: providerId,
          configured: false,
          display_hint: undefined,
          updated_at: Date.now()
        }
      }));
      setLocalInputs(prev => ({ ...prev, [providerId]: '' }));
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('restart_litellm_sidecar');
      }
    } catch (e) {
      console.error('Failed to delete key:', e);
    }
  };

  const handleTestKey = async (providerId: string, apiKey?: string) => {
    const keyToTest = apiKey || localInputs[providerId];
    const summary = summaries[providerId];

    if (!keyToTest && (!summary || !summary.configured) && providerId !== 'ollama') {
      setTestResults(prev => ({
        ...prev,
        [providerId]: { isValid: false, message: 'Please enter an API key first.' }
      }));
      return;
    }

    setTestingId(providerId);
    setTestResults(prev => ({
      ...prev,
      [providerId]: { isValid: null, message: 'Testing connection to provider...' }
    }));

    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke<any>('validate_provider_key', {
          provider: providerId,
          apiKey: keyToTest || ''
        });
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            isValid: data.isValid !== undefined ? data.isValid : null,
            verification: data.verification,
            message: data.message || 'Connection verified successfully.',
            latencyMs: data.latencyMs
          }
        }));
      } else {
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            isValid: true,
            verification: 'verified',
            message: 'Mock verification successful.',
            latencyMs: 120
          }
        }));
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          isValid: null,
          verification: 'unverified',
          message: `Could not reach local sidecar on :4000`
        }
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>OS Credential Vault</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Hardware/OS Protected
                </span>
              </h2>
              <p className="text-xs text-slate-400">Keys are stored in your OS Credential Vault and never exposed to the webview</p>
            </div>
          </div>
          <button
            onClick={() => setKeyManagerOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {providers.map((p) => {
            const currentTest = testResults[p.id];
            const isCurrentlyTesting = testingId === p.id;
            const summary = summaries[p.id];
            const isConfigured = summary?.configured || p.isHealthy;
            const localKey = localInputs[p.id] || '';

            return (
              <div key={p.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white">{p.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${isConfigured ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                      {isConfigured ? `Configured in OS Vault (${summary?.display_hint || '••••'})` : 'Unconfigured'}
                    </span>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <span className="text-[11px] text-slate-400">Enabled</span>
                    <input
                      type="checkbox"
                      checked={p.isEnabled}
                      onChange={(e) => updateProvider(p.id, { isEnabled: e.target.checked })}
                      className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500"
                    />
                  </label>
                </div>

                {/* Billing Mode Selector */}
                <div className="pt-2 border-t border-slate-800/50">
                  <label className="text-[11px] text-slate-400 flex items-center space-x-1.5 mb-1.5">
                    <DollarSign className="w-3 h-3 text-amber-400" />
                    <span>Billing Mode</span>
                  </label>
                  <select
                    value={p.billingMode || 'pay-per-token'}
                    onChange={(e) => updateProvider(p.id, { billingMode: e.target.value as BillingMode })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="pay-per-token">Pay-per-token (enforce budget caps)</option>
                    <option value="subscription-unlimited">Subscription (unlimited, no cost tracking)</option>
                  </select>
                </div>

                {/* API Key Input + Live Test Button */}
                {p.id === 'ollama' ? (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Ollama Host URL</span>
                      <a
                        href="https://ollama.com/download"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5"
                      >
                        <span>Download Ollama</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={p.baseUrl || 'http://localhost:11434'}
                        onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        onClick={() => handleTestKey(p.id, p.baseUrl)}
                        disabled={isCurrentlyTesting}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center space-x-1"
                      >
                        {isCurrentlyTesting ? <Loader2 className="w-3 h-3 animate-spin text-cyan-400" /> : <Zap className="w-3 h-3 text-cyan-400" />}
                        <span>Probe</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>API Key / Secret Token</span>
                      {p.id === 'anthropic' && (
                        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5">
                          <span>Get Anthropic Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {p.id === 'openai' && (
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5">
                          <span>Get OpenAI Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {p.id === 'openrouter' && (
                        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5">
                          <span>Get OpenRouter Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {p.id === 'groq' && (
                        <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5">
                          <span>Get Groq Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {p.id === 'deepseek' && (
                        <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5">
                          <span>Get DeepSeek Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <input
                          type="password"
                          placeholder={summary?.configured ? `Configured in OS Vault (${summary.display_hint})` : `Enter ${p.name} key...`}
                          value={localKey}
                          onChange={(e) => setLocalInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      
                      {localKey ? (
                        <button
                          onClick={() => handleSaveKey(p.id)}
                          disabled={savingId === p.id}
                          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-sm"
                        >
                          {savingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                          <span>Save Key</span>
                        </button>
                      ) : summary?.configured ? (
                        <button
                          onClick={() => handleDeleteKey(p.id)}
                          title="Remove key from OS Vault"
                          className="p-1.5 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}

                      <button
                        onClick={() => handleTestKey(p.id)}
                        disabled={isCurrentlyTesting || (!localKey && !summary?.configured)}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center space-x-1.5 disabled:opacity-40"
                      >
                        {isCurrentlyTesting ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                            <span>Testing...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span>Test</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Test Result Message */}
                {currentTest && (
                  <div className={`p-2 rounded text-[11px] font-mono flex items-center space-x-2 ${
                    currentTest.isValid === true
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : currentTest.isValid === false
                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  }`}>
                    {currentTest.isValid === true ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : currentTest.isValid === false ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span>{currentTest.message}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-xs text-slate-500">Zero-Trust: Webview never receives stored plaintext secrets.</span>
          <button
            onClick={() => setKeyManagerOpen(false)}
            className="px-5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-sm shadow-emerald-500/20"
          >
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
};
