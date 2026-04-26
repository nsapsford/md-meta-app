import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll } from '../utils/dbHelpers.js';
import { MD_BANLIST_DATES } from '../config.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const snapshots = await queryAll(pool, `
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

router.get('/movers', async (req: Request, res: Response) => {
  try {
    const window = Math.min(Math.max(parseInt(req.query.window as string) || 7, 1), 30);
    const pool = getPool();

    // Get the most recent snapshot date and the closest date >= window days ago
    const rows = await queryAll(pool, `
      WITH ranked AS (
        SELECT
          s.deck_type_name,
          s.power,
          s.tier,
          s.pop_rank,
          s.snapshot_date,
          dt.thumbnail_image,
          ROW_NUMBER() OVER (PARTITION BY s.deck_type_name ORDER BY s.snapshot_date DESC) AS rn_latest,
          ROW_NUMBER() OVER (PARTITION BY s.deck_type_name ORDER BY ABS(
            EXTRACT(EPOCH FROM (s.snapshot_date::date - (CURRENT_DATE - $1::int)::date))
          )) AS rn_past
        FROM meta_snapshots s
        JOIN deck_types dt ON LOWER(s.deck_type_name) = LOWER(dt.name)
        WHERE dt.tier IS NOT NULL AND dt.tier <= 3
      ),
      latest AS (SELECT * FROM ranked WHERE rn_latest = 1),
      past   AS (SELECT * FROM ranked WHERE rn_past   = 1)
      SELECT
        l.deck_type_name,
        l.tier,
        l.thumbnail_image,
        l.power          AS power_now,
        p.power          AS power_then,
        l.power - p.power AS power_delta,
        l.snapshot_date  AS date_now,
        p.snapshot_date  AS date_then
      FROM latest l
      JOIN past p ON LOWER(l.deck_type_name) = LOWER(p.deck_type_name)
      WHERE l.snapshot_date != p.snapshot_date
        AND l.power IS NOT NULL
        AND p.power IS NOT NULL
      ORDER BY power_delta DESC
    `, [window]);

    // Check if the window crosses any known banlist date
    const today = new Date().toISOString().slice(0, 10);
    const windowStart = new Date(Date.now() - window * 86400000).toISOString().slice(0, 10);
    const postBanlist = MD_BANLIST_DATES.some((d) => d > windowStart && d <= today);

    const risers = rows.slice(0, 5);
    const fallers = [...rows].sort((a, b) => a.power_delta - b.power_delta).slice(0, 5);

    res.json({ risers, fallers, post_banlist: postBanlist, window_days: window });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:deckName', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const snapshots = await queryAll(pool, `
      SELECT * FROM meta_snapshots
      WHERE LOWER(deck_type_name) = LOWER($1)
      ORDER BY snapshot_date ASC
    `, [req.params.deckName]);

    res.json(snapshots);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
