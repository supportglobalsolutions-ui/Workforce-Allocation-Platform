'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Lock, BookOpen, Mail, ArrowLeft } from 'lucide-react';

export default function ResetPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-brand-background flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-panel p-8"
      >
        <Link href="/login" className="inline-flex items-center gap-2 text-sm text-brand-on-surface-variant hover:text-emerald-accent mb-6">
          <ArrowLeft size={14} />
          Back to Login
        </Link>
        <h1 className="text-2xl text-white font-black mb-2">Reset Password</h1>
        <p className="text-sm text-brand-on-surface-variant mb-6">
          Enter your email address and we&apos;ll send you a recovery link.
        </p>
        {submitted ? (
          <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-success text-sm">
            Recovery link sent. Check your inbox and follow the instructions to reset your password.
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Email</label>
              <input type="email" required placeholder="you@globalsolutions.com" className="input-field" />
            </div>
            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
              <Mail size={16} />
              Send Recovery Link
            </button>
          </form>
        )}
        <div className="mt-6 flex justify-center">
          <Link href="/pages" className="inline-flex items-center gap-2 text-sm text-brand-on-surface-variant hover:text-emerald-accent">
            <BookOpen size={14} />
            View All Pages
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
