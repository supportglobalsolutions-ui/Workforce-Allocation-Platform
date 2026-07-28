import { api } from '@/lib/api';

export interface PartnerEntity {
  id: string;
  name: string;
  notes: string | null;
  status: 'active' | 'inactive';
  is_self: boolean;
  created_at: string;
  worker_count: number;
}

/** Ensure a partner company exists for this person (attached to the partner login). */
export async function ensurePartnerEntity(displayName: string): Promise<string> {
  const name = displayName.trim() || 'Partner';
  const existing = await api.get<PartnerEntity[]>('/partners');
  const match = existing.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;

  try {
    const created = await api.post<PartnerEntity>('/partners', {
      name,
      status: 'active',
      is_self: true,
    });
    return created.id;
  } catch {
    // Unique name race / conflict — append a short suffix
    const created = await api.post<PartnerEntity>('/partners', {
      name: `${name} · ${Date.now().toString(36).slice(-4)}`,
      status: 'active',
      is_self: true,
    });
    return created.id;
  }
}
