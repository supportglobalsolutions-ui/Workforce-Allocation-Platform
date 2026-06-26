import { STATUS_COLORS, STATUS_LABELS } from '@/lib/status';

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] ?? 'bg-white/10 text-white/60 border-white/10';
  const text = label ?? STATUS_LABELS[status] ?? status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colors}`}>
      {text}
    </span>
  );
}
