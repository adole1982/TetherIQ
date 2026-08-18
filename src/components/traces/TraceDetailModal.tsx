import React from 'react';
import { 
  X, 
  Activity, 
  Clock, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Zap, 
  ArrowRight, 
  ShieldCheck,
  Terminal,
  Database
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const TraceDetailModal: React.FC = () => {
  const { selectedTrace, setSelectedTrace } = useTetherStore();

  if (!selectedTrace) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Trace Details: {selectedTrace.traceId}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {selectedTrace.status}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {selectedTrace.clientName} → {selectedTrace.modelServed} ({selectedTrace.totalDurationMs}ms)
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedTrace(null)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-500">Latency</span>
              <div className="text-sm font-bold text-white font-mono">{selectedTrace.totalDurationMs} ms</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-500">Total Tokens</span>
              <div className="text-sm font-bold text-cyan-400 font-mono">{selectedTrace.totalTokens.toLocaleString()}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-500">Request Cost</span>
              <div className="text-sm font-bold text-amber-400 font-mono">${selectedTrace.cost.toFixed(5)}</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-500">HTTP Status</span>
              <div className="text-sm font-bold text-emerald-400 font-mono">{selectedTrace.statusCode} OK</div>
            </div>
          </div>

          {/* Fallback Reroutes Banner (if any) */}
          {selectedTrace.fallbacksTriggered && selectedTrace.fallbacksTriggered.length > 0 && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Automatic Fallback Transition Triggered</span>
              </div>
              {selectedTrace.fallbacksTriggered.map((f, i) => (
                <div key={i} className="text-xs text-amber-200/90 font-mono space-y-1">
                  <div className="flex items-center space-x-2">
                    <span>{f.fromModel}</span>
                    <ArrowRight className="w-3 h-3 text-amber-400" />
                    <span className="text-emerald-400 font-bold">{f.toModel}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{f.reason} ({f.durationMs}ms)</div>
                </div>
              ))}
            </div>
          )}

          {/* Microsecond Span Waterfall Visualizer */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Span Execution Waterfall (OpenTelemetry Tree)
            </h3>

            <div className="space-y-2 bg-slate-950 p-4 rounded-lg border border-slate-800">
              {selectedTrace.spans.map((span) => {
                const widthPercent = Math.max(8, (span.durationMs / selectedTrace.totalDurationMs) * 100);
                const leftPercent = (span.startTime / selectedTrace.totalDurationMs) * 100;

                return (
                  <div key={span.id} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-300">{span.name}</span>
                      <span className="font-mono text-cyan-400">{span.durationMs} ms</span>
                    </div>

                    <div className="w-full h-3 bg-slate-900 rounded overflow-hidden relative">
                      <div
                        className={`h-full rounded ${
                          span.status === 'error' ? 'bg-rose-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                        }`}
                        style={{
                          marginLeft: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prompt & Payload Summaries */}
          {selectedTrace.requestPayloadSummary && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Captured Prompt & Agent Payload
              </h3>
              <pre className="font-mono text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto select-text">
                {selectedTrace.requestPayloadSummary.samplePrompt || JSON.stringify(selectedTrace.requestPayloadSummary, null, 2)}
              </pre>
            </div>
          )}

          {selectedTrace.responsePayloadSummary && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Model Response Stream / Tool Return
              </h3>
              <pre className="font-mono text-xs text-emerald-300 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto select-text">
                {selectedTrace.responsePayloadSummary.sampleResponse || JSON.stringify(selectedTrace.responsePayloadSummary, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={() => setSelectedTrace(null)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Close Trace
          </button>
        </div>
      </div>
    </div>
  );
};
