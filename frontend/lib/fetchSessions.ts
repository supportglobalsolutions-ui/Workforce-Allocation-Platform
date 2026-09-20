import { api } from '@/lib/api';

const PAGE_SIZE = 1000;

export type SessionListOpts = {
  workerId?: string;
  includeImages?: boolean;
  /** Cap total rows (safety). Omit to load every matching session. */
  maxRows?: number;
};

/**
 * Page through GET /sessions until all matching rows are loaded.
 * Staff may pass workerId; workers are scoped to themselves by the API.
 */
export async function fetchAllSessions<T extends { id: string }>(
  opts: SessionListOpts = {},
): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY;

  for (let offset = 0; result.length < maxRows; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      include_images: opts.includeImages === true ? 'true' : 'false',
    });
    if (opts.workerId) params.set('worker_id', opts.workerId);

    const page = await api.get<T[]>(`/sessions?${params.toString()}`);
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      result.push(row);
      if (result.length >= maxRows) break;
    }
    if (page.length < PAGE_SIZE) break;
  }

  return result;
}
