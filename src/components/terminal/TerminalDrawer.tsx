import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Terminal as TerminalIcon, 
  Maximize2, 
  Minimize2, 
  Trash2, 
  Sparkles, 
  Zap, 
  CornerDownLeft,
  ChevronDown
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const TerminalDrawer: React.FC = () => {
  const { 
    isTerminalOpen, 
    setTerminalOpen, 
    terminalLogs, 
    appendTerminalLog, 
    clearTerminal, 
    proxyPort 
  } = useTetherStore();

  const [inputCommand, setInputCommand] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  if (!isTerminalOpen) return null;

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCommand.trim()) return;

    const cmd = inputCommand.trim();
    appendTerminalLog(`PS C:\\Projects\\TetherIQ> ${cmd}`);
    setInputCommand('');

    // Simulated terminal agent runner response
    setTimeout(() => {
      if (cmd.startsWith('claude')) {
        appendTerminalLog(`[Claude Code] Initializing session via ANTHROPIC_BASE_URL=http://127.0.0.1:${proxyPort}...`);
        appendTerminalLog(`[Claude Code] TetherIQ Local Gateway Connected (Zero Latency Loopback).`);
        appendTerminalLog(`[Claude Code] Ready. Type your coding prompt.`);
      } else if (cmd.startsWith('aider')) {
        appendTerminalLog(`[Aider] Connecting to model via http://127.0.0.1:${proxyPort}/v1...`);
        appendTerminalLog(`[Aider] Git repository detected. Ready for pair programming.`);
      } else if (cmd === 'clear' || cmd === 'cls') {
        clearTerminal();
      } else if (cmd === 'env' || cmd === 'Get-ChildItem env:') {
        appendTerminalLog(`ANTHROPIC_BASE_URL = http://127.0.0.1:${proxyPort}`);
        appendTerminalLog(`OPENAI_BASE_URL = http://127.0.0.1:${proxyPort}/v1`);
        appendTerminalLog(`TETHERIQ_ACTIVE = 1`);
      } else {
        appendTerminalLog(`[TetherIQ Subshell] Executed: ${cmd}`);
      }
    }, 120);
  };

  return (
    <div className={`fixed bottom-0 left-64 right-0 z-40 bg-slate-950/95 border-t border-slate-800 shadow-2xl backdrop-blur-md flex flex-col transition-all duration-200 ${
      isExpanded ? 'h-96' : 'h-64'
    }`}>
      {/* Drawer Header */}
      <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs select-none">
        <div className="flex items-center space-x-2">
          <TerminalIcon className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-white">Execution Terminal Drawer</span>
          <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.2 rounded">
            ANTHROPIC_BASE_URL=127.0.0.1:{proxyPort}
          </span>
        </div>

        <div className="flex items-center space-x-2 text-slate-400">
          <button
            onClick={() => appendTerminalLog('PS C:\\Projects\\TetherIQ> export ANTHROPIC_BASE_URL=http://127.0.0.1:4000')}
            className="text-[11px] text-cyan-400 hover:underline mr-2"
          >
            Inject Env Vars
          </button>

          <button
            onClick={clearTerminal}
            className="p-1 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="Clear Terminal"
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

      {/* Terminal Output Log Area */}
      <div className="flex-1 p-3 font-mono text-xs text-slate-300 overflow-y-auto space-y-1 select-text bg-black/40">
        {terminalLogs.map((log, index) => (
          <div
            key={index}
            className={`leading-relaxed ${
              log.includes('TetherIQ')
                ? 'text-cyan-400'
                : log.includes('PS C:\\')
                ? 'text-slate-100 font-semibold'
                : 'text-slate-400'
            }`}
          >
            {log}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Terminal Input Bar */}
      <form onSubmit={handleCommandSubmit} className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
        <span className="font-mono text-xs text-cyan-400 font-bold">PS &gt;</span>
        <input
          type="text"
          placeholder="Run claude, aider, npm test, or type 'help'..."
          value={inputCommand}
          onChange={(e) => setInputCommand(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 font-mono focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono flex items-center space-x-1"
        >
          <span>Run</span>
          <CornerDownLeft className="w-3 h-3" />
        </button>
      </form>
    </div>
  );
};
