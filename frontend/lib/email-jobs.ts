type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeEmailJobsRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyEmailJobsChanged(): void {
  listeners.forEach((listener) => listener());
}
