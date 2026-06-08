import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { parseYdk, buildYdk, resolvePasscodes, type DeckPasscodes } from '../services/deckCodecService.js';

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

export default router;
