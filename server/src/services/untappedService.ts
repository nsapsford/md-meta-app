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

interface RawUntappedData {
  statsData: Record<string, ArchetypeStats>;
  manifestData: Record<string, ManifestEntry>;
}

export interface UntappedMatchupPairing {
  deckA: string;
  deckB: string;
  winRate: number;   // 0-1 decimal
  sampleSize: number;
}

async function fetchRawStats(): Promise<RawUntappedData> {
  const cacheKey = 'untapped:raw-stats';
  const cached = getCached<RawUntappedData>(cacheKey);
  if (cached) return cached;

  const [statsRes, manifestRes] = await Promise.all([
    api.get('/analytics/query/archetypes_by_rank_v3/free', {
      params: { TimeRangeFilter: 'CURRENT_META_PERIOD' },
    }),
    api.get('/analytics/query/archetypes_manifest'),
  ]);

  const result: RawUntappedData = {
    statsData: statsRes.data?.data || {},
    manifestData: manifestRes.data?.data || {},
  };

  setCache(cacheKey, result, config.cache.untappedTtl);
  return result;
}

/**
 * Returns per-opponent matchup win rates from untapped.gg's public API.
 * Each entry is win rate of deckA against deckB (0–1 decimal).
 */
export async function getMatchupPairings(): Promise<UntappedMatchupPairing[]> {
  const cacheKey = 'untapped:matchup-pairings';
  const cached = getCached<UntappedMatchupPairing[]>(cacheKey);
  if (cached) return cached;

  try {
    const { statsData, manifestData } = await fetchRawStats();
    const pairings: UntappedMatchupPairing[] = [];

    for (const [idA, archA] of Object.entries(statsData)) {
      const manifestA = manifestData[idA];
      if (!manifestA) continue;

      for (const [key, stats] of Object.entries(archA)) {
        if (key === 'ALL' || key === 'tier') continue;
        const manifestB = manifestData[key];
        if (!manifestB) continue;

        const [gFirst, gSecond, wFirst, wSecond] = stats as [number, number, number, number];
        const totalGames = gFirst + gSecond;
        if (totalGames < 20) continue;

        pairings.push({
          deckA: manifestA.arch_name,
          deckB: manifestB.arch_name,
          winRate: (wFirst + wSecond) / totalGames,
          sampleSize: Math.round(totalGames / 2),
        });
      }
    }

    setCache(cacheKey, pairings, config.cache.untappedTtl);
    console.log(`[Untapped] Got ${pairings.length} matchup pairings`);
    return pairings;
  } catch (err) {
    console.error('[Untapped] Matchup pairing fetch failed:', (err as Error).message);
    return [];
  }
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
    const { statsData, manifestData } = await fetchRawStats();
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

export interface CardNegateData {
  cardName: string;
  negateEffectiveness: number; // win rate delta % when this card is negated
}

/**
 * Scrapes card negate effectiveness from untapped.gg.
 *
 * Strategy A: Try known /free API query names directly.
 * Strategy B: Use Puppeteer to navigate the site and intercept XHR requests
 *             to discover the actual endpoint, then parse the response.
 * Strategy C: DOM scraping fallback — render a deck page and extract card
 *             impact stats from the HTML.
 */
export async function scrapeCardNegateEffectiveness(): Promise<CardNegateData[]> {
  const cacheKey = 'untapped:card-negate';
  const cached = getCached<CardNegateData[]>(cacheKey);
  if (cached) return cached;

  console.log('[Untapped] Fetching card negate effectiveness...');

  // Strategy A: Try likely public API query names
  const candidateQueries = [
    'cards_negate_impact_v3',
    'card_negate_stats_v3',
    'card_impact_stats_v3',
    'cards_impact_v3',
    'card_stats_v3',
    'negate_cards_v3',
  ];

  for (const queryName of candidateQueries) {
    try {
      const res = await api.get(`/analytics/query/${queryName}/free`, {
        params: { TimeRangeFilter: 'CURRENT_META_PERIOD' },
      });
      const data = res.data?.data;
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        console.log(`[Untapped] Found card negate data at query: ${queryName}`);
        const results = parseCardNegateResponse(data);
        if (results.length > 0) {
          setCache(cacheKey, results, config.cache.untappedTtl);
          return results;
        }
      }
    } catch {
      // "No registered query" — try next
    }
  }

  // Strategy B: Puppeteer network interception
  console.log('[Untapped] Strategy A failed — trying Puppeteer network interception...');
  try {
    const puppeteerResults = await scrapeViaPuppeteer();
    if (puppeteerResults.length > 0) {
      setCache(cacheKey, puppeteerResults, config.cache.untappedTtl);
      return puppeteerResults;
    }
  } catch (err) {
    console.error('[Untapped] Puppeteer scrape failed:', (err as Error).message);
  }

  console.warn('[Untapped] No card negate data found from any strategy.');
  return [];
}

/**
 * Attempts to parse various API response shapes into CardNegateData[].
 * Handles both {cardName, winDelta} and raw stat arrays.
 */
function parseCardNegateResponse(data: Record<string, any>): CardNegateData[] {
  const results: CardNegateData[] = [];
  for (const [key, value] of Object.entries(data)) {
    // Shape: { name: string, win_delta: number } or { name: string, negate_win_rate: number }
    const cardName: string = value?.name || value?.card_name || value?.cardName || key;
    const winDelta: number | undefined =
      value?.win_delta ?? value?.negate_win_delta ?? value?.negate_impact ??
      value?.winDelta ?? value?.impact;

    if (typeof cardName === 'string' && cardName && typeof winDelta === 'number') {
      results.push({ cardName, negateEffectiveness: Math.round(winDelta * 10) / 10 });
    }
  }
  return results;
}

/**
 * Uses Puppeteer to navigate untapped.gg, intercept XHR calls to the analytics
 * API, and extract card negate effectiveness data.
 */
async function scrapeViaPuppeteer(): Promise<CardNegateData[]> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const capturedData: CardNegateData[] = [];
    let discoveredEndpoint: string | null = null;

    // Intercept responses from the untapped analytics API
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('api.ygom.untapped.gg')) return;
      try {
        const json = await response.json();
        const data = json?.data;
        if (data && typeof data === 'object') {
          const parsed = parseCardNegateResponse(data);
          if (parsed.length > 0) {
            discoveredEndpoint = url;
            console.log(`[Untapped] Discovered card negate endpoint: ${url}`);
            capturedData.push(...parsed);
          }
        }
      } catch { /* non-JSON response */ }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    );

    // Navigate to decks page and wait for content to load
    await page.goto('https://ygom.untapped.gg/en/decks', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Try to click the first deck link to trigger card-level API calls
    try {
      await page.waitForSelector('a[href*="/en/decks/"]', { timeout: 10000 });
      const deckLinks = await page.$$('a[href*="/en/decks/"]');
      if (deckLinks.length > 0) {
        await deckLinks[0].click();
        await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
      }
    } catch { /* no deck links found */ }

    if (capturedData.length === 0) {
      // Strategy C: scrape rendered DOM for card impact stats
      const domResults = await scrapeCardImpactFromDom(page);
      capturedData.push(...domResults);
    }

    if (discoveredEndpoint) {
      console.log(`[Untapped] Discovered endpoint for future use: ${discoveredEndpoint}`);
    }

    return capturedData;
  } finally {
    await browser.close();
  }
}

/**
 * Scrapes card impact stats from the rendered DOM of the current Puppeteer page.
 * Looks for elements containing card names paired with win delta percentages.
 */
async function scrapeCardImpactFromDom(page: any): Promise<CardNegateData[]> {
  return page.evaluate(() => {
    const results: Array<{ cardName: string; negateEffectiveness: number }> = [];
    // Look for any section labelled "negate", "impact", "card impact" etc.
    const allText = document.querySelectorAll('[class*="negate"], [class*="impact"], [class*="card-stat"]');
    allText.forEach((el) => {
      const nameEl = el.querySelector('[class*="name"], [class*="card"]');
      const valueEl = el.querySelector('[class*="delta"], [class*="value"], [class*="rate"]');
      if (nameEl && valueEl) {
        const cardName = nameEl.textContent?.trim();
        const rawValue = valueEl.textContent?.replace('%', '').trim();
        const value = parseFloat(rawValue || '');
        if (cardName && !isNaN(value)) {
          results.push({ cardName, negateEffectiveness: value });
        }
      }
    });
    return results;
  });
}

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
