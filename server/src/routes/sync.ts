import { Router, Request, Response } from 'express';
import { syncCards, syncArchetypes, syncDeckTypes, syncTopDecks, syncTournaments, syncUntapped } from '../services/syncService.js';
import { clearCache } from '../services/cacheService.js';

const router = Router();

router.post('/cards', async (_req: Request, res: Response) => {
  try {
    const count = await syncCards();
    await syncArchetypes();
    res.json({ message: `Synced ${count} cards` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/meta', async (_req: Request, res: Response) => {
  let step = 'init';
  try {
    clearCache('mdm');  // Force fresh data from MDM API
    step = 'syncDeckTypes';
    const dtCount = await syncDeckTypes();
    step = 'syncTopDecks';
    const tdCount = await syncTopDecks();
    step = 'syncTournaments';
    const tCount = await syncTournaments();
    step = 'syncUntapped';
    const uCount = await syncUntapped();
    res.json({ message: `Synced ${dtCount} deck types, ${tdCount} top decks, ${tCount} tournaments, ${uCount} untapped archetypes` });
  } catch (err: any) {
    console.error(`[Sync] Meta sync failed at step "${step}":`, err);
    res.status(500).json({ error: `${step}: ${String(err?.message || err)}` });
  }
});

router.post('/untapped', async (_req: Request, res: Response) => {
  try {
    // Clear cache so Puppeteer re-scrapes fresh data
    clearCache('untapped');
    const count = await syncUntapped();
    res.json({ message: `Synced ${count} archetypes from untapped.gg` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/all', async (_req: Request, res: Response) => {
  try {
    clearCache('mdm');  // Force fresh data from MDM API
    const cardCount = await syncCards();
    await syncArchetypes();
    const dtCount = await syncDeckTypes();
    const tdCount = await syncTopDecks();
    const tCount = await syncTournaments();
    const uCount = await syncUntapped();
    res.json({
      message: 'Full sync complete',
      cards: cardCount,
      deckTypes: dtCount,
      topDecks: tdCount,
      tournaments: tCount,
      untappedArchetypes: uCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
