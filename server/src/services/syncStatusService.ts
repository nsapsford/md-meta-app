import { getPool } from '../db/connection.js';
import { run, queryAll } from '../utils/dbHelpers.js';

export type SyncSource = 'ygoprodeck' | 'mdm_deck_types' | 'mdm_tournaments' | 'untapped';
export type SyncStatus = 'success' | 'partial' | 'failed';

export interface SyncRecord {
  source: SyncSource;
  status: SyncStatus;
  detail: string | null;
  synced_at: number;
}

export async function recordSync(source: SyncSource, status: SyncStatus, detail: string | null = null): Promise<void> {
  const pool = getPool();
  await run(pool,
    `INSERT INTO sync_log (source, status, detail, synced_at)
     VALUES ($1, $2, $3, extract(epoch from now())::bigint)
     ON CONFLICT (source) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, synced_at = EXCLUDED.synced_at`,
    [source, status, detail]
  );
}

export async function getSyncStatus(): Promise<SyncRecord[]> {
  const pool = getPool();
  return await queryAll(pool, 'SELECT source, status, detail, synced_at FROM sync_log ORDER BY source ASC') as SyncRecord[];
}

const ALL_SOURCES: SyncSource[] = ['ygoprodeck', 'mdm_deck_types', 'mdm_tournaments', 'untapped'];

/**
 * True if any source is missing a sync record or hasn't synced within
 * maxAgeSeconds. Used to catch up a full sync that a scheduled run missed —
 * e.g. the host spun the service down right through the scheduled time.
 */
export async function isSyncStale(maxAgeSeconds: number): Promise<boolean> {
  const records = await getSyncStatus();
  const bySource = new Map(records.map((r) => [r.source, r]));
  const nowSeconds = Math.floor(Date.now() / 1000);
  return ALL_SOURCES.some((source) => {
    const record = bySource.get(source);
    return !record || nowSeconds - record.synced_at > maxAgeSeconds;
  });
}
