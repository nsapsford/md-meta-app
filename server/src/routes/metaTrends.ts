import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryAll } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const snapshots = queryAll(db, `
      SELECT deck_type_name, tier, power, pop_rank, snapshot_date
      FROM meta_snapshots
      ORDER BY snapshot_date DESC, deck_type_name
    `);

    const grouped: Record<string, any[]> = {};
    for (const s of snapshots) {
      if (!grouped[s.deck_type_name]) grouped[s.deck_type_name] = [];
      grouped[s.deck_type_name].push(s);
    }

    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:deckName', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const snapshots = queryAll(db, `
      SELECT * FROM meta_snapshots
      WHERE deck_type_name = ? COLLATE NOCASE
      ORDER BY snapshot_date ASC
    `, [req.params.deckName]);

    res.json(snapshots);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
