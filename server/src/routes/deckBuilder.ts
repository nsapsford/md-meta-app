import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';

const router = Router();

router.post('/score', async (req: Request, res: Response) => {
  try {
    const { main = [], extra = [] } = req.body as { main: string[]; extra: string[] };
    const allCards = [...main, ...extra];
    const pool = getPool();

    const deckTypes = await queryAll(pool, 'SELECT name, tier, power, breakdown_json FROM deck_types WHERE tier IS NOT NULL ORDER BY tier ASC');

    let totalScore = 0;
    const cardScores: Record<string, { score: number; decks: string[] }> = {};

    for (const cardName of allCards) {
      let cardScore = 0;
      const appearsIn: string[] = [];

      for (const dt of deckTypes) {
        if (!dt.breakdown_json) continue;
        const breakdown = JSON.parse(dt.breakdown_json);
        const allBreakdownCards = [...(breakdown.main || []), ...(breakdown.extra || [])];

        for (const bc of allBreakdownCards) {
          if (bc.cardName?.toLowerCase() === cardName.toLowerCase() ||
              bc.name?.toLowerCase() === cardName.toLowerCase()) {
            const tierWeight = dt.tier === 0 ? 4 : dt.tier === 1 ? 3 : dt.tier === 2 ? 2 : 1;
            const usageRate = bc.percentage || bc.usage || 50;
            cardScore += tierWeight * (usageRate / 100) * (dt.power || 1);
            appearsIn.push(dt.name);
            break;
          }
        }
      }

      cardScores[cardName] = { score: cardScore, decks: appearsIn };
      totalScore += cardScore;
    }

    const maxPossible = allCards.length * 80;
    const normalizedScore = Math.min(100, Math.round((totalScore / Math.max(maxPossible, 1)) * 100));

    res.json({ score: normalizedScore, cardScores, totalCards: allCards.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { main = [], extra = [], side = [] } = req.body;
    const errors: string[] = [];

    if (main.length < 40) errors.push(`Main deck too small: ${main.length}/40 minimum`);
    if (main.length > 60) errors.push(`Main deck too large: ${main.length}/60 maximum`);
    if (extra.length > 15) errors.push(`Extra deck too large: ${extra.length}/15 maximum`);
    if (side.length > 15) errors.push(`Side deck too large: ${side.length}/15 maximum`);

    const pool = getPool();
    const allCards = [...main, ...extra, ...side];
    const cardCounts: Record<string, number> = {};
    for (const c of allCards) {
      cardCounts[c] = (cardCounts[c] || 0) + 1;
    }

    for (const [name, count] of Object.entries(cardCounts)) {
      const card = await queryOne(pool, "SELECT ban_status_md FROM cards WHERE LOWER(name) = LOWER($1)", [name]);
      if (card?.ban_status_md === 'Banned') {
        errors.push(`${name} is Forbidden`);
      } else if (card?.ban_status_md === 'Limited' && count > 1) {
        errors.push(`${name} is Limited to 1 (found ${count})`);
      } else if (card?.ban_status_md === 'Semi-Limited' && count > 2) {
        errors.push(`${name} is Semi-Limited to 2 (found ${count})`);
      } else if (count > 3) {
        errors.push(`${name}: maximum 3 copies allowed (found ${count})`);
      }
    }

    res.json({ valid: errors.length === 0, errors, warnings: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
