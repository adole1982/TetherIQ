import React from 'react';
import { 
  Activity, 
  GitFork, 
  Grid, 
  Search, 
  Users, 
  Settings, 
  BookOpen,
  Zap
} from 'lucide-react';
import { useTetherStore, NavTab } from '../../store/useTetherStore';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, mcpCatalog, installedTools, traces, connectedAgents } = useTetherStore();

  const enabledToolsCount = installedTools.filter(t => t.isEnabled).length;
  const activeAgentsCount = connectedAgents.filter(a => a.status === 'active').length;

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: string | number }> = [
    { id: 'hud', label: 'Live Telemetry HUD', icon: <Activity className="w-4 h-4" /> },
    { id: 'matrix', label: 'Model Fallback Matrix', icon: <GitFork className="w-4 h-4" /> },
    { id: 'tools', label: '50+ MCP Marketplace', icon: <Grid className="w-4 h-4" />, badge: `${enabledToolsCount}/${mcpCatalog.length}` },
    { id: 'traces', label: 'Activity Traces', icon: <Search className="w-4 h-4" />, badge: traces.length },
    { id: 'agents', label: 'Connected Agents', icon: <Users className="w-4 h-4" />, badge: activeAgentsCount },
    { id: 'quickstart', label: 'Quickstart & Connectors', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'settings', label: 'Control Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-slate-950/60 backdrop-blur-sm flex flex-col justify-between py-4 select-none shrink-0">
      <div className="px-3 space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Control Plane
        </div>

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className={isActive ? 'text-cyan-400' : 'text-slate-500'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-800/80 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Gateway Loopback Card */}
      <div className="px-3">
        <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Gateway Endpoint</span>
            <span className="flex items-center text-[10px] text-emerald-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
              Active
            </span>
          </div>
          <div className="font-mono text-cyan-300 text-[11px] bg-slate-950 px-2 py-1 rounded border border-slate-800/80 flex items-center justify-between">
            <span>http://127.0.0.1:4000</span>
            <Zap className="w-3 h-3 text-cyan-400 opacity-70" />
          </div>
        </div>
      </div>
    </aside>
  );
};
