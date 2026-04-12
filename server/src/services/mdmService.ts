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
  const cached = await getCached<T>(key);
  if (cached) return cached;
  await throttle();
  const data = await fetcher();
  await setCache(key, data, ttl);
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

export async function scrapeTierList(): Promise<Array<{ name: string; tier: number; power: number }>> {
  return fetchWithCache('mdm:tier-list-scraped', config.cache.tierListTtl, async () => {
    const res = await siteApi.get('/tier-list');
    const html = res.data as string;
    const entries: Array<{ name: string; tier: number; power: number }> = [];

    // Find tier section boundaries via alt="Tier N" images
    const tierBounds: Array<{ tier: number; index: number }> = [];
    const tierImgRe = /alt="Tier\s*(\d)"/g;
    let m: RegExpExecArray | null;
    while ((m = tierImgRe.exec(html)) !== null) {
      tierBounds.push({ tier: parseInt(m[1]), index: m.index });
    }
    // Add sentinel for content after last tier
    tierBounds.push({ tier: tierBounds.length > 0 ? tierBounds[tierBounds.length - 1].tier : 3, index: html.length });

    // Extract deck entries: label div followed by power-label div
    const entryRe = /<div class="label[^"]*">([^<]+)<\/div>\s*<\/a>\s*\n*\s*<\/div>\s*\n*\s*<div class="power-label[^"]*">Power:\s*<b>(\d+\.?\d*)<\/b>/g;
    while ((m = entryRe.exec(html)) !== null) {
      const name = m[1].trim();
      const power = parseFloat(m[2]);
      const pos = m.index;

      // Determine tier from position between tier boundaries
      let tier = 3;
      for (let i = 0; i < tierBounds.length - 1; i++) {
        if (pos >= tierBounds[i].index && pos < tierBounds[i + 1].index) {
          tier = tierBounds[i].tier;
          break;
        }
      }

      if (name && !isNaN(power)) {
        entries.push({ name, tier, power });
      }
    }

    console.log(`[MDM Scraper] Extracted ${entries.length} decks from tier list page`);
    return entries;
  });
}

export interface MDMBanCard {
  name: string;
  banStatus: 'Forbidden' | 'Limited 1' | 'Limited 2';
  rarity: string | null;
  konamiID: string | null;
  banListDate: string | null;
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
      if (data.length > 0) console.log('[MDM ban-list fields]', Object.keys(data[0]));
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
        banListDate: c.banListDate ?? c.startDate ?? c.date ?? null,
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
