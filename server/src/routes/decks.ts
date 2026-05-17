import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import { getCached, setCache } from '../services/cacheService.js';

const FEATURED_CACHE_KEY = 'featured_decks_v1';
const FEATURED_CACHE_TTL = 300; // 5 minutes

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
router.get('/featured', async (_req: Request, res: Response) => {
  try {
    const cached = await getCached<any[]>(FEATURED_CACHE_KEY);
    if (cached) return res.json(cached);

    const pool = getPool();
    const top3 = await queryAll(pool,
      `SELECT id, name, tier, power, power_trend, thumbnail_image, win_rate, play_rate
       FROM deck_types
       WHERE power IS NOT NULL AND power > 0
       ORDER BY power DESC
       LIMIT 3`
    );

    // BATCH: archetype → card names
    const archetypeCards = new Map<string, Set<string>>();
    const allArchCards = await queryAll(pool,
      `SELECT name, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`
    );
    for (const c of allArchCards) {
      const key = (c.archetype as string).toLowerCase();
      if (!archetypeCards.has(key)) archetypeCards.set(key, new Set());
      archetypeCards.get(key)!.add(c.name as string);
    }

    // BATCH: top decks for all 3 featured decks in one query
    const deckNames = top3.map((d: any) => (d.name as string).toLowerCase());
    const placeholdersNames = deckNames.map((_: any, i: number) => `$${i + 1}`).join(',');
    const allTopDecks = deckNames.length > 0 ? await queryAll(pool,
      `SELECT deck_type_name, main_deck_json FROM (
         SELECT deck_type_name, main_deck_json,
                ROW_NUMBER() OVER (PARTITION BY LOWER(deck_type_name) ORDER BY created_at DESC) AS rn
         FROM top_decks
         WHERE LOWER(deck_type_name) IN (${placeholdersNames}) AND main_deck_json IS NOT NULL
       ) t WHERE rn <= 20`,
      deckNames
    ) : [];
    const topDecksByName = new Map<string, any[]>();
    for (const row of allTopDecks) {
      const k = (row.deck_type_name as string).toLowerCase();
      if (!topDecksByName.has(k)) topDecksByName.set(k, []);
      topDecksByName.get(k)!.push(row);
    }

    // Compute top card names per deck (CPU-only)
    const deckTopNames = new Map<string, string[]>();
    for (const deck of top3) {
      const deckNameLower = (deck.name as string).toLowerCase();
      const deckArchetypeNames = new Set<string>();
      for (const [archKey, cardSet] of archetypeCards) {
        if (deckNameLower.includes(archKey) || archKey.includes(deckNameLower)) {
          for (const name of cardSet) deckArchetypeNames.add(name);
        }
      }
      const topDecks = topDecksByName.get(deckNameLower) ?? [];
      const freq = new Map<string, number>();
      for (const td of topDecks) {
        try {
          const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
          for (const c of cards) {
            if (c.cardName && c.cardName !== 'Unknown' && deckArchetypeNames.has(c.cardName)) {
              freq.set(c.cardName, (freq.get(c.cardName) || 0) + 1);
            }
          }
        } catch { /* skip */ }
      }
      let topNames = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
      if (topNames.length === 0) topNames = [...deckArchetypeNames].slice(0, 5);
      deckTopNames.set(deck.id as string, topNames);
    }

    // BATCH: fetch all needed card images in one query
    const allNeeded = new Set<string>();
    for (const names of deckTopNames.values()) for (const n of names) allNeeded.add(n.toLowerCase());
    const cardImageMap = new Map<string, { name: string; image: string | null }>();
    if (allNeeded.size > 0) {
      const arr = [...allNeeded];
      const ph = arr.map((_: any, i: number) => `$${i + 1}`).join(',');
      const rows = await queryAll(pool,
        `SELECT name, image_cropped_url, image_small_url FROM cards
         WHERE LOWER(name) IN (${ph}) AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)`,
        arr
      );
      for (const row of rows) {
        cardImageMap.set((row.name as string).toLowerCase(), {
          name: row.name as string,
          image: (row.image_cropped_url || row.image_small_url || null) as string | null,
        });
      }
    }

    const result = top3.map((deck: any) => {
      const topNames = deckTopNames.get(deck.id as string) ?? [];
      const cards: Array<{ name: string; image: string | null }> = [];
      for (const n of topNames) {
        const info = cardImageMap.get(n.toLowerCase());
        if (info) cards.push(info);
        if (cards.length >= 5) break;
      }
      return { ...deck, cards };
    });

    await setCache(FEATURED_CACHE_KEY, result, FEATURED_CACHE_TTL);
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
