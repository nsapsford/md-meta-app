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
        'SELECT image_small_url, image_cropped_url, id FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1',
        [card.name]
      );
      return {
        ...card,
        id: local?.id ?? null,
        image_small_url: local?.image_small_url ?? null,
        image_cropped_url: local?.image_cropped_url ?? null,
      };
    };

    res.json({
      forbidden: banList.forbidden.map(enrichCard),
      limited: banList.limited.map(enrichCard),
      semiLimited: banList.semiLimited.map(enrichCard),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
