import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import { config } from '../config.js';

let featuredMemCache: any[] | null = null;
let featuredMemCacheAt = 0;
const FEATURED_MEM_TTL_MS = 5 * 60 * 1000;

export function invalidateFeaturedCache() { featuredMemCache = null; }

export async function warmFeaturedCache(): Promise<void> {
  if (featuredMemCache && (Date.now() - featuredMemCacheAt) < FEATURED_MEM_TTL_MS) return;
  const { default: axios } = await import('axios');
  await axios.get(`http://localhost:${config.port}/api/decks/featured`, { timeout: 30000 });
  console.log('[Warmup] featured cache built');
}

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { tier } = req.query;
    let decks;
    if (tier != null) {
      decks = await queryAll(pool, 'SELECT * FROM deck_types WHERE tier = $1 ORDER BY power DESC', [parseInt(tier as string)]);
    } else {
      decks = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');
    }
    res.json(decks.map((d: any) => ({
      ...d,
      breakdown_json: d.breakdown_json ? JSON.parse(d.breakdown_json) : null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/decks/featured — top 3 archetypes with most-used card images for dashboard
// Uses pre-computed computed_cards_json so this is a single SELECT — no joins, no batch queries
router.get('/featured', async (_req: Request, res: Response) => {
  try {
    if (featuredMemCache && (Date.now() - featuredMemCacheAt) < FEATURED_MEM_TTL_MS) {
      return res.json(featuredMemCache);
    }

    const pool = getPool();
    const top3 = await queryAll(pool,
      `SELECT id, name, tier, power, power_trend, thumbnail_image, win_rate, play_rate, computed_cards_json
       FROM deck_types
       WHERE power IS NOT NULL AND power > 0
       ORDER BY power DESC
       LIMIT 3`
    );

    const result = top3.map((deck: any) => {
      const cards: Array<{ name: string; image: string | null }> = deck.computed_cards_json
        ? JSON.parse(deck.computed_cards_json)
        : [];
      const { computed_cards_json: _omit, ...rest } = deck;
      return { ...rest, cards };
    });

    featuredMemCache = result;
    featuredMemCacheAt = Date.now();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const deck = await queryOne(pool, 'SELECT * FROM deck_types WHERE LOWER(name) = LOWER($1)', [req.params.name]);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    let topDecks = await queryAll(pool,
      'SELECT * FROM top_decks WHERE LOWER(deck_type_name) = LOWER($1) ORDER BY created_at DESC LIMIT 10',
      [req.params.name]);

    // Fuzzy fallback: if no exact match, try LIKE-based matching (e.g. "Snake-Eye" → "Snake-Eye Fire King")
    if (topDecks.length === 0) {
      const words = req.params.name.split(/[\s\-]+/).filter((w: string) => w.length >= 3);
      if (words.length > 0) {
        const likeClause = words.map((_: string, i: number) => `LOWER(deck_type_name) LIKE $${i + 1}`).join(' AND ');
        const likeParams = words.map((w: string) => `%${w.toLowerCase()}%`);
        topDecks = await queryAll(pool,
          `SELECT * FROM top_decks WHERE ${likeClause} ORDER BY created_at DESC LIMIT 10`,
          likeParams);
      }
    }

    // Parse breakdown and resolve card IDs to names if needed
    let breakdown = deck.breakdown_json ? JSON.parse(deck.breakdown_json) : null;
    if (breakdown?.cards) {
      // MDM breakdown cards have {card: "<id>", per: <usage%>, avgAt: <avg copies>}
      // Try to enrich with card names from top deck data
      const allCardNames = new Map<string, string>();
      for (const td of topDecks) {
        const main = td.main_deck_json ? JSON.parse(td.main_deck_json) : [];
        for (const c of main) {
          if (c.cardName) allCardNames.set(c.cardName.toLowerCase(), c.cardName);
        }
      }

      breakdown.cards = breakdown.cards.map((c: any) => ({
        ...c,
        cardName: c.cardName || c.name || null,
        percentage: c.per ?? c.percentage,
        amount: c.avgAt ?? c.at ?? c.amount,
      }));
    }

    // Collect all unique card names from top decks for batch enrichment
    const allNames = new Set<string>();
    const parsedTopDecks = topDecks.map((d: any) => {
      const main = d.main_deck_json ? JSON.parse(d.main_deck_json) : null;
      const extra = d.extra_deck_json ? JSON.parse(d.extra_deck_json) : null;
      const side = d.side_deck_json ? JSON.parse(d.side_deck_json) : null;
      for (const arr of [main, extra, side]) {
        if (arr) for (const c of arr) if (c.cardName) allNames.add(c.cardName);
      }
      return { ...d, main_deck_json: main, extra_deck_json: extra, side_deck_json: side };
    });

    // Batch lookup card info (images, type, archetype)
    const cardInfoMap = new Map<string, any>();
    if (allNames.size > 0) {
      const names = Array.from(allNames);
      const placeholders = names.map((_: string, i: number) => `$${i + 1}`).join(',');
      const cardRows = await queryAll(pool,
        `SELECT name, type, frame_type, archetype, image_small_url, negate_effectiveness, negated_win_rate, not_negated_win_rate, negate_sample_size FROM cards WHERE LOWER(name) IN (${placeholders})`,
        names.map(n => n.toLowerCase()));
      for (const row of cardRows) {
        cardInfoMap.set(row.name.toLowerCase(), row);
      }
    }

    const enrichCard = (c: any) => {
      const info = cardInfoMap.get((c.cardName || '').toLowerCase());
      return {
        ...c,
        imageUrl: info?.image_small_url || null,
        type: info?.type || null,
        frameType: info?.frame_type || null,
        archetype: info?.archetype || null,
        negate_effectiveness: info?.negate_effectiveness ?? null,
        negated_win_rate: info?.negated_win_rate ?? null,
        not_negated_win_rate: info?.not_negated_win_rate ?? null,
        negate_sample_size: info?.negate_sample_size ?? null,
      };
    };

    res.json({
      ...deck,
      breakdown_json: breakdown,
      topDecks: parsedTopDecks.map((d: any) => ({
        ...d,
        main_deck_json: d.main_deck_json?.map(enrichCard) || null,
        extra_deck_json: d.extra_deck_json?.map(enrichCard) || null,
        side_deck_json: d.side_deck_json?.map(enrichCard) || null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name/top-lists', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const topDecks = await queryAll(pool,
      'SELECT * FROM top_decks WHERE LOWER(deck_type_name) = LOWER($1) ORDER BY created_at DESC LIMIT 20',
      [req.params.name]);

    res.json(topDecks.map((d: any) => ({
      ...d,
      main_deck_json: d.main_deck_json ? JSON.parse(d.main_deck_json) : null,
      extra_deck_json: d.extra_deck_json ? JSON.parse(d.extra_deck_json) : null,
      side_deck_json: d.side_deck_json ? JSON.parse(d.side_deck_json) : null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
