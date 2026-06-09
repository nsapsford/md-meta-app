import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { parseYdk, buildYdk, resolvePasscodes, type DeckPasscodes } from '../services/deckCodecService.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';

const router = Router();

// POST /api/decks-io/parse-ydk { ydk } -> { main, extra, side, cards, unresolved }
router.post('/parse-ydk', async (req: Request, res: Response) => {
  try {
    const { ydk } = req.body as { ydk?: string };
    if (typeof ydk !== 'string') return res.status(400).json({ error: 'ydk (string) is required' });

    let deck: DeckPasscodes;
    try {
      deck = parseYdk(ydk);
    } catch (e: any) {
      return res.status(422).json({ error: e.message });
    }

    const all = [...deck.main, ...deck.extra, ...deck.side];
    const { cards, unresolved } = await resolvePasscodes(getPool(), all);
    res.json({ ...deck, cards, unresolved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/decks-io/export-ydk { main, extra, side } -> { ydk }
router.post('/export-ydk', (req: Request, res: Response) => {
  try {
    const { main = [], extra = [], side = [] } = req.body as Partial<DeckPasscodes>;
    const toInts = (arr: unknown): number[] =>
      Array.isArray(arr) ? arr.map((n) => Number(n)).filter((n) => Number.isInteger(n)) : [];
    const ydk = buildYdk({ main: toInts(main), extra: toInts(extra), side: toInts(side) });
    res.json({ ydk });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/decks-io/resolve { passcodes } -> { cards, unresolved }
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const { passcodes } = req.body as { passcodes?: number[] };
    if (!Array.isArray(passcodes)) return res.status(400).json({ error: 'passcodes (array) is required' });
    const result = await resolvePasscodes(getPool(), passcodes.map(Number));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const NOW = () => Math.floor(Date.now() / 1000);

// GET /api/decks-io/saved -> deck rows (newest first)
router.get('/saved', async (_req: Request, res: Response) => {
  try {
    const rows = await queryAll(getPool(),
      'SELECT * FROM user_decks ORDER BY updated_at DESC');
    res.json(rows.map((d: any) => ({
      ...d,
      main_json: JSON.parse(d.main_json),
      extra_json: d.extra_json ? JSON.parse(d.extra_json) : [],
      side_json: d.side_json ? JSON.parse(d.side_json) : [],
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/decks-io/saved { name, archetype?, main, extra, side, source? } -> row
router.post('/saved', async (req: Request, res: Response) => {
  try {
    const { name, archetype = null, main = [], extra = [], side = [], source = 'manual' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const now = NOW();
    const row = await queryOne(getPool(),
      `INSERT INTO user_decks (name, archetype, main_json, extra_json, side_json, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [name, archetype, JSON.stringify(main), JSON.stringify(extra), JSON.stringify(side), source, now]
    );
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/decks-io/saved/:id { name, archetype?, main, extra, side } -> row
router.put('/saved/:id', async (req: Request, res: Response) => {
  try {
    const { name, archetype = null, main = [], extra = [], side = [] } = req.body;
    const row = await queryOne(getPool(),
      `UPDATE user_decks SET name=$1, archetype=$2, main_json=$3, extra_json=$4, side_json=$5, updated_at=$6
       WHERE id=$7 RETURNING *`,
      [name, archetype, JSON.stringify(main), JSON.stringify(extra), JSON.stringify(side), NOW(), req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Deck not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/decks-io/saved/:id -> { success }
router.delete('/saved/:id', async (req: Request, res: Response) => {
  try {
    await run(getPool(), 'DELETE FROM user_decks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
