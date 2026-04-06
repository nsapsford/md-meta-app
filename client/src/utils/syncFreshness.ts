export type Freshness = 'fresh' | 'stale' | 'outdated' | 'failed';

// SyncRecord shape inline to avoid circular import
interface MinimalSyncRecord {
  status: string;
  synced_at: number;
}

export function computeFreshness(record: MinimalSyncRecord): Freshness {
  if (record.status === 'failed') return 'failed';
  const ageHrs = (Date.now() / 1000 - record.synced_at) / 3600;
  if (ageHrs > 12) return 'outdated';
  if (ageHrs > 2) return 'stale';
  return 'fresh';
}
