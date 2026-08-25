import React, { useState } from 'react';
import {
  X,
  Check,
  Apple,
  Terminal,
  ShieldCheck,
  Laptop,
  Sparkles,
  Mail,
  Calendar
} from 'lucide-react';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Submit to Formspree
      const response = await fetch('https://formspree.io/f/xkokwrvn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          source: 'TetherMesh Waitlist',
          _subject: 'New TetherMesh Waitlist Signup',
        }),
      });

      if (response.ok) {
        setSubmitted(true);
        // Keep success message visible for 3 seconds, then close
        setTimeout(() => {
          setEmail('');
          setSubmitted(false);
          onClose();
        }, 3000);
      } else {
        console.error('Form submission failed');
        // You could add error handling UI here
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      // You could add error handling UI here
    }
  };

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
              src="/brand/generated/tethermesh-emblem.png"
              alt="TetherMesh Emblem"
              className="w-7 h-7 object-contain"
            />
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Join the Waitlist
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-semibold border border-yellow-200">
                  Oct 2026
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Be the first to know when TetherMesh launches
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
        <div className="p-8 space-y-6">
          {/* Hero Icon */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">
              Get Early Access
            </h3>
            <p className="text-slate-600 max-w-md mx-auto">
              TetherMesh is launching in October 2026. Join the waitlist to be notified when we launch and get exclusive early access to the zero-config local control plane.
            </p>
          </div>

          {/* Waitlist Form */}
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
              >
                <Calendar className="w-4 h-4" />
                <span>Notify Me at Launch</span>
              </button>

              <p className="text-xs text-center text-slate-500">
                We'll only email you when TetherMesh launches. No spam, unsubscribe anytime.
              </p>
            </form>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-2">You're on the list!</h4>
              <p className="text-slate-600">
                We'll notify you at <strong>{email}</strong> when TetherMesh launches in October 2026.
              </p>
            </div>
          )}

          {/* Planned Platforms */}
          <div className="border-t border-slate-200 pt-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 text-center">
              Planned Platform Support
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <Apple className="w-6 h-6 mx-auto mb-2 text-slate-700" />
                <p className="text-sm font-semibold text-slate-900">macOS</p>
                <p className="text-xs text-slate-500">M1-M4 & Intel</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <Laptop className="w-6 h-6 mx-auto mb-2 text-slate-700" />
                <p className="text-sm font-semibold text-slate-900">Windows</p>
                <p className="text-xs text-slate-500">10 & 11 (x64)</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <Terminal className="w-6 h-6 mx-auto mb-2 text-slate-700" />
                <p className="text-sm font-semibold text-slate-900">Linux</p>
                <p className="text-xs text-slate-500">AppImage/.deb</p>
              </div>
            </div>
          </div>

          {/* Security Note */}
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start space-x-2 text-xs text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              100% Open-Source • Local-First Architecture • Zero Cloud Telemetry • No Account Required
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
