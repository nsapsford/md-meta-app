import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const tournaments = queryAll(db, 'SELECT * FROM tournaments ORDER BY next_date DESC');
    res.json(tournaments.map((t: any) => ({
      ...t,
      placements_json: t.placements_json ? JSON.parse(t.placements_json) : null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const tournament = queryOne(db, 'SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    res.json({
      ...tournament,
      placements_json: tournament.placements_json ? JSON.parse(tournament.placements_json) : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
