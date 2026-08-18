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
  CheckCircle2
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';
import { CLIENT_INTEGRATIONS } from '../../data/clientIntegrations';

export const QuickstartModal: React.FC = () => {
  const { isQuickstartOpen, setQuickstartOpen, providers, updateProvider, budget, updateBudgetLimits } = useTetherStore();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isQuickstartOpen) return null;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">60-Second Setup Wizard</h2>
              <p className="text-xs text-slate-400">Zero-config control plane setup for autonomous AI coding agents</p>
            </div>
          </div>
          <button
            onClick={() => setQuickstartOpen(false)}
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
              <span>3. Connect Client</span>
            </div>
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* STEP 1: API KEYS */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300">
                Enter your provider API keys. TetherIQ stores them locally in your secure vault and routes requests through <span className="font-mono text-cyan-400">127.0.0.1:4000</span>.
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
                        {p.id === 'ollama' ? 'Local engine auto-detect' : 'Cloud inference'}
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
                          placeholder={`Enter ${p.name} key...`}
                          value={p.apiKey || ''}
                          onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
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
                Protect yourself from runaway recursive loops or infinite tool loops. TetherIQ trips a hard circuit breaker (<span className="font-mono text-rose-400">HTTP 402</span>) if your budget cap is reached.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-white">
                    <ShieldAlert className="w-4 h-4 text-cyan-400" />
                    <span>Daily Spend Cap ($)</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={budget.dailyLimit}
                    onChange={(e) => updateBudgetLimits(parseFloat(e.target.value) || 10, budget.monthlyLimit)}
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
                    min="10"
                    max="5000"
                    step="10"
                    value={budget.monthlyLimit}
                    onChange={(e) => updateBudgetLimits(budget.dailyLimit, parseFloat(e.target.value) || 150)}
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
              <div className="text-xs text-slate-300">
                Choose your coding tool below and copy the 1-click command or configure automatically:
              </div>

              <div className="space-y-3">
                {CLIENT_INTEGRATIONS.slice(0, 3).map((client) => (
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
                            <span>Copy Command</span>
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
              onClick={() => setCurrentStep((prev) => Math.min(3, prev + 1) as any)}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors shadow-sm shadow-cyan-500/20"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setQuickstartOpen(false)}
              className="flex items-center space-x-1.5 px-5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-sm shadow-emerald-500/20"
            >
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              <span>Launch Control Plane</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
