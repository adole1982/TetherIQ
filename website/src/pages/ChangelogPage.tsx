import React from 'react';
import {
  Clock,
  Sparkles,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';

interface ChangelogPageProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const ChangelogPage: React.FC<ChangelogPageProps> = ({ navigate, onOpenDownload }) => {

  const releases = [
    {
      version: 'v1.2.0',
      date: 'Q1 2027 (Future Vision)',
      status: 'Planned',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      highlights: [
        {
          title: 'Native OS Keychain / Credential Vault',
          desc: 'Encrypted storage integration for master provider API keys via macOS Keychain and Windows Credential Manager.'
        },
        {
          title: 'Live Streaming Token Visualization',
          desc: 'Real-time SSE token stream monitoring and per-request latency analytics in a lightweight HUD.'
        },
        {
          title: 'Air-Gapped Offline Local Mesh',
          desc: 'Enhanced discovery and auto-configuration for offline local LLMs (Ollama, LM Studio, and vLLM).'
        },
        {
          title: 'Expanded MCP Catalog (50+ Tools)',
          desc: 'Pre-validated configuration schemas for additional database, search, and productivity tool connectors.'
        }
      ]
    },
    {
      version: 'v1.1.0',
      date: 'November 2026 (Planned)',
      status: 'Post-Launch',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      highlights: [
        {
          title: 'Hybrid Billing Support',
          desc: 'Track monthly subscription allowances (e.g. Claude Pro, Google AI Studio) alongside pay-per-token overage thresholds.'
        },
        {
          title: 'Active Provider Health Probing',
          desc: 'Automated background ping checks (every 60s) to detect provider outages and measure real upstream latency.'
        },
        {
          title: 'Request Tracing & Inspector Drawer',
          desc: 'Inspect in-flight agent prompts, payloads, and tool execution spans directly in a side drawer.'
        },
        {
          title: '1-Click Sanitized Debug Export',
          desc: 'Export sanitized diagnostic logs with sensitive API keys (sk-ant-***, ghp_***) automatically redacted.'
        }
      ]
    },
    {
      version: 'v1.0.0',
      date: 'October 2026 (Planned)',
      status: 'Initial Launch',
      badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      highlights: [
        {
          title: 'Local Control Plane & Proxy Gateway',
          desc: 'Zero-config local proxy on 127.0.0.1:4000 supporting OpenAI (/v1/chat/completions) and Anthropic (/v1/messages) protocols.'
        },
        {
          title: 'Hard Spend Circuit Breakers',
          desc: 'Visual daily and monthly budget caps that automatically halt runaway agent loops with HTTP 402 cutoffs.'
        },
        {
          title: '1-Click Multi-IDE MCP Tool Sync',
          desc: 'Automated non-destructive JSON configuration injection for Cursor, Claude Code, and Windsurf with automated .bak backups.'
        },
        {
          title: 'Virtual Model Aliases & LiteLLM Core',
          desc: 'Define simple aliases like fast-code and heavy-reasoning mapped to your preferred upstream providers.'
        },
        {
          title: 'Integrated Execution Terminal',
          desc: 'Embedded terminal drawer pre-loaded with local proxy gateway environment variables.'
        }
      ]
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
            Release Roadmap & Planned Features
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto mb-8">
            TetherMesh is launching October 2026. Below is our planned feature roadmap showing what we're building for the initial release and beyond.
          </p>

          <div className="flex items-center justify-center space-x-4 text-xs font-mono text-slate-500">
            <span>Launch Target: October 2026</span>
            <span>•</span>
            <a
              href="https://github.com/adole1982/TetherIQ"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-700 hover:text-cyan-800 font-semibold flex items-center gap-1"
            >
              <span>View on GitHub</span>
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
                  {rel.status === 'Initial Launch' && (
                    <button
                      onClick={onOpenDownload}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Join Waitlist</span>
                    </button>
                  )}
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

          {/* Open Source Commitment Box */}
          <div className="p-6 rounded-2xl bg-slate-950 text-white border border-slate-800 space-y-3 shadow-xl">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold uppercase tracking-wider text-[10px]">
              <ShieldCheck className="w-4 h-4" />
              <span>Open-Source & Transparency Commitment</span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              TetherMesh is built as an open-source project. All application code, proxy routing logic, and release builds are developed transparently on GitHub.
            </p>
            <p className="text-slate-400 text-xs">
              100% Open-Source • Local-First • Zero Cloud Telemetry • No Account Required
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
