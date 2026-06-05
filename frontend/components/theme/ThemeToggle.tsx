'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeProvider';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export default function ThemeToggle({ className = '', showLabel = true }: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();

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
