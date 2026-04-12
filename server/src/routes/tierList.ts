import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import { syncDeckTypes } from '../services/syncService.js';

// Manual overrides for MDM deck names → YGOProDeck archetype keys
const ARCHETYPE_OVERRIDES: Record<string, string[]> = {
  'vanquish soul k9': ['vanquish soul'],
  'solfachord yummy': ['solfachord'],
  'mitsurugi yummy': ['mitsurugi'],
  'crystron k9': ['crystron'],
  'white forest azamina': ['white forest', 'azamina'],
  'ryzeal mitsurugi': ['ryzeal', 'mitsurugi'],
  'dinos': ['dinomorphia', 'dinosaur'],
  'earth machine': ['machina', 'infinitrack'],
  'zombies': ['zombie'],
  'telefon combo': ['telefon'],
  // Engine aggregations from MDM website
  'mitsurugi engine': ['mitsurugi'],
  'yummy engine': ['yummy'],
  'k9 engine': ['k9'],
};

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    let deckTypes = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');

    if (deckTypes.length === 0) {
      await syncDeckTypes();
      deckTypes = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');
    }

    // Build archetype → card-names map (same logic as /decks/featured)
    const archetypeCards = new Map<string, Set<string>>();
    const allArchCards = await queryAll(pool,
      `SELECT name, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`
    );
    for (const c of allArchCards) {
      const key = (c.archetype as string).toLowerCase();
      if (!archetypeCards.has(key)) archetypeCards.set(key, new Set());
      archetypeCards.get(key)!.add(c.name as string);
    }

    const grouped: Record<string, any[]> = { '0': [], '1': [], '2': [], '3': [], rogue: [] };
    for (const d of deckTypes) {
      const key = d.tier != null ? String(d.tier) : 'rogue';
      if (!grouped[key]) grouped[key] = [];

      const deckNameLower = (d.name as string).toLowerCase();
      const deckArchetypeNames = new Set<string>();

      // Step 0: Check manual overrides first
      const overrideKeys = ARCHETYPE_OVERRIDES[deckNameLower];
      if (overrideKeys) {
        for (const ok of overrideKeys) {
          const cardSet = archetypeCards.get(ok);
          if (cardSet) for (const name of cardSet) deckArchetypeNames.add(name);
        }
      }

      // Step 1: Substring match against all archetypes
      if (deckArchetypeNames.size === 0) {
        for (const [archKey, cardSet] of archetypeCards) {
          if (deckNameLower.includes(archKey) || archKey.includes(deckNameLower)) {
            for (const name of cardSet) deckArchetypeNames.add(name);
          }
        }
      }

      // Step 2: Get recent top decks for card frequency
      const topDecks = await queryAll(pool,
        `SELECT main_deck_json FROM top_decks
         WHERE LOWER(deck_type_name) = LOWER($1)
         ORDER BY created_at DESC LIMIT 20`,
        [d.name]
      );

      // Step 3: Aggregate card frequencies — prefer archetype-matched cards
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

      // Step 3b: Fallback — use most-played cards overall from top_decks
      if (freq.size === 0) {
        for (const td of topDecks) {
          if (!td.main_deck_json) continue;
          try {
            const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
            for (const c of cards) {
              if (c.cardName && c.cardName !== 'Unknown') {
                freq.set(c.cardName, (freq.get(c.cardName) || 0) + (c.amount || 1));
              }
            }
          } catch { /* skip */ }
        }
      }

      // Step 4: Build cards array from frequency data
      const topCardNames = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      const cards: Array<{ name: string; image: string | null }> = [];
      for (const cardName of topCardNames) {
        const card = await queryOne(pool,
          `SELECT name, image_cropped_url, image_small_url FROM cards WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [cardName]
        );
        if (card) {
          cards.push({
            name: card.name as string,
            image: (card.image_cropped_url || card.image_small_url || null) as string | null,
          });
        }
      }

      // Step 5: If no top_decks data but archetype cards were found, use archetype cards directly
      if (cards.length === 0 && deckArchetypeNames.size > 0) {
        const archNames = [...deckArchetypeNames].slice(0, 50);
        const placeholders = archNames.map((_, i) => `$${i + 1}`).join(',');
        const archCards = await queryAll(pool,
          `SELECT name, image_cropped_url, image_small_url FROM cards
           WHERE LOWER(name) IN (${placeholders})
             AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)
           LIMIT 3`,
          archNames.map(n => n.toLowerCase())
        );
        for (const card of archCards) {
          cards.push({
            name: card.name as string,
            image: (card.image_cropped_url || card.image_small_url || null) as string | null,
          });
        }
      }

      // Step 6: Fuzzy fallback — word-overlap scoring against all archetypes (up to 3 cards)
      if (cards.length === 0) {
        const deckWords = (d.name as string).toLowerCase().split(/[\s\-]+/).filter((w: string) => w.length >= 3);
        let bestMatch: string | null = null;
        let bestScore = 0;
        for (const [archKey] of archetypeCards) {
          const archWords = archKey.split(/[\s\-]+/);
          const score = deckWords.filter((w: string) => archWords.some((aw: string) => aw.includes(w) || w.includes(aw))).length;
          if (score > bestScore) { bestScore = score; bestMatch = archKey; }
        }
        if (bestMatch && bestScore > 0) {
          const matchedCardNames = [...archetypeCards.get(bestMatch)!];
          for (const cardName of matchedCardNames) {
            if (cards.length >= 3) break;
            const card = await queryOne(pool,
              `SELECT name, image_cropped_url, image_small_url FROM cards
               WHERE LOWER(name) = LOWER($1) AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)
               LIMIT 1`,
              [cardName]
            );
            if (card) {
              cards.push({
                name: card.name as string,
                image: (card.image_cropped_url || card.image_small_url || null) as string | null,
              });
            }
          }
        }
      }

      grouped[key].push({
        ...d,
        cards,
        thumbnail_image: d.thumbnail_image || (cards.length > 0 ? cards[0].image : null),
        breakdown_json: d.breakdown_json ? JSON.parse(d.breakdown_json) : null,
      });
    }

    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
