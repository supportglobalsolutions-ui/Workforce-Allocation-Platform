'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, LogIn, Mail, Menu, X } from 'lucide-react';

import GlobalSolutionsLogo from './GlobalSolutionsLogo';

interface LandingNavbarProps {
  variant?: 'landing' | 'login' | 'contact';
}

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  /** Gold pill treatment — one primary action per screen. */
  primary?: boolean;
};

/**
 * One definition drives both the desktop row and the mobile sheet, so the two
 * cannot drift apart as pages are added.
 */
function itemsFor(variant: NonNullable<LandingNavbarProps['variant']>): NavItem[] {
  const home: NavItem = { href: '/', label: 'Home', icon: Home };
  const contact: NavItem = { href: '/contact', label: 'Contact', icon: Mail };
  const login: NavItem = { href: '/login', label: 'Log in', icon: LogIn, primary: true };

  if (variant === 'landing') return [contact, login];
  if (variant === 'login') return [home, contact];
  return [home, login]; // contact page — no link back to itself
}

export default function LandingNavbar({ variant = 'landing' }: LandingNavbarProps) {
  const [open, setOpen] = useState(false);
  const items = itemsFor(variant);

  // Never leave the sheet open behind a navigation, and stop the page
  // scrolling underneath it.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pill =
    'inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-[#d4af37] bg-[#03201a]/70 hover:bg-[#d4af37]/10 border border-[#d4af37]/40 hover:border-[#d4af37]/75 shadow-[0_0_15px_rgba(212,175,55,0.14)] transition-all active:scale-95';
  const plain =
    'inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-bold tracking-wide text-[#d4af37] hover:text-[#f0cf66] transition-colors';

  return (
    <header className="relative z-50 w-full px-4 sm:px-6 lg:px-12 py-3 sm:py-4 flex items-center justify-between border-b border-[#d4af37]/20 bg-[#010c09]/55 backdrop-blur-md">
      <GlobalSolutionsLogo size="md" showOperations={false} className="shrink-0" />

      {/* Desktop */}
      <nav className="hidden sm:flex items-center gap-2 md:gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={item.primary ? pill : plain}>
              <Icon size={14} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile trigger — 44px target, the minimum comfortable tap size */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="sm:hidden inline-flex items-center justify-center w-11 h-11 -mr-1 rounded-xl text-[#d4af37] hover:bg-[#d4af37]/10 active:scale-95 transition-all"
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Mobile sheet */}
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="sm:hidden fixed inset-0 top-[var(--nav-h,60px)] bg-black/60 backdrop-blur-sm z-40 cursor-default"
          />
          <nav className="sm:hidden absolute left-0 right-0 top-full z-50 border-b border-[#d4af37]/20 bg-[#010c09]/97 backdrop-blur-xl shadow-2xl">
            <ul className="px-4 py-3 space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3.5 rounded-xl text-base font-semibold transition-colors ${
                        item.primary
                          ? 'text-[#01241c] bg-[#d4af37] hover:bg-[#f0cf66]'
                          : 'text-[#d4af37] hover:bg-[#d4af37]/10'
                      }`}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}
    </header>
  );
}
