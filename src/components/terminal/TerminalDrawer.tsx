import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Activity, 
  Maximize2, 
  Minimize2, 
  Trash2, 
  Copy, 
  Check, 
  Radio, 
  ShieldCheck, 
  Cpu
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const TerminalDrawer: React.FC = () => {
  const { 
    isTerminalOpen, 
    setTerminalOpen, 
    terminalLogs, 
    clearTerminal, 
    proxyPort,
    isProxyRunning
  } = useTetherStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<{
    proxy_running: boolean;
    proxy_healthy: boolean;
    proxy_port: number;
    anthropic_base_url: string;
    openai_base_url: string;
    gateway_token?: string;
    sidecar_pid?: number;
  }>({
    proxy_running: isProxyRunning,
    proxy_healthy: isProxyRunning,
    proxy_port: proxyPort,
    anthropic_base_url: `http://127.0.0.1:${proxyPort}`,
    openai_base_url: `http://127.0.0.1:${proxyPort}/v1`,
    gateway_token: 'sk-tether-local',
  });

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  useEffect(() => {
    if (!isTerminalOpen) return;

    const fetchDiagnostics = async () => {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const data = await invoke<any>('get_gateway_diagnostics');
          if (data) {
            setDiagnostics(data);
          }
        } catch {
          // fallback
        }
      }
    };

    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 3000);
    return () => clearInterval(interval);
  }, [isTerminalOpen, proxyPort, isProxyRunning]);

  if (!isTerminalOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const anthropicExport = `export ANTHROPIC_BASE_URL=http://127.0.0.1:${diagnostics.proxy_port || 4000}\nexport ANTHROPIC_API_KEY=${diagnostics.gateway_token || 'sk-tether-local'}`;
  const openaiExport = `export OPENAI_BASE_URL=http://127.0.0.1:${diagnostics.proxy_port || 4000}/v1\nexport OPENAI_API_KEY=${diagnostics.gateway_token || 'sk-tether-local'}`;

  return (
    <div className={`fixed bottom-0 left-64 right-0 z-40 bg-slate-950/95 border-t border-slate-800 shadow-2xl backdrop-blur-md flex flex-col transition-all duration-200 ${
      isExpanded ? 'h-96' : 'h-64'
    }`}>
      {/* Drawer Header */}
      <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs select-none">
        <div className="flex items-center space-x-3">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-white">Gateway Diagnostics & Connection Inspector</span>
          <span className={`text-[10px] font-mono border px-2 py-0.5 rounded flex items-center space-x-1 ${
            diagnostics.proxy_running 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${diagnostics.proxy_running ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{diagnostics.proxy_running ? `LOOPBACK :${diagnostics.proxy_port}` : 'STANDBY'}</span>
          </span>
          {diagnostics.sidecar_pid && (
            <span className="text-[10px] font-mono text-slate-500">PID: {diagnostics.sidecar_pid}</span>
          )}
        </div>

        <div className="flex items-center space-x-2 text-slate-400">
          <button
            onClick={clearTerminal}
            className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="Clear Diagnostics Log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setTerminalOpen(false)}
            className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="Close Drawer (Ctrl+`)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Diagnostics Quick Copy Bar */}
      <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-mono text-[11px] bg-slate-950 border border-slate-800 px-2.5 py-1 rounded text-slate-300">
            <span className="text-cyan-400">Anthropic:</span>
            <span>{diagnostics.anthropic_base_url}</span>
            <button
              onClick={() => handleCopy(anthropicExport, 'anthropic')}
              className="ml-1 text-slate-400 hover:text-cyan-400 transition-colors"
              title="Copy export command"
            >
              {copiedKey === 'anthropic' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>

          <div className="flex items-center space-x-1.5 font-mono text-[11px] bg-slate-950 border border-slate-800 px-2.5 py-1 rounded text-slate-300">
            <span className="text-purple-400">OpenAI:</span>
            <span>{diagnostics.openai_base_url}</span>
            <button
              onClick={() => handleCopy(openaiExport, 'openai')}
              className="ml-1 text-slate-400 hover:text-purple-400 transition-colors"
              title="Copy export command"
            >
              {copiedKey === 'openai' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Loopback Isolation (127.0.0.1)</span>
        </div>
      </div>

      {/* Terminal Output Log Area */}
      <div className="flex-1 p-3 font-mono text-xs text-slate-300 overflow-y-auto space-y-1 select-text bg-black/40">
        <div className="text-slate-500 text-[11px] pb-1 border-b border-slate-900">
          [Gateway Event Stream] — Tracking real-time loopback connections and MCP adapter synchronizations...
        </div>
        {terminalLogs.length === 0 ? (
          <div className="text-slate-500 italic py-2">
            No gateway events recorded yet. Ready to route local AI coding requests.
          </div>
        ) : (
          terminalLogs.map((log, index) => (
            <div
              key={index}
              className={`leading-relaxed ${
                log.includes('TetherMesh') || log.includes('TetherIQ')
                  ? 'text-cyan-400'
                  : log.includes('Error') || log.includes('ERR')
                  ? 'text-rose-400 font-semibold'
                  : 'text-slate-400'
              }`}
            >
              {log}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
