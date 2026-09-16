'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Mail, MessageSquare, Send, User } from 'lucide-react';

import AuthPageShell, { AuthGlassCard } from '@/components/landing/AuthPageShell';
import { api } from '@/lib/api';
import { reportError } from '@/lib/errors';

type Stage = 'form' | 'sending' | 'sent';

const SUBJECTS = [
  'I cannot sign in',
  'I forgot my username or email',
  'My account is locked or banned',
  'Payment or wallet question',
  'Something else',
];

export default function ContactPage() {
  const [stage, setStage] = useState<Stage>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (message.trim().length < 10) {
      setError('Please describe your problem in a little more detail.');
      return;
    }
    setStage('sending');
    try {
      await api.post('/contact', {
        name: name.trim(),
        email: email.trim(),
        subject,
        message: message.trim(),
      });
      setStage('sent');
    } catch (err) {
      setError(reportError('Send contact message', err));
      setStage('form');
    }
  }

  const inputClass =
    'w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-4 py-2.5 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all';
  const labelClass =
    'text-[10px] font-bold uppercase tracking-wider text-[#98b7af] mb-1.5 block';

  return (
    <AuthPageShell navVariant="contact">
      <AuthGlassCard wide>
        {stage === 'sent' ? (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="text-[#0df5c4] mx-auto mb-3" />
            <p className="text-sm text-[#ddf5ee]">
              Thanks {name.split(' ')[0] || 'there'} — we have your message.
            </p>
            <p className="mt-2 text-xs text-[#98b7af]">
              We will reply to <span className="text-white">{email}</span>.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0df5c4] hover:underline"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className={labelClass}>Your name</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className={inputClass}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Your email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                  autoComplete="email"
                />
              </div>
              <p className="mt-1 text-[11px] text-[#7fa093]">We reply to this address.</p>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>What is this about?</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-[#04201a]/80 text-white text-sm rounded-xl px-4 py-2.5 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all"
              >
                {SUBJECTS.map((s) => (
                  <option key={s} value={s} className="bg-[#04201a]">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Message</label>
              <div className="relative">
                <MessageSquare size={16} className="absolute left-3.5 top-3.5 text-[#0df5c4]/70" />
                <textarea
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what happened and we will help."
                  className={`${inputClass} resize-none min-h-[84px] pt-2.5`}
                />
              </div>
              <p className="mt-1 text-[11px] text-[#7fa093]">{message.length}/4000</p>
            </div>

            {error && (
              <p role="alert" className="md:col-span-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={stage === 'sending'}
              className="md:col-span-2 w-full mt-1 flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {stage === 'sending' ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-[#01241c]/30 border-t-[#01241c] animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send size={16} strokeWidth={2.5} />
                  Send message
                </>
              )}
            </button>

            <Link
              href="/login"
              className="md:col-span-2 mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#98b7af] hover:text-[#0df5c4] transition-colors"
            >
              <ArrowLeft size={13} /> Back to sign in
            </Link>
          </form>
        )}
      </AuthGlassCard>
    </AuthPageShell>
  );
}
