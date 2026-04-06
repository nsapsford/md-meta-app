import { getDb } from '../db/connection.js';
import { run, queryAll } from '../utils/dbHelpers.js';

export type SyncSource = 'ygoprodeck' | 'mdm_deck_types' | 'mdm_tournaments' | 'untapped';
export type SyncStatus = 'success' | 'partial' | 'failed';

export interface SyncRecord {
  source: SyncSource;
  status: SyncStatus;
  detail: string | null;
  synced_at: number;
}

export function recordSync(source: SyncSource, status: SyncStatus, detail: string | null = null): void {
  const db = getDb();
  run(db,
    `INSERT OR REPLACE INTO sync_log (source, status, detail, synced_at)
     VALUES (?, ?, ?, strftime('%s','now'))`,
    [source, status, detail]
  );
}

export function getSyncStatus(): SyncRecord[] {
  const db = getDb();
  return queryAll(db, 'SELECT source, status, detail, synced_at FROM sync_log') as SyncRecord[];
}
