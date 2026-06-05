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
    /* Brand-dominant light — emerald mist, never plain white */
    background: '#D4EDE4',
    foreground: '#032F25',
    primaryDark: '#021D17',
    secondaryGreen: '#0A4D3A',
    emeraldAccent: '#1A9B72',
    goldAccent: '#9A7B1A',
    cardBg: '#BFE4D6',
    surfaceLowest: '#E8F5F0',
    surfaceLow: '#D4EDE4',
    surfaceContainer: '#C5E6DC',
    surfaceHigh: '#A8D4C8',
    surfaceHighest: '#8FC9BA',
    onSurface: '#032F25',
    onSurfaceVariant: '#0A4D3A',
    textHeading: '#021D17',
    glassBg: 'rgba(191, 228, 214, 0.88)',
    glassBorder: 'rgba(3, 47, 37, 0.14)',
    glassHover: 'rgba(168, 212, 200, 0.95)',
    inputBg: 'rgba(197, 230, 220, 0.9)',
    inputBorder: 'rgba(3, 47, 37, 0.18)',
    scrollbarTrack: '#C5E6DC',
    scrollbarThumb: '#8FC9BA',
    glowEmerald: 'rgba(26, 155, 114, 0.12)',
    glowGold: 'rgba(154, 123, 26, 0.08)',
    shadowColor: 'rgba(3, 47, 37, 0.12)',
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
