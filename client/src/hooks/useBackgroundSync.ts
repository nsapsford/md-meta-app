import { useCallback, useEffect, useRef, useState } from 'react';
import { onlineManager, focusManager, useQueryClient } from '@tanstack/react-query';
import { syncResources } from '../offline/resources';
import { kvSet } from '../storage/kvStore';

export type BackgroundSyncStatus = 'idle' | 'syncing' | 'error';

export interface BackgroundSyncState {
  status: BackgroundSyncStatus;
  lastSyncAt: number | null; // unix ms of last completed run
  /** Re-fetch every resource regardless of TTL. Resolves when the run finishes. */
  syncNow: () => Promise<void>;
}

const SYNC_CHECK_INTERVAL_MS = 5 * 60_000;

/**
 * Keeps the offline datasets warm while "Enable Local Caching" is on. Each
 * run is a prefetchQuery per resource with staleTime = its TTL, so TanStack
 * Query skips anything still fresh, dedupes against a page that is fetching
 * the same data, and the persister writes the result to IndexedDB.
 *
 * Runs at idle after boot, on an interval, and when the app regains focus or
 * the network — focus/online come from TanStack's managers, which
 * queryClient.ts wires to Capacitor's appStateChange.
 */
export function useBackgroundSync(enabled: boolean): BackgroundSyncState {
  const queryClient = useQueryClient();
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
      // Sequential on purpose: background work trickles instead of competing
      // with the requests of the page the user is looking at.
      for (const resource of syncResources) {
        if (!enabledRef.current) return;
        try {
          const opts = { ...resource.options(), staleTime: force ? 0 : resource.ttlMs };
          // fetchQuery (not prefetchQuery) so a failure is visible here.
          await queryClient.fetchQuery(opts);
        } catch (err) {
          anyFailed = true;
          console.warn(`[BackgroundSync] ${resource.label} failed:`, err);
        }
      }
      const now = Date.now();
      setLastSyncAt(now);
      await kvSet('offline.lastFullSyncAt', now).catch(() => {});
    } finally {
      runningRef.current = false;
      setStatus(anyFailed ? 'error' : 'idle');
    }
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;

    const idleHandle: number = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => void runSync(), { timeout: 5000 })
      : window.setTimeout(() => void runSync(), 1500);
    const interval = window.setInterval(() => void runSync(), SYNC_CHECK_INTERVAL_MS);
    const unsubOnline = onlineManager.subscribe((online) => { if (online) void runSync(); });
    const unsubFocus = focusManager.subscribe((focused) => { if (focused) void runSync(); });

    return () => {
      if (typeof requestIdleCallback === 'function') cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
      window.clearInterval(interval);
      unsubOnline();
      unsubFocus();
    };
  }, [enabled, runSync]);

  const syncNow = useCallback(() => runSync(true), [runSync]);

  return { status, lastSyncAt, syncNow };
}
