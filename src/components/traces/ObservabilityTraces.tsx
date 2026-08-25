import React, { useState } from 'react';
import { 
  Search, 
  ChevronRight,
  Database,
  Terminal,
  Activity
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';
import { TraceDetailModal } from './TraceDetailModal';

export const ObservabilityTraces: React.FC = () => {
  const { traces, setSelectedTrace } = useTetherStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredTraces = traces.filter(t => {
    const matchesSearch = t.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.modelServed.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.traceId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex items-center justify-between">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Deep Agent & Tool Observability</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Observability & Activity Traces</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Inspect every LLM gateway call, model fallback transition, and MCP tool execution with microsecond latency waterfalls, raw prompt inspection, and OpenTelemetry spans.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
          <span className={`w-2 h-2 rounded-full ${traces.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-slate-300">{traces.length} Logged {traces.length === 1 ? 'Trace' : 'Traces'}</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search traces by client, model, or trace ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center space-x-1.5 text-xs">
          {['all', 'llm-proxy', 'mcp-tool', 'fallback-event'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-2 rounded-lg font-medium transition-all ${
                filterType === type
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {type === 'all' ? 'All Traces' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Traces Table / Waterfall List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          <div className="col-span-3">Client Agent / Trace ID</div>
          <div className="col-span-3">Served Model / Tool Target</div>
          <div className="col-span-2">Latency & Status</div>
          <div className="col-span-2">Tokens & Cost</div>
          <div className="col-span-2 text-right">Waterfall Timeline</div>
        </div>

        {filteredTraces.length > 0 ? (
          <div className="divide-y divide-slate-800/60">
            {filteredTraces.map((trace) => {
              const timeAgo = Math.max(0, Math.round((Date.now() - trace.timestamp) / 1000));
              return (
                <div
                  key={trace.id}
                  onClick={() => setSelectedTrace(trace)}
                  className="px-4 py-3.5 hover:bg-slate-800/40 transition-colors grid grid-cols-12 gap-2 items-center text-xs cursor-pointer select-none"
                >
                  {/* 1. Client & ID */}
                  <div className="col-span-3 space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white">{trace.clientName}</span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1 rounded border border-slate-800">
                        {trace.traceId}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">{timeAgo}s ago</span>
                  </div>

                  {/* 2. Model / Tool */}
                  <div className="col-span-3 space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      {trace.type === 'mcp-tool' ? (
                        <Database className="w-3.5 h-3.5 text-cyan-400" />
                      ) : (
                        <Terminal className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <span className="font-mono text-slate-200 text-xs truncate">{trace.modelServed}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">{trace.providerServed}</div>
                  </div>

                  {/* 3. Latency & Status */}
                  <div className="col-span-2 space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-2 h-2 rounded-full ${trace.status === 'success' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="font-mono text-white font-semibold">{trace.totalDurationMs} ms</span>
                    </div>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      trace.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {trace.status}
                    </span>
                  </div>

                  {/* 4. Tokens & Cost */}
                  <div className="col-span-2 space-y-0.5 font-mono">
                    <div className="text-slate-300 font-medium">{trace.totalTokens.toLocaleString()} tok</div>
                    <div className="text-cyan-400 text-[11px] font-bold">${trace.cost.toFixed(4)}</div>
                  </div>

                  {/* 5. Mini Waterfall */}
                  <div className="col-span-2 flex items-center justify-end space-x-2">
                    <div className="w-24 h-2 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                      <div className="h-full bg-cyan-500" style={{ width: '30%' }} />
                      <div className="h-full bg-blue-500" style={{ width: '55%' }} />
                      <div className="h-full bg-emerald-500" style={{ width: '15%' }} />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="p-3 rounded-full bg-slate-950 border border-slate-800">
              <Activity className="w-8 h-8 text-slate-600 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">No traces recorded yet</div>
              <div className="text-xs text-slate-400 max-w-sm mt-1">
                Requests received by the proxy on <code className="text-cyan-300 font-mono">127.0.0.1:4000</code> will stream here with full span duration breakdowns and prompt inspectors.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trace Detail Inspector Modal */}
      <TraceDetailModal />
    </div>
  );
};
