import { Preferences } from '@capacitor/preferences';

// Small key-value storage backed by Capacitor Preferences: SharedPreferences
// on Android, UserDefaults on iOS, localStorage on the web. Use this only for
// small payloads (session, settings) — bulk data belongs in offlineCache (IndexedDB).
//
// Each key declares its value type here so reads/writes are checked end to end.
export interface KvSchema {
  'auth.session': { token: string; user: import('../types/auth').AuthUser };
  'offline.cachingEnabled': boolean;
  'offline.lastFullSyncAt': number; // unix ms
  'sync.dataVersion': number; // fingerprint of last-acknowledged server data
}

export type KvKey = keyof KvSchema;

export async function kvGet<K extends KvKey>(key: K): Promise<KvSchema[K] | null> {
  try {
    const { value } = await Preferences.get({ key });
    if (value == null) return null;
    return JSON.parse(value) as KvSchema[K];
  } catch {
    // Corrupt entry or storage unavailable — treat as a cache miss.
    return null;
  }
}

export async function kvSet<K extends KvKey>(key: K, value: KvSchema[K]): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export async function kvRemove(key: KvKey): Promise<void> {
  await Preferences.remove({ key });
}
