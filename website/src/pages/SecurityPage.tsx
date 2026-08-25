import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Server, 
  Key, 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Terminal, 
  ArrowRight,
  Database,
  EyeOff,
  Cpu
} from 'lucide-react';

interface SecurityPageProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const SecurityPage: React.FC<SecurityPageProps> = ({ navigate, onOpenDownload }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const faqs = [
    {
      q: 'Does TetherMesh log or transmit my codebase or prompts to third-party servers?',
      a: 'No. TetherMesh operates strictly on localhost (127.0.0.1:4000). All telemetry, spans, token counters, and prompt logs reside strictly in your local computer’s volatile memory / local SQLite database. TetherMesh has zero telemetry servers and zero cloud analytics.'
    },
    {
      q: 'Where are my provider API keys stored?',
      a: 'Your master LLM provider API keys (Anthropic, OpenAI, AWS Bedrock, Google Vertex, Groq) reside strictly on your local machine (either in local memory or your own local environment variables). TetherMesh never sends your credentials or prompts to external telemetry servers. For editor MCP tools (e.g. GitHub, Postgres), configurations are synced directly to your local editor JSON files (like ~/.cursor/mcp.json) with automated timestamped .bak backups.'
    },
    {
      q: 'Can I use TetherMesh completely offline or in air-gapped environments?',
      a: 'Yes. TetherMesh has native support for local LLM engines like Ollama and LM Studio. You can run offline models (e.g. Qwen2.5-Coder, DeepSeek R1, Llama 3.3) on 127.0.0.1 with zero external internet connectivity.'
    },
    {
      q: 'How does TetherMesh prevent corrupting my existing MCP config files?',
      a: 'TetherMesh utilizes non-destructive JSON merging. It reads your existing ~/.cursor/mcp.json or ~/.claude.json, creates an automated timestamped backup (.bak file) in the same directory, and inserts only verified tool entries without removing custom configurations.'
    },
    {
      q: 'Is TetherMesh open-source and auditable?',
      a: 'Yes. TetherMesh is 100% open-source on GitHub. You can inspect the complete source code, build and run it locally, and audit all local traffic with standard networking tools.'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* 1. Security Hero */}
      <section className="pt-12 pb-16 md:pt-20 md:pb-24 border-b border-slate-100 bg-slate-50/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 mb-6">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Local-First Security Architecture</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
            100% Local. Zero Cloud Tracking. <br />
            <span className="brand-gradient-text">Your Keys Stay Yours.</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto mb-8">
            TetherMesh runs privately on your computer. No accounts to create, no external databases, no cloud tracking, and your API keys never leave your machine.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-500">
            <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
              🔒 Zero Cloud Intermediary
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
              🛡️ 100% Local Key Privacy
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
              ⚡ Open-Source LiteLLM Core
            </span>
          </div>
        </div>
      </section>

      {/* 2. Visual Architecture Diagram */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Direct Loopback Architecture
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Zero cloud telemetry or MITM interception. All traffic flows directly from your machine.
            </p>
          </div>

          {/* Diagram Card */}
          <div className="rounded-2xl bg-slate-950 p-6 sm:p-8 border border-slate-800 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Box 1: Local Agent */}
              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 text-center space-y-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-800 mx-auto flex items-center justify-center text-cyan-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Local Coding Agents</h3>
                  <p className="text-[11px] text-slate-400 mt-1">Claude Code, Cursor, Windsurf, Devin</p>
                </div>
                <div className="text-[10px] font-mono text-cyan-300 bg-slate-950 p-1.5 rounded border border-slate-800">
                  127.0.0.1:4000
                </div>
              </div>

              {/* Box 2: TetherMesh Gateway */}
              <div className="p-6 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-cyan-500 text-center space-y-3 shadow-lg shadow-cyan-950/50 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 font-bold text-[10px] tracking-wider uppercase">
                  100% Localhost
                </div>
                <div className="w-12 h-12 rounded-xl bg-cyan-600/20 border border-cyan-500 mx-auto flex items-center justify-center text-cyan-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">TetherMesh Control Plane</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Failover Matrix • Spend Cap • MCP Sync • Local Privacy
                  </p>
                </div>
                <div className="text-[10px] font-mono text-emerald-400 bg-slate-950/90 p-1.5 rounded border border-slate-800">
                  No External Cloud Transit
                </div>
              </div>

              {/* Box 3: LLM Providers */}
              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 text-center space-y-3">
                <div className="w-10 h-10 rounded-lg bg-blue-950/80 border border-blue-800 mx-auto flex items-center justify-center text-blue-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Official Provider APIs</h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Anthropic, OpenAI, AWS Bedrock, Google Vertex, Local Ollama
                  </p>
                </div>
                <div className="text-[10px] font-mono text-blue-300 bg-slate-950 p-1.5 rounded border border-slate-800">
                  Direct HTTPS (TLS 1.3)
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/80 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Direct encrypted connections. Zero intermediate cloud telemetry servers.</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. The 4 Security Pillars */}
      <section className="py-16 bg-slate-50/60 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-600 mb-2">
              Security by Design
            </h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Four Core Guarantees for Enterprise Confidence
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Pillar 1 */}
            <div className="frosted-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600">
                <Lock className="w-5 h-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">1. Private On-Device Gateway</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                The TetherMesh proxy engine runs strictly on your local machine. It never exposes open external ports or connects to cloud proxy intermediaries.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="frosted-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <Key className="w-5 h-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">2. Zero Cloud Key Storage</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Master LLM API credentials (Anthropic, OpenAI, AWS, Groq) reside strictly on your local machine. They are never transmitted to external cloud servers or third-party telemetry systems.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="frosted-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <EyeOff className="w-5 h-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">3. 1-Click Sanitized Debug Redaction</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                When generating diagnostic reports for GitHub issues, TetherMesh’s built-in sanitizer automatically redacts all API tokens (<code className="text-xs font-mono text-cyan-800 bg-cyan-50 px-1 py-0.5 rounded">sk-ant-***</code>, <code className="text-xs font-mono text-cyan-800 bg-cyan-50 px-1 py-0.5 rounded">ghp_***</code>).
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="frosted-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">4. Non-Destructive Config Backups</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Before updating any editor config file (<code className="text-xs font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">~/.cursor/mcp.json</code>), TetherMesh creates an automated timestamped backup (<code className="text-xs font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">.bak</code>) ensuring zero config loss.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Security FAQ */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-600 mb-2">
              Transparency & FAQ
            </h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Frequently Asked Security Questions
            </h3>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div 
                  key={idx} 
                  className="rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between font-semibold text-slate-900 text-sm hover:bg-slate-100/60 transition-colors"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-4 pt-1 text-sm text-slate-600 leading-relaxed border-t border-slate-200/50 bg-white">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Verification CTA Box */}
          <div className="mt-14 p-6 rounded-2xl bg-slate-100 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Want to inspect the code or contribute?</h4>
              <p className="text-xs text-slate-600 mt-0.5">Explore our open-source codebase, architecture, and roadmap on GitHub.</p>
            </div>
            <a
              href="https://github.com/adole1982/TetherIQ"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 shrink-0 transition-all"
            >
              <span>View Source on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
