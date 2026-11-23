import React, { useState } from 'react';
import { Menu, X, Sparkles } from 'lucide-react';

interface NavbarProps {
  currentRoute: string;
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, navigate, onOpenDownload }) => {
  const [open, setOpen] = useState(false);
  const links = [
    { label: 'Overview', route: '/' },
    { label: 'AI access', route: '/mcp' },
    { label: 'Security', route: '/security' },
    { label: 'Docs', route: '/docs' },
    { label: 'Changelog', route: '/changelog' },
  ];
  const go = (route: string) => { navigate(route); setOpen(false); };
  return <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <button onClick={() => go('/')} className="flex items-center" aria-label="Tethermesh home"><img src="/brand/generated/tethermesh-navbar-lockup.png" alt="Tethermesh" className="h-8 w-auto" /></button>
      <div className="hidden items-center gap-1 md:flex">{links.map(link => <button key={link.route} onClick={() => go(link.route)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${currentRoute === link.route ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>{link.label}</button>)}</div>
      <div className="hidden md:block"><button onClick={onOpenDownload} className="button-primary !px-4 !py-2 text-xs"><Sparkles className="h-3.5 w-3.5" />Request early access</button></div>
      <div className="flex items-center gap-2 md:hidden"><button onClick={onOpenDownload} className="button-primary !px-3 !py-2 text-xs">Early access</button><button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-slate-600" aria-label="Toggle navigation">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button></div>
    </div>
    {open && <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">{links.map(link => <button key={link.route} onClick={() => go(link.route)} className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium ${currentRoute === link.route ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>{link.label}</button>)}</div>}
  </nav>;
};
