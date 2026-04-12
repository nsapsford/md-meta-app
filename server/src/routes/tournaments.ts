import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tournaments = await queryAll(pool, `
      SELECT
        t.id, t.name, t.short_name, t.banner_image, t.next_date, t.placements_json,
        (
          SELECT dt.thumbnail_image
          FROM top_decks td JOIN deck_types dt ON dt.name = td.deck_type_name
          WHERE (td.tournament_name = t.name OR td.tournament_name = t.short_name)
            AND td.tournament_placement IS NOT NULL
          ORDER BY CASE WHEN td.tournament_placement LIKE '1st%' THEN 0 ELSE 1 END ASC,
                   td.created_at DESC
          LIMIT 1
        ) AS winner_deck_thumbnail,
        (
          SELECT td2.deck_type_name
          FROM top_decks td2
          WHERE (td2.tournament_name = t.name OR td2.tournament_name = t.short_name)
            AND td2.tournament_placement IS NOT NULL
          ORDER BY CASE WHEN td2.tournament_placement LIKE '1st%' THEN 0 ELSE 1 END ASC,
                   td2.created_at DESC
          LIMIT 1
        ) AS winner_deck_name
      FROM tournaments t
      ORDER BY t.next_date DESC
    `);
    res.json(tournaments.map((t: any) => ({
      ...t,
      placements_json: t.placements_json ? JSON.parse(t.placements_json) : null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent-results', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const results = await queryAll(pool,
      `SELECT deck_type_name, tournament_placement, author, created_at, url
       FROM top_decks
       WHERE tournament_placement IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const tournament = await queryOne(pool, 'SELECT * FROM tournaments WHERE id = $1', [req.params.id]);
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
