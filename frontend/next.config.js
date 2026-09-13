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
  webpack: (config) => {
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      ...(config.resolve.modules ?? ['node_modules']),
    ];
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

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
    const guacamoleUrl = process.env.NEXT_PUBLIC_GUACAMOLE_URL || 'http://localhost:8080/guacamole';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
      {
        source: '/remote/:path*',
        destination: `${guacamoleUrl}/:path*`,
      },
    ];
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
