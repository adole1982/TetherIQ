import React, { useState } from 'react';
import { 
  Download, 
  Menu, 
  X, 
  Github, 
  Shield, 
  Layers, 
  BookOpen, 
  Clock, 
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface NavbarProps {
  currentRoute: string;
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, navigate, onOpenDownload }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Features', route: '/' },
    { label: 'Security & Privacy', route: '/security', icon: Shield },
    { label: 'MCP Marketplace', route: '/mcp', icon: Layers, badge: '50+' },
    { label: 'Documentation', route: '/docs', icon: BookOpen },
    { label: 'Changelog', route: '/changelog', icon: Clock, badge: 'v1.2' },
  ];

  const handleNav = (route: string) => {
    navigate(route);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="sticky top-0 z-40 w-full frosted-glass border-b border-slate-200/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button 
            onClick={() => handleNav('/')}
            className="flex items-center space-x-3 group text-left focus:outline-none"
          >
            <img 
              src="/brand/generated/tethermesh-navbar-lockup.png" 
              alt="TetherMesh Logo" 
              className="h-8 sm:h-9 object-contain transition-transform group-hover:scale-[1.02]"
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </button>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {navLinks.map((link) => {
              const isActive = currentRoute === link.route;
              return (
                <button
                  key={link.route}
                  onClick={() => handleNav(link.route)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    isActive 
                      ? 'text-cyan-700 bg-cyan-50 font-semibold shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-cyan-200/70 text-cyan-800' : 'bg-slate-200/80 text-slate-700'
                    }`}>
                      {link.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Action Center */}
          <div className="hidden md:flex items-center space-x-3">
            {/* GitHub Stars Link */}
            <a
              href="https://github.com/alexd/TetherIQ"
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all shadow-xs"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Star</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="font-mono text-slate-900">4.8k</span>
            </a>

            {/* Primary Download CTA */}
            <button
              onClick={onOpenDownload}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs tracking-wide shadow-sm hover:shadow transition-all flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Free</span>
            </button>
          </div>

          {/* Mobile Hamburger Toggle */}
          <div className="flex md:hidden items-center space-x-2">
            <button
              onClick={onOpenDownload}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium text-xs flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white/95 backdrop-blur-xl px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => (
            <button
              key={link.route}
              onClick={() => handleNav(link.route)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium ${
                currentRoute === link.route 
                  ? 'bg-cyan-50 text-cyan-700 font-semibold' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2">
                {link.icon && <link.icon className="w-4 h-4 text-slate-500" />}
                {link.label}
              </span>
              {link.badge && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                  {link.badge}
                </span>
              )}
            </button>
          ))}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <a
              href="https://github.com/alexd/TetherIQ"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-600 font-medium flex items-center gap-1.5"
            >
              <Github className="w-4 h-4" />
              <span>GitHub (4.8k Stars)</span>
            </a>
            <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              ● 127.0.0.1:4000
            </span>
          </div>
        </div>
      )}
    </nav>
  );
};
