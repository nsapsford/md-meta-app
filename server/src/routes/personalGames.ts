import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const deck = req.query.deck as string | undefined;

    let query = 'SELECT * FROM personal_games';
    const params: any[] = [];
    if (deck) {
      query += ' WHERE LOWER(deck_played) = LOWER($1)';
      params.push(deck);
    }
    query += ` ORDER BY played_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    res.json(await queryAll(pool, query, params));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { deck_played, opponent_deck, result, went_first, notes } = req.body;
    if (!deck_played || !opponent_deck || !result) {
      return res.status(400).json({ error: 'deck_played, opponent_deck, and result are required' });
    }
    if (!['win', 'loss', 'draw'].includes(result)) {
      return res.status(400).json({ error: 'result must be win, loss, or draw' });
    }

    const pool = getPool();
    const row = await queryOne(pool,
      `INSERT INTO personal_games (deck_played, opponent_deck, result, went_first, notes, played_at)
       VALUES ($1, $2, $3, $4, $5, EXTRACT(EPOCH FROM NOW())::INTEGER) RETURNING *`,
      [deck_played, opponent_deck, result, went_first ?? null, notes ?? null]
    );
    res.status(201).json(row);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    await run(pool, 'DELETE FROM personal_games WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/spread', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const days = parseInt(req.query.days as string) || 90;
    const deck = req.query.deck as string | undefined;

    let query = `
      SELECT
        deck_played,
        opponent_deck,
        COUNT(*)::INTEGER AS total,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END)::INTEGER AS wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END)::INTEGER AS losses,
        SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END)::INTEGER AS draws,
        ROUND(SUM(CASE WHEN result = 'win' THEN 1.0 ELSE 0 END) / COUNT(*), 4)::REAL AS win_rate
      FROM personal_games
      WHERE played_at > EXTRACT(EPOCH FROM NOW())::INTEGER - $1
    `;
    const params: any[] = [days * 86400];

    if (deck) {
      query += ` AND LOWER(deck_played) = LOWER($2)`;
      params.push(deck);
    }
    query += ' GROUP BY deck_played, opponent_deck ORDER BY deck_played, total DESC';

    res.json(await queryAll(pool, query, params));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
