import React from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  Database,
  FileCode2,
  GitBranch,
  LockKeyhole,
  Map,
  Network,
  Share2,
  Sparkles,
  Waypoints,
} from 'lucide-react';

interface HomePageProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

const steps = [
  {
    icon: FileCode2,
    title: 'Import or record',
    text: 'Review dependencies from a local manifest, or record the setups you already know.',
  },
  {
    icon: Map,
    title: 'Understand the map',
    text: 'Connect an app or agent to the setups it uses and keep the relationships explicit.',
  },
  {
    icon: Share2,
    title: 'Share reviewed context',
    text: 'Choose project context for a supported read-only MCP connection or portable brief.',
  },
];

const workspaceAreas = [
  {
    icon: Database,
    title: 'My Stack',
    text: 'Keep an inventory of technology setups, useful metadata and project memberships.',
  },
  {
    icon: Network,
    title: 'Projects',
    text: 'See the architecture of a named effort, with app, agent and setup relationships.',
  },
  {
    icon: Waypoints,
    title: 'Pathways',
    text: 'Work through six approachable architecture patterns and production considerations.',
  },
];

export const HomePage: React.FC<HomePageProps> = ({ navigate, onOpenDownload }) => (
  <div className="min-h-screen bg-white">
    <section className="relative overflow-hidden border-b border-slate-200 bg-slate-50/70">
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <div className="eyebrow"><span className="status-dot" />Development preview for Windows</div>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-6xl">
              Understand your stack. <span className="brand-gradient-text">Map your projects.</span>
              <span className="block">Give your coding assistant better context.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Bring your tools, setups and architecture decisions together, then carry reviewed project context into your coding workflow.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button onClick={onOpenDownload} className="button-primary">
                <Sparkles className="h-4 w-4" /> Request early access
              </button>
              <button onClick={() => navigate('/docs')} className="button-secondary">
                Explore the workspace <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-blue-600" />Stored locally</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" />Read-only sharing</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" />No public installer yet</span>
            </div>
          </div>

          <div className="product-placeholder" aria-label="Product visual placeholder">
            <div className="placeholder-toolbar">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /><span>Tethermesh workspace</span></div>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">Preview</span>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-2">
                {['Overview', 'My Stack', 'Projects', 'Pathways', 'AI access'].map((item, index) => (
                  <div key={item} className={`rounded-lg px-3 py-2 text-xs font-medium ${index === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{item}</div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Project map</p><p className="mt-1 text-base font-bold text-slate-900">Research assistant</p></div><GitBranch className="h-5 w-5 text-blue-600" /></div>
                <div className="relative mt-8 h-40">
                  <div className="map-node left-0 top-14"><Bot className="h-4 w-4" />App / agent</div>
                  <div className="map-node right-0 top-2"><Database className="h-4 w-4" />Knowledge index</div>
                  <div className="map-node right-0 bottom-2"><Network className="h-4 w-4" />Model service</div>
                  <span className="map-line left-[30%] top-[45%] w-[38%] rotate-[-18deg]" /><span className="map-line left-[30%] top-[56%] w-[38%] rotate-[18deg]" />
                </div>
              </div>
            </div>
            <p className="px-4 pb-4 text-xs text-slate-400">Placeholder visual — replace with a sanitized Overview/project screenshot before publishing.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="border-b border-slate-200 bg-white py-10">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <div key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{index + 1}</div>
            <div><h2 className="font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>
          </div>
        ))}
      </div>
    </section>

    <section className="section">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl"><p className="eyebrow text-blue-700">A workspace for the decisions around your code</p><h2 className="section-title">Keep the architecture legible as the project changes.</h2><p className="section-copy">A catalogue is useful when it helps you decide. Tethermesh connects technology information to the setups and projects where those choices matter.</p></div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {workspaceAreas.map(({ icon: Icon, title, text }) => <div key={title} className="feature-card"><Icon className="h-6 w-6 text-blue-600" /><h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>)}
        </div>
      </div>
    </section>

    <section className="section border-y border-slate-200 bg-slate-50/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8">
        <div><p className="eyebrow text-blue-700">Context you review, not a black box</p><h2 className="section-title">Give assistants a project brief they can actually use.</h2><p className="section-copy">Select the setup summaries and relationships you want to share through a supported read-only MCP connection. Or download a Markdown brief and Mermaid diagram for a portable, manual route.</p><button onClick={() => navigate('/mcp')} className="button-secondary mt-6">See context sharing <ArrowRight className="h-4 w-4" /></button></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="feature-card"><Share2 className="h-5 w-5 text-blue-600" /><h3 className="mt-4 font-bold text-slate-900">Scoped AI access</h3><p className="mt-2 text-sm leading-6 text-slate-600">Supported read-only Demo setup and map reads, with project selection under your control.</p></div><div className="feature-card"><FileCode2 className="h-5 w-5 text-blue-600" /><h3 className="mt-4 font-bold text-slate-900">Portable briefs</h3><p className="mt-2 text-sm leading-6 text-slate-600">Reviewed project-scoped Markdown and Mermaid downloads for other assistants.</p></div></div>
      </div>
    </section>

    <section className="section">
      <div className="mx-auto max-w-5xl rounded-3xl bg-slate-950 px-6 py-10 text-white sm:px-12">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center"><div><p className="eyebrow text-blue-300">Development preview</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Build with a clearer account of your choices.</h2><p className="mt-3 max-w-2xl leading-7 text-slate-300">Tethermesh is an early-access Windows desktop workspace. It does not deploy, operate or automatically prove the architecture for you.</p></div><button onClick={onOpenDownload} className="button-primary whitespace-nowrap">Request early access <ArrowRight className="h-4 w-4" /></button></div>
      </div>
    </section>
  </div>
);
