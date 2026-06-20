import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getSyncStatus, type SyncRecord } from '../api/sync';
import { isUpdateAvailable } from '../utils/syncFreshness';
import { computeServerVersion, getStoredVersion, setStoredVersion } from './syncVersion';

export interface SyncUpdateContextValue {
  /** True when the server has data newer than what the client acknowledged. */
  updateAvailable: boolean;
  /** True while a pull-only refresh is in flight (for badge feedback). */
  applying: boolean;
  /**
   * Bumped by applyUpdate(). Data pages add this to their primary fetch
   * effect's deps so they refetch + re-render in place without a full reload.
   */
  dataGeneration: number;
  /** Latest sync status records, shared so pages don't each re-poll. */
  syncRecords: SyncRecord[];
  /** Pull the newer server data into the cache and re-render active pages. */
  applyUpdate: () => Promise<void>;
}

const SyncUpdateContext = createContext<SyncUpdateContextValue | null>(null);

// How often we quietly re-check the server's data version while the app is open.
const CHECK_INTERVAL_MS = 5 * 60_000;

export function SyncUpdateProvider({ children }: { children: ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dataGeneration, setDataGeneration] = useState(0);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  // Most recently observed server version, used by applyUpdate to set the baseline.
  const serverVersionRef = useRef<number | null>(null);

  const check = useCallback(async () => {
    let records: SyncRecord[];
    try {
      records = await getSyncStatus();
    } catch {
      // A status-check failure should never surface as a spurious update prompt.
      return;
    }
    setSyncRecords(records);
    const serverVersion = computeServerVersion(records);
    serverVersionRef.current = serverVersion;

    const stored = await getStoredVersion();
    if (stored == null) {
      // First run: establish a silent baseline so we only flag genuine changes.
      await setStoredVersion(serverVersion);
      return;
    }
    setUpdateAvailable(isUpdateAvailable(serverVersion, stored));
  }, []);

  useEffect(() => {
    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  const applyUpdate = useCallback(async () => {
    setApplying(true);
    try {
      // Re-render every mounted data page in place: they refetch on the bump,
      // which repopulates the local cache from the network as a side effect.
      setDataGeneration((g) => g + 1);
      if (serverVersionRef.current != null) {
        await setStoredVersion(serverVersionRef.current);
      }
      setUpdateAvailable(false);
      // The page refetch runs in its own effect (not awaited here), so hold the
      // "Updating…" feedback long enough to register while it lands.
      await new Promise((resolve) => setTimeout(resolve, 600));
    } finally {
      setApplying(false);
    }
  }, []);

  const value = useMemo<SyncUpdateContextValue>(
    () => ({ updateAvailable, applying, dataGeneration, syncRecords, applyUpdate }),
    [updateAvailable, applying, dataGeneration, syncRecords, applyUpdate]
  );

  return <SyncUpdateContext.Provider value={value}>{children}</SyncUpdateContext.Provider>;
}

export function useSyncUpdate(): SyncUpdateContextValue {
  const ctx = useContext(SyncUpdateContext);
  if (!ctx) throw new Error('useSyncUpdate must be used within a SyncUpdateProvider');
  return ctx;
}
