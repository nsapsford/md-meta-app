import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { syncResources, type SyncResource } from '../offline/resources';
import { cacheRead, cacheWrite } from '../storage/offlineCache';
import { kvSet } from '../storage/kvStore';

export type BackgroundSyncStatus = 'idle' | 'syncing' | 'error';

export interface BackgroundSyncState {
  status: BackgroundSyncStatus;
  lastSyncAt: number | null; // unix ms of last completed run
  /** Re-fetch every resource regardless of TTL. Resolves when the run finishes. */
  syncNow: () => Promise<void>;
}

// How often the engine wakes up to check resource TTLs. Each wake-up only
// hits the network for resources whose cached copy is older than its ttlMs.
const SYNC_CHECK_INTERVAL_MS = 5 * 60_000;

async function syncResource(resource: SyncResource<unknown>, force: boolean): Promise<boolean> {
  const cached = await cacheRead(resource.key);
  if (!force && cached && Date.now() - cached.updatedAt < resource.ttlMs) return false;
  const data = await resource.fetch();
  await cacheWrite(resource.key, data);
  return true;
}

/**
 * Silent background synchronization engine. While `enabled`, it keeps every
 * registered SyncResource fresh in IndexedDB by re-fetching stale entries:
 *  - shortly after mount (deferred to idle time so it never delays first paint)
 *  - on a fixed interval while the app is open
 *  - when the native app returns to the foreground (Capacitor App plugin)
 *  - when the network comes back online
 *
 * All work is plain async I/O (fetch + IndexedDB), so nothing here blocks the
 * main thread; failures are swallowed per-resource so one bad endpoint can't
 * stall the rest of the cache.
 */
export function useBackgroundSync(enabled: boolean): BackgroundSyncState {
  const [status, setStatus] = useState<BackgroundSyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const runningRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const runSync = useCallback(async (force = false): Promise<void> => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus('syncing');
    let anyFailed = false;
    try {
      // Sequential on purpose: this is a background task, so we'd rather
      // trickle requests than burst-compete with user-initiated fetches.
      for (const resource of syncResources) {
        if (!enabledRef.current) return;
        try {
          await syncResource(resource, force);
        } catch (err) {
          anyFailed = true;
          console.warn(`[BackgroundSync] ${resource.key} failed:`, err);
        }
      }
      const now = Date.now();
      setLastSyncAt(now);
      await kvSet('offline.lastFullSyncAt', now).catch(() => {});
    } finally {
      runningRef.current = false;
      setStatus(anyFailed ? 'error' : 'idle');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // First pass: wait for idle time so cached pages render before we spend
    // bandwidth refreshing the cache.
    const idleHandle: number = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => void runSync(), { timeout: 5000 })
      : window.setTimeout(() => void runSync(), 1500);

    const interval = window.setInterval(() => void runSync(), SYNC_CHECK_INTERVAL_MS);

    const onOnline = () => void runSync();
    window.addEventListener('online', onOnline);

    // On native, also resync when the app comes back from the background —
    // intervals are throttled or frozen while the WebView is suspended.
    let removeResumeListener: (() => void) | null = null;
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/app').then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void runSync();
        })
      ).then((handle) => {
        removeResumeListener = () => void handle.remove();
      }).catch(() => {});
    }

    return () => {
      if (typeof requestIdleCallback === 'function') cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      removeResumeListener?.();
    };
  }, [enabled, runSync]);

  const syncNow = useCallback(() => runSync(true), [runSync]);

  return { status, lastSyncAt, syncNow };
}
