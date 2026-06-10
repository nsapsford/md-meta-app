import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useBackgroundSync, type BackgroundSyncStatus } from '../hooks/useBackgroundSync';
import { cacheClear } from '../storage/offlineCache';
import { kvGet, kvRemove, kvSet } from '../storage/kvStore';

export interface OfflineCacheContextValue {
  /** Whether "Enable Local Caching" is on. Null while restoring from storage. */
  enabled: boolean;
  ready: boolean;
  syncStatus: BackgroundSyncStatus;
  lastSyncAt: number | null;
  setEnabled: (enabled: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
  clearCache: () => Promise<void>;
}

const OfflineCacheContext = createContext<OfflineCacheContextValue | null>(null);

export function OfflineCacheProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);
  const [persistedSyncAt, setPersistedSyncAt] = useState<number | null>(null);

  // Restore the toggle (and last sync time, for display) from device storage.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, lastSync] = await Promise.all([
        kvGet('offline.cachingEnabled'),
        kvGet('offline.lastFullSyncAt'),
      ]);
      if (cancelled) return;
      setEnabledState(stored ?? false);
      setPersistedSyncAt(lastSync);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // The engine only runs once the persisted setting is known, so a user who
  // disabled caching never sees a spurious sync on boot.
  const { status: syncStatus, lastSyncAt, syncNow } = useBackgroundSync(ready && enabled);

  const setEnabled = useCallback(async (next: boolean) => {
    setEnabledState(next);
    await kvSet('offline.cachingEnabled', next);
    if (!next) {
      // Turning the feature off is also a privacy action: drop everything
      // we've mirrored onto the device.
      await cacheClear();
      await kvRemove('offline.lastFullSyncAt');
      setPersistedSyncAt(null);
    }
  }, []);

  const clearCache = useCallback(async () => {
    await cacheClear();
    await kvRemove('offline.lastFullSyncAt');
    setPersistedSyncAt(null);
  }, []);

  const value = useMemo<OfflineCacheContextValue>(() => ({
    enabled,
    ready,
    syncStatus,
    lastSyncAt: lastSyncAt ?? persistedSyncAt,
    setEnabled,
    syncNow,
    clearCache,
  }), [enabled, ready, syncStatus, lastSyncAt, persistedSyncAt, setEnabled, syncNow, clearCache]);

  return <OfflineCacheContext.Provider value={value}>{children}</OfflineCacheContext.Provider>;
}

export function useOfflineCache(): OfflineCacheContextValue {
  const ctx = useContext(OfflineCacheContext);
  if (!ctx) throw new Error('useOfflineCache must be used within an OfflineCacheProvider');
  return ctx;
}
