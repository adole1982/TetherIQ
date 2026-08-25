import React from 'react';
import { 
  ShieldCheck, 
  Terminal, 
  Layers, 
  BookOpen, 
  Download,
  ExternalLink,
  Sparkles,
  Zap
} from 'lucide-react';
import { Github, Twitter } from '../icons/BrandIcons';

interface FooterProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const Footer: React.FC<FooterProps> = ({ navigate, onOpenDownload }) => {
  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Col 1 & 2: Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center space-x-3">
              <img 
                src="/brand/generated/tethermesh-navbar-lockup-dark.png" 
                alt="TetherMesh Logo" 
                className="h-8 object-contain"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
            
            <p className="text-xs tracking-widest font-bold uppercase text-cyan-400">
              CONNECT. TRACE. OPTIMIZE.
            </p>

            <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
              The zero-config local desktop control plane and proxy gateway for autonomous AI coding agents. 
              Eliminate runaway spend, avoid 429 rate limit outages, and sync verified MCP servers in one click.
            </p>

            <div className="flex items-center space-x-2 pt-2">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Local Gateway: 127.0.0.1:4000</span>
              </div>
            </div>
          </div>

          {/* Col 3: Product */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Product</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => navigate('/')} className="hover:text-white transition-colors">
                  Overview & Features
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/mcp')} className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span>MCP Marketplace</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-cyan-900/80 text-cyan-300 font-bold rounded">50+ Planned</span>
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/changelog')} className="hover:text-white transition-colors">
                  Releases & Changelog
                </button>
              </li>
              <li>
                <button onClick={onOpenDownload} className="hover:text-white transition-colors text-cyan-400 font-medium">
                  Join Waitlist (Oct 2026)
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Trust & Resources */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Trust & Docs</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => navigate('/security')} className="hover:text-white transition-colors flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Security & Privacy</span>
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/docs')} className="hover:text-white transition-colors">
                  60-Second Quickstart
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/docs')} className="hover:text-white transition-colors">
                  IDE Configuration Guide
                </button>
              </li>
              <li>
                <a 
                  href="https://github.com/BerriAI/litellm" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="hover:text-white transition-colors flex items-center gap-1"
                >
                  <span>Powered by LiteLLM</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
            </ul>
          </div>

          {/* Col 5: Community & Source */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Community</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a 
                  href="https://github.com/adole1982/TetherIQ" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-sm text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5"
                >
                  <Github className="w-4 h-4" />
                  <span>GitHub Repository</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright & attribution */}
        <div className="mt-12 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} TetherMesh. All rights reserved. 100% Local-First Software.</p>
          <div className="flex items-center space-x-4">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% Open Source</span>
            </span>
            <span>•</span>
            <span>Zero Cloud Telemetry</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
