import { experimental_createQueryPersister, type PersistedQuery } from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';
import { cacheClear, cacheEntries, cacheRead, cacheRemove, cacheWrite } from '../storage/offlineCache';

// Per-query persistence into the existing IndexedDB store (storage/offlineCache).
//
// Why per-query rather than persisting the whole QueryClient as one blob: the
// heavy analytics payloads (matchup matrix, meta trends, deck profiles with
// full decklists) add up to megabytes. A whole-client persister re-serializes
// all of it on every cache change, on the main thread. Here each query is read
// only when it is first used and written only when it changes.

const PREFIX = 'rq';
// Bump to discard every persisted entry after a breaking change to a payload shape.
const BUSTER = 'v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How a query may be persisted:
 *  - 'public': shared meta data (tier list, matchups, trends...). Always kept,
 *    because it is what makes a cold start paint instantly.
 *  - 'user': the signed-in player's own data (saved decks, games, dossiers).
 *    Only kept while "Enable Local Caching" is on.
 * Queries with no `meta.persist` stay in memory only.
 */
export type PersistScope = 'public' | 'user';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { persist?: PersistScope };
  }
}

// The setting itself lives in Capacitor Preferences (async). A synchronous
// localStorage mirror lets the very first queries of a cold start — which run
// before OfflineCacheProvider has read Preferences — already know whether they
// may restore user data from disk.
const USER_PERSIST_MIRROR = 'md.offline.cachingEnabled';
let userDataPersistence = (() => {
  try { return localStorage.getItem(USER_PERSIST_MIRROR) === '1'; } catch { return false; }
})();

/** Called by OfflineCacheProvider whenever the "Enable Local Caching" setting is known or changes. */
export function setUserDataPersistence(enabled: boolean) {
  userDataPersistence = enabled;
  try { localStorage.setItem(USER_PERSIST_MIRROR, enabled ? '1' : '0'); } catch { /* private mode */ }
}

function shouldPersist(query: Query): boolean {
  const scope = query.meta?.persist;
  return scope === 'public' || (scope === 'user' && userDataPersistence);
}

// IndexedDB stores structured-cloned objects, so no JSON round trip is needed.
// Only the fields the persister reads back are kept: `state` also carries
// errors and fetch bookkeeping that don't belong on disk.
const storage = {
  getItem: async (key: string) => (await cacheRead<PersistedQuery>(key))?.data ?? null,
  setItem: (key: string, value: PersistedQuery) => cacheWrite(key, value).catch(() => {}),
  removeItem: (key: string) => cacheRemove(key),
  entries: () => cacheEntries<PersistedQuery>(),
};

const persister = experimental_createQueryPersister<PersistedQuery>({
  storage,
  prefix: PREFIX,
  buster: BUSTER,
  maxAge: MAX_AGE_MS,
  serialize: (q) => ({
    queryHash: q.queryHash,
    queryKey: q.queryKey,
    buster: q.buster,
    state: {
      data: q.state.data,
      dataUpdatedAt: q.state.dataUpdatedAt,
      status: 'success',
    } as PersistedQuery['state'],
  }),
  deserialize: (q) => q,
  filters: { predicate: shouldPersist },
});

export const queryPersister = persister.persisterFn;

/**
 * Housekeeping, run once at idle after boot: drops expired entries and the
 * pre-TanStack page mirrors (`tier-list`, `matchup-matrix:*`, ...) that
 * nothing reads any more.
 */
export async function pruneStorage(): Promise<void> {
  const entries = await cacheEntries();
  await Promise.all(
    entries
      .filter(([key]) => !key.startsWith(`${PREFIX}-`))
      .map(([key]) => cacheRemove(key))
  );
  await persister.persisterGc();
}

/** Drops everything persisted (used when the user turns local caching off). */
export function clearPersistedQueries(): Promise<void> {
  return cacheClear();
}
