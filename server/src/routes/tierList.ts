import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryAll } from '../utils/dbHelpers.js';
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
      grouped[key].push({
        ...d,
        breakdown_json: d.breakdown_json ? JSON.parse(d.breakdown_json) : null,
      });
    }

    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
