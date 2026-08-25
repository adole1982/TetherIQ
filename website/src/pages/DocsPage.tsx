import React, { useState } from 'react';
import {
  BookOpen,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Layers,
  Sliders,
  ExternalLink,
  Key,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Lock,
  Cpu
} from 'lucide-react';
import { Github } from '../components/icons/BrandIcons';

interface DocsPageProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const DocsPage: React.FC<DocsPageProps> = ({ navigate, onOpenDownload }) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'claude' | 'cursor' | 'python'>('claude');
  const [activeSection, setActiveSection] = useState('quickstart');

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const navSections = [
    {
      title: 'GETTING STARTED',
      items: [
        { id: 'quickstart', label: '60-Second Quickstart' },
        { id: 'gateway', label: 'Local Gateway (127.0.0.1)' },
        { id: 'keys', label: 'API Key Management' },
      ]
    },
    {
      title: 'CLIENT INTEGRATIONS',
      items: [
        { id: 'claude-code', label: 'Claude Code CLI' },
        { id: 'cursor', label: 'Cursor & Windsurf' },
        { id: 'python-sdk', label: 'Python & TypeScript SDK' },
        { id: 'ollama', label: 'Local Ollama & LM Studio' },
      ]
    },
    {
      title: 'CORE FEATURES',
      items: [
        { id: 'failovers', label: 'Resilient Model Failover Matrix' },
        { id: 'circuit-breakers', label: 'Hard Spend Circuit Breakers' },
        { id: 'mcp-sync', label: '1-Click MCP Auto-Sync' },
        { id: 'telemetry', label: 'Live Telemetry & Traces' },
      ]
    },
    {
      title: 'SECURITY & PRIVACY',
      items: [
        { id: 'keychain', label: 'Local Key Storage & Privacy' },
        { id: 'sanitizer', label: 'Sanitized Log Export' },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Sidebar (3 Cols) */}
          <aside className="hidden lg:block lg:col-span-3 border-r border-slate-100 pr-6 space-y-8">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <BookOpen className="w-4 h-4 text-cyan-600" />
              <span>Developer Documentation</span>
            </div>

            <div className="space-y-6">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {section.items.map((item) => {
                      const isActive = activeSection === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => setActiveSection(item.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-all text-xs font-medium ${
                              isActive 
                                ? 'bg-cyan-50 text-cyan-800 font-semibold border-l-2 border-cyan-500' 
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                          >
                            {item.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          {/* Central Main Documentation Content (6 Cols) */}
          <main className="lg:col-span-6 space-y-10">
            {/* Breadcrumb */}
            <div className="flex items-center space-x-2 text-xs font-mono text-slate-500">
              <span>Docs</span>
              <span>/</span>
              <span>Getting Started</span>
              <span>/</span>
              <span className="text-cyan-700 font-semibold">60-Second Quickstart</span>
            </div>

            {/* Header */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
                60-Second Quickstart Guide
              </h1>
              <p className="text-base text-slate-600 leading-relaxed">
                Connect your AI coding agents, IDEs, and CLI tools to TetherMesh in three effortless steps.
              </p>
            </div>

            {/* Step 1 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  1
                </div>
                <h3 className="text-lg font-bold text-slate-900">Launch TetherMesh Desktop</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Open TetherMesh on macOS, Windows, or Linux. The local loopback proxy gateway spins up automatically on port 4000.
              </p>
              <div className="p-3 rounded-xl bg-slate-900 text-white font-mono text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-slate-300">Gateway Status:</span>
                  <span className="text-emerald-400 font-bold">http://127.0.0.1:4000</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Loopback Ready</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  2
                </div>
                <h3 className="text-lg font-bold text-slate-900">Add Your Provider API Keys</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Click <strong>"Keys"</strong> in the top titlebar. Add your Anthropic, OpenAI, AWS Bedrock, or Groq credentials.
              </p>
              <div className="p-3.5 rounded-xl bg-cyan-50/70 border border-cyan-200 flex items-start space-x-2 text-xs text-cyan-900">
                <Lock className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Security Note:</strong> Master provider API keys (Anthropic, OpenAI, AWS, Groq) stay strictly on your local machine and are never transmitted to external cloud servers. MCP tool configs are synchronized locally to your editor JSON files with automated <code className="bg-cyan-100/80 px-1 py-0.5 rounded font-mono text-[11px]">.bak</code> backups.
                </span>
              </div>
            </div>

            {/* Step 3: Tabbed Client Setup */}
            <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  3
                </div>
                <h3 className="text-lg font-bold text-slate-900">Connect Your Coding Agent</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Select your client below to configure the gateway endpoint in 1 command or setting:
              </p>

              {/* Tabs */}
              <div className="flex space-x-2 border-b border-slate-100 pb-2">
                <button
                  onClick={() => setActiveTab('claude')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'claude' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Claude Code CLI
                </button>
                <button
                  onClick={() => setActiveTab('cursor')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'cursor' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Cursor / Windsurf
                </button>
                <button
                  onClick={() => setActiveTab('python')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'python' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Python SDK
                </button>
              </div>

              {/* Code Box */}
              <div className="p-4 rounded-xl bg-slate-950 text-white font-mono text-xs space-y-2 border border-slate-800 relative">
                <button
                  onClick={() => {
                    const text = activeTab === 'claude' 
                      ? 'export ANTHROPIC_BASE_URL=http://127.0.0.1:4000\nclaude'
                      : activeTab === 'cursor'
                      ? 'Base URL: http://127.0.0.1:4000/v1\nModel: fast-code'
                      : 'from openai import OpenAI\nclient = OpenAI(base_url="http://127.0.0.1:4000/v1", api_key="tethermesh-local")';
                    handleCopy(text, activeTab);
                  }}
                  className="absolute right-3 top-3 p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-white transition-all flex items-center gap-1 text-[11px]"
                >
                  {copiedCmd === activeTab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCmd === activeTab ? 'Copied' : 'Copy'}</span>
                </button>

                {activeTab === 'claude' && (
                  <pre className="space-y-1">
                    <span className="text-slate-500"># Set environment variable and run Claude Code</span>
                    <br />
                    <span className="text-cyan-400">export</span> ANTHROPIC_BASE_URL=http://127.0.0.1:4000
                    <br />
                    <span className="text-emerald-400">claude</span>
                  </pre>
                )}

                {activeTab === 'cursor' && (
                  <pre className="space-y-1">
                    <span className="text-slate-500">// In Cursor Settings → Models → OpenAI API Key:</span>
                    <br />
                    Base URL: <span className="text-emerald-300">http://127.0.0.1:4000/v1</span>
                    <br />
                    Model: <span className="text-cyan-400">fast-code</span> or <span className="text-cyan-400">heavy-reasoning</span>
                  </pre>
                )}

                {activeTab === 'python' && (
                  <pre className="space-y-1">
                    <span className="text-cyan-400">from</span> openai <span className="text-cyan-400">import</span> OpenAI
                    <br />
                    client = OpenAI(
                    <br />
                    &nbsp;&nbsp;base_url=<span className="text-emerald-300">"http://127.0.0.1:4000/v1"</span>,
                    <br />
                    &nbsp;&nbsp;api_key=<span className="text-emerald-300">"tethermesh-local"</span>
                    <br />
                    )
                  </pre>
                )}
              </div>
            </div>

            {/* Next Steps Grid */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <h3 className="font-bold text-slate-900 text-base">Next Steps & Advanced Features</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-cyan-600" />
                    Configure Failover Priority
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Set up cascading model routes (Claude → Bedrock → Groq) to ensure zero downtime on 429 errors.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Set Daily Spend Circuit Breakers
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Arm visual budget caps (e.g. $10.00/day) to stop runaway recursive agent loops automatically.
                  </p>
                </div>
              </div>
            </div>
          </main>

          {/* Right Sidebar ("On This Page" - 3 Cols) */}
          <aside className="hidden lg:block lg:col-span-3 pl-6 border-l border-slate-100 space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              On This Page
            </div>
            <ul className="space-y-2 text-xs text-slate-600 font-medium">
              <li>
                <a href="#step-1" className="hover:text-slate-900 transition-colors">1. Launch Desktop App</a>
              </li>
              <li>
                <a href="#step-2" className="hover:text-slate-900 transition-colors">2. Add Provider Keys</a>
              </li>
              <li>
                <a href="#step-3" className="hover:text-slate-900 transition-colors">3. Connect Your Agent</a>
              </li>
              <li>
                <a href="#next-steps" className="hover:text-slate-900 transition-colors">Next Steps & Failovers</a>
              </li>
            </ul>

            <div className="pt-6 border-t border-slate-100 space-y-3 text-xs">
              <a 
                href="https://github.com/adole1982/TetherIQ" 
                target="_blank" 
                rel="noreferrer"
                className="px-4 py-2 rounded-lg bg-slate-900 text-slate-100 hover:bg-slate-800 text-sm font-semibold transition-all inline-flex items-center gap-2"
              >
                <Github className="w-4 h-4" />
                <span>View on GitHub</span>
              </a>
              <button
                onClick={onOpenDownload}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-all"
              >
                Join Waitlist →
              </button>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
};
