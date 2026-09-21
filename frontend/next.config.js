/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  transpilePackages: ['framer-motion'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  webpack: (config, { dev }) => {
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      ...(config.resolve.modules ?? ['node_modules']),
    ];
    // Webpack's on-disk pack cache corrupts on Windows (failed rename of
    // *.pack.gz). The dev server then serves HTML that points at chunks that
    // no longer exist, and the app stays a blank screen. Memory cache avoids that.
    if (dev) {
      config.cache = { type: 'memory' };
    }
    return config;
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss: ws:",
      "font-src 'self' data:",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    const security = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];

    return [
      // Hashed build assets are safe to cache forever.
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // HTML/app routes must never keep pointing at deleted chunk hashes after a
      // hot reload or deploy — that is what leaves pages stuck on the spinner.
      // Exclude /_next/* so immutable static assets keep their long cache.
      {
        source: '/((?!_next/).*)',
        headers: [
          ...security,
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Prefer a dedicated local proxy target so NEXT_PUBLIC_API_URL can stay
    // pointed at production without breaking local auth/OTP development.
    const backendUrl =
      process.env.API_PROXY_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://127.0.0.1:8000';

    const rules = [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];

    // Phase 1 Safety: never proxy Guacamole REST through Vercel in production.
    // A worker who once obtained a Guacamole token could call
    // /remote/api/session/data/.../parameters and read every Windows password.
    // Local optional: set ALLOW_GUACAMOLE_REMOTE_PROXY=true for debugging only.
    const allowRemoteProxy =
      process.env.ALLOW_GUACAMOLE_REMOTE_PROXY === 'true' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.VERCEL !== '1';
    if (allowRemoteProxy) {
      const guacamoleUrl =
        process.env.NEXT_PUBLIC_GUACAMOLE_URL || 'http://localhost:8080/guacamole';
      rules.push({
        source: '/remote/:path*',
        destination: `${guacamoleUrl}/:path*`,
      });
    }

    return rules;
  },
  async redirects() {
    return [
      { source: '/auth/login', destination: '/login', permanent: true },
      { source: '/worker/worker_portal_home', destination: '/worker/dashboard', permanent: true },
      { source: '/worker/active_work_session', destination: '/worker/active-session', permanent: true },
      { source: '/worker/active-work-session', destination: '/worker/active-session', permanent: true },
      { source: '/worker/worker_management', destination: '/admin/workers', permanent: true },
      { source: '/rdp_claim_board', destination: '/worker/rdp-claim-board', permanent: true },
      { source: '/global_leaderboard', destination: '/worker/leaderboard', permanent: true },
      { source: '/session_history', destination: '/worker/session-history', permanent: true },
      { source: '/operations_command_center', destination: '/admin/dashboard', permanent: true },
      { source: '/ceo_command_center', destination: '/leadership/ceo-command', permanent: true },
      { source: '/rdp_resource_management', destination: '/admin/rdp', permanent: true },
      { source: '/admin/audit_logs', destination: '/admin/audit-logs', permanent: true },
      { source: '/admin/partner_management', destination: '/admin/partners', permanent: true },
      { source: '/admin/payroll_revenue_dashboard', destination: '/admin/payroll', permanent: true },
      { source: '/admin/financial_intelligence', destination: '/leadership/financial', permanent: true },
      { source: '/admin/system_settings', destination: '/admin/settings', permanent: true },
      { source: '/executive/ceo_command_center', destination: '/leadership/ceo-command', permanent: true },
      { source: '/executive/executive_login', destination: '/login', permanent: true },
      { source: '/leadership/global_leaderboard', destination: '/worker/leaderboard', permanent: true },
      { source: '/leadership/operations_command_center', destination: '/admin/dashboard', permanent: true },
      { source: '/leadership/rdp_claim_board', destination: '/worker/rdp-claim-board', permanent: true },
      { source: '/leadership/rdp_resource_management', destination: '/admin/rdp', permanent: true },
      { source: '/leadership/session_history', destination: '/worker/session-history', permanent: true },
    ];
  },
};

module.exports = nextConfig;
