import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  change?: string;
  icon: LucideIcon;
  accent?: 'emerald' | 'gold' | 'blue' | 'danger';
}

const accentMap = {
  emerald: 'text-emerald-accent border-emerald-accent/20 bg-emerald-accent/5',
  gold: 'text-gold-accent border-gold-accent/20 bg-gold-accent/5',
  blue: 'text-blue-400 border-blue-400/20 bg-blue-400/5',
  danger: 'text-danger border-danger/20 bg-danger/5',
};

export default function KpiCard({ label, value, change, icon: Icon, accent = 'emerald' }: KpiCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/5 hover:border-emerald-accent/20 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${accentMap[accent]}`}>
          <Icon size={18} />
        </div>
        {change && (
          <span className="text-xs font-mono text-emerald-accent bg-emerald-accent/10 px-2 py-0.5 rounded-full border border-emerald-accent/20">
            {change}
          </span>
        )}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1">{label}</p>
      <p className="text-2xl font-black text-white tracking-tight">{value}</p>
    </div>
  );
}
