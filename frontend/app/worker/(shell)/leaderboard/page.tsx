import { redirect } from 'next/navigation';

/** Leaderboard is admin-only; workers are redirected away. */
export default function WorkerLeaderboardRedirect() {
  redirect('/worker/dashboard');
}
