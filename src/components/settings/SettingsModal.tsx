import React from 'react';
import { 
  Settings, 
  ShieldAlert, 
  Sliders, 
  Terminal, 
  RotateCcw,
  Check,
  Zap,
  Bug,
  Power,
  Info
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
  const [dailyDraft, setDailyDraft] = React.useState<string>(budget.dailyLimit !== null && budget.dailyLimit !== undefined ? String(budget.dailyLimit) : '');
  const [monthlyDraft, setMonthlyDraft] = React.useState<string>(budget.monthlyLimit !== null && budget.monthlyLimit !== undefined ? String(budget.monthlyLimit) : '');
  const [isSavingBudget, setIsSavingBudget] = React.useState<boolean>(false);
  const [budgetSaveStatus, setBudgetSaveStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDailyDraft(budget.dailyLimit !== null && budget.dailyLimit !== undefined ? String(budget.dailyLimit) : '');
    setMonthlyDraft(budget.monthlyLimit !== null && budget.monthlyLimit !== undefined ? String(budget.monthlyLimit) : '');
  }, [budget.dailyLimit, budget.monthlyLimit]);

  const handleSaveBudget = async () => {
    setIsSavingBudget(true);
    setBudgetSaveStatus(null);
    try {
      const dailyVal = dailyDraft.trim() === '' ? null : dailyDraft.trim();
      const monthlyVal = monthlyDraft.trim() === '' ? null : monthlyDraft.trim();
      await updateBudgetLimits(dailyVal, monthlyVal);
      setBudgetSaveStatus('Budget limits saved');
      setTimeout(() => setBudgetSaveStatus(null), 3000);
    } catch (err: any) {
      setBudgetSaveStatus(`Error: ${err.message || String(err)}`);
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleSetDailyUnlimited = () => {
    setDailyDraft('');
  };

  const handleSetMonthlyUnlimited = () => {
    setMonthlyDraft('');
  };

  const handleToggleAutoStart = async (checked: boolean) => {
    updateSettings({ autoStartOnBoot: checked });
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_auto_start_on_boot', { enabled: checked });
      } catch (err) {
        console.error('Failed to update startup registry:', err);
      }
    }
  };

  const handleOpenOsStartupSettings = async () => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_os_startup_settings');
      } catch (err) {
        console.error('Failed to open OS settings:', err);
      }
    }
  };

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
            Configure local gateway networking, background daemon startup, and runaway spend limits.
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

      {/* Primary Auto-Start & Background Proxy Banner */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Background Proxy & Auto-Start on Boot</h2>
              <p className="text-xs text-slate-400">
                Keep the local LiteLLM proxy active in the system tray so your coding agents never lose connection.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <input
                type="checkbox"
                checked={settings.autoStartOnBoot}
                onChange={(e) => handleToggleAutoStart(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-xs font-semibold text-slate-200">Start on Boot</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <input
                type="checkbox"
                checked={settings.minimizeToTray}
                onChange={(e) => updateSettings({ minimizeToTray: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-xs font-semibold text-slate-200">Minimize to Tray</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          <div className="flex items-start space-x-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Why enable this?</strong> AI coding tools route to <code className="text-cyan-300">http://127.0.0.1:4000</code>. Enabling auto-start keeps your spend circuit breaker and tools ready on boot.
            </span>
          </div>

          <button
            onClick={handleOpenOsStartupSettings}
            className="text-[11px] text-cyan-400 hover:underline font-mono shrink-0 ml-4"
          >
            Windows Startup Settings ↗
          </button>
        </div>
      </div>

      {/* Settings Grid */}
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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold text-white uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Runaway Spend Circuit Breaker</span>
            </div>
            {budgetSaveStatus && (
              <span className={`text-[11px] font-medium ${budgetSaveStatus.startsWith('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>
                {budgetSaveStatus}
              </span>
            )}
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-slate-400 text-[11px]">Daily Hard Budget Limit ($)</label>
                <button
                  type="button"
                  onClick={handleSetDailyUnlimited}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  Set Unlimited
                </button>
              </div>
              <input
                type="text"
                value={dailyDraft}
                placeholder="e.g. 10.00 (leave empty for unlimited)"
                onChange={(e) => setDailyDraft(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-rose-400 font-bold mt-1 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-slate-400 text-[11px]">Monthly Budget Limit ($)</label>
                <button
                  type="button"
                  onClick={handleSetMonthlyUnlimited}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  Set Unlimited
                </button>
              </div>
              <input
                type="text"
                value={monthlyDraft}
                placeholder="e.g. 150.00 (leave empty for unlimited)"
                onChange={(e) => setMonthlyDraft(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-emerald-400 font-bold mt-1 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={handleSaveBudget}
                disabled={isSavingBudget}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded font-bold text-xs flex items-center space-x-1.5 transition-colors"
              >
                {isSavingBudget ? <span>Saving...</span> : <span>Save Budget Limits</span>}
              </button>
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
