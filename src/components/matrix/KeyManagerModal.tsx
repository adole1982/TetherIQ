import React from 'react';
import { X, Key, Check, ShieldCheck, ExternalLink, Zap } from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const KeyManagerModal: React.FC = () => {
  const { isKeyManagerOpen, setKeyManagerOpen, providers, updateProvider } = useTetherStore();

  if (!isKeyManagerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Key className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Provider API Key Vault</h2>
              <p className="text-xs text-slate-400">Keys are stored exclusively on your local desktop machine</p>
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
          {providers.map((p) => (
            <div key={p.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white">{p.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${p.isHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                    {p.isHealthy ? `Healthy (${p.lastPingMs}ms)` : 'Unconfigured'}
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

              {p.id === 'bedrock' ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400">AWS Region</label>
                    <input
                      type="text"
                      value={p.awsRegion || 'us-east-1'}
                      onChange={(e) => updateProvider(p.id, { awsRegion: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">AWS Access Key ID</label>
                    <input
                      type="text"
                      value={p.awsAccessKey || ''}
                      onChange={(e) => updateProvider(p.id, { awsAccessKey: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-slate-400">AWS Secret Access Key</label>
                    <input
                      type="password"
                      value={p.awsSecretKey || ''}
                      onChange={(e) => updateProvider(p.id, { awsSecretKey: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : p.id === 'ollama' ? (
                <div>
                  <label className="text-[11px] text-slate-400">Ollama Host URL</label>
                  <input
                    type="text"
                    value={p.baseUrl || 'http://localhost:11434'}
                    onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-slate-400">API Key / Token</label>
                  <input
                    type="password"
                    placeholder={`Enter ${p.name} key...`}
                    value={p.apiKey || ''}
                    onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={() => setKeyManagerOpen(false)}
            className="px-5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors shadow-sm shadow-cyan-500/20"
          >
            Save & Close Vault
          </button>
        </div>
      </div>
    </div>
  );
};
