import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          surface: '#001712',
          'surface-dim': '#001712',
          'surface-bright': '#243e37',
          'surface-lowest': '#00110d',
          'surface-low': '#04201a',
          'surface-container': '#08241e',
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
        }
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
