/**
 * GlobalSolutions Style Manager
 * Central API for theme tokens, application, and design-system access.
 * Aligned with DESIGN.md — Deep Emerald & Gold glassmorphism system.
 */

export { themeTokens, applyThemeToDocument, THEME_STORAGE_KEY, type ThemeMode } from './tokens';
export { ThemeProvider, useTheme, themeInitScript } from './ThemeProvider';

import { themeTokens, type ThemeMode } from './tokens';

/** Get all CSS custom properties for a theme mode */
export function getThemeVariables(mode: ThemeMode): Record<string, string> {
  const t = themeTokens[mode];
  return {
    '--background': t.background,
    '--foreground': t.foreground,
    '--primary-dark': t.primaryDark,
    '--secondary-green': t.secondaryGreen,
    '--emerald-accent': t.emeraldAccent,
    '--gold-accent': t.goldAccent,
    '--card-bg': t.cardBg,
    '--surface-lowest': t.surfaceLowest,
    '--surface-container': t.surfaceContainer,
    '--surface-high': t.surfaceHigh,
    '--on-surface': t.onSurface,
    '--on-surface-variant': t.onSurfaceVariant,
    '--text-heading': t.textHeading,
    '--glass-bg': t.glassBg,
    '--glass-border': t.glassBorder,
  };
}

/** Design-system component class presets */
export const stylePresets = {
  card: 'glass-panel rounded-2xl border border-theme',
  cardHover: 'glass-panel glass-panel-hover rounded-2xl',
  heading: 'text-theme-heading font-black tracking-tight font-display',
  body: 'text-theme-body',
  muted: 'text-theme-muted',
  label: 'text-[10px] font-bold uppercase tracking-wider text-theme-muted font-mono',
} as const;
