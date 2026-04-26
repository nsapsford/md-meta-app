import api from './client';

export type SyncSource = 'ygoprodeck' | 'mdm_deck_types' | 'mdm_tournaments' | 'untapped';

export interface SyncRecord {
  source: SyncSource;
  status: 'success' | 'partial' | 'failed';
  detail: string | null;
  synced_at: number; // unix timestamp
}

// Expected sync intervals in seconds, used to detect stale data (threshold = 2×)
export const SYNC_TTL: Record<SyncSource, number> = {
  ygoprodeck:      86400, // 24h
  mdm_deck_types:  21600, // 6h
  mdm_tournaments:  7200, // 2h
  untapped:        10800, // 3h
};

export const SOURCE_LABEL: Record<SyncSource, string> = {
  ygoprodeck:      'Card DB',
  mdm_deck_types:  'Deck Types',
  mdm_tournaments: 'Tournaments',
  untapped:        'Untapped',
};

export async function getSyncStatus(): Promise<SyncRecord[]> {
  const res = await api.get('/sync/status');
  return res.data;
}

export async function triggerSync(source: SyncSource, token: string): Promise<void> {
  await api.post(`/sync/run/${source}`, null, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
