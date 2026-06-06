'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';

const TAGLINE = ['Remote', 'Smart', 'Global'] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function LandingHero() {
  return (
    <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 landing-grid opacity-60" />
        <div className="landing-orb absolute -top-20 left-[15%] w-[420px] h-[420px] rounded-full bg-emerald-accent/[0.07]" />
        <div className="landing-orb landing-orb-delayed absolute bottom-0 right-[10%] w-[380px] h-[380px] rounded-full bg-gold-accent/[0.06]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_72%)]" />
      </div>

      {/* Floating particles */}
      {[...Array(8)].map((_, i) => (
        <motion.span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-emerald-accent/30 pointer-events-none"
          style={{ left: `${10 + i * 11}%`, top: `${18 + (i % 4) * 18}%` }}
          animate={{ y: [0, -24, 0], opacity: [0.15, 0.55, 0.15] }}
          transition={{ duration: 5 + i * 0.4, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }}
          aria-hidden
        />
      ))}

      <motion.div
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center text-center max-w-2xl"
      >
        {/* Logo with glow ring */}
        <motion.div custom={0} variants={fadeUp} className="relative">
          <div className="absolute -inset-3 rounded-2xl bg-emerald-accent/10 blur-xl landing-orb" />
          <div className="relative rounded-2xl ring-1 ring-white/10 shadow-[0_0_40px_rgba(63,199,160,0.12)]">
            <LogoMark size="xl" priority />
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          custom={1}
          variants={fadeUp}
          className="landing-display landing-title-gradient font-display mt-10 text-glow-emerald"
        >
          Global Solutions
        </motion.h1>

        {/* Tagline */}
        <motion.div custom={2} variants={fadeUp} className="mt-6 flex flex-col items-center gap-3">
          <div className="h-px w-24 landing-shimmer-line rounded-full opacity-70" />
          <p className="type-label-caps flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {TAGLINE.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 + i * 0.1, duration: 0.5 }}
                className={word === 'Smart' ? 'text-gold-accent text-glow-gold' : 'text-emerald-accent'}
              >
                {word}
                {i < TAGLINE.length - 1 && (
                  <span className="text-gold-accent/40 ml-3 hidden sm:inline">·</span>
                )}
              </motion.span>
            ))}
          </p>
        </motion.div>

        {/* Login CTA */}
        <motion.div custom={3} variants={fadeUp} className="mt-12">
          <Link
            href="/login"
            prefetch
            className="group relative inline-flex items-center gap-2.5 px-10 py-3.5 rounded-xl font-bold text-sm overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="absolute inset-0 bg-emerald-accent rounded-xl" />
            <span className="absolute inset-0 bg-gradient-to-r from-emerald-accent via-emerald-accent to-gold-accent/80 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl" />
            <span className="absolute inset-0 rounded-xl ring-1 ring-gold-accent/30 group-hover:ring-gold-accent/50 transition-all" />
            <span className="relative text-brand-primary-dark flex items-center gap-2.5">
              Login
              <ArrowRight
                size={17}
                strokeWidth={2.5}
                className="transition-transform group-hover:translate-x-1"
              />
            </span>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
