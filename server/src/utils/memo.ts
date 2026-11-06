// Small in-process cache for expensive, read-mostly computations (matchup
// matrix, ecosystem analysis, ladder EV, card popularity ordering).
//
// The underlying data only changes when a sync runs (twice a day) or a
// personal game is logged, so recomputing on every request just re-reads the
// same Neon rows. Entries are dropped by invalidateDerived() from those write
// paths; the TTL is only a safety net for writes that don't call it.
//
// Concurrent callers for the same key share one in-flight computation, so a
// burst of requests right after the host wakes up costs one query, not N.

interface Entry<T> {
  promise: Promise<T>;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 15 * 60_000;
const MAX_ENTRIES = 200;

const store = new Map<string, Entry<unknown>>();

export function memoize<T>(key: string, compute: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    // Refresh recency for the LRU eviction below.
    store.delete(key);
    store.set(key, hit);
    return hit.promise;
  }

  const promise = compute();
  store.set(key, { promise, expiresAt: now + ttlMs });
  // Never cache a failure: the next request should retry.
  promise.catch(() => {
    if (store.get(key)?.promise === promise) store.delete(key);
  });

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return promise;
}

/** Drop cached entries whose key starts with `prefix` (or everything). */
export function invalidateDerived(prefix = ''): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
