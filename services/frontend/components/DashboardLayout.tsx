'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, Users, Monitor, Settings, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const adminItems: SidebarItem[] = [
  { icon: <LayoutDashboard size={20} />, label: 'Command Center', href: '/admin/command-center' },
  { icon: <Users size={20} />, label: 'Worker Management', href: '/admin/workers' },
  { icon: <Monitor size={20} />, label: 'RDP Resources', href: '/admin/rdp' },
  { icon: <FileText size={20} />, label: 'Audit Logs', href: '/admin/audit' },
  { icon: <Settings size={20} />, label: 'System Settings', href: '/admin/settings' },
];

export default function DashboardLayout({ children, role = 'admin' }: { children: React.ReactNode, role?: 'admin' | 'worker' | 'leadership' }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans">
      {/* Sidebar */}
      <aside className="w-[280px] bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 left-0 z-50">
        <div className="p-8">
          <h1 className="text-2xl font-black text-indigo-950 tracking-tight">GlobalSolutions</h1>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em] mt-1">Personnel Ops v2.0</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {adminItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${
                pathname === item.href 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={pathname === item.href ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'}>
                  {item.icon}
                </span>
                <span className="font-bold text-sm tracking-tight">{item.label}</span>
              </div>
              {pathname === item.href && (
                <motion.div layoutId="active" className="w-1.5 h-1.5 rounded-full bg-white/40" />
              )}
            </Link>
          ))}
        </nav>

        <div className="p-6">
          <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-600">
              AL
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-indigo-900 truncate">Admin Lead</p>
              <p className="text-xs text-slate-400 truncate">Super Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 ml-[280px]">
        <main className="p-10 max-w-7xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
