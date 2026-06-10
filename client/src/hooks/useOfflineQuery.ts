import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyncResource } from '../offline/resources';
import { cacheRead, cacheWrite } from '../storage/offlineCache';

export interface OfflineQueryResult<T> {
  data: T | null;
  /** Where the current `data` came from. 'cache' means it may be stale. */
  source: 'cache' | 'network' | null;
  /** True while the initial load (cache or network) is in flight. */
  loading: boolean;
  /** True while a background revalidation is in flight (data already shown). */
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Offline-first data hook (stale-while-revalidate):
 *  1. Resolve instantly from IndexedDB if a cached copy exists — this is what
 *     makes cold app starts render immediately.
 *  2. Always revalidate against the server in the background and swap the
 *     fresh data in (and back into the cache) when it lands.
 *
 * When caching is disabled the hook degrades to a plain network fetch.
 */
export function useOfflineQuery<T>(
  resource: SyncResource<T>,
  cachingEnabled: boolean
): OfflineQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [source, setSource] = useState<'cache' | 'network' | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Invalidate in-flight loads when the resource changes or we unmount.
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current;
    setError(null);

    let servedFromCache = false;
    if (cachingEnabled) {
      const cached = await cacheRead<T>(resource.key);
      if (cached && isCurrent()) {
        setData(cached.data);
        setSource('cache');
        setLoading(false);
        servedFromCache = true;
      }
    }

    if (servedFromCache) setRefreshing(true);
    try {
      const fresh = await resource.fetch();
      if (!isCurrent()) return;
      setData(fresh);
      setSource('network');
      if (cachingEnabled) await cacheWrite(resource.key, fresh);
    } catch (err) {
      if (!isCurrent()) return;
      // Keep showing cached data on network failure — that's the point of
      // the offline cache. Only surface the error if we have nothing to show.
      if (!servedFromCache) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resource, cachingEnabled]);

  useEffect(() => {
    setLoading(true);
    void load();
    return () => { generationRef.current++; };
  }, [load]);

  return { data, source, loading, refreshing, error, refresh: load };
}
