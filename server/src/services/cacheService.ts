import { getDb } from '../db/connection.js';
import { queryOne, run } from '../utils/dbHelpers.js';

export function getCached<T>(key: string): T | null {
  const db = getDb();
  const row = queryOne(db, 'SELECT data, expires_at FROM api_cache WHERE cache_key = ?', [key]);
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) {
    run(db, 'DELETE FROM api_cache WHERE cache_key = ?', [key]);
    return null;
  }
  return JSON.parse(row.data) as T;
}

export function setCache(key: string, data: unknown, ttlSeconds: number): void {
  const db = getDb();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  run(db, 'INSERT OR REPLACE INTO api_cache (cache_key, data, expires_at) VALUES (?, ?, ?)', [key, JSON.stringify(data), expiresAt]);
}

export function clearCache(pattern?: string): void {
  const db = getDb();
  if (pattern) {
    run(db, 'DELETE FROM api_cache WHERE cache_key LIKE ?', [`%${pattern}%`]);
  } else {
    run(db, 'DELETE FROM api_cache');
  }
}
