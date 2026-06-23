/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  transpilePackages: ['framer-motion', 'firebase'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  webpack: (config) => {
    // Firebase sub-packages (e.g. firebase/firestore) import @firebase/* peers.
    // Resolve from the project root so nested firebase/node_modules does not shadow them.
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      ...(config.resolve.modules ?? ['node_modules']),
    ];
    return config;
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        // Proxy /api/:path* → backend :path*
        // e.g. /api/auth/users → http://localhost:8000/auth/users
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
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
