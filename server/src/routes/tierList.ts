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
