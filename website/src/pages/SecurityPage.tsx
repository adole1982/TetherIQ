import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';

interface SecurityPageProps { navigate: (route: string) => void; onOpenDownload: () => void; }
const faqs = [
  ['Where are project records stored?', 'Project records are stored locally in the Windows desktop application. Backups and downloaded briefs can contain project metadata and should be handled appropriately.'],
  ['Are credentials included in architecture briefs?', 'Credentials are managed separately from project records and are not intended to be included in standard project briefs.'],
  ['Is shared context read-only?', 'Supported MCP connections can read only the projects and information you select.'],
  ['How does a coding assistant handle shared context?', 'Check your coding assistant’s privacy policy and settings to understand how it handles shared context.'],
  ['Can shared project details contain sensitive information?', 'Yes. Project names and relationship labels may contain sensitive details. Check the context you selected before sharing.'],
];

export const SecurityPage: React.FC<SecurityPageProps> = () => {
  const [open, setOpen] = useState(0);
  return <div className="min-h-screen">
    <section className="border-b border-slate-200 bg-slate-50/70"><div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:py-24"><div className="eyebrow justify-center"><ShieldCheck className="h-4 w-4 text-blue-600" />Privacy and control</div><h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">You decide what becomes project context.</h1><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">Tethermesh stores project information locally, manages service credentials separately, and lets you choose what to share.</p></div></section>
    <section className="section"><div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"><div className="grid gap-5 md:grid-cols-3"><div className="feature-card"><LockKeyhole className="h-6 w-6 text-blue-600" /><h2 className="mt-5 font-bold text-slate-900">Local project records</h2><p className="mt-2 text-sm leading-6 text-slate-600">The desktop workspace stores project information on your Windows computer.</p></div><div className="feature-card"><KeyRound className="h-6 w-6 text-blue-600" /><h2 className="mt-5 font-bold text-slate-900">Separate credentials</h2><p className="mt-2 text-sm leading-6 text-slate-600">Credentials for connected services are managed separately from project information.</p></div><div className="feature-card"><Eye className="h-6 w-6 text-blue-600" /><h2 className="mt-5 font-bold text-slate-900">Choose what to share</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose which projects and details to make available through supported, read-only connections.</p></div></div></div></section>
    <section className="section border-y border-slate-200 bg-white"><div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8"><p className="eyebrow text-blue-700">Privacy and sharing</p><h2 className="section-title">How your project context is handled.</h2><p className="section-copy">Learn how local project information, shared context and coding-assistant connections are handled.</p><div className="mt-8 space-y-3">{faqs.map(([question, answer], i) => <div key={question} className="overflow-hidden rounded-xl border border-slate-200"><button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold text-slate-900"><span>{question}</span>{open === i ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}</button>{open === i && <p className="border-t border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-600">{answer}</p>}</div>)}</div></div></section>
  </div>;
};
