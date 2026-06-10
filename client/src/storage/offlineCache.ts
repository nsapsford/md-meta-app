// IndexedDB-backed cache for bulk server data (card archetypes, tier list,
// deck lists). IndexedDB reads/writes are async and run off the main thread,
// so hydrating from here on boot never blocks first paint.

const DB_NAME = 'md-meta-offline';
const DB_VERSION = 1;
const STORE = 'resources';

export interface CacheEntry<T> {
  key: string;
  data: T;
  updatedAt: number; // unix ms when this entry was written
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      // If the connection is severed (e.g. version bump in another tab),
      // drop the memoized promise so the next call reopens.
      req.result.onclose = () => { dbPromise = null; };
      resolve(req.result);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Failed to open IndexedDB'));
    };
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function cacheRead<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const entry = await requestToPromise<CacheEntry<T> | undefined>(tx.objectStore(STORE).get(key));
    return entry ?? null;
  } catch {
    // Private browsing / quota / unsupported — degrade to network-only.
    return null;
  }
}

export async function cacheWrite<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { key, data, updatedAt: Date.now() };
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}

export async function cacheClear(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'));
    });
  } catch {
    // Nothing to clear if the DB never opened.
  }
}
