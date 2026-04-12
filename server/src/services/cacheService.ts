import { getPool } from '../db/connection.js';
import { queryOne, run } from '../utils/dbHelpers.js';

export async function getCached<T>(key: string): Promise<T | null> {
  const pool = getPool();
  const row = await queryOne(pool, 'SELECT data, expires_at FROM api_cache WHERE cache_key = $1', [key]);
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) {
    await run(pool, 'DELETE FROM api_cache WHERE cache_key = $1', [key]);
    return null;
  }
  return JSON.parse(row.data) as T;
}

export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  const pool = getPool();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  await run(pool, 'INSERT INTO api_cache (cache_key, data, expires_at) VALUES ($1, $2, $3) ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at', [key, JSON.stringify(data), expiresAt]);
}

export async function clearCache(pattern?: string): Promise<void> {
  const pool = getPool();
  if (pattern) {
    await run(pool, 'DELETE FROM api_cache WHERE cache_key LIKE $1', [`%${pattern}%`]);
  } else {
    await run(pool, 'DELETE FROM api_cache');
  }
}
