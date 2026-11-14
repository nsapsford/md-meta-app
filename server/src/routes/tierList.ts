import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll } from '../utils/dbHelpers.js';
import { syncDeckTypes, computeDeckTypeCards } from '../services/syncService.js';
import { config } from '../config.js';
import { UNTAPPED_RANKS } from '../services/untappedService.js';

// In-memory process cache — instant lookup, no DB round-trip
let memCache: Record<string, any[]> | null = null;
let memCacheAt = 0;
// Rank-filtered variants (rank bucket -> grouped tier list), same TTL
const rankCache = new Map<number, { at: number; data: Record<string, any[]> }>();
const MEM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateTierListCache() {
  memCache = null;
  rankCache.clear();
}

export async function warmTierListCache(): Promise<void> {
  if (memCache && (Date.now() - memCacheAt) < MEM_CACHE_TTL_MS) return;
  const { default: axios } = await import('axios');
  await axios.get(`http://localhost:${config.port}/api/tier-list`, { timeout: 30000 });
  console.log('[Warmup] tier-list cache built');
}

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    // Optional ?rank=2..7 (Bronze..Master): win/play rates come from that rank's Untapped data
    const rank = req.query.rank != null ? Number(req.query.rank) : null;
    if (rank != null && !UNTAPPED_RANKS[rank]) {
      return res.status(400).json({ error: 'rank must be 2 (Bronze) to 7 (Master)' });
    }
    if (rank != null) {
      const hit = rankCache.get(rank);
      if (hit && (Date.now() - hit.at) < MEM_CACHE_TTL_MS) return res.json(hit.data);
    } else if (memCache && (Date.now() - memCacheAt) < MEM_CACHE_TTL_MS) {
      // Serve from in-memory cache — zero DB round-trips
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

    if (rank != null) {
      const rows = await queryAll<{ deck_name: string; games: number; wins: number }>(pool,
        `SELECT archetype AS deck_name, games_first + games_second AS games, wins_first + wins_second AS wins
           FROM archetype_rank_stats WHERE rank_id = $1`, [rank]);
      const total = rows.reduce((n, r) => n + r.games, 0);
      const byName = new Map(rows.map((r) => [r.deck_name.toLowerCase(), r]));
      for (const list of Object.values(grouped)) {
        for (const d of list) {
          const r = byName.get(String(d.name).toLowerCase());
          d.win_rate = r ? Math.round((r.wins / r.games) * 1000) / 10 : null;
          d.play_rate = r && total ? Math.round((r.games / total) * 1000) / 10 : null;
          d.sample_size = r ? r.games : null;
        }
      }
      rankCache.set(rank, { at: Date.now(), data: grouped });
      return res.json(grouped);
    }

    memCache = grouped;
    memCacheAt = Date.now();
    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
