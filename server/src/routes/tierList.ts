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

    const grouped: Record<string, any[]> = { '0': [], '1': [], '2': [], '3': [], rogue: [] };
    for (const d of deckTypes) {
      const key = d.tier != null ? String(d.tier) : 'rogue';
      if (!grouped[key]) grouped[key] = [];

      // Derive thumbnail from cards table — same source as /decks/featured card images
      let thumbnail = d.thumbnail_image || null;
      if (!thumbnail) {
        // Strategy 1: archetype is a substring of the deck name (e.g. "Ryzeal" in "Ryzeal Mitsurugi")
        const byArchetype = queryOne(db,
          `SELECT image_cropped_url, image_small_url FROM cards
           WHERE archetype IS NOT NULL
             AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)
             AND LOWER(?) LIKE '%' || LOWER(archetype) || '%'
           LIMIT 1`,
          [d.name]
        );
        thumbnail = byArchetype ? (byArchetype.image_cropped_url || byArchetype.image_small_url || null) : null;
      }
      if (!thumbnail) {
        // Strategy 2: try each significant word of the deck name against archetype OR card name
        // (handles new archetypes not yet indexed, e.g. "Dracotail", "Radiant Typhoon")
        const words = (d.name as string).split(' ').filter((w: string) => w.length >= 4);
        for (const word of words) {
          const byWord = queryOne(db,
            `SELECT image_cropped_url, image_small_url FROM cards
             WHERE (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)
               AND (
                 (archetype IS NOT NULL AND LOWER(archetype) LIKE LOWER(?))
                 OR LOWER(name) LIKE LOWER(?)
               )
             LIMIT 1`,
            [`%${word}%`, `${word}%`]
          );
          if (byWord) {
            thumbnail = byWord.image_cropped_url || byWord.image_small_url || null;
            break;
          }
        }
      }
      if (!thumbnail) {
        // Strategy 3: look up the most-used card from actual top deck lists
        // (mirrors /decks/featured — handles MDM-specific names like "Dracotail")
        const recentDecks = queryAll(db,
          `SELECT main_deck_json FROM top_decks
           WHERE deck_type_name = ? COLLATE NOCASE
           ORDER BY created_at DESC LIMIT 20`,
          [d.name]
        );
        const freq = new Map<string, number>();
        for (const td of recentDecks) {
          if (!td.main_deck_json) continue;
          try {
            const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
            for (const c of cards) {
              if (c.cardName && c.cardName !== 'Unknown')
                freq.set(c.cardName, (freq.get(c.cardName) || 0) + (c.amount || 1));
            }
          } catch { /* skip malformed */ }
        }
        const topCard = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (topCard) {
          const card = queryOne(db,
            `SELECT image_cropped_url, image_small_url FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1`,
            [topCard]
          );
          thumbnail = card ? (card.image_cropped_url || card.image_small_url || null) : null;
        }
      }

      grouped[key].push({
        ...d,
        thumbnail_image: thumbnail,
        breakdown_json: d.breakdown_json ? JSON.parse(d.breakdown_json) : null,
      });
    }

    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
