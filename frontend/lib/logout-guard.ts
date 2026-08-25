type LogoutGuard = () => string | null;

const guards = new Set<LogoutGuard>();

export function registerLogoutGuard(guard: LogoutGuard): () => void {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

export function logoutBlockReason(): string | null {
  for (const guard of guards) {
    const reason = guard();
    if (reason) return reason;
  }
  return null;
}
