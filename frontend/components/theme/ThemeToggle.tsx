'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeProvider';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'switch' | 'icon';
}

export default function ThemeToggle({
  className = '',
  showLabel = false,
  variant = 'icon',
}: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={isDark ? 'Light theme' : 'Dark theme'}
        className={`p-2 rounded-xl border border-theme hover:bg-white/5 transition-all ${className}`}
      >
        {isDark ? (
          <Moon size={18} className="text-emerald-accent" />
        ) : (
          <Sun size={18} className="text-gold-accent" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      className={`theme-toggle group ${className}`}
    >
      <span className="theme-toggle-track">
        <span className={`theme-toggle-thumb ${isDark ? 'translate-x-0' : 'translate-x-5'}`}>
          {isDark ? <Moon size={12} className="text-emerald-accent" /> : <Sun size={12} className="text-gold-accent" />}
        </span>
      </span>
      {showLabel && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden sm:inline">
          {theme}
        </span>
      )}
    </button>
  );
}
