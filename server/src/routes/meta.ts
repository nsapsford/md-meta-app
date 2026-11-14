import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { getRankMeta } from '../services/rankMeta.js';
import { RANK_NAMES, rankIdFromName } from '../services/untappedParse.js';
import { memoize } from '../utils/memo.js';

const router = Router();

/**
 * GET /api/meta/by-rank?rank=master
 *
 * Per-archetype win rate, play rate and going-first / going-second splits at one
 * rank, from untapped.gg. `rank` is a name (all, bronze, silver, gold, platinum,
 * diamond, master) or an id; defaults to master. `win_rate` is mirror-corrected,
 * `win_rate_raw` is as reported. Returns `decks: []` when nothing has synced yet.
 */
router.get('/by-rank', async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.rank ?? 'master').trim();
    const rankId = /^\d+$/.test(raw) ? Number(raw) : rankIdFromName(raw);
    if (rankId == null || RANK_NAMES[rankId] === undefined) {
      return res.status(400).json({
        error: `Unknown rank "${raw}". Use one of: ${Object.values(RANK_NAMES).join(', ')}`,
      });
    }
    const pool = getPool();
    res.json(await memoize(`meta:by-rank:${rankId}`, () => getRankMeta(pool, rankId)));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
