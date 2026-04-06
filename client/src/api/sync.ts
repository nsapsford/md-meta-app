import api from './client';

export interface SyncRecord {
  source: 'ygoprodeck' | 'mdm_deck_types' | 'mdm_tournaments' | 'untapped';
  status: 'success' | 'partial' | 'failed';
  detail: string | null;
  synced_at: number; // unix timestamp
}

export async function getSyncStatus(): Promise<SyncRecord[]> {
  const res = await api.get('/sync/status');
  return res.data;
}
