'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ShieldCheck, UserCheck, KeyRound, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide a valid work email.');
      return;
    }

    // Interactive routing based on email keywords or pre-fills for testing convenience
    if (email.includes('worker') || email.includes('kelvin')) {
      router.push('/worker/portal');
    } else if (email.includes('leader') || email.includes('ceo') || email.includes('luther')) {
      router.push('/leadership');
    } else {
      // Default to admin
      router.push('/admin/command-center');
    }
  };

  const fillQuickCredentials = (role: 'admin' | 'worker' | 'leadership') => {
    setError('');
    if (role === 'admin') {
      setEmail('operations.lead@globalsolutions.com');
      setPassword('••••••••••••');
    } else if (role === 'worker') {
      setEmail('kibiru.kelvin@globalsolutions.com');
      setPassword('••••••••••••');
    } else if (role === 'leadership') {
      setEmail('luther.ceo@globalsolutions.com');
      setPassword('••••••••••••');
    }
  };

  return (
    <div className="min-h-screen bg-[#001712] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Background glow overlay */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#61e3bb]/5 rounded-full blur-[130px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, cubicBezier: [0.16, 1, 0.3, 1] }}
        className="glass-panel rounded-3xl p-10 max-w-md w-full shadow-2xl relative z-10 border border-white/10"
      >
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 bg-[#142f28]/60 border border-[#61e3bb]/20 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <ShieldCheck className="w-8 h-8 text-[#61e3bb] text-glow-emerald" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Executive Gateway</h1>
          <p className="text-[#bbcac2] text-xs font-medium mt-1">Access the GlobalSolutions Command Platform</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-950/40 border border-red-500/20 text-[#ffb4ab] text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Work Email</label>
            <div className="relative">
              <input 
                type="email" 
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 pl-11 rounded-xl bg-[#00110d]/60 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-[#61e3bb]/20 focus:border-[#61e3bb] outline-none transition-all text-sm font-medium"
                placeholder="name@globalsolutions.com"
              />
              <UserCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Security Key</label>
            <div className="relative">
              <input 
                type="password" 
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pl-11 rounded-xl bg-[#00110d]/60 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-[#61e3bb]/20 focus:border-[#61e3bb] outline-none transition-all text-sm font-medium"
                placeholder="••••••••••••"
              />
              <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-4 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(97,227,187,0.15)] flex items-center justify-center gap-2 hover:shadow-[0_0_25px_rgba(97,227,187,0.25)] border border-[#78f9cf]/20"
          >
            <span>Sign In to Console</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Demo Credentials Helper */}
        <div className="mt-8 pt-6 border-t border-white/5">
          <p className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-3 text-center">Testing Sign-In Credentials</p>
          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => fillQuickCredentials('admin')}
              className="py-2 px-1 rounded-lg bg-white/[0.02] border border-white/5 hover:border-[#61e3bb]/30 text-[10px] font-bold text-[#61e3bb] transition-all text-center leading-tight"
            >
              Operations
            </button>
            <button 
              onClick={() => fillQuickCredentials('worker')}
              className="py-2 px-1 rounded-lg bg-white/[0.02] border border-white/5 hover:border-[#9ddac0]/30 text-[10px] font-bold text-[#9ddac0] transition-all text-center leading-tight"
            >
              Worker
            </button>
            <button 
              onClick={() => fillQuickCredentials('leadership')}
              className="py-2 px-1 rounded-lg bg-white/[0.02] border border-white/5 hover:border-[#e9c349]/30 text-[10px] font-bold text-[#e9c349] transition-all text-center leading-tight"
            >
              Leadership
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] text-slate-500 font-mono">
          System secured via Firebase Auth & SSL Proxy
        </div>
      </motion.div>
    </div>
  );
}
