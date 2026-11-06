import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { memoize } from '../utils/memo.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import * as ygopd from '../services/ygoprodeckService.js';

const router = Router();

/** How often each card name appears across tournament top-deck lists. */
async function cardPopularity(pool: ReturnType<typeof getPool>): Promise<Map<string, number>> {
  const topDecks = await queryAll(pool, 'SELECT main_deck_json FROM top_decks WHERE main_deck_json IS NOT NULL');
  const freq = new Map<string, number>();
  for (const td of topDecks) {
    try {
      const cards = JSON.parse(td.main_deck_json);
      for (const c of cards) {
        const name = c.cardName?.toLowerCase();
        if (name) freq.set(name, (freq.get(name) || 0) + 1);
      }
    } catch {}
  }
  return freq;
}

router.get('/archetypes', async (_req: Request, res: Response) => {
  try {
    const archetypes = await ygopd.getArchetypes();
    res.json(archetypes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, type, attribute, archetype, banStatus, atkMin, atkMax, defMin, defMax, level, sort = 'name', page = '1', limit = '30' } = req.query as Record<string, string>;

    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (q) { conditions.push(`name ILIKE $${paramIndex++}`); params.push(`%${q}%`); }
    if (type) {
      if (type === 'Ritual Monster') {
        conditions.push(`type ILIKE $${paramIndex++}`); params.push('%Ritual%');
      } else {
        conditions.push(`type = $${paramIndex++}`); params.push(type);
      }
    }
    if (attribute) { conditions.push(`attribute = $${paramIndex++}`); params.push(attribute); }
    if (archetype) { conditions.push(`archetype = $${paramIndex++}`); params.push(archetype); }
    if (banStatus) { conditions.push(`ban_status_md = $${paramIndex++}`); params.push(banStatus); }
    if (atkMin) { conditions.push(`atk >= $${paramIndex++}`); params.push(parseInt(atkMin)); }
    if (atkMax) { conditions.push(`atk <= $${paramIndex++}`); params.push(parseInt(atkMax)); }
    if (defMin) { conditions.push(`def >= $${paramIndex++}`); params.push(parseInt(defMin)); }
    if (defMax) { conditions.push(`def <= $${paramIndex++}`); params.push(parseInt(defMax)); }
    if (level) { conditions.push(`level = $${paramIndex++}`); params.push(parseInt(level)); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    if (sort === 'popular') {
      // Previously every page request re-read every top-deck list and every
      // matching card row (full rows, descriptions included) from Neon, then
      // sorted in JS and threw away all but 30 — and infinite scroll asks for
      // a page every few seconds. Now the popularity-ordered id list per
      // filter is computed once (memoised until the next sync), and each page
      // fetches only its own rows by primary key.
      const filterKey = JSON.stringify(params) + where;
      const orderedIds = await memoize(`cards:popular:${filterKey}`, async () => {
        const freq = await memoize('cards:popularity', () => cardPopularity(pool));
        const rows = await queryAll(pool, `SELECT id, name FROM cards ${where} ORDER BY name`, params) as { id: number; name: string }[];
        rows.sort((a, b) => (freq.get(b.name.toLowerCase()) || 0) - (freq.get(a.name.toLowerCase()) || 0));
        return rows.map((r) => r.id);
      });

      const total = orderedIds.length;
      const pageIds = orderedIds.slice(offset, offset + limitNum);
      const pageRows = pageIds.length > 0
        ? await queryAll(pool, 'SELECT * FROM cards WHERE id = ANY($1::int[])', [pageIds])
        : [];
      const byId = new Map(pageRows.map((c: any) => [c.id, c]));
      const cards = pageIds.map((id) => byId.get(id)).filter(Boolean);
      res.json({ cards, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
    } else {
      const countRow = await queryOne(pool, `SELECT COUNT(*) as total FROM cards ${where}`, params);
      const cards = await queryAll(pool, `SELECT * FROM cards ${where} ORDER BY name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`, [...params, limitNum, offset]);
      res.json({ cards, total: countRow?.total || 0, page: pageNum, limit: limitNum, totalPages: Math.ceil((countRow?.total || 0) / limitNum) });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const card = await queryOne(pool, 'SELECT * FROM cards WHERE id = $1', [parseInt(req.params.id)]);
    if (!card) {
      const fetched = await ygopd.getCardById(parseInt(req.params.id));
      if (!fetched) return res.status(404).json({ error: 'Card not found' });
      return res.json(fetched);
    }
    res.json(card);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
