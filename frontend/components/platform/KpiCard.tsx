import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  change?: string;
  icon: LucideIcon;
  accent?: 'emerald' | 'gold' | 'blue' | 'danger';
  highlight?: boolean;
  compact?: boolean;
}

const iconTint = {
  emerald: 'text-emerald-accent bg-emerald-accent/10',
  gold: 'text-gold-accent bg-gold-accent/10',
  blue: 'text-blue-400 bg-blue-400/10',
  danger: 'text-danger bg-danger/10',
};

const highlightCard = {
  emerald: 'border-emerald-accent/40 bg-emerald-accent/5',
  gold: 'border-gold-accent/40 bg-gold-accent/5',
  blue: 'border-blue-400/40 bg-blue-400/5',
  danger: 'border-danger/40 bg-danger/5',
};

const highlightValue = {
  emerald: 'text-emerald-accent',
  gold: 'text-gold-accent',
  blue: 'text-blue-400',
  danger: 'text-danger',
};

export default function KpiCard({
  label, value, change, icon: Icon, accent = 'emerald', highlight = false, compact = false,
}: KpiCardProps) {
  if (compact) {
    return (
      <div className={`glass-panel px-3.5 py-3 ${highlight ? highlightCard[accent] : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted truncate">{label}</p>
          <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${iconTint[accent]}`}>
            <Icon size={12} />
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-xl font-black tracking-tight leading-none ${highlight ? highlightValue[accent] : 'text-theme-heading'}`}>
            {value}
          </p>
          {change && (
            <span className="text-[10px] font-mono text-emerald-accent bg-emerald-accent/10 px-1.5 py-0.5 rounded-full">
              {change}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-panel p-5 ${highlight ? highlightCard[accent] : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{label}</p>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconTint[accent]}`}>
          <Icon size={15} />
        </span>
      </div>
      <div className="flex items-end justify-between mt-3">
        <p className={`text-2xl font-black tracking-tight ${highlight ? highlightValue[accent] : 'text-theme-heading'}`}>
          {value}
        </p>
        {change && (
          <span className="text-xs font-mono text-emerald-accent bg-emerald-accent/10 px-2 py-0.5 rounded-full">
            {change}
          </span>
        )}
      </div>
    </div>
  );
}
