'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Lock, BookOpen, Shield } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-brand-background flex font-sans">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'linear-gradient(#3FC7A0 1px, transparent 1px), linear-gradient(90deg, #3FC7A0 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <LogoMark size="md" />
            <span className="text-xl font-black text-theme-heading">GlobalSolutions</span>
          </div>
          <h2 className="text-3xl font-black text-white mb-4">Operations Command Platform</h2>
          <p className="text-brand-on-surface-variant max-w-md">Secure access for workers, operations leads, country managers, and executive leadership.</p>
          <div className="mt-8 p-6 glass-panel max-w-sm">
            <Shield size={24} className="text-emerald-accent mb-3" />
            <p className="text-sm text-brand-on-surface-variant">Firebase Auth · Role-based access · SSO-ready architecture</p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full glass-panel p-8"
        >
          <h1 className="text-2xl text-white font-black mb-6">Sign In</h1>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Email</label>
              <input type="email" placeholder="you@globalsolutions.com" className="input-field" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Password</label>
              <input type="password" placeholder="••••••••" className="input-field" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-brand-on-surface-variant cursor-pointer">
                <input type="checkbox" className="rounded border-white/20" />
                Remember me
              </label>
              <Link href="/reset-password" className="text-emerald-accent hover:underline">Forgot password?</Link>
            </div>
            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
              <Lock size={16} />
              Login
            </button>
          </form>
          <p className="text-center text-xs text-brand-on-surface-variant mt-4">SSO integration point ready</p>
          <div className="mt-6 flex justify-center">
            <Link href="/pages" className="inline-flex items-center gap-2 text-sm text-brand-on-surface-variant hover:text-emerald-accent">
              <BookOpen size={14} />
              View All Pages
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
