import { cacheRead, cacheWrite } from '../storage/offlineCache';

// Local-first data store for page datasets. This is a thin, typed facade over
// the single IndexedDB cache (storage/offlineCache.ts) — it deliberately does
// NOT open a second database. Pages read from here first to paint instantly,
// then revalidate against the network and write the fresh copy back.

// Stable keys for the datasets we mirror onto the device. The tier-list key is
// shared with offline/resources.ts so the background sync engine and the
// page-level local-first reads stay in sync on the same cache entry.
export const LOCAL_KEYS = {
  tierList: 'tier-list',
  matchupMatrix: 'matchup-matrix',
  featuredDecks: 'featured-decks',
  metaTrends: 'meta-trends',
} as const;

export type LocalKey = (typeof LOCAL_KEYS)[keyof typeof LOCAL_KEYS];

/** Read a cached dataset, or null on a miss / unavailable storage. */
export async function readLocal<T>(key: string): Promise<T | null> {
  const entry = await cacheRead<T>(key);
  return entry ? entry.data : null;
}

/** Mirror a fresh dataset onto the device for the next cold start. */
export async function writeLocal<T>(key: string, data: T): Promise<void> {
  try {
    await cacheWrite(key, data);
  } catch {
    // Quota / private browsing — a failed mirror just means a network fetch
    // next cold start, never a broken page.
  }
}
