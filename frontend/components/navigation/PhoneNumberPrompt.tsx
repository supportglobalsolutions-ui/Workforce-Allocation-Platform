'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

const NEXT_KEY = 'wap_phone_prompt_next';
const DAY_MS = 24 * 60 * 60 * 1000;
const VISIBLE_MS = 8_000;

function nextShowAt(): number {
  try {
    const raw = localStorage.getItem(NEXT_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function snooze() {
  try {
    localStorage.setItem(NEXT_KEY, String(Date.now() + DAY_MS));
  } catch {
    /* ignore */
  }
}

function rememberedAsEntered(workerId: string): boolean {
  try {
    return localStorage.getItem(`wap_phone_entered:${workerId}`) === '1';
  } catch {
    return false;
  }
}

/**
 * Missing phone only. Never blocks navigation.
 * The card fades in and out, then stays quiet for 24 hours.
 * After that, the next cursor move shows it again.
 */
export default function PhoneNumberPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [phoneMissing, setPhoneMissing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{ id: string; phone?: string | null }>('/workers/me');
      const entered = Boolean(me.phone?.trim()) || rememberedAsEntered(me.id);
      setPhoneMissing(!entered);
      if (entered) setVisible(false);
    } catch {
      setPhoneMissing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  const showOnce = useCallback(() => {
    if (!phoneMissing || visible || Date.now() < nextShowAt()) return;
    setVisible(true);
  }, [phoneMissing, visible]);

  useEffect(() => {
    if (!phoneMissing || visible) return;
    let move: (() => void) | null = null;
    const arm = () => {
      move = () => showOnce();
      window.addEventListener('pointermove', move, { once: true });
    };
    if (Date.now() >= nextShowAt()) {
      showOnce();
      return;
    }
    const timer = window.setTimeout(arm, Math.max(nextShowAt() - Date.now(), 0));
    return () => {
      window.clearTimeout(timer);
      if (move) window.removeEventListener('pointermove', move);
    };
  }, [phoneMissing, visible, showOnce]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      snooze();
      setVisible(false);
    }, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-20 right-4 z-[80] w-[min(360px,calc(100vw-2rem))]"
      style={{ animation: 'wap-phone-prompt 8s ease forwards' }}
    >
      <style>{`
        @keyframes wap-phone-prompt {
          0% { opacity: 0; transform: translateX(16px); }
          10% { opacity: 1; transform: translateX(0); }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div className="rounded-2xl border border-emerald-accent/30 bg-brand-surface-lowest shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-theme-heading">Add your phone number</p>
            <p className="text-xs text-theme-muted mt-1 leading-relaxed">
              It is not on your profile yet. You can keep working and add it whenever you like.
            </p>
            <Link
              href="/worker/profile"
              className="inline-block mt-2.5 text-xs font-bold uppercase tracking-wider text-emerald-accent hover:underline"
            >
              Open profile
            </Link>
          </div>
          <button
            type="button"
            onClick={() => {
              snooze();
              setVisible(false);
            }}
            className="text-theme-muted hover:text-theme-heading p-0.5"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
