'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Search, ExternalLink, Filter } from 'lucide-react';
import { PAGES, PORTAL_LABELS, Portal } from '@/lib/pages-registry';

const PORTAL_ORDER: Portal[] = ['public', 'worker', 'admin', 'leadership', 'audit'];

export default function PagesIndex() {
  const [search, setSearch] = useState('');
  const [portalFilter, setPortalFilter] = useState<Portal | 'all'>('all');

  const filtered = useMemo(() => {
    return PAGES.filter((p) => {
      const matchesPortal = portalFilter === 'all' || p.portal === portalFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.purpose.toLowerCase().includes(q) ||
        p.href.toLowerCase().includes(q) ||
        p.features.some((f) => f.toLowerCase().includes(q));
      return matchesPortal && matchesSearch;
    });
  }, [search, portalFilter]);

  const grouped = PORTAL_ORDER.map((portal) => ({
    portal,
    pages: filtered.filter((p) => p.portal === portal),
  })).filter((g) => g.pages.length > 0);

  return (
    <div className="min-h-screen bg-brand-background p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Platform Pages Directory</h1>
            <p className="text-brand-on-surface-variant mt-2 max-w-2xl">
              Complete sitemap of all {PAGES.length} pages — location, purpose, and direct navigation links for the GlobalSolutions Operations Command Platform.
            </p>
          </motion.div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
            <input
              type="text"
              placeholder="Search pages, features, routes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-brand-on-surface-variant shrink-0" />
            <select
              value={portalFilter}
              onChange={(e) => setPortalFilter(e.target.value as Portal | 'all')}
              className="input-field w-auto min-w-[180px]"
            >
              <option value="all">All Portals</option>
              {PORTAL_ORDER.map((p) => (
                <option key={p} value={p}>{PORTAL_LABELS[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {PORTAL_ORDER.map((portal) => {
            const count = PAGES.filter((p) => p.portal === portal).length;
            return (
              <button
                key={portal}
                onClick={() => setPortalFilter(portalFilter === portal ? 'all' : portal)}
                className={`glass-panel p-4 text-left transition-all ${portalFilter === portal ? 'border-emerald-accent/30' : 'hover:border-white/15'}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant">{PORTAL_LABELS[portal]}</p>
                <p className="text-2xl font-black text-white mt-1">{count}</p>
              </button>
            );
          })}
        </div>

        {grouped.map(({ portal, pages }) => (
          <section key={portal} className="mb-10">
            <h2 className="text-lg font-bold text-gold-accent mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-accent" />
              {PORTAL_LABELS[portal]}
              <span className="text-xs font-mono text-brand-on-surface-variant ml-1">({pages.length})</span>
            </h2>
            <div className="grid gap-4">
              {pages.map((page, i) => (
                <motion.div
                  key={page.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass-panel p-5 border border-white/5 hover:border-emerald-accent/20 transition-all group"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-base font-bold text-white group-hover:text-emerald-accent transition-colors">{page.title}</h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/20">{page.status}</span>
                      </div>
                      <p className="text-xs font-mono text-brand-on-surface-variant mb-2">{page.href}</p>
                      <p className="text-sm text-brand-on-surface-variant mb-3">{page.purpose}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {page.features.map((f) => (
                          <span key={f} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.03] text-brand-on-surface-variant border border-white/5">{f}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-brand-on-surface-variant">
                        <span className="text-white/40">Roles:</span> {page.roles.join(', ')}
                      </p>
                    </div>
                    <Link
                      href={page.href}
                      className="btn-primary inline-flex items-center gap-2 shrink-0 self-start"
                    >
                      Open Page
                      <ExternalLink size={14} />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        ))}

        {filtered.length === 0 && (
          <div className="glass-panel p-12 text-center text-brand-on-surface-variant">
            No pages match your search.
          </div>
        )}
      </div>
    </div>
  );
}
