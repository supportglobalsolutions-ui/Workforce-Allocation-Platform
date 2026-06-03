'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck className="w-10 h-10 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-black text-indigo-900">Executive Login</h1>
          <p className="text-slate-500 text-sm">Access the Command Dashboard</p>
        </div>

        <form className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Work Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              placeholder="name@globalsolutions.com"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          <button className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100">
            Sign In
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-400">
          Trouble logging in? <a href="#" className="underline text-indigo-600">Contact Support</a>
        </div>
      </motion.div>
    </div>
  );
}
