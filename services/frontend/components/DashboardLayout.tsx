'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, Users, Monitor, Settings, FileText, 
  Calendar, Trophy, Landmark, Briefcase, LogOut, ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const adminItems: SidebarItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Command Center', href: '/admin/command-center' },
  { icon: <Users size={18} />, label: 'Worker Management', href: '/admin/workers' },
  { icon: <Monitor size={18} />, label: 'RDP Resources', href: '/admin/rdp' },
  { icon: <FileText size={18} />, label: 'Audit Logs', href: '/admin/audit' },
  { icon: <Settings size={18} />, label: 'System Settings', href: '/admin/settings' },
];

const workerItems: SidebarItem[] = [
  { icon: <Briefcase size={18} />, label: 'My Console', href: '/worker/portal' },
  { icon: <Calendar size={18} />, label: 'My Schedule', href: '/worker/schedule' },
  { icon: <Trophy size={18} />, label: 'Leaderboard', href: '/worker/leaderboard' },
];

const leadershipItems: SidebarItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Org Command View', href: '/leadership' },
  { icon: <Landmark size={18} />, label: 'Payroll Bridge', href: '/leadership/payroll' },
];

type UserRole = 'admin' | 'worker' | 'leadership';

export default function DashboardLayout({ 
  children, 
  role: initialRole 
}: { 
  children: React.ReactNode, 
  role?: UserRole 
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState<UserRole>('admin');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Sync role from path if possible, or use prop
  useEffect(() => {
    if (pathname) {
      if (pathname.startsWith('/worker')) {
        setCurrentRole('worker');
      } else if (pathname.startsWith('/leadership')) {
        setCurrentRole('leadership');
      } else if (pathname.startsWith('/admin')) {
        setCurrentRole('admin');
      }
    } else if (initialRole) {
      setCurrentRole(initialRole);
    }
  }, [pathname, initialRole]);

  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    setIsDropdownOpen(false);
    
    // Auto-navigate to correct landing page for role
    if (role === 'admin') {
      router.push('/admin/command-center');
    } else if (role === 'worker') {
      router.push('/worker/portal');
    } else if (role === 'leadership') {
      router.push('/leadership');
    }
  };

  const getRoleLabel = (r: UserRole) => {
    switch (r) {
      case 'admin': return 'Operations Lead';
      case 'worker': return 'System Worker';
      case 'leadership': return 'Executive C-Suite';
    }
  };

  const getRoleColor = (r: UserRole) => {
    switch (r) {
      case 'admin': return 'text-[#61e3bb] border-[#61e3bb]/30 bg-[#61e3bb]/5';
      case 'worker': return 'text-[#9ddac0] border-[#9ddac0]/30 bg-[#9ddac0]/5';
      case 'leadership': return 'text-[#e9c349] border-[#e9c349]/30 bg-[#e9c349]/5';
    }
  };

  const items = currentRole === 'admin' 
    ? adminItems 
    : currentRole === 'worker' 
      ? workerItems 
      : leadershipItems;

  return (
    <div className="min-h-screen bg-[#001712] text-[#cbe9df] flex font-sans overflow-x-hidden">
      {/* Background radial effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#61e3bb]/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-[#e9c349]/[0.01] rounded-full blur-[100px]" />
      </div>

      {/* Sidebar */}
      <aside className="w-[280px] bg-[#00110d]/90 backdrop-blur-xl border-r border-white/5 flex flex-col fixed inset-y-0 left-0 z-40">
        {/* Brand */}
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#006c53] to-[#61e3bb] flex items-center justify-center font-black text-[#00382a] shadow-[0_0_15px_rgba(97,227,187,0.3)]">
              GS
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight leading-none">GlobalSolutions</h1>
              <p className="text-[9px] font-bold text-[#e9c349] tracking-[0.25em] uppercase mt-1.5">Orchestration Platform</p>
            </div>
          </div>
        </div>

        {/* Role Toggle Dropdown */}
        <div className="px-4 py-4 border-b border-white/5 relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left"
          >
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Workspace Context</span>
              <span className="text-sm font-bold text-white mt-0.5">{getRoleLabel(currentRole)}</span>
            </div>
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute top-[calc(100%-8px)] left-4 right-4 bg-[#08241e] border border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {(['admin', 'worker', 'leadership'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all mb-1 last:mb-0 flex items-center justify-between ${
                    currentRole === r 
                      ? 'bg-white/5 text-white' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <span>{getRoleLabel(r)}</span>
                  <span className={`px-2 py-0.5 text-[8px] rounded border uppercase font-mono ${getRoleColor(r)}`}>
                    {r}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          {items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${
                  isActive 
                    ? 'bg-[#142f28]/60 text-white border-l-2 border-[#e9c349] shadow-[inset_1px_0_0_rgba(255,255,255,0.05)]' 
                    : 'text-[#bbcac2] hover:bg-white/[0.02] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-[#61e3bb]' : 'text-slate-400 group-hover:text-[#61e3bb] transition-colors'}>
                    {item.icon}
                  </span>
                  <span className="font-bold text-sm tracking-tight">{item.label}</span>
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#e9c349] shadow-[0_0_8px_#e9c349]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer / Profile details */}
        <div className="p-4 border-t border-white/5 bg-[#000d0a]/60">
          <div className="flex items-center gap-3 p-2 bg-white/[0.02] border border-white/5 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#142f28] to-[#1f3a33] border border-white/10 flex items-center justify-center font-bold text-[#61e3bb] shadow-inner">
              {currentRole === 'admin' ? 'AL' : currentRole === 'worker' ? 'KK' : 'LR'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white truncate leading-tight">
                {currentRole === 'admin' ? 'Admin Lead' : currentRole === 'worker' ? 'Kibiru Kelvin' : 'Luther Rukhairo'}
              </p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate mt-0.5">
                {currentRole === 'admin' ? 'OPS SUPERVISOR' : currentRole === 'worker' ? 'SENIOR GENERALIST' : 'CHIEF EXECUTIVE'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 ml-[280px] relative min-h-screen z-10 flex flex-col">
        {/* Top Navbar */}
        <header className="h-16 border-b border-white/5 bg-[#00110d]/40 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#61e3bb] animate-pulse shadow-[0_0_10px_#61e3bb]" />
            <span className="text-xs font-bold text-[#bbcac2] tracking-wider uppercase font-mono">Firebase Gateway Connected</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider leading-none">Current local time</span>
              <span className="text-sm font-bold text-white font-mono mt-1 block">15:13:32 EAT</span>
            </div>
            <div className="h-8 w-px bg-white/5" />
            <Link 
              href="/login" 
              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              <LogOut size={14} />
              <span>Log Out</span>
            </Link>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="p-8 flex-1 max-w-7xl w-full mx-auto animate-in fade-in duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}
