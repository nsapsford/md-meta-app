import type { Pool } from '@neondatabase/serverless';
import { queryOne, run } from '../utils/dbHelpers.js';

// One-shot data migrations, run after the (idempotent) schema on every boot.
// Completion is recorded in api_cache under a far-future expiry so the marker
// is not swept up by clearCache('untapped' | 'mdm' | 'interaction:').

const FAR_FUTURE = 2147483647;

async function once(pool: Pool, name: string, fn: () => Promise<void>): Promise<boolean> {
  const key = `migration:${name}`;
  if (await queryOne(pool, 'SELECT 1 FROM api_cache WHERE cache_key = $1', [key])) return false;
  await fn();
  await run(pool,
    'INSERT INTO api_cache (cache_key, data, expires_at) VALUES ($1, $2, $3) ON CONFLICT (cache_key) DO NOTHING',
    [key, JSON.stringify({ ranAt: Date.now() }), FAR_FUTURE]);
  return true;
}

/**
 * Earlier versions treated the rank-bucket keys of untapped's
 * `archetypes_by_rank_v3` response as opponent archetypes and stored them as
 * matchup pairings (4 fake opponents per deck). Remove everything that path
 * could have written. The legacy `matchups` table has no source column, so it
 * is cleared wholesale; the only other writer is the on-demand MDM scrape in
 * GET /api/matchups?deck=, which repopulates it when asked.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const purged = await once(pool, 'purge-rank-bucket-matchups-v1', async () => {
    await run(pool, "DELETE FROM matchup_sources WHERE source = 'untapped'");
    await run(pool, 'DELETE FROM matchups');
    await run(pool, "DELETE FROM api_cache WHERE cache_key = 'untapped:matchup-pairings'");
  });
  if (purged) console.log('[DB] Purged matchup rows derived from untapped rank buckets');
}
