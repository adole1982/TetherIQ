import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Github } from '../icons/BrandIcons';

interface FooterProps { navigate: (route: string) => void; onOpenDownload: () => void; }

export const Footer: React.FC<FooterProps> = ({ navigate, onOpenDownload }) => <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">
  <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
      <div><img src="/brand/generated/tethermesh-navbar-lockup-dark.png" alt="Tethermesh" className="h-8 w-auto" /><p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">A local Windows architecture workspace for builders using coding assistants.</p><p className="mt-4 text-xs text-slate-500">Development preview. Early access invitation only.</p></div>
      <div><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Explore</h2><div className="mt-4 space-y-3 text-sm"><button onClick={() => navigate('/')} className="block hover:text-white">Overview</button><button onClick={() => navigate('/docs')} className="block hover:text-white">Documentation</button><button onClick={() => navigate('/mcp')} className="block hover:text-white">AI access</button><button onClick={() => navigate('/security')} className="block hover:text-white">Security & privacy</button></div></div>
      <div><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Keep in touch</h2><div className="mt-4 space-y-3 text-sm"><button onClick={onOpenDownload} className="block text-blue-300 hover:text-white">Request early access</button><a href="https://github.com/adole1982/TetherIQ" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white"><Github className="h-4 w-4" />GitHub repository</a></div></div>
    </div>
    <div className="mt-10 flex flex-col gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Tethermesh</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-blue-400" />You choose what context to share</span></div>
  </div>
</footer>;
