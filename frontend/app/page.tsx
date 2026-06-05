'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { ShieldCheck, Zap, Globe2, BarChart3, ChevronRight, Lock, BookOpen, Users, Clock, Network } from 'lucide-react';
import Link from 'next/link';
import { PAGES } from '@/lib/pages-registry';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-background flex flex-col relative overflow-hidden font-sans">
      {/* Animated network grid background */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(#3FC7A0 1px, transparent 1px), linear-gradient(90deg, #3FC7A0 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-emerald-accent/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gold-accent/[0.03] rounded-full blur-[120px]" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 md:p-10">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12 max-w-4xl"
        >
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="GlobalSolutions Logo" width={64} height={64} className="rounded-2xl" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-surface-high/60 border border-emerald-accent/20 mb-6 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-accent uppercase tracking-[0.15em] font-mono">Operations Command Platform</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-4 font-display">
            Workforce Allocation.<br />
            <span className="bg-gradient-to-r from-emerald-accent to-gold-accent bg-clip-text text-transparent">Session Tracking.</span><br />
            Payroll Intelligence.
          </h1>
          <p className="text-base md:text-lg text-brand-on-surface-variant max-w-2xl mx-auto font-medium leading-relaxed">
            Manage workers, RDP resources, payroll, quality scores and partner operations from one platform.
          </p>
        </motion.header>

        {/* Statistics */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full mb-12"
        >
          {[
            { label: 'Active Workers', value: '142', icon: Users },
            { label: 'Countries', value: '12', icon: Globe2 },
            { label: 'Session Hours', value: '3.2K', icon: Clock },
            { label: 'Partner Networks', value: '8', icon: Network },
          ].map((s) => (
            <div key={s.label} className="glass-panel p-5 text-center">
              <s.icon size={20} className="text-emerald-accent mx-auto mb-2" />
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant mt-1">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Features */}
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl w-full mb-12"
        >
          <FeatureCard icon={<ShieldCheck className="w-7 h-7 text-emerald-accent" />} title="Session Management" description="Claim RDP machines, track heartbeats, and log sessions across all earning channels." />
          <FeatureCard icon={<Zap className="w-7 h-7 text-gold-accent" />} title="Payroll Engine" description="Variable percentage splits by partner arrangement with exception flagging." />
          <FeatureCard icon={<Globe2 className="w-7 h-7 text-brand-tertiary" />} title="Quality Scoring" description="50% MCQ assessments + 50% subjective indicators powering global leaderboards." />
          <FeatureCard icon={<BarChart3 className="w-7 h-7 text-success" />} title="Leadership Analytics" description="CEO command center with real-time KPIs, utilization, and financial intelligence." />
        </motion.main>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 w-full max-w-md px-4 sm:px-0"
        >
          <Link href="/login" className="flex-1 py-3.5 bg-emerald-accent hover:bg-emerald-accent/90 text-brand-primary-dark rounded-2xl font-bold text-center transition-all shadow-[0_0_20px_rgba(63,199,160,0.2)] flex items-center justify-center gap-2">
            <Lock size={16} />
            Login
          </Link>
          <Link href="/login" className="flex-1 py-3.5 bg-brand-card hover:bg-brand-surface-high text-white border border-white/10 hover:border-gold-accent/35 rounded-2xl font-bold text-center transition-all backdrop-blur-md flex items-center justify-center gap-2">
            Request Access
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-4 flex flex-col sm:flex-row gap-3 items-center"
        >
          <Link href="/worker/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-white/10 hover:border-emerald-accent/30 bg-white/[0.03] text-brand-on-surface-variant hover:text-emerald-accent text-sm font-medium transition-all">
            Worker Portal
            <ChevronRight size={15} className="text-emerald-accent" />
          </Link>
          <Link href="/pages" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-white/10 hover:border-emerald-accent/30 bg-white/[0.03] hover:bg-brand-card/60 text-brand-on-surface-variant hover:text-emerald-accent text-sm font-medium transition-all backdrop-blur-md">
            <BookOpen size={15} />
            View All Pages
            <span className="text-[10px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">{PAGES.length} pages</span>
          </Link>
        </motion.div>
      </div>

      <footer className="relative z-10 py-8 border-t border-white/5 text-center">
        <div className="flex justify-center gap-6 text-xs text-brand-on-surface-variant mb-3">
          <span>Terms</span>
          <span>Privacy</span>
          <span>© 2026 GlobalSolutions Platform</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      className="glass-panel p-8 flex flex-col items-start hover:border-emerald-accent/20 transition-all duration-300"
    >
      <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-6">{icon}</div>
      <h3 className="text-base font-bold text-white mb-2">{title}</h3>
      <p className="text-xs text-brand-on-surface-variant leading-relaxed">{description}</p>
    </motion.div>
  );
}
