import React from 'react';
import { 
  Settings, 
  ShieldAlert, 
  Sliders, 
  Terminal, 
  Folder, 
  RotateCcw,
  Check,
  Zap,
  Bug
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const SettingsModal: React.FC = () => {
  const { 
    settings, 
    updateSettings, 
    budget, 
    updateBudgetLimits, 
    proxyPort, 
    setDiagnosticModalOpen 
  } = useTetherStore();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">System Preferences</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Control Plane Settings</h1>
          <p className="text-xs text-slate-400">
            Configure local gateway networking, runaway spend limits, and terminal shell preferences.
          </p>
        </div>

        <button
          onClick={() => setDiagnosticModalOpen(true)}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
        >
          <Bug className="w-4 h-4 text-rose-400" />
          <span>Export Debug Logs</span>
        </button>
      </div>

      {/* Settings Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Gateway Network Config */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-white uppercase tracking-wider">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>Gateway Network Binding</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 text-[11px]">Proxy Host Address</label>
              <input
                type="text"
                disabled
                value="127.0.0.1 (Loopback Only)"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-slate-400 cursor-not-allowed mt-1"
              />
              <span className="text-[10px] text-slate-500">Locked to loopback for maximum security.</span>
            </div>

            <div>
              <label className="text-slate-400 text-[11px]">Proxy Port</label>
              <input
                type="number"
                value={proxyPort}
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-cyan-400 font-bold mt-1"
              />
            </div>
          </div>
        </div>

        {/* 2. Runaway Spend Guardrails */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-white uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Runaway Spend Circuit Breaker</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 text-[11px]">Daily Hard Budget Limit ($)</label>
              <input
                type="number"
                value={budget.dailyLimit}
                onChange={(e) => updateBudgetLimits(parseFloat(e.target.value) || 10, budget.monthlyLimit)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-rose-400 font-bold mt-1 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-400 text-[11px]">Monthly Budget Limit ($)</label>
              <input
                type="number"
                value={budget.monthlyLimit}
                onChange={(e) => updateBudgetLimits(budget.dailyLimit, parseFloat(e.target.value) || 150)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-emerald-400 font-bold mt-1 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 3. Terminal & Shell Preferences */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-white uppercase tracking-wider">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span>Integrated Terminal Shell</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 text-[11px]">Host Shell</label>
              <select
                value={settings.defaultTerminalShell}
                onChange={(e) => updateSettings({ defaultTerminalShell: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 mt-1 font-mono focus:border-cyan-500 focus:outline-none"
              >
                <option value="powershell">Windows PowerShell (powershell.exe)</option>
                <option value="pwsh">PowerShell Core (pwsh.exe)</option>
                <option value="cmd">Command Prompt (cmd.exe)</option>
                <option value="bash">Git Bash / WSL (/bin/bash)</option>
              </select>
            </div>

            <label className="flex items-center space-x-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={settings.enableTerminalAutoEnv}
                onChange={(e) => updateSettings({ enableTerminalAutoEnv: e.target.checked })}
                className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-slate-300 text-[11px]">Auto-export ANTHROPIC_BASE_URL into terminal</span>
            </label>
          </div>
        </div>

        {/* 4. Telemetry Retention */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-white uppercase tracking-wider">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Telemetry & Trace Retention</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 text-[11px]">Retain Traces For</label>
              <select
                value={settings.telemetryRetentionHours}
                onChange={(e) => updateSettings({ telemetryRetentionHours: parseInt(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 mt-1 font-mono focus:border-cyan-500 focus:outline-none"
              >
                <option value={24}>24 Hours</option>
                <option value={48}>48 Hours (Recommended)</option>
                <option value={168}>7 Days</option>
                <option value={720}>30 Days</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
