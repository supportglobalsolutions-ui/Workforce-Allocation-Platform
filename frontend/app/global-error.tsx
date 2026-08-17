'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: it replaces the root layout, so it ships its own
 * <html>/<body> and inline styles rather than depending on globals.css.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#021D17', color: '#E6F2EE', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{
            maxWidth: 520, width: '100%', textAlign: 'center', padding: 32,
            borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
          }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Application error</h1>
            <p style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>
              The app failed to load. Reloading usually clears it.
            </p>
            {error.digest && (
              <p style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>Reference: {error.digest}</p>
            )}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 24, padding: '10px 18px', borderRadius: 12, cursor: 'pointer',
                border: '1px solid rgba(63,199,160,0.4)', background: 'rgba(63,199,160,0.15)',
                color: '#3FC7A0', fontSize: 14, fontWeight: 600,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
