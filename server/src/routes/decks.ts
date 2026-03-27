import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { tier } = req.query;
    let decks;
    if (tier != null) {
      decks = queryAll(db, 'SELECT * FROM deck_types WHERE tier = ? ORDER BY power DESC', [parseInt(tier as string)]);
    } else {
      decks = queryAll(db, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');
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
    const db = getDb();
    const top3 = queryAll(db,
      `SELECT id, name, tier, power, power_trend, thumbnail_image, win_rate, play_rate
       FROM deck_types
       WHERE power IS NOT NULL AND power > 0
       ORDER BY power DESC
       LIMIT 3`
    );

    // Build a set of archetype card names from the cards table for filtering
    const archetypeCards = new Map<string, Set<string>>();
    const allArchCards = queryAll(db,
      `SELECT name, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`
    );
    for (const c of allArchCards) {
      const key = (c.archetype as string).toLowerCase();
      if (!archetypeCards.has(key)) archetypeCards.set(key, new Set());
      archetypeCards.get(key)!.add(c.name as string);
    }

    const result = [];
    for (const deck of top3) {
      // Determine which archetypes belong to this deck
      // Deck names often combine archetypes e.g. "Ryzeal Mitsurugi" → check "ryzeal", "mitsurugi"
      const deckNameLower = (deck.name as string).toLowerCase();
      const deckArchetypeNames = new Set<string>();
      for (const [archKey, cardSet] of archetypeCards) {
        if (deckNameLower.includes(archKey) || archKey.includes(deckNameLower)) {
          for (const name of cardSet) deckArchetypeNames.add(name);
        }
      }

      // Get recent top decks for this archetype
      const topDecks = queryAll(db,
        `SELECT main_deck_json FROM top_decks
         WHERE deck_type_name = ? COLLATE NOCASE
         ORDER BY created_at DESC LIMIT 20`,
        [deck.name]
      );

      // Aggregate card frequencies — only count cards that belong to the deck's archetype(s)
      const freq = new Map<string, number>();
      for (const td of topDecks) {
        if (!td.main_deck_json) continue;
        try {
          const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
          for (const c of cards) {
            if (c.cardName && c.cardName !== 'Unknown' && deckArchetypeNames.has(c.cardName)) {
              freq.set(c.cardName, (freq.get(c.cardName) || 0) + 1);
            }
          }
        } catch { /* skip */ }
      }

      // Sort by frequency, take top 5
      const topCardNames = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      // Fetch card images
      const cards = [];
      for (const cardName of topCardNames) {
        const card = queryOne(db,
          `SELECT name, image_small_url, image_cropped_url FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1`,
          [cardName]
        );
        if (card) {
          cards.push({
            name: card.name,
            image: card.image_cropped_url || card.image_small_url,
          });
        }
      }

      result.push({ ...deck, cards });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const deck = queryOne(db, 'SELECT * FROM deck_types WHERE name = ? COLLATE NOCASE', [req.params.name]);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    let topDecks = queryAll(db,
      'SELECT * FROM top_decks WHERE deck_type_name = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 10',
      [req.params.name]);

    // Fuzzy fallback: if no exact match, try LIKE-based matching (e.g. "Snake-Eye" → "Snake-Eye Fire King")
    if (topDecks.length === 0) {
      const words = req.params.name.split(/[\s\-]+/).filter((w: string) => w.length >= 3);
      if (words.length > 0) {
        const likeClause = words.map(() => 'LOWER(deck_type_name) LIKE ?').join(' AND ');
        const likeParams = words.map((w: string) => `%${w.toLowerCase()}%`);
        topDecks = queryAll(db,
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
      const placeholders = names.map(() => '?').join(',');
      const cardRows = queryAll(db,
        `SELECT name, type, frame_type, archetype, image_small_url, negate_effectiveness FROM cards WHERE name IN (${placeholders}) COLLATE NOCASE`,
        names);
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
    const db = getDb();
    const topDecks = queryAll(db,
      'SELECT * FROM top_decks WHERE deck_type_name = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 20',
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
