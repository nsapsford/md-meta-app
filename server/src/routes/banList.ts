import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryOne } from '../utils/dbHelpers.js';
import * as mdm from '../services/mdmService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const banList = await mdm.getBanList();

    const enrichCard = (card: mdm.MDMBanCard) => {
      const local = queryOne(db,
        'SELECT image_small_url, image_cropped_url, id, md_rarity FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1',
        [card.name]
      );
      return {
        ...card,
        id: local?.id ?? null,
        image_small_url: local?.image_small_url ?? null,
        image_cropped_url: local?.image_cropped_url ?? null,
        rarity: card.rarity ?? local?.md_rarity ?? null,
      };
    };

    const sortByDate = (cards: ReturnType<typeof enrichCard>[]) =>
      [...cards].sort((a, b) => {
        if (!a.banListDate && !b.banListDate) return 0;
        if (!a.banListDate) return 1;
        if (!b.banListDate) return -1;
        return b.banListDate.localeCompare(a.banListDate);
      });

    const forbidden = sortByDate(banList.forbidden.map(enrichCard));
    const limited = sortByDate(banList.limited.map(enrichCard));
    const semiLimited = sortByDate(banList.semiLimited.map(enrichCard));

    res.json({ forbidden, limited, semiLimited });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Temporary debug - remove after checking
router.get('/debug-raw', async (_req: Request, res: Response) => {
  const axios = (await import('axios')).default;
  try {
    const r = await axios.get('https://www.masterduelmeta.com/api/v1/cards', {
      params: { banStatus: 'Forbidden', limit: 2 },
    });
    const data = Array.isArray(r.data) ? r.data : [];
    res.json({ fields: data[0] ? Object.keys(data[0]) : [], sample: data[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
