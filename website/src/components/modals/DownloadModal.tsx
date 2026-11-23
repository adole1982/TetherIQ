import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Mail, X } from 'lucide-react';

interface DownloadModalProps { isOpen: boolean; onClose: () => void; }

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  useEffect(() => { if (!isOpen) { setEmail(''); setState('idle'); } }, [isOpen]);
  if (!isOpen) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === 'submitting') return;
    setState('submitting');
    try {
      const response = await fetch('https://formspree.io/f/mojkzgeb', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, source: 'Tethermesh early access', _subject: 'New Tethermesh early access request' }) });
      setState(response.ok ? 'success' : 'error');
    } catch (error) {
      console.error('Early access form submission failed', error);
      setState('error');
    }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="early-access-title" onClick={onClose}><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="eyebrow text-blue-700">Development preview</p><h2 id="early-access-title" className="mt-2 text-2xl font-bold text-slate-950">Request early access</h2></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button></div>{state === 'success' ? <div className="py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700"><Check className="h-6 w-6" /></div><h3 className="mt-4 text-lg font-bold text-slate-900">Request received</h3><p className="mt-2 text-sm leading-6 text-slate-600">Thanks. We will use the address you provided to follow up about the preview.</p></div> : <form onSubmit={submit} className="mt-6"><p className="text-sm leading-6 text-slate-600">Tethermesh is not publicly downloadable yet. Share an email if you would like to hear about preview access.</p><label htmlFor="early-access-email" className="mt-5 block text-sm font-semibold text-slate-800">Email address</label><div className="relative mt-2"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="early-access-email" required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>{state === 'error' && <p className="mt-3 flex items-center gap-2 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />The request could not be submitted. Please try again.</p>}<button disabled={state === 'submitting'} type="submit" className="button-primary mt-5 w-full justify-center disabled:cursor-wait disabled:opacity-60">{state === 'submitting' ? 'Submitting…' : 'Request early access'}</button><p className="mt-3 text-center text-xs text-slate-500">The form is provided by an external service. No launch date is promised.</p></form>}</div></div>;
};
