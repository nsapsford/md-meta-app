import axios from 'axios';
import { config } from '../config.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { getCached, setCache } from './cacheService.js';

const limiter = new RateLimiter(config.rateLimit.ygoprodeckRps);
const api = axios.create({ baseURL: config.ygoprodeckBaseUrl });

async function fetchWithCache<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;
  const data = await limiter.wrap(fetcher);
  setCache(cacheKey, data, ttl);
  return data;
}

export interface YGOCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  archetype?: string;
  linkval?: number;
  linkmarkers?: string[];
  scale?: number;
  card_images: Array<{ id: number; image_url: string; image_url_small: string; image_url_cropped: string }>;
  banlist_info?: { ban_tcg?: string; ban_ocg?: string; ban_goat?: string; ban_masterduel?: string };
  misc_info?: Array<{ md_rarity?: string }>;
}

export async function searchCards(params: Record<string, string>): Promise<YGOCard[]> {
  const queryStr = new URLSearchParams(params).toString();
  const cacheKey = `ygopd:cards:${queryStr}`;
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/cardinfo.php', {
      params: { ...params, misc: 'yes' },
    });
    return res.data.data || [];
  });
}

export async function getCardById(id: number): Promise<YGOCard | null> {
  const cacheKey = `ygopd:card:${id}`;
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/cardinfo.php', { params: { id, misc: 'yes' } });
    return res.data.data?.[0] || null;
  });
}

export async function getAllCards(): Promise<YGOCard[]> {
  const cacheKey = 'ygopd:allcards';
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/cardinfo.php', { params: { misc: 'yes' } });
    return res.data.data || [];
  });
}

export async function getArchetypes(): Promise<string[]> {
  const cacheKey = 'ygopd:archetypes';
  return fetchWithCache(cacheKey, config.cache.cardsTtl, async () => {
    const res = await api.get('/archetypes.php');
    return (res.data as Array<{ archetype_name: string }>).map(a => a.archetype_name);
  });
}

export async function getBanList(): Promise<YGOCard[]> {
  const cacheKey = 'ygopd:banlist:md';
  return fetchWithCache(cacheKey, config.cache.banListTtl, async () => {
    const res = await api.get('/cardinfo.php', {
      params: { banlist: 'masterduel', misc: 'yes' },
    });
    return res.data.data || [];
  });
}
