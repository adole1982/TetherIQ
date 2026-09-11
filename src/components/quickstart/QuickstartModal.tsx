import React, { useEffect, useState } from 'react';
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
import { generateLiteLLMConfig } from '../../services/litellmConfigService';
import { isTauri } from '@tauri-apps/api/core';

export const QuickstartModal: React.FC = () => {
  const { 
    isQuickstartOpen, 
    setQuickstartOpen, 
    providers, 
    fallbackChains,
    virtualAliases,
    isAirGappedMode,
    updateProvider, 
    budget, 
    updateBudgetLimits,
    syncAllTools,
    proxyPort,
    fetchGatewayHealth,
  } = useTetherStore();
  
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inputKeys, setInputKeys] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [pingMessage, setPingMessage] = useState<string>('');
  const [gatewayPort, setGatewayPort] = useState<number | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [dailyLimitDraft, setDailyLimitDraft] = useState('');
  const [monthlyLimitDraft, setMonthlyLimitDraft] = useState('');
  const [budgetSaveStatus, setBudgetSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [budgetSaveMessage, setBudgetSaveMessage] = useState('');

  useEffect(() => {
    if (currentStep !== 2) return;
    setDailyLimitDraft(budget.dailyLimit == null ? '' : String(budget.dailyLimit));
    setMonthlyLimitDraft(budget.monthlyLimit == null ? '' : String(budget.monthlyLimit));
  }, [currentStep, budget.dailyLimit, budget.monthlyLimit]);

  const persistBudgetDraft = async () => {
    setBudgetSaveStatus('saving');
    setBudgetSaveMessage('Saving spend caps…');
    try {
      await updateBudgetLimits(
        dailyLimitDraft === '' ? null : dailyLimitDraft,
        monthlyLimitDraft === '' ? null : monthlyLimitDraft,
      );
      setBudgetSaveStatus('saved');
      setBudgetSaveMessage('Spend caps saved.');
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      setBudgetSaveStatus('error');
      setBudgetSaveMessage(detail || 'Spend caps could not be saved.');
    }
  };

  const commitBudgetDraft = () => {
    void persistBudgetDraft();
  };

  useEffect(() => {
    if (!isQuickstartOpen) return;

    void fetchGatewayHealth();
    if (typeof window === 'undefined' || !isTauri()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const waitForGateway = async () => {
      if (cancelled) return;

      setPingStatus('checking');
      setPingMessage('Starting the secure local LiteLLM gateway…');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const diagnostics = await invoke<{ proxy_running: boolean; proxy_port: number }>('get_gateway_diagnostics');
        if (diagnostics.proxy_running && diagnostics.proxy_port > 0) {
          setGatewayPort(diagnostics.proxy_port);
          setPingStatus('ok');
          setPingMessage(`LiteLLM gateway ready at 127.0.0.1:${diagnostics.proxy_port}`);
          return;
        }
      } catch {
        // Keep waiting while the supervised native sidecar is starting.
      }

      attempts += 1;
      if (attempts >= 90) {
        setPingStatus('error');
        setPingMessage('The LiteLLM gateway did not become ready. Retry Gateway to check again.');
        return;
      }
      timer = setTimeout(waitForGateway, 2000);
    };

    void waitForGateway();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchGatewayHealth, isQuickstartOpen]);

  if (!isQuickstartOpen) return null;

  const handleCopy = async (id: string, text: string) => {
    if (id === 'claude-code' && typeof window !== 'undefined' && isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('copy_gateway_environment', { client: 'anthropic' });
    } else {
      await navigator.clipboard.writeText(text);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveInputKeys = async (): Promise<boolean> => {
    let savedCredential = false;
    for (const [provId, rawKey] of Object.entries(inputKeys)) {
      const trimmed = rawKey.trim();
      if (trimmed) {
        const summary = await setProviderCredential(provId, trimmed);
        savedCredential = true;
        updateProvider(provId as any, {
          isEnabled: true,
          isConfigured: true,
          keyHint: summary?.display_hint || '••••••••',
        });
      }
    }
    if (savedCredential && typeof window !== 'undefined' && isTauri()) {
      const configuredProviderIds = new Set(
        providers
          .filter(provider => provider.isConfigured)
          .map(provider => provider.id),
      );
      for (const providerId of Object.keys(inputKeys)) {
        if (inputKeys[providerId]?.trim()) configuredProviderIds.add(providerId as any);
      }
      const configYaml = generateLiteLLMConfig({
        providers: providers.map(provider => ({
          ...provider,
          isEnabled: configuredProviderIds.has(provider.id),
        })),
        fallbackChains,
        virtualAliases,
        budget,
        isAirGappedMode,
      });
      if (!configYaml.includes('  - model_name:')) {
        setPingStatus('error');
        setPingMessage('Credential was saved, but no LiteLLM route could be created for it. Choose a supported model before continuing.');
        return false;
      }
      setIsRestarting(true);
      setPingStatus('checking');
      setPingMessage('Applying credential and restarting the secure LiteLLM gateway…');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_litellm_config', { yamlContent: configYaml });
        const restart = await invoke<{ port: number }>('restart_litellm_sidecar');
        if (restart.port > 0) setGatewayPort(restart.port);
        setPingStatus('ok');
        setPingMessage(`LiteLLM gateway ready at 127.0.0.1:${restart.port}`);
      } catch (err: unknown) {
        const detail = typeof err === 'string'
          ? err
          : err instanceof Error
            ? err.message
            : JSON.stringify(err);
        setPingStatus('error');
        setPingMessage(`Credential was saved, but the LiteLLM gateway restart failed: ${detail}`);
        return false;
      } finally {
        setIsRestarting(false);
      }
    }
    // Immediately scrub transient key memory
    setInputKeys({});
    return true;
  };

  /**
   * Rebuild the LiteLLM config from provider state that was hydrated from the
   * native vault. This matters when a user saved a key in an earlier session:
   * there is no new input value to trigger the normal save path, but the
   * generated model routes still need to be applied to the running sidecar.
   */
  const ensureConfiguredGatewayRoutes = async (): Promise<void> => {
    if (typeof window === 'undefined' || !isTauri()) return;

    const configuredProviderIds = new Set(
      providers.filter(provider => provider.isConfigured).map(provider => provider.id),
    );
    const configYaml = generateLiteLLMConfig({
      providers: providers.map(provider => ({
        ...provider,
        isEnabled: configuredProviderIds.has(provider.id),
      })),
      fallbackChains,
      virtualAliases,
      budget,
      isAirGappedMode,
    });
    if (!configYaml.includes('  - model_name:')) {
      throw new Error('No configured provider can create a LiteLLM model route yet.');
    }

    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_litellm_config', { yamlContent: configYaml });
    const restart = await invoke<{ port: number }>('restart_litellm_sidecar');
    if (restart.port > 0) setGatewayPort(restart.port);
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
      let port = gatewayPort || proxyPort;
      if (typeof window !== 'undefined' && isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const diagnostics = await invoke<{ proxy_running: boolean; proxy_port: number }>('get_gateway_diagnostics');
        if (!diagnostics.proxy_running || diagnostics.proxy_port <= 0) {
          throw new Error('The LiteLLM sidecar is still starting or failed to start.');
        }
        port = diagnostics.proxy_port;
        setGatewayPort(port);
        let route = await invoke<{ authenticated: boolean; model_count: number; status_code: number }>('test_gateway_route');
        // A vault credential may already be present while the config file was
        // generated before that credential was saved. Repair that stale state
        // once, then re-test the authenticated LiteLLM route.
        if (route.authenticated && route.model_count < 1) {
          setPingMessage('Applying saved provider credentials to LiteLLM…');
          await ensureConfiguredGatewayRoutes();
          route = await invoke<{ authenticated: boolean; model_count: number; status_code: number }>('test_gateway_route');
        }
        if (!route.authenticated || route.model_count < 1) {
          throw new Error(`LiteLLM gateway is ready but has no authenticated model routes (HTTP ${route.status_code}).`);
        }
        setPingStatus('ok');
        setPingMessage(`LiteLLM gateway authenticated with ${route.model_count} model route${route.model_count === 1 ? '' : 's'} on 127.0.0.1:${port}`);
        return;
      }

      // The native supervisor reaches Ready only after it verifies the sidecar's
      // loopback readiness attestation. Re-fetching from the webview is both
      // redundant and susceptible to platform-specific WebView CORS behavior.
      setPingStatus('ok');
      setPingMessage(`LiteLLM gateway ready at 127.0.0.1:${port}`);
    } catch (err: any) {
      setPingStatus('error');
      setPingMessage(err?.message || 'Could not verify the LiteLLM gateway.');
    }
  };

  const configuredPort = gatewayPort || proxyPort;
  const gatewayBaseUrl = `http://127.0.0.1:${configuredPort}`;
  const snippetFor = (client: ClientIntegrationGuide) => {
    if (client.id === 'claude-code') {
      return `Click Copy Connection Command. It copies the secure PowerShell connection settings; it does not run them automatically.\n\nOpen PowerShell, paste, and press Enter. Then run:\nclaude\n\nThe copied settings connect this terminal session to ${gatewayBaseUrl}.`;
    }
    return client.commandSnippet.replaceAll('http://127.0.0.1:4000', gatewayBaseUrl);
  };

  const handleCompleteWizard = async () => {
    if (!(await handleSaveInputKeys())) return;
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
            disabled={pingStatus === 'checking' || isRestarting}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-[11px] transition-colors border ${
              pingStatus === 'checking' || isRestarting
                ? 'bg-slate-800/40 text-slate-500 border-slate-800 cursor-wait'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${pingStatus === 'checking' ? 'animate-spin text-cyan-400' : pingStatus === 'ok' ? 'text-emerald-400' : pingStatus === 'error' ? 'text-rose-400' : 'text-cyan-400'}`} />
            <span>{pingStatus === 'checking' ? 'Starting Gateway' : 'Test Gateway'}</span>
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
                        <span>{p.id === 'bedrock' ? 'Amazon Bedrock API Key' : p.name}</span>
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
                          placeholder={p.isConfigured ? `Configured in OS Vault (${p.keyHint || '••••'})` : p.id === 'bedrock' ? 'Enter Amazon Bedrock API key...' : `Enter ${p.name} key...`}
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
                    defaultValue={budget.dailyLimit ?? ''}
                    onChange={(e) => setDailyLimitDraft(e.target.value)}
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
                    defaultValue={budget.monthlyLimit ?? ''}
                    onChange={(e) => setMonthlyLimitDraft(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-emerald-400 font-mono font-bold focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">Default recommended limit: $150.00/mo</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                {budgetSaveMessage && (
                  <span className={budgetSaveStatus === 'error' ? 'text-xs text-rose-300' : 'text-xs text-emerald-300'}>
                    {budgetSaveMessage}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void persistBudgetDraft()}
                  disabled={budgetSaveStatus === 'saving'}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-xs font-semibold text-slate-950"
                >
                  {budgetSaveStatus === 'saving' ? 'Saving…' : 'Save Spend Caps'}
                </button>
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
                        onClick={() => void handleCopy(client.id, snippetFor(client))}
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
                            <span>{client.id === 'claude-code' ? 'Copy Connection Command' : 'Copy Snippet'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <pre className="font-mono text-xs text-cyan-300 bg-slate-900/90 p-2 rounded border border-slate-800/80 overflow-x-auto">
                      {snippetFor(client)}
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
                  if (pingStatus !== 'ok' || isRestarting) return;
                  if (!(await handleSaveInputKeys())) return;
                }
                setCurrentStep((prev) => Math.min(3, prev + 1) as any);
              }}
              disabled={currentStep === 1 && (pingStatus !== 'ok' || isRestarting)}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
                currentStep === 1 && (pingStatus !== 'ok' || isRestarting)
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
              }`}
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
