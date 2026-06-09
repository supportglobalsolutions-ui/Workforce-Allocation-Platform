import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          background: 'var(--background)',
          'primary-dark': 'var(--primary-dark)',
          'secondary-green': 'var(--secondary-green)',
          'card': 'var(--card-bg)',
          'surface': 'var(--background)',
          'surface-dim': 'var(--background)',
          'surface-bright': 'var(--surface-highest)',
          'surface-lowest': 'var(--surface-lowest)',
          'surface-low': 'var(--surface-low)',
          'surface-container': 'var(--surface-container)',
          'surface-high': 'var(--surface-high)',
          'surface-highest': 'var(--surface-highest)',
          'on-surface': 'var(--on-surface)',
          'on-surface-variant': 'var(--on-surface-variant)',
          outline: '#86948d',
          'outline-variant': '#3d4a44',
          primary: '#61e3bb',
          'on-primary': 'var(--primary-dark)',
          'primary-container': 'var(--emerald-accent)',
          secondary: 'var(--gold-accent)',
          'on-secondary': 'var(--primary-dark)',
          'secondary-container': '#af8d11',
          tertiary: '#9ddac0',
          error: '#ffb4ab',
          'error-container': '#93000a',
        },
        'emerald-accent': 'var(--emerald-accent)',
        'gold-accent': 'var(--gold-accent)',
        success: '#42D392',
        warning: '#F4B740',
        danger: '#E85D75',
      },
      borderRadius: {
        '2xl': '16px',
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        'dot-bounce': {
          '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'dot-bounce': 'dot-bounce 1.2s infinite ease-in-out both',
      },
    },
  },
  plugins: [],
};
export default config;
