import Link from 'next/link';
import { motion } from 'framer-motion';

// Simple index of all available pages in the app
export default function PagesIndex() {
  const pages = [
    { href: '/auth/login', label: 'Login (Auth)' },
    { href: '/worker/portal', label: 'Worker Portal' },
    { href: '/worker/dashboard', label: 'Worker Dashboard' },
    { href: '/admin/dashboard', label: 'Admin Dashboard' },
    { href: '/leadership/dashboard', label: 'Leadership Dashboard' },
    // add more routes as they are created
  ];

  return (
    <div className="min-h-screen bg-[#001712] flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-[#0a241e] glass-panel p-8 rounded-2xl border border-white/5 w-full max-w-2xl"
      >
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Pages Directory</h1>
        <ul className="space-y-3">
          {pages.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="block w-full text-center py-2 rounded-md bg-[#61e3bb]/10 hover:bg-[#61e3bb]/20 text-[#cbe9df] transition-colors"
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
