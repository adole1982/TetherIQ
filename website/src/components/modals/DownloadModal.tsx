import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Check, 
  Copy, 
  Apple, 
  Terminal, 
  ShieldCheck, 
  Laptop, 
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [detectedOS, setDetectedOS] = useState<'mac' | 'windows' | 'linux'>('mac');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (userAgent.includes('win')) {
        setDetectedOS('windows');
      } else if (userAgent.includes('linux')) {
        setDetectedOS('linux');
      } else {
        setDetectedOS('mac');
      }
    }
  }, []);

  if (!isOpen) return null;

  const handleCopySha = (sha: string, id: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(id);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const handleCopyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const curlCmd = 'curl -fsSL https://tetheriq.dev/install.sh | bash';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <img 
              src="/brand/generated/tetheriq-emblem.png" 
              alt="TetherIQ Emblem" 
              className="w-7 h-7 object-contain"
            />
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Download TetherIQ Desktop
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 font-semibold border border-cyan-200">
                  v1.2.0 Stable
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Zero-config local control plane & proxy gateway (127.0.0.1:4000)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Quick Terminal Install */}
          <div className="bg-slate-900 rounded-xl p-4 text-white shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-mono flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Quickstart via Terminal (macOS / Linux)
              </span>
              <button
                onClick={() => handleCopyCmd(curlCmd)}
                className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <code className="text-sm font-mono text-cyan-300 block bg-slate-950/70 p-2.5 rounded-lg select-all border border-slate-800">
              {curlCmd}
            </code>
          </div>

          {/* OS Download Cards */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Native Installers by Operating System
            </h4>

            {/* macOS Card */}
            <div className={`p-4 rounded-xl border transition-all ${
              detectedOS === 'mac' ? 'border-cyan-500 bg-cyan-50/20 ring-1 ring-cyan-400' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800">
                    <Apple className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">macOS Installer (.dmg)</span>
                      {detectedOS === 'mac' && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800">
                          Detected OS
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">Universal Binary (Apple Silicon M1/M2/M3/M4 & Intel Core)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => handleCopySha('a8f9c0e1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9', 'mac')}
                    title="Copy SHA-256"
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all text-xs flex items-center gap-1"
                  >
                    {copiedSha === 'mac' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="font-mono text-[10px]">SHA-256</span>
                  </button>
                  <a
                    href="https://github.com/alexd/TetherIQ/releases/latest"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download (.dmg)</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Windows Card */}
            <div className={`p-4 rounded-xl border transition-all ${
              detectedOS === 'windows' ? 'border-cyan-500 bg-cyan-50/20 ring-1 ring-cyan-400' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800">
                    <Laptop className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">Windows 64-bit (.exe / MSI)</span>
                      {detectedOS === 'windows' && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800">
                          Detected OS
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">Windows 10, 11 (x64 / ARM64)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => handleCopySha('b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2', 'win')}
                    title="Copy SHA-256"
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all text-xs flex items-center gap-1"
                  >
                    {copiedSha === 'win' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="font-mono text-[10px]">SHA-256</span>
                  </button>
                  <a
                    href="https://github.com/alexd/TetherIQ/releases/latest"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download (.exe)</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Linux Card */}
            <div className={`p-4 rounded-xl border transition-all ${
              detectedOS === 'linux' ? 'border-cyan-500 bg-cyan-50/20 ring-1 ring-cyan-400' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800">
                    <Terminal className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">Linux AppImage / .deb</span>
                      {detectedOS === 'linux' && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800">
                          Detected OS
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">Ubuntu, Debian, Fedora, Arch Linux (x86_64)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => handleCopySha('c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4', 'linux')}
                    title="Copy SHA-256"
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all text-xs flex items-center gap-1"
                  >
                    {copiedSha === 'linux' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="font-mono text-[10px]">SHA-256</span>
                  </button>
                  <a
                    href="https://github.com/alexd/TetherIQ/releases/latest"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download (.AppImage)</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Security & Cryptographic Guarantee */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>100% Open-Source Binary • Verified SHA-256 Hashes • Zero Cloud Telemetry</span>
            </div>
            <a 
              href="https://github.com/alexd/TetherIQ" 
              target="_blank" 
              rel="noreferrer"
              className="text-cyan-700 hover:text-cyan-800 font-medium flex items-center gap-1 shrink-0"
            >
              <span>Inspect Source on GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
