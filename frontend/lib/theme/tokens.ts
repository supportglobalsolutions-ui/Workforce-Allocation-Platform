export type ThemeMode = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'gs-theme';

/** Canonical design tokens — source of truth aligned with DESIGN.md */
export const themeTokens = {
  dark: {
    background: '#021D17',
    foreground: '#cbe9df',
    primaryDark: '#032F25',
    secondaryGreen: '#0A4D3A',
    emeraldAccent: '#3FC7A0',
    goldAccent: '#D4AF37',
    cardBg: '#0A241E',
    surfaceLowest: '#00110d',
    surfaceLow: '#04201a',
    surfaceContainer: '#0A241E',
    surfaceHigh: '#142f28',
    surfaceHighest: '#1f3a33',
    onSurface: '#cbe9df',
    onSurfaceVariant: '#bbcac2',
    textHeading: '#ffffff',
    glassBg: 'rgba(10, 36, 30, 0.75)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
    glassHover: 'rgba(20, 47, 40, 0.85)',
    inputBg: 'rgba(10, 36, 30, 0.6)',
    inputBorder: 'rgba(255, 255, 255, 0.10)',
    scrollbarTrack: '#00110d',
    scrollbarThumb: '#142f28',
    glowEmerald: 'rgba(63, 199, 160, 0.06)',
    glowGold: 'rgba(212, 175, 55, 0.04)',
    shadowColor: 'rgba(2, 29, 23, 0.4)',
  },
  light: {
    /* Clean white light theme — green & gold as accents only, not background wash */
    background: '#F7F9F8',
    foreground: '#1C2B26',
    primaryDark: '#032F25',
    secondaryGreen: '#0A4D3A',
    emeraldAccent: '#0A7A55',
    goldAccent: '#D4AF37',
    cardBg: '#FFFFFF',
    surfaceLowest: '#FFFFFF',
    surfaceLow: '#F7F9F8',
    surfaceContainer: '#FFFFFF',
    surfaceHigh: '#F0F2F1',
    surfaceHighest: '#E8EBEA',
    onSurface: '#1C2B26',
    onSurfaceVariant: '#5F6F69',
    textHeading: '#0F1F1A',
    glassBg: 'rgba(255, 255, 255, 0.96)',
    glassBorder: 'rgba(15, 31, 26, 0.08)',
    glassHover: 'rgba(248, 250, 249, 1)',
    inputBg: '#FFFFFF',
    inputBorder: 'rgba(15, 31, 26, 0.12)',
    scrollbarTrack: '#F0F2F1',
    scrollbarThumb: '#C5CCC9',
    glowEmerald: 'rgba(10, 122, 85, 0.02)',
    glowGold: 'rgba(184, 146, 46, 0.02)',
    shadowColor: 'rgba(0, 0, 0, 0.06)',
  },
} as const;

export function applyThemeToDocument(mode: ThemeMode) {
  const t = themeTokens[mode];
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(mode);
  root.style.colorScheme = mode;

  const vars: Record<string, string> = {
    '--background': t.background,
    '--foreground': t.foreground,
    '--primary-dark': t.primaryDark,
    '--secondary-green': t.secondaryGreen,
    '--emerald-accent': t.emeraldAccent,
    '--gold-accent': t.goldAccent,
    '--card-bg': t.cardBg,
    '--surface-lowest': t.surfaceLowest,
    '--surface-low': t.surfaceLow,
    '--surface-container': t.surfaceContainer,
    '--surface-high': t.surfaceHigh,
    '--surface-highest': t.surfaceHighest,
    '--on-surface': t.onSurface,
    '--on-surface-variant': t.onSurfaceVariant,
    '--text-heading': t.textHeading,
    '--glass-bg': t.glassBg,
    '--glass-border': t.glassBorder,
    '--glass-hover': t.glassHover,
    '--input-bg': t.inputBg,
    '--input-border': t.inputBorder,
    '--scrollbar-track': t.scrollbarTrack,
    '--scrollbar-thumb': t.scrollbarThumb,
    '--glow-emerald': t.glowEmerald,
    '--glow-gold': t.glowGold,
    '--shadow-color': t.shadowColor,
  };

  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
}
