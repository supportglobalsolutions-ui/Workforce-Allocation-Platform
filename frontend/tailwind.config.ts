import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
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
          background: '#021D17',
          'primary-dark': '#032F25',
          'secondary-green': '#0A4D3A',
          'card': '#0A241E',
          'surface': '#021D17',
          'surface-dim': '#021D17',
          'surface-bright': '#243e37',
          'surface-lowest': '#00110d',
          'surface-low': '#04201a',
          'surface-container': '#0A241E',
          'surface-high': '#142f28',
          'surface-highest': '#1f3a33',
          'on-surface': '#cbe9df',
          'on-surface-variant': '#bbcac2',
          outline: '#86948d',
          'outline-variant': '#3d4a44',
          primary: '#61e3bb',
          'on-primary': '#00382a',
          'primary-container': '#3fc7a0',
          secondary: '#e9c349',
          'on-secondary': '#3c2f00',
          'secondary-container': '#af8d11',
          tertiary: '#9ddac0',
          error: '#ffb4ab',
          'error-container': '#93000a',
        },
        'emerald-accent': '#3FC7A0',
        'gold-accent': '#D4AF37',
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
    },
  },
  plugins: [],
};
export default config;
