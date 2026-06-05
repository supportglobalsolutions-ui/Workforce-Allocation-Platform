import Link from 'next/link';
import { Lock } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';

export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="text-center max-w-3xl">
        <div className="flex justify-center mb-10">
          <LogoMark size="lg" priority />
        </div>

        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-gold-accent mb-4 font-mono">
          Remote · Smart · Global
        </p>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-theme-heading font-display leading-[1.1] tracking-tight mb-6">
          Global Solutions
          <span className="block mt-2 text-emerald-accent">
            Workforce Allocation Platform
          </span>
        </h1>

        <div className="mt-12">
          <Link
            href="/login"
            className="inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-base transition-colors glass-modal border border-theme hover:border-gold-accent/40"
          >
            <span className="w-10 h-10 rounded-xl bg-emerald-accent flex items-center justify-center text-brand-primary-dark">
              <Lock size={18} />
            </span>
            <span className="text-theme-heading">Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
