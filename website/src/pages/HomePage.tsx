import React from 'react';
import {
  ArrowRight,
  Check,
  Database,
  FileCode2,
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
            <div className="eyebrow"><span className="status-dot" />Your stack, mapped to your projects</div>
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
            <p className="mt-3 text-sm text-slate-500">Windows desktop preview · Early access by invitation</p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-blue-600" />Stored locally</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" />Read-only sharing</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" />Built for coding workflows</span>
            </div>
          </div>

          <figure className="product-preview">
            <img
              src="/images/research-assistant-map.png"
              alt="Tethermesh project map showing a research app connected to document storage, a knowledge base, model gateway, foundation models and tracing."
              width={810}
              height={671}
              className="block h-auto w-full"
            />
            <figcaption className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">Example project architecture mapped in Tethermesh.</figcaption>
          </figure>
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
        <div><p className="eyebrow text-blue-700">Project context for coding assistants</p><h2 className="section-title">Give assistants a project brief they can actually use.</h2><p className="section-copy">Choose the setup summaries and relationships to share through a supported read-only MCP connection, or export a Markdown brief and Mermaid diagram for your coding workflow.</p><button onClick={() => navigate('/mcp')} className="button-secondary mt-6">Explore AI access <ArrowRight className="h-4 w-4" /></button></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="feature-card"><Share2 className="h-5 w-5 text-blue-600" /><h3 className="mt-4 font-bold text-slate-900">Coding assistant access</h3><p className="mt-2 text-sm leading-6 text-slate-600">Connect supported coding assistants to the project context you choose through read-only MCP access.</p></div><div className="feature-card"><FileCode2 className="h-5 w-5 text-blue-600" /><h3 className="mt-4 font-bold text-slate-900">Portable briefs</h3><p className="mt-2 text-sm leading-6 text-slate-600">Export project-scoped Markdown briefs and Mermaid diagrams for your assistant workflow.</p></div></div>
      </div>
    </section>

    <section className="section">
      <div className="mx-auto max-w-5xl rounded-3xl bg-slate-950 px-6 py-10 text-white sm:px-12">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center"><div><p className="eyebrow text-blue-300">Your projects, in context</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Build with a clearer view of your architecture.</h2><p className="mt-3 max-w-2xl leading-7 text-slate-300">Bring your technology stack, project relationships and coding workflow together in one clear workspace.</p></div><button onClick={onOpenDownload} className="button-primary whitespace-nowrap">Request early access <ArrowRight className="h-4 w-4" /></button></div>
      </div>
    </section>
  </div>
);
