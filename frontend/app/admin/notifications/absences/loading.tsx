import SpinningDots from '@/components/shared/SpinningDots';

/** Keep the notifications shell responsive while this route's client bundle loads. */
export default function AbsenceReportsLoading() {
  return (
    <div className="min-h-[420px] flex items-center justify-center">
      <div className="glass-panel rounded-2xl border border-white/5 px-6 py-5 flex items-center gap-3">
        <SpinningDots size="md" className="text-emerald-accent" />
        <p className="text-sm text-theme-muted">Loading absence reports…</p>
      </div>
    </div>
  );
}
