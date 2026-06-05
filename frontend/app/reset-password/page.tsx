'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';

export default function ResetPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-emerald-accent/[0.05] rounded-full blur-[100px]" />
        <div className="absolute bottom-1/3 left-1/4 w-[250px] h-[250px] bg-gold-accent/[0.04] rounded-full blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md glass-modal p-8 md:p-10"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-transparent via-emerald-accent to-transparent rounded-full" />

        <div className="flex flex-col items-center mb-6">
          <LogoMark size="md" />
          <h1 className="text-xl font-black text-theme-heading mt-4">Reset Password</h1>
          <p className="text-xs text-theme-muted text-center mt-2">
            Enter your email and we&apos;ll send a recovery link.
          </p>
        </div>

        {submitted ? (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="text-emerald-accent mx-auto mb-3" />
            <p className="text-sm text-theme-body">Recovery link sent. Check your inbox.</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
            className="space-y-4"
          >
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Email</label>
              <input type="email" required placeholder="you@globalsolutions.com" className="input-field" />
            </div>
            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              <Mail size={16} />
              Send Recovery Link
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-2 text-xs text-gold-accent hover:underline font-medium"
        >
          <ArrowLeft size={14} />
          Back to Login
        </Link>
      </motion.div>
    </div>
  );
}
