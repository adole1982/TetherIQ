import React, { useState } from 'react';
import { 
  GitFork, 
  Key, 
  ShieldCheck, 
  ArrowDown, 
  Sparkles, 
  Check, 
  Clock, 
  Layers, 
  Zap, 
  AlertCircle,
  Plus
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';

export const ModelRoutingMatrix: React.FC = () => {
  const { 
    fallbackChains, 
    virtualAliases, 
    providers, 
    setKeyManagerOpen 
  } = useTetherStore();

  const [activeChainId, setActiveChainId] = useState<string>(fallbackChains[0]?.id || 'chain-heavy-reasoning');

  const selectedChain = fallbackChains.find(c => c.id === activeChainId) || fallbackChains[0];

  return (
    <div className="space-y-6">
      {/* Header with Key Manager Trigger */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex items-center justify-between">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center space-x-2">
            <GitFork className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Resilient Fallback Chains</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Model Routing & Failover Matrix</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure linear and tiered priority lists. If Anthropic hits a <code className="text-amber-300 font-mono">429 Rate Limit</code>, TetherIQ automatically reroutes active agent sessions to AWS Bedrock or Groq with zero session disruption.
          </p>
        </div>

        <button
          onClick={() => setKeyManagerOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500/40 text-xs font-semibold shadow-sm transition-all"
        >
          <Key className="w-4 h-4 text-amber-400" />
          <span>Manage Provider API Keys ({providers.filter(p => p.isEnabled).length})</span>
        </button>
      </div>

      {/* Virtual Model Aliasing Card */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Virtual Model Target Aliasing</h2>
          </div>
          <span className="text-[11px] text-slate-500">Clients can request abstract model names</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {virtualAliases.map((alias) => {
            const mappedChain = fallbackChains.find(c => c.id === alias.targetChainId);
            return (
              <div key={alias.alias} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                      model: "{alias.alias}"
                    </span>
                    <span className="text-xs text-slate-400">maps to</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{alias.description}</p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-semibold text-white">{mappedChain?.name || 'Default Chain'}</span>
                  <div className="text-[11px] text-emerald-400 font-mono flex items-center justify-end space-x-1 mt-0.5">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Active Chain</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Fallback Chain Visualizer */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        {/* Chain Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            {fallbackChains.map((chain) => (
              <button
                key={chain.id}
                onClick={() => setActiveChainId(chain.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeChainId === chain.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                {chain.name}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 font-mono">
            {selectedChain?.nodes.length} fallback tiers configured
          </span>
        </div>

        {/* Fallback Waterfall Nodes */}
        <div className="space-y-3 py-2">
          {selectedChain?.nodes.map((node, index) => (
            <React.Fragment key={node.id}>
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                    index === 0 ? 'bg-cyan-500 text-slate-950 font-mono' : 'bg-slate-800 text-slate-300 font-mono'
                  }`}>
                    P{node.priority}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{node.displayName}</span>
                      <span className="font-mono text-[11px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {node.modelIdentifier}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-0.5 font-mono">
                      <span>In: ${node.costPer1kInput}/1k</span>
                      <span>Out: ${node.costPer1kOutput}/1k</span>
                      <span>Ctx: {(node.maxContextTokens / 1000).toFixed(0)}k</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-xs">
                  <span className="flex items-center space-x-1 text-slate-400 font-mono text-[11px]">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Timeout: {node.timeoutMs / 1000}s</span>
                  </span>

                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    index === 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {index === 0 ? 'Primary Tier' : `Fallback Tier ${index}`}
                  </span>
                </div>
              </div>

              {index < (selectedChain?.nodes.length || 0) - 1 && (
                <div className="flex items-center justify-center py-0.5 text-slate-600">
                  <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-500">
                    <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
                    <span>Auto-failover on 429 RateLimit / 503 Outage</span>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
