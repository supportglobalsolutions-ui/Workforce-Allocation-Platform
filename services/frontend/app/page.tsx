'use client';

import { motion } from 'framer-motion';
import { Shield, Zap, Globe, BarChart3 } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl font-extrabold tracking-tight text-indigo-900 mb-4">
          GlobalSolutions
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          Remote — Smart — Global. The operational infrastructure for scaling your workforce with precision.
        </p>
      </motion.header>

      <motion.main 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl w-full"
      >
        <FeatureCard 
          icon={<Shield className="w-8 h-8 text-indigo-600" />}
          title="Secure RDP"
          description="Browser-based access via Apache Guacamole. Credentials never leave the server."
        />
        <FeatureCard 
          icon={<Zap className="w-8 h-8 text-amber-500" />}
          title="Real-Time State"
          description="Instant RDP status updates and session heartbeats powered by Firebase."
        />
        <FeatureCard 
          icon={<Globe className="w-8 h-8 text-emerald-600" />}
          title="Global Scale"
          description="Manage hundreds of workers across multiple countries and currency zones."
        />
        <FeatureCard 
          icon={<BarChart3 className="w-8 h-8 text-rose-500" />}
          title="Deep Insights"
          description="Data-driven leadership dashboard for organizational intelligence."
        />
      </motion.main>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-16 flex gap-4"
      >
        <Link href="/login" className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">
          Executive Login
        </Link>
        <Link href="/worker/portal" className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition shadow-sm">
          Worker Portal
        </Link>
      </motion.div>

      <footer className="mt-24 text-slate-400 text-sm">
        &copy; 2026 GlobalSolutions Platform. All rights reserved.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <motion.div 
      whileHover={{ scale: 1.05 }}
      className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center"
    >
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-slate-500 leading-relaxed">{description}</p>
    </motion.div>
  );
}
