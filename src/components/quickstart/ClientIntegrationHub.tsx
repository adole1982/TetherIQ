import React, { useState } from 'react';
import { 
  Terminal, 
  Code2, 
  Compass, 
  Bot, 
  Layers, 
  FileCode, 
  Cpu, 
  Copy, 
  CheckCircle2, 
  Check, 
  ExternalLink,
  Zap,
  Sparkles,
  Network
} from 'lucide-react';
import { CLIENT_INTEGRATIONS, ClientIntegrationGuide } from '../../data/clientIntegrations';
import { useTetherStore } from '../../store/useTetherStore';

export const ClientIntegrationHub: React.FC = () => {
  const { syncAllTools } = useTetherStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoConfiguringId, setAutoConfiguringId] = useState<string | null>(null);
  const [autoConfiguredSuccessId, setAutoConfiguredSuccessId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAutoConfigure = async (client: ClientIntegrationGuide) => {
    setAutoConfiguringId(client.id);
    await syncAllTools();
    setTimeout(() => {
      setAutoConfiguringId(null);
      setAutoConfiguredSuccessId(client.id);
      setTimeout(() => setAutoConfiguredSuccessId(null), 3000);
    }, 600);
  };

  const getClientIcon = (icon: string) => {
    switch (icon) {
      case 'Terminal': return <Terminal className="w-5 h-5 text-cyan-400" />;
      case 'Code2': return <Code2 className="w-5 h-5 text-blue-400" />;
      case 'Compass': return <Compass className="w-5 h-5 text-emerald-400" />;
      case 'Bot': return <Bot className="w-5 h-5 text-purple-400" />;
      case 'Layers': return <Layers className="w-5 h-5 text-amber-400" />;
      case 'FileCode': return <FileCode className="w-5 h-5 text-rose-400" />;
      case 'Cpu': return <Cpu className="w-5 h-5 text-teal-400" />;
      default: return <Network className="w-5 h-5 text-cyan-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex items-center justify-between">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Zero-Config Gateway Connectors</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Connect AI Agents to TetherMesh</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Redirect any coding agent CLI, IDE, or autonomous script to the local proxy (<code className="text-cyan-300 font-mono">127.0.0.1:4000</code>) for automatic model failover, MCP tool bridging, and runaway spend protection.
          </p>
        </div>

        <div className="flex flex-col items-end space-y-2">
          <button
            onClick={() => syncAllTools()}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Zap className="w-4 h-4 fill-slate-950" />
            <span>1-Click Sync All Config Files</span>
          </button>
          <span className="text-[11px] text-slate-500">Updates Cursor, Windsurf, Devin, Claude Code & Antigravity</span>
        </div>
      </div>

      {/* Client Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CLIENT_INTEGRATIONS.map((client) => {
          const isCopied = copiedId === client.id;
          const isConfiguring = autoConfiguringId === client.id;
          const isConfigured = autoConfiguredSuccessId === client.id;

          return (
            <div
              key={client.id}
              className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 shadow-inner">
                      {getClientIcon(client.icon)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-white">{client.name}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                          {client.badge}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {client.configLocationDescription}
                      </span>
                    </div>
                  </div>

                  <a
                    href={client.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                    title="Open Documentation"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {client.description}
                </p>

                {/* Command Snippet Box */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Integration Command / Code</span>
                    <button
                      onClick={() => handleCopy(client.id, client.codeSnippet || client.commandSnippet)}
                      className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Snippet</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="font-mono text-xs text-cyan-300 bg-slate-950 p-3 rounded-lg border border-slate-800/80 overflow-x-auto max-h-36 select-text">
                    {client.codeSnippet || client.commandSnippet}
                  </pre>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                {client.oneClickAutoConfigAvailable ? (
                  <button
                    onClick={() => handleAutoConfigure(client)}
                    disabled={isConfiguring}
                    className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      isConfigured
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500/40'
                    }`}
                  >
                    {isConfiguring ? (
                      <span>Auto-injecting configuration...</span>
                    ) : isConfigured ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Config File Injected & Synced!</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Auto-Configure {client.name}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCopy(client.id, client.codeSnippet || client.commandSnippet)}
                    className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy SDK Initialization Code</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
