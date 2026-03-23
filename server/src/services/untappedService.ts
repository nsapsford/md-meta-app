import axios from 'axios';
import { config } from '../config.js';
import { getCached, setCache } from './cacheService.js';

export interface UntappedArchetype {
  name: string;
  tier: number | null;
  winRate: number | null;
  playRate: number | null;
  sampleSize: number | null;
}

const api = axios.create({
  baseURL: 'https://api.ygom.untapped.gg/api/v1',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Origin': 'https://ygom.untapped.gg',
    'Referer': 'https://ygom.untapped.gg/',
    'Accept': '*/*',
  },
});

interface ArchetypeStats {
  ALL: [number, number, number, number]; // [games_first, games_second, wins_first, wins_second]
  tier: number | null;
  [rank: string]: any;
}

interface ManifestEntry {
  arch_name: string;
  type: number;
  type_name: string;
}

/**
 * Fetches archetype stats from untapped.gg's public API.
 * Returns win rate, play rate, and sample size for each archetype.
 */
export async function scrapeTierList(): Promise<UntappedArchetype[]> {
  const cacheKey = 'untapped:tier-list';
  const cached = getCached<UntappedArchetype[]>(cacheKey);
  if (cached) return cached;

  console.log('[Untapped] Fetching archetype stats from API...');

  try {
    const [statsRes, manifestRes] = await Promise.all([
      api.get('/analytics/query/archetypes_by_rank_v3/free', {
        params: { TimeRangeFilter: 'CURRENT_META_PERIOD' },
      }),
      api.get('/analytics/query/archetypes_manifest'),
    ]);

    const statsData: Record<string, ArchetypeStats> = statsRes.data?.data || {};
    const manifestData: Record<string, ManifestEntry> = manifestRes.data?.data || {};

    // Compute total games across all archetypes (each game counted for both players)
    let totalPlayerGames = 0;
    for (const arch of Object.values(statsData)) {
      totalPlayerGames += arch.ALL[0] + arch.ALL[1];
    }
    const totalGames = totalPlayerGames / 2;

    const results: UntappedArchetype[] = [];

    for (const [id, arch] of Object.entries(statsData)) {
      const manifest = manifestData[id];
      if (!manifest) continue;

      const [gamesFirst, gamesSecond, winsFirst, winsSecond] = arch.ALL;
      const totalArchGames = gamesFirst + gamesSecond;
      const totalWins = winsFirst + winsSecond;

      if (totalArchGames < 20) continue; // skip very low sample sizes

      // Win rate: total wins / total games
      // Note: this is ~3-5% higher than untapped.gg displays because they
      // apply a mirror match correction client-side. The raw rate is still
      // useful for relative comparisons.
      const winRate = Math.round((totalWins / totalArchGames) * 1000) / 10;

      // Play rate: archetype's games / total games (each game counted once per player)
      const playRate = Math.round((totalArchGames / 2 / totalGames) * 1000) / 10;

      // Sample size: number of games this archetype appeared in
      const sampleSize = Math.round(totalArchGames / 2);

      results.push({
        name: manifest.arch_name,
        tier: arch.tier,
        winRate,
        playRate,
        sampleSize,
      });
    }

    // Sort by play rate descending
    results.sort((a, b) => (b.playRate ?? 0) - (a.playRate ?? 0));

    setCache(cacheKey, results, config.cache.untappedTtl);
    console.log(`[Untapped] Got ${results.length} archetypes from API`);

    const sample = results.slice(0, 5).map(r =>
      `${r.name} wr=${r.winRate}% pr=${r.playRate}%`
    ).join(', ');
    console.log(`[Untapped] Top 5: ${sample}`);

    return results;
  } catch (err) {
    console.error('[Untapped] API fetch failed:', (err as Error).message);
    return [];
  }
}

/**
 * No longer needed — kept as a no-op for backwards compatibility.
 */
export async function closeBrowser(): Promise<void> {}

/**
 * Fetches stats for a specific archetype by name.
 * Returns data from the cached tier list.
 */
export async function scrapeArchetypeStats(
  _archetypeId: number,
  slug: string
): Promise<Omit<UntappedArchetype, 'name' | 'tier'> | null> {
  const cacheKey = `untapped:archetype:${slug}`;
  const cached = getCached<Omit<UntappedArchetype, 'name' | 'tier'>>(cacheKey);
  if (cached) return cached;

  // Get from the main tier list data
  const tierList = await scrapeTierList();
  const name = slug.replace(/-/g, ' ');
  const match = tierList.find(a =>
    a.name.toLowerCase() === name.toLowerCase()
  );

  if (!match) return null;

  const result = {
    winRate: match.winRate,
    playRate: match.playRate,
    sampleSize: match.sampleSize,
  };

  setCache(cacheKey, result, config.cache.untappedTtl);
  return result;
}
