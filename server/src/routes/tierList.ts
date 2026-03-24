import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import { syncDeckTypes } from '../services/syncService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    let deckTypes = queryAll(db, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');

    if (deckTypes.length === 0) {
      await syncDeckTypes();
      deckTypes = queryAll(db, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');
    }

    // Build archetype → card-names map (same logic as /decks/featured)
    const archetypeCards = new Map<string, Set<string>>();
    const allArchCards = queryAll(db,
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

      // Find archetype card names for this deck (mirrors /decks/featured logic)
      const deckNameLower = (d.name as string).toLowerCase();
      const deckArchetypeNames = new Set<string>();
      for (const [archKey, cardSet] of archetypeCards) {
        if (deckNameLower.includes(archKey) || archKey.includes(deckNameLower)) {
          for (const name of cardSet) deckArchetypeNames.add(name);
        }
      }

      // Get recent top decks for card frequency
      const topDecks = queryAll(db,
        `SELECT main_deck_json FROM top_decks
         WHERE deck_type_name = ? COLLATE NOCASE
         ORDER BY created_at DESC LIMIT 20`,
        [d.name]
      );

      // Aggregate card frequencies — prefer archetype-matched cards
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

      // Fallback: if no archetype-matched cards, use most-played cards overall
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

      // Top 3 cards by frequency
      const topCardNames = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      const cards: Array<{ name: string; image: string | null }> = [];
      for (const cardName of topCardNames) {
        const card = queryOne(db,
          `SELECT name, image_cropped_url, image_small_url FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1`,
          [cardName]
        );
        if (card) {
          cards.push({
            name: card.name as string,
            image: (card.image_cropped_url || card.image_small_url || null) as string | null,
          });
        }
      }

      // Fuzzy fallback: word-overlap scoring against all archetypes
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
          const matchedCards = archetypeCards.get(bestMatch)!;
          for (const cardName of matchedCards) {
            const card = queryOne(db,
              `SELECT name, image_cropped_url, image_small_url FROM cards
               WHERE name = ? COLLATE NOCASE AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)
               LIMIT 1`,
              [cardName]
            );
            if (card) {
              cards.push({
                name: card.name as string,
                image: (card.image_cropped_url || card.image_small_url || null) as string | null,
              });
              break;
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
