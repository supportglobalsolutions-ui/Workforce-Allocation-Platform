'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';

export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-16">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.04, 0.08, 0.04] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-emerald-accent rounded-full blur-[140px]"
        />
        <motion.div
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.03, 0.07, 0.03] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-gold-accent rounded-full blur-[130px]"
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(var(--emerald-accent) 1px, transparent 1px), linear-gradient(90deg, var(--emerald-accent) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 text-center max-w-3xl"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="flex justify-center mb-10"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gold-accent/20 rounded-2xl blur-xl animate-pulse" />
            <LogoMark size="lg" />
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-[11px] font-bold uppercase tracking-[0.35em] text-gold-accent mb-4 font-mono"
        >
          Remote · Smart · Global
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-theme-heading font-display leading-[1.1] tracking-tight mb-6"
        >
          Global Solutions
          <span className="block mt-2 bg-gradient-to-r from-emerald-accent via-emerald-accent to-gold-accent bg-clip-text text-transparent">
            Workforce Allocation Platform
          </span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.7 }}
          className="mt-12"
        >
          <Link
            href="/login"
            className="group inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-base transition-all duration-300 glass-modal border border-gold-accent/30 hover:border-gold-accent/60 hover:shadow-[0_0_40px_rgba(212,175,55,0.15)]"
          >
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-accent to-emerald-accent/70 flex items-center justify-center text-brand-primary-dark group-hover:scale-105 transition-transform">
              <Lock size={18} />
            </span>
            <span className="text-theme-heading">Login</span>
          </Link>
        </motion.div>
      </motion.div>

      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-gold-accent/40"
          style={{ left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 25}%` }}
          animate={{ y: [0, -20, 0], opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 4 + i * 0.5, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </div>
  );
}
