'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Home,
  LogIn,
  LayoutDashboard,
  Users,
  Monitor,
  FileText,
  Settings,
  Briefcase,
  Calendar,
  Trophy,
  LineChart,
  CreditCard,
  BookOpen,
  ExternalLink,
} from 'lucide-react';

interface PageEntry {
  title: string;
  path: string;
  role: 'Public' | 'Admin' | 'Worker' | 'Leadership';
  status: 'Active' | 'Shell';
  description: string;
  icon: React.ReactNode;
}

const roleColor: Record<PageEntry['role'], string> = {
  Public:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
  Admin:      'bg-[#61e3bb]/10 text-[#61e3bb] border-[#61e3bb]/30',
  Worker:     'bg-[#e9c349]/10 text-[#e9c349] border-[#e9c349]/30',
  Leadership: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

const statusColor: Record<PageEntry['status'], string> = {
  Active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Shell:  'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const pages: PageEntry[] = [
  {
    title: 'Landing',
    path: '/',
    role: 'Public',
    status: 'Active',
    description: 'Public entry point. Hero section with feature highlights and sign-in / Worker Portal CTAs.',
    icon: <Home className="w-5 h-5" />,
  },
  {
    title: 'Login',
    path: '/login',
    role: 'Public',
    status: 'Active',
    description: 'Role-based authentication page. Quick-fill buttons for Admin, Worker, and Leadership testing.',
    icon: <LogIn className="w-5 h-5" />,
  },
  {
    title: 'Pages Index',
    path: '/pages',
    role: 'Public',
    status: 'Active',
    description: 'This page. A live directory of all routes, their roles, statuses, and descriptions.',
    icon: <BookOpen className="w-5 h-5" />,
  },
  // ── Admin ──────────────────────────────────────────────────
  {
    title: 'Command Center',
    path: '/admin/command-center',
    role: 'Admin',
    status: 'Active',
    description: 'Top-level operations hub. Live KPI tiles, worker status feed, system alerts, and quick actions.',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    title: 'Workers',
    path: '/admin/workers',
    role: 'Admin',
    status: 'Active',
    description: 'Worker database with search, filter, and per-worker performance rating & audit trails.',
    icon: <Users className="w-5 h-5" />,
  },
  {
    title: 'RDP Manager',
    path: '/admin/rdp',
    role: 'Admin',
    status: 'Active',
    description: 'RDP session management board. Assign, terminate, and monitor remote desktop connections.',
    icon: <Monitor className="w-5 h-5" />,
  },
  {
    title: 'Audit Logs',
    path: '/admin/audit',
    role: 'Admin',
    status: 'Active',
    description: 'Filterable event log viewer. All system actions, login events, and configuration changes.',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    title: 'Settings',
    path: '/admin/settings',
    role: 'Admin',
    status: 'Active',
    description: 'System configuration — timezone, session limits, RDP gateway URL, notifications, and API keys.',
    icon: <Settings className="w-5 h-5" />,
  },
  // ── Worker ─────────────────────────────────────────────────
  {
    title: 'Worker Portal',
    path: '/worker/portal',
    role: 'Worker',
    status: 'Active',
    description: 'Personal worker console. Session start/stop, daily task log, earnings snapshot, and RDP launcher.',
    icon: <Briefcase className="w-5 h-5" />,
  },
  {
    title: 'Schedule',
    path: '/worker/schedule',
    role: 'Worker',
    status: 'Active',
    description: 'Weekly availability scheduler. Workers set and update their shift preferences.',
    icon: <Calendar className="w-5 h-5" />,
  },
  {
    title: 'Leaderboard',
    path: '/worker/leaderboard',
    role: 'Worker',
    status: 'Active',
    description: 'Performance leaderboard ranking workers by output, earnings, and quality score.',
    icon: <Trophy className="w-5 h-5" />,
  },
  // ── Leadership ─────────────────────────────────────────────
  {
    title: 'Leadership Dashboard',
    path: '/leadership',
    role: 'Leadership',
    status: 'Active',
    description: 'C-suite command view. Org-wide KPIs, headcount, revenue output, and strategic trend charts.',
    icon: <LineChart className="w-5 h-5" />,
  },
  {
    title: 'Payroll Bridge',
    path: '/leadership/payroll',
    role: 'Leadership',
    status: 'Active',
    description: 'Payroll reconciliation and export tool. Review cycle totals and push to external payment providers.',
    icon: <CreditCard className="w-5 h-5" />,
  },
];

const groups: PageEntry['role'][] = ['Public', 'Admin', 'Worker', 'Leadership'];

export default function PagesIndexPage() {
  return (
    <div className="min-h-screen bg-[#001712] p-6 md:p-10 font-sans">
      {/* Background glow */}
      <div className="fixed top-1/3 left-1/3 w-[600px] h-[600px] bg-[#61e3bb]/4 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-5xl mx-auto relative z-10"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link href="/" className="text-[#61e3bb]/60 hover:text-[#61e3bb] text-sm font-mono transition-colors">← Home</Link>
          <span className="text-white/20">/</span>
          <span className="text-white/40 text-sm font-mono">pages</span>
        </div>

        <div className="flex items-start justify-between gap-4 mb-10">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-2">
              Page <span className="text-[#61e3bb]">Directory</span>
            </h1>
            <p className="text-[#bbcac2] text-sm max-w-xl">
              Every route in the GlobalSolutions Platform — with its role access, status, and purpose. Click any card to navigate.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <span className="text-xs text-[#61e3bb]/60 font-mono">{pages.length} routes</span>
          </div>
        </div>

        {/* Groups */}
        {groups.map((role, gi) => {
          const group = pages.filter(p => p.role === role);
          return (
            <motion.section
              key={role}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.08, duration: 0.5 }}
              className="mb-10"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${roleColor[role]}`}>
                  {role}
                </span>
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-white/20 text-xs font-mono">{group.length} page{group.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.map((page, i) => (
                  <motion.div
                    key={page.path}
                    whileHover={{ y: -3, scale: 1.01 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Link
                      href={page.path}
                      className="flex flex-col gap-3 p-5 rounded-2xl border border-white/5 bg-[#08241e]/40 hover:bg-[#0d2e24]/70 hover:border-[#61e3bb]/20 backdrop-blur-md transition-all duration-300 group shadow-lg block h-full"
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[#61e3bb] shrink-0 group-hover:bg-[#61e3bb]/10 transition-colors">
                            {page.icon}
                          </div>
                          <div>
                            <p className="text-white font-bold text-sm leading-tight">{page.title}</p>
                            <p className="text-[#61e3bb]/50 text-[11px] font-mono mt-0.5">{page.path}</p>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-white/20 group-hover:text-[#61e3bb]/60 transition-colors shrink-0 mt-0.5" />
                      </div>

                      {/* Description */}
                      <p className="text-[#bbcac2] text-xs leading-relaxed">{page.description}</p>

                      {/* Badges */}
                      <div className="flex items-center gap-2 mt-auto">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor[page.status]}`}>
                          {page.status}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          );
        })}

        <footer className="mt-16 text-center text-slate-600 text-xs font-mono">
          GlobalSolutions Platform · Pages Index · Auto-maintained
        </footer>
      </motion.div>
    </div>
  );
}
