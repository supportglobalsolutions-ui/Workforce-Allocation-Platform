'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Globe2, BarChart3, ChevronRight, Lock, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#001712] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[#61e3bb]/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#e9c349]/[0.02] rounded-full blur-[120px]" />

      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16 relative z-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#142f28]/60 border border-[#61e3bb]/20 mb-6 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-[#61e3bb] animate-pulse" />
          <span className="text-[10px] font-bold text-[#61e3bb] uppercase tracking-[0.15em] font-mono">v2.0 Command Console</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-4 bg-gradient-to-r from-white via-[#cbe9df] to-[#bbcac2] bg-clip-text text-transparent">
          GlobalSolutions
        </h1>
        <p className="text-lg md:text-xl text-[#bbcac2] max-w-2xl mx-auto font-medium leading-relaxed">
          Remote — Smart — Global. The operational infrastructure for scaling your workforce with precision.
        </p>
      </motion.header>

      <motion.main 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl w-full relative z-10"
      >
        <FeatureCard 
          icon={<ShieldCheck className="w-7 h-7 text-[#61e3bb]" />}
          title="Secure RDP Gateway"
          description="Browser-based access via Apache Guacamole. Credentials never expose to the client browser."
        />
        <FeatureCard 
          icon={<Zap className="w-7 h-7 text-[#e9c349]" />}
          title="Real-Time State Board"
          description="Instant RDP state synchronisation and session heartbeats powered by Firebase."
        />
        <FeatureCard 
          icon={<Globe2 className="w-7 h-7 text-[#9ddac0]" />}
          title="Global Orchestration"
          description="Track hundreds of remote workers across multiple countries and currency zones."
        />
        <FeatureCard 
          icon={<BarChart3 className="w-7 h-7 text-[#ffb4ab]" />}
          title="Executive Intelligence"
          description="Data-driven leadership console answering organizational questions natively."
        />
      </motion.main>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="mt-16 flex flex-col sm:flex-row gap-4 relative z-10 w-full max-w-md px-4 sm:px-0"
      >
        <Link 
          href="/login" 
          className="flex-1 py-3.5 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded-xl font-bold text-center transition-all duration-300 shadow-[0_0_20px_rgba(97,227,187,0.2)] hover:shadow-[0_0_30px_rgba(97,227,187,0.3)] flex items-center justify-center gap-2 border border-[#78f9cf]/20"
        >
          <Lock size={16} />
          <span>Executive Sign In</span>
        </Link>
        <Link 
          href="/worker/portal" 
          className="flex-1 py-3.5 bg-[#08241e] hover:bg-[#142f28] text-white border border-white/10 hover:border-[#61e3bb]/35 rounded-xl font-bold text-center transition-all duration-300 backdrop-blur-md flex items-center justify-center gap-2"
        >
          <span>Worker Portal</span>
          <ChevronRight size={16} className="text-[#61e3bb]" />
        </Link>
      </motion.div>

      {/* Pages directory link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.8 }}
        className="mt-4 relative z-10"
      >
        <Link
          href="/pages"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 hover:border-[#61e3bb]/30 bg-white/[0.03] hover:bg-[#08241e]/60 text-[#bbcac2] hover:text-[#61e3bb] text-sm font-medium transition-all duration-300 backdrop-blur-md"
        >
          <BookOpen size={15} />
          <span>View All Pages</span>
          <span className="ml-1 text-[10px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">13 routes</span>
        </Link>
      </motion.div>

      <footer className="mt-24 text-slate-500 text-xs font-mono relative z-10">
        &copy; 2026 GlobalSolutions Platform. All rights reserved.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <motion.div 
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3, cubicBezier: [0.4, 0, 0.2, 1] }}
      className="glass-panel p-8 rounded-2xl border border-white/5 flex flex-col items-start hover:border-[#61e3bb]/20 hover:bg-[#08241e]/90 transition-all duration-300 shadow-xl"
    >
      <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-6 shadow-inner">
        {icon}
      </div>
      <h3 className="text-base font-bold text-white mb-2 tracking-tight">{title}</h3>
      <p className="text-xs text-[#bbcac2] leading-relaxed font-medium">{description}</p>
    </motion.div>
  );
}
