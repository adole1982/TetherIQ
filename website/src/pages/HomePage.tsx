import React, { useState } from 'react';
import { 
  Download, 
  Check, 
  Copy, 
  Terminal, 
  ShieldCheck, 
  Zap, 
  Layers, 
  Flame, 
  Sliders, 
  ArrowRight, 
  Activity, 
  Lock, 
  RefreshCw, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Server,
  Code,
  DollarSign,
  AlertTriangle,
  FileCode,
  CheckCircle2,
  XCircle,
  Database,
  Cpu
} from 'lucide-react';

interface HomePageProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ navigate, onOpenDownload }) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'claude' | 'cursor' | 'python'>('claude');

  const curlCmd = 'curl -fsSL https://tethermesh.dev/install.sh | bash';

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(curlCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* 1. Hero Section */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-to-b from-cyan-50/50 via-slate-50/30 to-transparent pointer-events-none -z-10" />
        <div className="absolute top-20 right-10 w-96 h-96 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-40 left-10 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Top Pill Badge */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-100/90 border border-slate-200 text-xs font-semibold text-slate-800 mb-6 shadow-2xs">
            <span className="flex h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
            <span>Built on LiteLLM Core</span>
            <span className="text-slate-300">•</span>
            <span className="text-cyan-700 font-medium">Zero-Config Desktop Control Plane</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl mx-auto leading-[1.15] mb-6">
            The Command Center for <br className="hidden sm:inline" />
            <span className="brand-gradient-text">Local AI Workflows</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-4">
            One zero-config desktop app to eliminate runaway API bills, prevent 429 rate-limit crashes, 
            and manage all your MCP tools across Claude Code, Cursor, Windsurf, and beyond.
          </p>

          {/* Tagline Badge */}
          <p className="text-xs sm:text-sm font-mono tracking-widest font-bold uppercase text-slate-500 mb-8">
            CONNECT. TRACE. OPTIMIZE.
          </p>

          {/* CTA Hub */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-10">
            <button
              onClick={onOpenDownload}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm tracking-wide shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 group"
            >
              <Download className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
              <span>Download Free for macOS & Windows</span>
            </button>

            <button
              onClick={() => navigate('/docs')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-semibold text-sm border border-slate-200 transition-all flex items-center justify-center space-x-1.5"
            >
              <span>60-Second Quickstart</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs font-medium text-slate-500 mb-14">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Verified SHA-256 Checksums
            </span>
            <span className="hidden sm:inline text-slate-300">•</span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-cyan-600" />
              100% Local Loopback (127.0.0.1)
            </span>
            <span className="hidden sm:inline text-slate-300">•</span>
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-600" />
              Native Rust / Tauri (~50MB RAM)
            </span>
          </div>

          {/* Perspective Product UI Preview */}
          <div className="relative max-w-5xl mx-auto">
            <div className="rounded-2xl bg-slate-950 p-2 sm:p-3 shadow-2xl border border-slate-800 ring-1 ring-slate-900/10">
              {/* Fake Window Titlebar */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/70 rounded-t-xl text-xs font-mono text-slate-400">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="text-slate-300 ml-2 font-bold flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                    TetherMesh Control Plane
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    127.0.0.1:4000
                  </span>
                  <span className="text-slate-400">Daily Cap: $10.00 ($3.42 used)</span>
                </div>
              </div>

              {/* Cockpit Grid Demo */}
              <div className="p-4 sm:p-6 bg-slate-950 text-left space-y-4 rounded-b-xl">
                {/* Live Telemetry HUD Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                      <span>Throughput</span>
                      <Activity className="w-3 h-3 text-cyan-400" />
                    </div>
                    <div className="text-lg font-mono font-bold text-white mt-1">148 <span className="text-xs text-slate-400 font-normal">t/sec</span></div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                      <span>Avg Latency</span>
                      <Zap className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div className="text-lg font-mono font-bold text-emerald-400 mt-1">214 <span className="text-xs text-slate-400 font-normal">ms</span></div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                      <span>Spend Safety</span>
                      <ShieldCheck className="w-3 h-3 text-cyan-400" />
                    </div>
                    <div className="text-lg font-mono font-bold text-white mt-1">34.2% <span className="text-xs text-slate-400 font-normal">of cap</span></div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                      <span>Active Agents</span>
                      <Cpu className="w-3 h-3 text-purple-400" />
                    </div>
                    <div className="text-lg font-mono font-bold text-purple-300 mt-1">3 <span className="text-xs text-slate-400 font-normal">clients</span></div>
                  </div>
                </div>

                {/* Model Failover Priority Matrix Strip */}
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-cyan-400 font-bold">heavy-reasoning</span>
                    <span className="text-slate-500">→</span>
                    <div className="flex items-center space-x-1 font-mono">
                      <span className="px-2 py-1 bg-cyan-950 text-cyan-300 rounded border border-cyan-800/80">1. Claude 3.7</span>
                      <span className="text-slate-500">→</span>
                      <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">2. AWS Bedrock</span>
                      <span className="text-slate-500">→</span>
                      <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">3. Groq</span>
                      <span className="text-slate-500">→</span>
                      <span className="px-2 py-1 bg-emerald-950 text-emerald-300 rounded border border-emerald-800/80">4. Ollama</span>
                    </div>
                  </div>
                  <span className="text-emerald-400 font-mono flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Zero-429 Resilience Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Trust Bar */}
      <section className="border-y border-slate-100 bg-slate-50/70 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-lg font-bold text-slate-900">100% Local-First</div>
              <p className="text-xs text-slate-500 mt-0.5">Runs privately on your computer</p>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">Zero Cloud Telemetry</div>
              <p className="text-xs text-slate-500 mt-0.5">No tracking, no accounts, no MITM</p>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">OS Keychain Security</div>
              <p className="text-xs text-slate-500 mt-0.5">API keys encrypted on your hardware</p>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">Powered by LiteLLM</div>
              <p className="text-xs text-slate-500 mt-0.5">Proven open-source translation core</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. The Frustrating Reality vs. The TetherMesh Fix (Comparison Grid) */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-600 mb-2">
              The Reality Check
            </h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
              Stop fighting your AI tools. Start building.
            </h3>
            <p className="text-base text-slate-600 mt-3">
              Autonomous coding agents are incredible until they hit rate limits, runaway spend loops, and configuration chaos.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* The Frustrating Reality */}
            <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-6 sm:p-8 space-y-6">
              <div className="flex items-center space-x-2 text-rose-700 font-bold text-sm uppercase tracking-wider">
                <XCircle className="w-5 h-5 text-rose-600" />
                <span>The Frustrating Reality Today</span>
              </div>

              <div className="space-y-4 text-sm">
                <div className="p-4 rounded-xl bg-white border border-rose-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Session-Killing 429 Rate Limits
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    Midway through a 20-minute refactor with Claude Code, Anthropic throws a 429. The agent crashes and all context is lost.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-rose-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Surprise API Bills & Runaway Loops
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    Autonomous agents get stuck in recursive debugging loops, silently burning through hundreds of dollars before you notice.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-rose-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    JSON Configuration Hell
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    Adding tools means wrestling npx commands and manually hand-editing fragmented JSON files across .cursor, .claude, and .codeium.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-rose-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Siloed Billing & Zero Visibility
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    Token usage, costs, and latencies are scattered across 5 separate cloud billing consoles (AWS, OpenAI, Anthropic, GCP).
                  </p>
                </div>
              </div>
            </div>

            {/* The TetherMesh Fix */}
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/30 p-6 sm:p-8 space-y-6">
              <div className="flex items-center space-x-2 text-cyan-800 font-bold text-sm uppercase tracking-wider">
                <CheckCircle2 className="w-5 h-5 text-cyan-600" />
                <span>The TetherMesh Fix</span>
              </div>

              <div className="space-y-4 text-sm">
                <div className="p-4 rounded-xl bg-white border border-cyan-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Invisible Automatic Failovers
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    TetherMesh silently reroutes in-flight prompts to AWS Bedrock, Google Vertex, or Groq without interrupting the active agent CLI session.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-cyan-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Hard Circuit-Breaker Spend Caps
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    Set hard daily/monthly limits ($10/day). If an agent goes rogue, TetherMesh cuts off requests instantly with HTTP 402.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-cyan-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    1-Click MCP Sync. Zero JSON Config.
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    Pick a tool, check your target apps, and TetherMesh non-destructively injects verified configs in 5ms with automated .bak backups.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-cyan-100 shadow-2xs">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Unified Local HUD & Span Tracing
                  </h4>
                  <p className="text-slate-600 text-xs mt-1">
                    Monitor live throughput (t/sec), per-model latency (ms), and active connected agents in one central dark-mode HUD.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Core Features Bento Grid */}
      <section id="features" className="py-20 bg-slate-50/60 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-600 mb-2">
              Engineered for Builders
            </h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
              Everything you need to orchestrate local agents
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Feature 1: LiteLLM with a Native Face */}
            <div className="frosted-card rounded-2xl p-8 frosted-card-hover flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 mb-5">
                  <Zap className="w-6 h-6" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
                  LiteLLM with a Native Face
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Run resilient local model proxying and automatic failovers with visual toggles instead of messy YAML configs. 
                  Define virtual aliases like <code className="text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded font-mono text-xs">fast-code</code> and <code className="text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded font-mono text-xs">heavy-reasoning</code>.
                </p>
              </div>

              {/* Visual Demo Card */}
              <div className="p-4 rounded-xl bg-slate-900 text-white font-mono text-xs space-y-2 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase">Linear Cascade Order</div>
                <div className="flex items-center justify-between text-slate-200">
                  <span>1. Anthropic (claude-3-7-sonnet)</span>
                  <span className="text-emerald-400">Primary (100%)</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>2. AWS Bedrock (us.anthropic.claude-3-7)</span>
                  <span className="text-amber-400">Fallback on 429</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>3. Local Ollama (qwen2.5-coder:32b)</span>
                  <span className="text-slate-400">Air-Gap Safety</span>
                </div>
              </div>
            </div>

            {/* Feature 2: 1-Click MCP Sync. Zero JSON Config. */}
            <div className="frosted-card rounded-2xl p-8 frosted-card-hover flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-5">
                  <Layers className="w-6 h-6" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
                  1-Click MCP Sync. Zero JSON Config.
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Connect databases, browsers, and GitHub to Cursor, Claude Code, and Windsurf simultaneously without hand-editing config files. 
                  TetherMesh non-destructively merges verified schemas with automated timestamped backups.
                </p>
              </div>

              {/* Visual Demo Sync Matrix */}
              <div className="p-4 rounded-xl bg-slate-900 text-white text-xs space-y-2.5 border border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Target Configuration Files</span>
                  <span className="text-cyan-400">5 Clients Synchronized</span>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>~/.cursor/mcp.json</span>
                    <span className="text-emerald-400">✓ Injected</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>~/.claude.json</span>
                    <span className="text-emerald-400">✓ Injected</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>~/.codeium/windsurf/mcp_config.json</span>
                    <span className="text-emerald-400">✓ Injected</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3: Live Telemetry, Hard Spend Caps & Integrated Terminal */}
            <div className="frosted-card rounded-2xl p-8 frosted-card-hover flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 mb-5">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
                  Live Telemetry, Hard Spend Caps & Integrated Terminal
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Watch tokens and burn rates in real time, block runaway agent loops with hard HTTP 402 cutoffs, 
                  and run your CLI agents directly beneath your control panel in the built-in terminal drawer.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 text-white font-mono text-xs space-y-2 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Daily Spend Cap</span>
                  <span className="text-rose-400 font-bold">$10.00 / day</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-cyan-500 to-amber-500 h-full w-[34%]" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Current: $3.42</span>
                  <span className="text-emerald-400">Circuit Breaker Armed</span>
                </div>
              </div>
            </div>

            {/* Feature 4: 100% Local. Zero Cloud Tracking. */}
            <div className="frosted-card rounded-2xl p-8 frosted-card-hover flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-5">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
                  100% Local. Zero Cloud Tracking. Your Keys Stay Yours.
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  TetherMesh runs privately on your computer. No accounts to create, no external databases, no cloud tracking, and your API keys never leave your machine.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 text-white text-xs space-y-2 border border-slate-800 font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Key Storage:</span>
                  <span className="text-cyan-400">macOS Keychain / Windows Vault</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Proxy Endpoint:</span>
                  <span className="text-emerald-400">http://127.0.0.1:4000/v1</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Air-Gap Mode:</span>
                  <span className="text-purple-400">Ollama & LM Studio Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Supported Ecosystem Grid */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-600 mb-2">
              Universal Interoperability
            </h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
              Compatible with your entire agentic toolchain
            </h3>
            <p className="text-base text-slate-600 mt-3">
              Point any tool or script to <code className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded font-mono text-xs">http://127.0.0.1:4000/v1</code> and start building.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {[
              { name: 'Cursor IDE', desc: 'Auto-sync MCPs & routing', badge: 'Popular' },
              { name: 'Claude Code', desc: 'CLI environment injection', badge: 'CLI' },
              { name: 'Windsurf', desc: 'Multi-model cascade', badge: 'IDE' },
              { name: 'Antigravity', desc: 'Full agent orchestration', badge: 'Agentic' },
              { name: 'Devin', desc: 'Spend-capped proxying', badge: 'Autonomous' },
              { name: 'VS Code', desc: 'Native continue/copilot', badge: 'Editor' },
            ].map((client) => (
              <div key={client.name} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all text-center">
                <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 mx-auto mb-2 flex items-center justify-center font-bold text-slate-800 text-sm shadow-2xs">
                  {client.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="font-bold text-slate-900 text-xs">{client.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{client.desc}</div>
              </div>
            ))}
          </div>

          {/* Featured MCP Connectors */}
          <div className="mt-12 p-6 rounded-2xl bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
            <div>
              <div className="flex items-center space-x-2 text-xs text-cyan-400 font-bold uppercase tracking-wider mb-1">
                <Layers className="w-4 h-4" />
                <span>50+ Verified MCP Server Catalog</span>
              </div>
              <h4 className="text-xl font-bold text-white tracking-tight">
                Databricks, Snowflake, Supabase, GitHub, Slack & PostgreSQL
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Pre-configured schemas with dynamic environment variable validation. One click injects clean tool definitions across all your target editors.
              </p>
            </div>
            <button
              onClick={() => navigate('/mcp')}
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shrink-0 flex items-center gap-1.5 shadow transition-all"
            >
              <span>Explore 50+ MCP Tools</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 6. Interactive Code Snippet Tabs */}
      <section className="py-20 bg-slate-50/70 border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
              Connect in 1 Line of Code
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              No SDK rewrites. Use standard OpenAI and Anthropic client protocols.
            </p>
          </div>

          {/* Code Tabs */}
          <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveCodeTab('claude')}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                    activeCodeTab === 'claude' ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Claude Code CLI
                </button>
                <button
                  onClick={() => setActiveCodeTab('cursor')}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                    activeCodeTab === 'cursor' ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cursor / Windsurf
                </button>
                <button
                  onClick={() => setActiveCodeTab('python')}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                    activeCodeTab === 'python' ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Python SDK
                </button>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">● 127.0.0.1:4000</span>
            </div>

            <div className="p-5 font-mono text-xs text-slate-200 overflow-x-auto">
              {activeCodeTab === 'claude' && (
                <pre className="space-y-1">
                  <span className="text-slate-500"># Point Claude Code to local TetherMesh gateway</span>
                  <br />
                  <span className="text-cyan-400">export</span> ANTHROPIC_BASE_URL=http://127.0.0.1:4000
                  <br />
                  <span className="text-emerald-400">claude</span>
                </pre>
              )}

              {activeCodeTab === 'cursor' && (
                <pre className="space-y-1">
                  <span className="text-slate-500">// Configure in Cursor Settings → Models → OpenAI API Key</span>
                  <br />
                  <span className="text-cyan-400">"openai.apiBase"</span>: <span className="text-emerald-300">"http://127.0.0.1:4000/v1"</span>,
                  <br />
                  <span className="text-cyan-400">"model"</span>: <span className="text-emerald-300">"fast-code"</span> <span className="text-slate-500">// Or "heavy-reasoning"</span>
                </pre>
              )}

              {activeCodeTab === 'python' && (
                <pre className="space-y-1">
                  <span className="text-cyan-400">from</span> openai <span className="text-cyan-400">import</span> OpenAI
                  <br />
                  <br />
                  client = OpenAI(
                  <br />
                  &nbsp;&nbsp;base_url=<span className="text-emerald-300">"http://127.0.0.1:4000/v1"</span>,
                  <br />
                  &nbsp;&nbsp;api_key=<span className="text-emerald-300">"tetheriq-local"</span>
                  <br />
                  )
                  <br />
                  <br />
                  response = client.chat.completions.create(
                  <br />
                  &nbsp;&nbsp;model=<span className="text-emerald-300">"heavy-reasoning"</span>,
                  <br />
                  &nbsp;&nbsp;messages=[{`{"role": "user", "content": "Refactor this system"}`}]
                  <br />
                  )
                </pre>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Bottom Conversion Banner */}
      <section className="py-20 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full bg-radial from-cyan-900/30 via-transparent to-transparent pointer-events-none" />
        
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mx-auto flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-6">
            <Zap className="w-7 h-7 text-white fill-white" />
          </div>

          <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Take Control of Your AI Coding Agents Today
          </h3>
          <p className="text-base text-slate-400 max-w-2xl mx-auto mb-8">
            Download TetherMesh for free. Eliminate runaway bills, bypass 429 crashes, and sync your MCP toolchain in under 60 seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onOpenDownload}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Free (macOS, Windows, Linux)</span>
            </button>
            <button
              onClick={() => navigate('/security')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Review Security Architecture</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
