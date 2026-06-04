// services/frontend/app/(auth)/login/page.tsx

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Lock, BookOpen } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#001712] flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-md w-full glass-panel p-8 rounded-2xl border border-white/5"
      >
        <h1 className="text-3xl text-white font-bold mb-6 text-center">Executive Sign In</h1>
        {/* Placeholder form */}
        <form className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-4 py-2 bg-[#08241e]/60 border border-white/10 rounded focus:outline-none focus:border-[#61e3bb]/30 text-white"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 bg-[#08241e]/60 border border-white/10 rounded focus:outline-none focus:border-[#61e3bb]/30 text-white"
          />
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded font-bold transition-colors"
          >
            <Lock size={16} />
            Sign In
          </button>
        </form>
        <div className="mt-6 text-center text-[#bbcac2] text-sm">
          <Link href="/reset-password" className="underline hover:text-[#61e3bb]">Forgot password?</Link>
        </div>
        <div className="mt-6 flex justify-center space-x-4">
          <Link
            href="/pages"
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-white/[0.03] hover:bg-[#08241e]/60 text-[#bbcac2] hover:text-[#61e3bb] border border-white/10"
          >
            <BookOpen size={14} />
            View All Pages
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
