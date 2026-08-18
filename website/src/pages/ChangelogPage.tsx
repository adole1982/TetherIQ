import React, { useState } from 'react';
import { 
  Clock, 
  Download, 
  Check, 
  Copy, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  Layers, 
  Terminal,
  ExternalLink,
  Tag
} from 'lucide-react';

interface ChangelogPageProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const ChangelogPage: React.FC<ChangelogPageProps> = ({ navigate, onOpenDownload }) => {
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  const handleCopySha = (sha: string, id: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(id);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const releases = [
    {
      version: 'v1.2.0',
      date: 'August 2026',
      status: 'Current Stable',
      badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      highlights: [
        {
          title: '1-Click Multi-Client MCP Auto-Sync',
          desc: 'Simultaneous non-destructive JSON injection across Cursor (~/.cursor/mcp.json), Claude Code (~/.claude.json), Windsurf, and Devin with automated timestamped .bak backups.'
        },
        {
          title: 'Enterprise Verified MCP Schemas',
          desc: 'Pre-validated connectors for Databricks Genie, Snowflake Analytics, Supabase, GitHub, Slack, and PostgreSQL.'
        },
        {
          title: 'Real-Time Spend Dials & Hard Circuit Breaker',
          desc: 'Visual daily/monthly budget dials that cut off runaway recursive agent loops with HTTP 402 responses.'
        },
        {
          title: 'Live Telemetry HUD & Latency Breakdown',
          desc: 'Microsecond latency tracking, token velocity counters, and active connected agent monitoring in a dark-mode dashboard.'
        }
      ],
      sha: 'a8f9c0e1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9'
    },
    {
      version: 'v1.1.0',
      date: 'July 2026',
      status: 'Previous',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      highlights: [
        {
          title: 'Multi-Tier Model Routing Matrix',
          desc: 'Automatic cascading failover priority chains (Anthropic Claude 3.7 -> AWS Bedrock -> Groq -> Ollama) to eliminate 429 rate limit outages.'
        },
        {
          title: 'OpenTelemetry Trace Waterfall Inspector',
          desc: 'Deep observability drawer visualizing agent tool execution spans and token consumption per tool call.'
        },
        {
          title: '1-Click Sensitive Key Redaction',
          desc: 'Automatic log sanitization stripping bearer tokens and API keys (sk-ant-***, ghp_***) for safe GitHub issue reporting.'
        }
      ],
      sha: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2'
    },
    {
      version: 'v1.0.0',
      date: 'June 2026',
      status: 'Initial Launch',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      highlights: [
        {
          title: 'Initial Public Desktop Control Plane',
          desc: 'Native desktop application built on Tauri/Rust with embedded Fastify proxy engine on 127.0.0.1:4000.'
        },
        {
          title: 'LiteLLM Gateway Core Integration',
          desc: 'Full OpenAI (/v1/chat/completions) and Anthropic (/v1/messages) protocol translation for autonomous coding agents.'
        },
        {
          title: 'Integrated Execution Terminal',
          desc: 'Embedded terminal drawer (Xterm.js) pre-loaded with local proxy gateway environment variables.'
        }
      ],
      sha: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* 1. Hero */}
      <section className="pt-12 pb-14 md:pt-20 md:pb-20 border-b border-slate-100 bg-slate-50/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-cyan-50 border border-cyan-200 text-xs font-semibold text-cyan-800 mb-6">
            <Clock className="w-4 h-4 text-cyan-600" />
            <span>Continuous Reliability & Release Updates</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
            Release Changelog & Downloads
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto mb-8">
            Stay up-to-date with new model failover adapters, verified MCP tools, spend circuit breakers, and telemetry updates.
          </p>

          <div className="flex items-center justify-center space-x-4 text-xs font-mono text-slate-500">
            <span>Latest: v1.2.0</span>
            <span>•</span>
            <a 
              href="https://github.com/alexd/TetherMesh/releases" 
              target="_blank" 
              rel="noreferrer"
              className="text-cyan-700 hover:text-cyan-800 font-semibold flex items-center gap-1"
            >
              <span>GitHub Release Feed</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </section>

      {/* 2. Timeline Feed */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {releases.map((rel) => (
            <div key={rel.version} className="relative pl-6 sm:pl-8 border-l-2 border-slate-200 space-y-6">
              {/* Node dot on timeline */}
              <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-white border-4 border-cyan-500 shadow-xs" />

              {/* Release Header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{rel.version}</h2>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${rel.badgeColor}`}>
                    {rel.status}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">{rel.date}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCopySha(rel.sha, rel.version)}
                    className="px-2.5 py-1 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-mono flex items-center gap-1 transition-all"
                  >
                    {copiedSha === rel.version ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{copiedSha === rel.version ? 'Copied SHA' : 'SHA-256'}</span>
                  </button>
                  <button
                    onClick={onOpenDownload}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download {rel.version}</span>
                  </button>
                </div>
              </div>

              {/* Release Highlights Cards */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-4 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Key Improvements & Features
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {rel.highlights.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1.5">
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Verification Box */}
          <div className="p-6 rounded-2xl bg-slate-950 text-white border border-slate-800 space-y-3 font-mono text-xs shadow-xl">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold uppercase tracking-wider text-[10px]">
              <ShieldCheck className="w-4 h-4" />
              <span>Release Cryptographic Verification</span>
            </div>
            <p className="text-slate-300 font-sans text-xs">
              Verify your downloaded binary checksum using standard terminal commands:
            </p>
            <div className="p-3 rounded-lg bg-slate-900 text-cyan-300 border border-slate-800 select-all">
              shasum -a 256 TetherIQ-1.2.0-universal.dmg
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
