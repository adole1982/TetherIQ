import React from 'react';
import { 
  Zap, 
  ShieldAlert, 
  Terminal, 
  Sparkles, 
  Bug, 
  Sliders, 
  Play, 
  Square,
  Key
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const Titlebar: React.FC = () => {
  const { 
    isProxyRunning, 
    toggleProxy, 
    proxyPort, 
    budget, 
    setQuickstartOpen, 
    setDiagnosticModalOpen, 
    isTerminalOpen, 
    setTerminalOpen,
    setKeyManagerOpen,
    resetCircuitBreaker
  } = useTetherStore();

  return (
    <header className="h-12 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md px-4 flex items-center justify-between select-none z-30">
      {/* Brand & Gateway Status */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-bold tracking-tight text-white text-base">
            Tether<span className="text-cyan-400">IQ</span>
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Proxy State Indicator */}
        <button
          onClick={toggleProxy}
          className={`flex items-center space-x-2 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            isProxyRunning
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
          }`}
          title={isProxyRunning ? 'Click to pause gateway' : 'Click to start gateway'}
        >
          <span className={`w-2 h-2 rounded-full ${isProxyRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          <span>127.0.0.1:{proxyPort}</span>
          {isProxyRunning ? <Square className="w-2.5 h-2.5 ml-1 opacity-60" /> : <Play className="w-2.5 h-2.5 ml-1 opacity-60" />}
        </button>
      </div>

      {/* Spend & Safety Alert */}
      <div className="flex items-center space-x-3">
        {budget.isCircuitBreakerTripped ? (
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs animate-bounce">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-semibold">Runaway Spend Tripped (${budget.currentDailySpend.toFixed(2)}/${budget.dailyLimit.toFixed(2)})</span>
            <button
              onClick={resetCircuitBreaker}
              className="ml-1 underline text-rose-200 hover:text-white text-[11px]"
            >
              Reset
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400">Daily Cap:</span>
            <span className="font-mono text-cyan-400 font-medium">${budget.currentDailySpend.toFixed(2)}</span>
            <span className="text-slate-500">/ ${budget.dailyLimit.toFixed(2)}</span>
          </div>
        )}

        <div className="h-4 w-px bg-slate-800" />

        {/* Action Buttons */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setQuickstartOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 hover:from-cyan-500/30 hover:to-blue-500/30 transition-all shadow-sm shadow-cyan-500/10"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>60s Quickstart</span>
          </button>

          <button
            onClick={() => setKeyManagerOpen(true)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white transition-all"
            title="Provider API Key Vault"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Keys</span>
          </button>

          <button
            onClick={() => setTerminalOpen(!isTerminalOpen)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              isTerminalOpen
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200'
            }`}
            title="Toggle Embedded Terminal Drawer (Ctrl+`)"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setDiagnosticModalOpen(true)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-rose-300 transition-all"
            title="Export Sanitized Debug Logs for GitHub Issue"
          >
            <Bug className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
            <span>Report</span>
          </button>
        </div>
      </div>
    </header>
  );
};
