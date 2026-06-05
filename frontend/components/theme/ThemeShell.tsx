'use client';

import ThemeToggle from './ThemeToggle';

/** Global theme toggle — rendered on every page via root layout */
export default function ThemeShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 glass-panel px-3 py-2 shadow-lg">
        <ThemeToggle showLabel />
      </div>
    </>
  );
}
