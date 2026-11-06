import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyncRecord } from '../api/sync';
import { syncStatusQuery } from '../queries/options';
import { isUpdateAvailable } from '../utils/syncFreshness';
import { computeServerVersion, getStoredVersion, setStoredVersion } from './syncVersion';

export interface SyncUpdateContextValue {
  /** True when the server has data newer than what the client acknowledged. */
  updateAvailable: boolean;
  /** True while a pull-only refresh is in flight (for badge feedback). */
  applying: boolean;
  /** Latest sync status records, shared so pages don't each re-poll. */
  syncRecords: SyncRecord[];
  /** Refetch every query on screen (and mark the rest stale), then clear the prompt. */
  applyUpdate: () => Promise<void>;
}

const SyncUpdateContext = createContext<SyncUpdateContextValue | null>(null);

const EMPTY: SyncRecord[] = [];

export function SyncUpdateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // The single sync-status poll for the whole app (5 min interval + on focus).
  // Pages read syncRecords from here instead of requesting it themselves.
  const { data: syncRecords = EMPTY } = useQuery(syncStatusQuery());
  const [storedVersion, setStoredVersionState] = useState<number | null | undefined>(undefined);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStoredVersion().then((v) => { if (!cancelled) setStoredVersionState(v); });
    return () => { cancelled = true; };
  }, []);

  const serverVersion = syncRecords.length > 0 ? computeServerVersion(syncRecords) : null;

  // First run: establish a silent baseline so we only flag genuine changes.
  useEffect(() => {
    if (storedVersion === null && serverVersion != null) {
      setStoredVersionState(serverVersion);
      void setStoredVersion(serverVersion);
    }
  }, [storedVersion, serverVersion]);

  const updateAvailable =
    storedVersion != null && serverVersion != null && isUpdateAvailable(serverVersion, storedVersion);

  const applyUpdate = useCallback(async () => {
    setApplying(true);
    try {
      // Active queries refetch now (and the persister rewrites them); inactive
      // ones are marked stale and refetch when their page next mounts.
      await queryClient.invalidateQueries();
      const latest = queryClient.getQueryData<SyncRecord[]>(syncStatusQuery().queryKey);
      if (latest && latest.length > 0) {
        const v = computeServerVersion(latest);
        setStoredVersionState(v);
        await setStoredVersion(v);
      }
    } finally {
      setApplying(false);
    }
  }, [queryClient]);

  const value = useMemo<SyncUpdateContextValue>(
    () => ({ updateAvailable, applying, syncRecords, applyUpdate }),
    [updateAvailable, applying, syncRecords, applyUpdate]
  );

  return <SyncUpdateContext.Provider value={value}>{children}</SyncUpdateContext.Provider>;
}

export function useSyncUpdate(): SyncUpdateContextValue {
  const ctx = useContext(SyncUpdateContext);
  if (!ctx) throw new Error('useSyncUpdate must be used within a SyncUpdateProvider');
  return ctx;
}
