import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import * as ygopd from '../services/ygoprodeckService.js';

const router = Router();

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
      // Build frequency map from tournament top decks
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

      const allCards = await queryAll(pool, `SELECT * FROM cards ${where} ORDER BY name`, params);
      allCards.sort((a: any, b: any) => {
        const fa = freq.get(a.name.toLowerCase()) || 0;
        const fb = freq.get(b.name.toLowerCase()) || 0;
        return fb - fa;
      });

      const total = allCards.length;
      const cards = allCards.slice(offset, offset + limitNum);
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
