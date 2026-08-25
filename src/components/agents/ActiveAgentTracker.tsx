import React from 'react';
import { 
  Users, 
  Terminal, 
  Code2, 
  Compass, 
  Bot, 
  Layers, 
  Zap, 
  Sparkles
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const ActiveAgentTracker: React.FC = () => {
  const { connectedAgents } = useTetherStore();

  const getAgentIcon = (icon: string) => {
    switch (icon) {
      case 'Terminal': return <Terminal className="w-4 h-4 text-cyan-400" />;
      case 'Code2': return <Code2 className="w-4 h-4 text-blue-400" />;
      case 'Compass': return <Compass className="w-4 h-4 text-emerald-400" />;
      case 'Bot': return <Bot className="w-4 h-4 text-purple-400" />;
      case 'Layers': return <Layers className="w-4 h-4 text-amber-400" />;
      case 'Sparkles': return <Sparkles className="w-4 h-4 text-cyan-300" />;
      default: return <Zap className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex items-center justify-between">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Agent Session Discovery</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Active Connected Agents</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Live client agents currently connected to <code className="text-cyan-300 font-mono">http://127.0.0.1:4000</code>. Automatically discovers sessions based on incoming request headers, tracking active model paths and cumulative token usage.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
          <span className={`w-2 h-2 rounded-full ${connectedAgents.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-slate-300">{connectedAgents.length} Active {connectedAgents.length === 1 ? 'Agent' : 'Agents'}</span>
        </div>
      </div>

      {/* Agents Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          <div className="col-span-4">Client Agent / Session ID</div>
          <div className="col-span-3">Active Model Routing</div>
          <div className="col-span-2">Tokens Consumed</div>
          <div className="col-span-2">Cumulative Cost</div>
          <div className="col-span-1 text-right">Status</div>
        </div>

        {connectedAgents.length > 0 ? (
          <div className="divide-y divide-slate-800/60">
            {connectedAgents.map((agent) => {
              const connectedMinutes = Math.max(0, Math.round((Date.now() - agent.connectedAt) / 60000));
              return (
                <div
                  key={agent.id}
                  className="px-4 py-3.5 hover:bg-slate-800/40 transition-colors grid grid-cols-12 gap-2 items-center text-xs"
                >
                  {/* 1. Client & ID */}
                  <div className="col-span-4 flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      {getAgentIcon(agent.agentIcon)}
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center space-x-2">
                        <span>{agent.clientName}</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                          {agent.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {agent.ip} • Connected {connectedMinutes}m ago
                      </div>
                    </div>
                  </div>

                  {/* 2. Model */}
                  <div className="col-span-3">
                    <span className="font-mono text-cyan-300 text-xs bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {agent.activeModel || 'Auto-routed'}
                    </span>
                  </div>

                  {/* 3. Tokens */}
                  <div className="col-span-2 font-mono text-slate-200">
                    {agent.totalTokens.toLocaleString()} tokens
                  </div>

                  {/* 4. Cost */}
                  <div className="col-span-2 font-mono text-amber-400 font-bold">
                    ${agent.totalCost.toFixed(4)}
                  </div>

                  {/* 5. Status */}
                  <div className="col-span-1 flex items-center justify-end">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                      agent.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="p-3 rounded-full bg-slate-950 border border-slate-800">
              <Bot className="w-8 h-8 text-slate-600 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">No active agent sessions detected</div>
              <div className="text-xs text-slate-400 max-w-sm mt-1">
                Configure Claude Code (<code className="text-cyan-300 font-mono">ANTHROPIC_BASE_URL=http://127.0.0.1:4000</code>) or Cursor to begin automatic discovery.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
