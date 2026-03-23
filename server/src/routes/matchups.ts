import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryAll, run } from '../utils/dbHelpers.js';
import * as mdm from '../services/mdmService.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { deck } = req.query;
    const db = getDb();

    if (deck) {
      let rows = queryAll(db, 'SELECT * FROM matchups WHERE deck_a = ? COLLATE NOCASE', [deck as string]);
      if (rows.length === 0) {
        const scraped = await mdm.scrapeMatchups(deck as string);
        for (const m of scraped) {
          run(db, "INSERT OR REPLACE INTO matchups (deck_a, deck_b, win_rate_a, sample_size, updated_at) VALUES (?, ?, ?, ?, strftime('%s','now'))",
            [deck, m.opponent, m.winRate, m.sampleSize]);
        }
        rows = queryAll(db, 'SELECT * FROM matchups WHERE deck_a = ? COLLATE NOCASE', [deck as string]);
      }
      return res.json(rows);
    }

    const allMatchups = queryAll(db, 'SELECT * FROM matchups ORDER BY deck_a, deck_b');
    res.json(allMatchups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
