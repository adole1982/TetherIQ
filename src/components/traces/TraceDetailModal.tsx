import React, { useState } from 'react';
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
  Shield,
  Terminal,
  Database,
  Copy,
  Check,
  MessageSquare,
  FileCode,
  Eye,
  EyeOff,
  Bot,
  User,
  Wrench,
  Sparkles
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const TraceDetailModal: React.FC = () => {
  const { selectedTrace, setSelectedTrace } = useTetherStore();
  const [activeTab, setActiveTab] = useState<'conversation' | 'waterfall' | 'raw'>('conversation');
  const [maskSecrets, setMaskSecrets] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  if (!selectedTrace) return null;

  // Redaction helper for PII and API keys
  const redactSensitiveText = (text: string): string => {
    if (!maskSecrets || !text) return text;
    return text
      .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-••••••••••••••••••••')
      .replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_••••••••••••••••••••')
      .replace(/xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g, 'xoxb-••••••••••••••••••••')
      .replace(/sbp_[a-zA-Z0-9_-]+/g, 'sbp_••••••••••••••••••••')
      .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, 'eyJ••••••••.[JWT].••••••••')
      .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '•••••@••••.com');
  };

  const handleCopyJson = () => {
    const traceJson = JSON.stringify(selectedTrace, null, 2);
    navigator.clipboard.writeText(traceJson);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const messages = selectedTrace.requestPayloadSummary?.messages || [];
  const toolCalls = selectedTrace.responsePayloadSummary?.toolCallsMade || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Trace: {selectedTrace.traceId}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  selectedTrace.status === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : selectedTrace.status === 'rate-limited'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {selectedTrace.status}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {selectedTrace.clientName} → {selectedTrace.modelServed} ({selectedTrace.totalDurationMs}ms)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyJson}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Copy Full Trace JSON"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{isCopied ? 'Copied!' : 'Copy JSON'}</span>
            </button>

            <button
              onClick={() => setSelectedTrace(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Mode Navigation & Redaction Toggle */}
        <div className="px-6 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setActiveTab('conversation')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'conversation'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversation Turns ({messages.length || 1})</span>
            </button>

            <button
              onClick={() => setActiveTab('waterfall')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'waterfall'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Span Waterfall ({selectedTrace.spans.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('raw')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'raw'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Raw Payloads</span>
            </button>
          </div>

          <button
            onClick={() => setMaskSecrets(!maskSecrets)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all ${
              maskSecrets
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }`}
          >
            {maskSecrets ? <Shield className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>{maskSecrets ? 'Secrets Redacted' : 'Showing Raw Secrets'}</span>
          </button>
        </div>

        {/* Content Body */}
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

          {/* TAB 1: CONVERSATION TURNS */}
          {activeTab === 'conversation' && (
            <div className="space-y-4">
              {/* Message Turns */}
              <div className="space-y-3">
                {messages.length > 0 ? (
                  messages.map((m, idx) => {
                    const isUser = m.role === 'user';
                    const isSystem = m.role === 'system';
                    const isTool = m.role === 'tool';
                    const isAssistant = m.role === 'assistant';

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border space-y-2 ${
                          isUser
                            ? 'bg-cyan-950/20 border-cyan-500/30'
                            : isSystem
                            ? 'bg-slate-950 border-slate-800'
                            : isTool
                            ? 'bg-amber-950/20 border-amber-500/30'
                            : 'bg-indigo-950/20 border-indigo-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-2">
                            {isUser && <User className="w-3.5 h-3.5 text-cyan-400" />}
                            {isSystem && <Terminal className="w-3.5 h-3.5 text-slate-400" />}
                            {isTool && <Wrench className="w-3.5 h-3.5 text-amber-400" />}
                            {isAssistant && <Bot className="w-3.5 h-3.5 text-indigo-400" />}
                            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-300">
                              {m.role}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">Turn #{idx + 1}</span>
                        </div>

                        <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap select-text leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
                          {redactSensitiveText(m.content)}
                        </pre>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-xs font-bold text-slate-400">Captured Prompt:</span>
                    <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap select-text">
                      {redactSensitiveText(selectedTrace.requestPayloadSummary?.samplePrompt || 'No prompt payload captured.')}
                    </pre>
                  </div>
                )}
              </div>

              {/* Model Response / Tool Execution Return */}
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-300">
                      Model Completion Stream
                    </span>
                  </div>
                  {selectedTrace.responsePayloadSummary?.finishReason && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      finish: {selectedTrace.responsePayloadSummary.finishReason}
                    </span>
                  )}
                </div>

                {toolCalls.length > 0 && (
                  <div className="flex items-center space-x-2 pt-1 pb-2">
                    <span className="text-[11px] text-slate-400">Tools Executed:</span>
                    {toolCalls.map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <pre className="font-mono text-xs text-emerald-200 whitespace-pre-wrap select-text leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-emerald-500/20">
                  {redactSensitiveText(
                    selectedTrace.responsePayloadSummary?.sampleResponse || 'Stream complete.'
                  )}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: SPAN WATERFALL */}
          {activeTab === 'waterfall' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Microsecond Span Waterfall Tree
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
          )}

          {/* TAB 3: RAW PAYLOADS */}
          {activeTab === 'raw' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Raw Request Context</span>
                <pre className="font-mono text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto select-text">
                  {redactSensitiveText(JSON.stringify(selectedTrace.requestPayloadSummary, null, 2))}
                </pre>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Raw Response Context</span>
                <pre className="font-mono text-xs text-emerald-300 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto select-text">
                  {redactSensitiveText(JSON.stringify(selectedTrace.responsePayloadSummary, null, 2))}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            ID: {selectedTrace.id} • Port 4000 Loopback
          </span>

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

