import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { getCached, setCache } from './cacheService.js';

const api = axios.create({
  baseURL: config.mdmBaseUrl,
  headers: { 'User-Agent': 'MDMetaApp/1.0' },
});

const siteApi = axios.create({
  baseURL: config.mdmSiteUrl,
  headers: { 'User-Agent': 'MDMetaApp/1.0' },
});

let lastRequestTime = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < config.rateLimit.mdmDelayMs) {
    await new Promise(r => setTimeout(r, config.rateLimit.mdmDelayMs - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithCache<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(key);
  if (cached) return cached;
  await throttle();
  const data = await fetcher();
  setCache(key, data, ttl);
  return data;
}

export interface MDMDeckType {
  _id: string;
  name: string;
  tier?: number | null;
  // API now uses tournamentPower instead of power
  power?: number;
  tournamentPower?: number;
  powerTrend?: number;
  tournamentPowerTrend?: number;
  popRank?: number;
  masterPopRank?: number;
  overview?: string;
  parsedOverview?: string;
  // API uses thumbnailImage instead of image
  image?: string;
  thumbnailImage?: string;
  deckBreakdown?: any;
  tournamentStats?: any;
  avgURPrice?: number;
  avgSRPrice?: number;
  // API uses lowercase 'r' in Ur/Sr
  avgUrPrice?: number;
  avgSrPrice?: number;
}

export interface MDMTopDeck {
  _id: string;
  deckType?: { name: string };
  author?: string;
  mainDeck?: Array<{ cardName: string; amount: number; rarity?: string }>;
  extraDeck?: Array<{ cardName: string; amount: number; rarity?: string }>;
  sideDeck?: Array<{ cardName: string; amount: number; rarity?: string }>;
  tournamentName?: string;
  tournamentPlacement?: string;
  rankedType?: string;
  createdAt?: string;
  gemsPrice?: number;
  urPrice?: number;
  srPrice?: number;
  url?: string;
}

export interface MDMTournament {
  _id: string;
  name: string;
  shortName?: string;
  bannerImage?: string;
  nextDate?: string;
  placements?: any[];
}

export async function getDeckTypes(): Promise<MDMDeckType[]> {
  return fetchWithCache('mdm:deck-types', config.cache.tierListTtl, async () => {
    const res = await api.get('/deck-types', {
      params: { 'game-format': 'master-duel', sort: '-tournamentPower' },
    });
    return Array.isArray(res.data) ? res.data : [];
  });
}

export async function getTopDecks(params?: Record<string, string>): Promise<MDMTopDeck[]> {
  const queryStr = new URLSearchParams(params || {}).toString();
  return fetchWithCache(`mdm:top-decks:${queryStr}`, config.cache.topDecksTtl, async () => {
    const res = await api.get('/top-decks', {
      params: { 'game-format': 'master-duel', sort: '-created', ...params },
    });
    return Array.isArray(res.data) ? res.data : [];
  });
}

export async function getTournaments(): Promise<MDMTournament[]> {
  return fetchWithCache('mdm:tournaments', config.cache.tournamentsTtl, async () => {
    const res = await api.get('/tournaments', {
      params: { 'game-format': 'master-duel' },
    });
    return Array.isArray(res.data) ? res.data : [];
  });
}

export async function scrapeTierList(): Promise<Array<{ name: string; tier: number }>> {
  return fetchWithCache('mdm:tier-list-scraped', config.cache.tierListTtl, async () => {
    const res = await siteApi.get('/tier-list');
    const $ = cheerio.load(res.data);
    const tiers: Array<{ name: string; tier: number }> = [];

    $('[class*="tier-list"]').find('[class*="tier-section"], [class*="tier-row"]').each((_i, el) => {
      const tierText = $(el).find('[class*="tier-label"]').text();
      const tierNum = parseInt(tierText.replace(/\D/g, '')) || 3;
      $(el).find('[class*="deck-name"], a').each((_j, deck) => {
        const name = $(deck).text().trim();
        if (name && name.length > 1) {
          tiers.push({ name, tier: tierNum });
        }
      });
    });

    return tiers;
  });
}

export interface MDMBanCard {
  name: string;
  banStatus: 'Forbidden' | 'Limited 1' | 'Limited 2';
  rarity: string | null;
  konamiID: string | null;
}

export interface MDMBanList {
  forbidden: MDMBanCard[];
  limited: MDMBanCard[];
  semiLimited: MDMBanCard[];
}

export async function getBanList(): Promise<MDMBanList> {
  return fetchWithCache('mdm:ban-list', 3600, async () => {
    const fetchStatus = async (status: string): Promise<MDMBanCard[]> => {
      const res = await api.get('/cards', {
        params: { banStatus: status, limit: 500 },
      });
      const data = Array.isArray(res.data) ? res.data : [];
      // Deduplicate by name
      const seen = new Set<string>();
      return data.filter((c: any) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      }).map((c: any) => ({
        name: c.name,
        banStatus: status as MDMBanCard['banStatus'],
        rarity: c.rarity ?? null,
        konamiID: c.konamiID ?? null,
      }));
    };

    const [forbidden, limited, semiLimited] = await Promise.all([
      fetchStatus('Forbidden'),
      fetchStatus('Limited 1'),
      fetchStatus('Limited 2'),
    ]);

    return { forbidden, limited, semiLimited };
  });
}

export async function scrapeMatchups(deckName: string): Promise<Array<{ opponent: string; winRate: number; sampleSize: number }>> {
  const slug = deckName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const cacheKey = `mdm:matchup:${slug}`;
  return fetchWithCache(cacheKey, config.cache.matchupsTtl, async () => {
    try {
      const res = await siteApi.get(`/tier-list/deck-types/${slug}`);
      const $ = cheerio.load(res.data);
      const matchups: Array<{ opponent: string; winRate: number; sampleSize: number }> = [];

      $('table').each((_i, table) => {
        $(table).find('tr').each((_j, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 2) {
            const opponent = $(cells[0]).text().trim();
            const winText = $(cells[1]).text().trim();
            const winRate = parseFloat(winText);
            const sizeText = cells.length >= 3 ? $(cells[2]).text().trim() : '0';
            const sampleSize = parseInt(sizeText.replace(/\D/g, '')) || 0;
            if (opponent && !isNaN(winRate)) {
              matchups.push({ opponent, winRate, sampleSize });
            }
          }
        });
      });

      return matchups;
    } catch {
      return [];
    }
  });
}
