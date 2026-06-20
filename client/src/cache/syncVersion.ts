import type { SyncRecord } from '../api/sync';
import { kvGet, kvSet } from '../storage/kvStore';

// The "data version" is a fingerprint of the server's sync state. We don't have
// a dedicated version endpoint, so we derive one from the per-source synced_at
// timestamps returned by getSyncStatus(). Any source re-syncing moves the
// fingerprint, which is exactly when the client has newer data to pull.

/**
 * Deterministic, order-independent fingerprint of the server's data freshness.
 * Summing the timestamps means the value only changes when some source's
 * synced_at changes, regardless of the order records arrive in.
 */
export function computeServerVersion(records: SyncRecord[]): number {
  return records.reduce((sum, r) => sum + (r.synced_at || 0), 0);
}

/** The version the client last acknowledged, or null if there's no baseline. */
export function getStoredVersion(): Promise<number | null> {
  return kvGet('sync.dataVersion');
}

/** Persist the version the client is now in sync with. */
export function setStoredVersion(version: number): Promise<void> {
  return kvSet('sync.dataVersion', version);
}
