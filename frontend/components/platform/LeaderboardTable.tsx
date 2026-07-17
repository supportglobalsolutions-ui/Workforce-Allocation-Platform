export interface LeaderboardEntry {
  worker_id: string;
  worker_display_name: string;
  worker_country: string;
  worker_type: string;
  composite_score: number;
  assessment_component: number | null;
  rating_component: number | null;
  reliability_component: number | null;
  consistency_component: number | null;
  period_type: string;
  period_label: string;
  global_rank: number | null;
  country_rank: number | null;
  session_streak_days: number | null;
  calculated_at: string;
}

function RankCell({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-gold-accent/20 border border-gold-accent/40 text-gold-accent text-sm font-black">1</span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-gray-300/15 border border-gray-300/40 text-gray-300 text-sm font-black">2</span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-orange-400/15 border border-orange-400/40 text-orange-400 text-sm font-black">3</span>
    );
  }
  return <span className="inline-flex w-8 h-8 items-center justify-center text-sm font-bold text-theme-muted">#{rank}</span>;
}

function TypeChip({ workerType }: { workerType: string }) {
  const isPartner = workerType === 'partner_worker';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
      isPartner
        ? 'bg-gold-accent/20 text-gold-accent border-gold-accent/30'
        : 'bg-white/10 text-theme-muted border-white/10'
    }`}>
      {isPartner ? 'Partner' : 'GS'}
    </span>
  );
}

function componentCell(value: number | null) {
  if (value == null) return <span className="text-theme-muted">—</span>;
  return <span className="text-white/80 tabular-nums">{Number(value).toFixed(1)}</span>;
}

export default function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted w-16">Rank</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Worker</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden sm:table-cell">Country</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Type</th>
              <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Score</th>
              <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Assessment</th>
              <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Rating</th>
              <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Reliability</th>
              <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Consistency</th>
              <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden lg:table-cell">Streak</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const rank = entry.global_rank ?? i + 1;
              return (
                <tr
                  key={entry.worker_id}
                  className={`border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors ${
                    rank <= 3 ? 'bg-gold-accent/[0.03]' : ''
                  }`}
                >
                  <td className="px-4 py-3"><RankCell rank={rank} /></td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{entry.worker_display_name}</p>
                    <p className="text-xs text-theme-muted sm:hidden">{entry.worker_country}</p>
                  </td>
                  <td className="px-4 py-3 text-theme-muted hidden sm:table-cell">{entry.worker_country}</td>
                  <td className="px-4 py-3"><TypeChip workerType={entry.worker_type} /></td>
                  <td className="px-4 py-3 text-right font-black text-emerald-accent tabular-nums">
                    {Number(entry.composite_score).toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs hidden md:table-cell">{componentCell(entry.assessment_component)}</td>
                  <td className="px-3 py-3 text-right text-xs hidden md:table-cell">{componentCell(entry.rating_component)}</td>
                  <td className="px-3 py-3 text-right text-xs hidden md:table-cell">{componentCell(entry.reliability_component)}</td>
                  <td className="px-3 py-3 text-right text-xs hidden md:table-cell">{componentCell(entry.consistency_component)}</td>
                  <td className="px-4 py-3 text-right text-xs text-theme-muted tabular-nums hidden lg:table-cell">
                    {entry.session_streak_days != null ? `${entry.session_streak_days}d` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
