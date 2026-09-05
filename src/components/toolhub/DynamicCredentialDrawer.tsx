import React, { useState, useEffect } from 'react';
import { 
  X, 
  Layers, 
  Check, 
  Zap, 
  ShieldCheck, 
  Key, 
  Terminal, 
  Code2, 
  Compass, 
  Bot, 
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';
import { TARGET_CLIENTS_META } from '../../data/mcpCatalogData';
import { TargetClientId } from '../../types/tools';

export const DynamicCredentialDrawer: React.FC = () => {
  const { 
    selectedToolForDrawer, 
    setSelectedToolForDrawer, 
    installedTools, 
    saveToolConfig,
    revokeToolConfig
  } = useTetherStore();

  const [selectedClients, setSelectedClients] = useState<TargetClientId[]>(['cursor', 'claude-code']);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedToolForDrawer) {
      const existing = installedTools.find(t => t.toolId === selectedToolForDrawer.id);
      if (existing) {
        setSelectedClients(existing.targetClients);
      } else {
        setSelectedClients(['cursor', 'windsurf', 'claude-code', 'antigravity']);
      }
      setCredentials({});
      setDrawerError(null);
    } else {
      setCredentials({});
      setDrawerError(null);
    }
  }, [selectedToolForDrawer, installedTools]);

  if (!selectedToolForDrawer) return null;

  const handleClientToggle = (clientId: TargetClientId) => {
    if (selectedClients.includes(clientId)) {
      setSelectedClients(selectedClients.filter(id => id !== clientId));
    } else {
      setSelectedClients([...selectedClients, clientId]);
    }
  };

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    setCredentials({});
    setDrawerError(null);
    setSelectedToolForDrawer(null);
  };

  const handleSaveAndInject = async () => {
    setIsSaving(true);
    setDrawerError(null);
    try {
      await saveToolConfig(selectedToolForDrawer.id, credentials, selectedClients, true);
      setIsSavedSuccess(true);
      setTimeout(() => {
        setIsSavedSuccess(false);
        setSelectedToolForDrawer(null);
      }, 1200);
    } catch (err: any) {
      console.error('[ToolDrawer] Save error occurred:', err);
      setDrawerError(err?.message || 'Failed to configure tool');
    } finally {
      setIsSaving(false);
      setCredentials({});
    }
  };

  const isCurrentlyInstalled = installedTools.some(t => t.toolId === selectedToolForDrawer.id);

  const handleRevoke = async () => {
    if (!window.confirm(`Are you sure you want to revoke and disconnect ${selectedToolForDrawer.name}? This will remove it from all IDE configs and delete its credentials from the OS vault.`)) {
      return;
    }
    setIsRevoking(true);
    setDrawerError(null);
    try {
      await revokeToolConfig(selectedToolForDrawer.id);
      setSelectedToolForDrawer(null);
    } catch (err: any) {
      console.error('[ToolDrawer] Revoke error occurred:', err);
      setDrawerError(err?.message || 'Failed to revoke tool');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>{selectedToolForDrawer.name}</span>
                {selectedToolForDrawer.official && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Official
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">{selectedToolForDrawer.description}</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert Banner */}
        {drawerError && (
          <div className="px-6 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span>⚠️</span>
              <span className="font-mono">{drawerError}</span>
            </div>
            <button
              onClick={() => setDrawerError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-semibold underline ml-3"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Section 1: Multi-Client Target Matrix */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Target Clients & IDEs (Non-Destructive Injections)
              </label>
              <span className="text-[11px] text-slate-500">Select all clients to receive this tool</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {TARGET_CLIENTS_META.map((client) => {
                const isSelected = selectedClients.includes(client.id);
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleClientToggle(client.id)}
                    className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-4 h-4 rounded flex items-center justify-center text-xs ${
                        isSelected ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 border border-slate-700'
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold">{client.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{client.defaultConfigPathWin}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Required Credentials Dynamic Drawer */}
          <div className="space-y-3 pt-3 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Required Credentials & Environment Parameters</span>
              </label>
              {selectedToolForDrawer.docsUrl && (
                <a
                  href={selectedToolForDrawer.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-400 hover:underline flex items-center space-x-1"
                >
                  <span>API Docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {selectedToolForDrawer.fields.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400">
                This tool operates without required secret keys or utilizes system defaults.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedToolForDrawer.fields.map((field) => {
                  const currentValue = credentials[field.key] || '';
                  const hasValue = currentValue.trim().length > 0;
                  const isInvalid = hasValue && field.validationRegex && !new RegExp(field.validationRegex).test(currentValue);

                  return (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-cyan-300 font-semibold">{field.key}</span>
                          {field.helpUrl && (
                            <a
                              href={field.helpUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5"
                            >
                              <span>Get Token</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                        {field.required ? (
                          <span className="text-[10px] text-rose-400 font-medium">Required</span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-medium">Optional</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">{field.description}</p>
                      {(() => {
                        const existingTool = installedTools.find(t => t.toolId === selectedToolForDrawer.id);
                        const hint = existingTool?.fieldHints?.[field.key];
                        const placeholderText = hint ? `Configured in OS Vault (${hint})` : (field.placeholder || `Enter ${field.label}...`);
                        return (
                          <input
                            type={field.type === 'password' ? 'password' : 'text'}
                            placeholder={placeholderText}
                            value={currentValue}
                            onChange={(e) => {
                              let val = e.target.value;
                              // Automatically normalize Windows backslashes in paths to forward slashes
                              if (field.isPositionalArg || field.key.includes('PATH') || field.key.includes('DIR')) {
                                val = val.replace(/\\/g, '/');
                              }
                              handleCredentialChange(field.key, val);
                            }}
                            className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none transition-colors ${
                              isInvalid 
                                ? 'border-rose-500/70 focus:border-rose-500' 
                                : 'border-slate-800 focus:border-cyan-500'
                            }`}
                          />
                        );
                      })()}
                      {isInvalid && field.validationMessage && (
                        <p className="text-[10px] text-rose-400 font-mono flex items-center space-x-1">
                          <span>⚠️ {field.validationMessage}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stdio Execution Preview */}
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Under the Hood Command</span>
            <pre className="font-mono text-xs text-slate-400 overflow-x-auto">
              {selectedToolForDrawer.command} {selectedToolForDrawer.args.join(' ')}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div>
            {isCurrentlyInstalled && (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={isRevoking || isSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
              >
                {isRevoking ? 'Revoking...' : 'Revoke & Disconnect'}
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleSaveAndInject}
              disabled={isSaving}
              className={`flex items-center space-x-1.5 px-5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                isSavedSuccess
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
              }`}
            >
              {isSavedSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Injected & Synced!</span>
                </>
              ) : isSaving ? (
                <span>Writing Configs...</span>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Connect & Auto-Configure All Files</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
