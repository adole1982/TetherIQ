import React from 'react';
import { 
  Activity, 
  Zap, 
  Clock, 
  ShieldAlert, 
  TrendingUp, 
  Flame, 
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip 
} from 'recharts';
import { useTetherStore } from '../../store/useTetherStore';

export const LiveTelemetryHUD: React.FC = () => {
  const { 
    telemetryHistory, 
    currentTokensPerSec, 
    currentLatencyMs, 
    currentBurnRatePerHour, 
    budget, 
    resetCircuitBreaker,
    connectedAgents,
    traces
  } = useTetherStore();

  const totalTokensToday = telemetryHistory.reduce((acc, t) => acc + t.inputTokens + t.outputTokens, 0) + 214500;
  const budgetPercentage = Math.min(100, (budget.currentDailySpend / budget.dailyLimit) * 100);

  return (
    <div className="space-y-6">
      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 1. Throughput */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Token Throughput</span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Zap className="w-4 h-4 fill-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold text-white font-mono">{currentTokensPerSec.toFixed(1)}</span>
              <span className="text-xs text-cyan-400 font-mono">tokens/s</span>
            </div>
            <div className="flex items-center space-x-1 text-[11px] text-emerald-400 mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>Real-time generation rate</span>
            </div>
          </div>
        </div>

        {/* 2. Latency */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Active Latency</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold text-white font-mono">{currentLatencyMs}</span>
              <span className="text-xs text-blue-400 font-mono">ms</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Loopback + upstream inference
            </div>
          </div>
        </div>

        {/* 3. Session Burn Rate */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Session Burn Rate</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Flame className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold text-amber-400 font-mono">${currentBurnRatePerHour.toFixed(2)}</span>
              <span className="text-xs text-slate-400 font-mono">/ hour</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Projected run cost rate
            </div>
          </div>
        </div>

        {/* 4. Budget & Circuit Breaker */}
        <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
          budget.isCircuitBreakerTripped
            ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/50'
            : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Daily Spend Guardrail</span>
            <div className={`p-1.5 rounded-lg border ${budget.isCircuitBreakerTripped ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline space-x-1 font-mono">
                <span className={`text-2xl font-extrabold ${budget.isCircuitBreakerTripped ? 'text-rose-400' : 'text-white'}`}>
                  ${budget.currentDailySpend.toFixed(2)}
                </span>
                <span className="text-xs text-slate-500">/ ${budget.dailyLimit.toFixed(2)}</span>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-400">{budgetPercentage.toFixed(0)}%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetPercentage > 85 ? 'bg-rose-500' : budgetPercentage > 50 ? 'bg-amber-400' : 'bg-cyan-400'
                }`}
                style={{ width: `${budgetPercentage}%` }}
              />
            </div>

            {budget.isCircuitBreakerTripped && (
              <button
                onClick={resetCircuitBreaker}
                className="w-full mt-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-semibold flex items-center justify-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset Circuit Breaker</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time Throughput Streaming Chart */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">Live In-Flight Telemetry (Tokens / Second Stream)</h2>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center space-x-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Token Velocity</span>
            </span>
            <span className="font-mono text-slate-500 text-[11px]">Sampling every 3s</span>
          </div>
        </div>

        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={telemetryHistory}>
              <defs>
                <linearGradient id="tokenVelocity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp" hide />
              <YAxis domain={[0, 80]} stroke="#475569" fontSize={11} tickFormatter={(v) => `${v} t/s`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px', color: '#f8fafc' }}
                labelFormatter={() => 'Telemetry Sample'}
                formatter={(value: any) => [`${value} tokens/sec`, 'Velocity']}
              />
              <Area
                type="monotone"
                dataKey="tokensPerSecond"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#tokenVelocity)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Connected Agents & Recent Traces Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Connected Agents Card */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Active Client Agents ({connectedAgents.length})</h3>
            <span className="text-[11px] text-cyan-400 font-mono">Bound to 127.0.0.1:4000</span>
          </div>

          <div className="space-y-2">
            {connectedAgents.map((agent) => (
              <div key={agent.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div>
                    <div className="text-xs font-bold text-white">{agent.clientName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{agent.activeModel}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono text-cyan-300 font-medium">{(agent.totalTokens).toLocaleString()} tok</div>
                  <div className="text-[11px] text-slate-400 font-mono">${agent.totalCost.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Trace Stream Summary */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Recent Activity Traces</h3>
            <span className="text-[11px] text-slate-400">Total requests logged: {traces.length}</span>
          </div>

          <div className="space-y-2">
            {traces.slice(0, 3).map((trace) => (
              <div key={trace.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-white">{trace.clientName}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                      trace.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {trace.status}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">{trace.modelServed}</span>
                </div>

                <div className="text-right font-mono">
                  <div className="text-slate-300">{trace.totalDurationMs}ms</div>
                  <div className="text-cyan-400 text-[11px]">${trace.cost.toFixed(4)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
