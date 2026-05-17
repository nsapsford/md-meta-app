import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll } from '../utils/dbHelpers.js';
import { syncDeckTypes, computeDeckTypeCards } from '../services/syncService.js';

// In-memory process cache — instant lookup, no DB round-trip
let memCache: Record<string, any[]> | null = null;
let memCacheAt = 0;
const MEM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateTierListCache() {
  memCache = null;
}

export async function warmTierListCache(): Promise<void> {
  if (memCache && (Date.now() - memCacheAt) < MEM_CACHE_TTL_MS) return;
  const { default: axios } = await import('axios');
  const port = process.env.PORT || 3000;
  await axios.get(`http://localhost:${port}/api/tier-list`, { timeout: 30000 });
  console.log('[Warmup] tier-list cache built');
}

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Serve from in-memory cache — zero DB round-trips
    if (memCache && (Date.now() - memCacheAt) < MEM_CACHE_TTL_MS) {
      return res.json(memCache);
    }

    const pool = getPool();

    // Single query — computed_cards_json pre-populated by computeDeckTypeCards() during sync
    let deckTypes = await queryAll(pool,
      `SELECT id, name, tier, power, power_trend, pop_rank, win_rate, play_rate,
              thumbnail_image, computed_cards_json
       FROM deck_types
       ORDER BY tier ASC NULLS LAST, power DESC NULLS LAST`
    );

    if (deckTypes.length === 0) {
      await syncDeckTypes();
      await computeDeckTypeCards();
      deckTypes = await queryAll(pool,
        `SELECT id, name, tier, power, power_trend, pop_rank, win_rate, play_rate,
                thumbnail_image, computed_cards_json
         FROM deck_types
         ORDER BY tier ASC NULLS LAST, power DESC NULLS LAST`
      );
    }

    const grouped: Record<string, any[]> = { '0': [], '1': [], '2': [], '3': [], rogue: [] };
    for (const d of deckTypes) {
      const key = d.tier != null ? String(d.tier) : 'rogue';
      if (!grouped[key]) grouped[key] = [];

      const cards: Array<{ name: string; image: string | null }> = d.computed_cards_json
        ? (JSON.parse(d.computed_cards_json) as Array<{ name: string; image: string | null }>).slice(0, 3)
        : [];

      grouped[key].push({
        id: d.id,
        name: d.name,
        tier: d.tier,
        power: d.power,
        power_trend: d.power_trend,
        pop_rank: d.pop_rank,
        win_rate: d.win_rate,
        play_rate: d.play_rate,
        thumbnail_image: d.thumbnail_image || (cards.length > 0 ? cards[0].image : null),
        cards,
        // breakdown_json intentionally omitted — only needed in /decks/:name
      });
    }

    memCache = grouped;
    memCacheAt = Date.now();
    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
