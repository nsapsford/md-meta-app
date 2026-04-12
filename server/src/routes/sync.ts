import { Router, Request, Response } from 'express';
import {
  syncCards, syncArchetypes, syncDeckTypes, syncTopDecks,
  syncTournaments, syncUntapped, syncCardNegateEffectiveness
} from '../services/syncService.js';
import { recordSync, getSyncStatus, SyncSource } from '../services/syncStatusService.js';
import { clearCache } from '../services/cacheService.js';

const router = Router();

router.post('/cards', async (_req: Request, res: Response) => {
  try {
    const count = await syncCards();
    await syncArchetypes();
    await recordSync('ygoprodeck', 'success');
    res.json({ message: `Synced ${count} cards` });
  } catch (err: any) {
    await recordSync('ygoprodeck', 'failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/meta', async (_req: Request, res: Response) => {
  let step = 'init';
  try {
    await clearCache('mdm');
    step = 'syncDeckTypes';
    const dtCount = await syncDeckTypes();
    step = 'syncTopDecks';
    const tdCount = await syncTopDecks();
    await recordSync('mdm_deck_types', 'success');
    step = 'syncTournaments';
    const tCount = await syncTournaments();
    await recordSync('mdm_tournaments', 'success');
    step = 'syncUntapped';
    const uCount = await syncUntapped();
    await recordSync('untapped', 'success');
    res.json({ message: `Synced ${dtCount} deck types, ${tdCount} top decks, ${tCount} tournaments, ${uCount} untapped archetypes` });
  } catch (err: any) {
    const source =
      step === 'syncTournaments' ? 'mdm_tournaments' :
      step === 'syncUntapped'    ? 'untapped'        : 'mdm_deck_types';
    await recordSync(source as SyncSource, 'failed', String(err?.message || err));
    console.error(`[Sync] Meta sync failed at step "${step}":`, err);
    res.status(500).json({ error: `${step}: ${String(err?.message || err)}` });
  }
});

router.post('/untapped', async (_req: Request, res: Response) => {
  try {
    await clearCache('untapped');
    const count = await syncUntapped();
    await recordSync('untapped', 'success');
    res.json({ message: `Synced ${count} archetypes from untapped.gg` });
  } catch (err: any) {
    await recordSync('untapped', 'failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/negate', async (_req: Request, res: Response) => {
  try {
    await clearCache('untapped:card-negate');
    const count = await syncCardNegateEffectiveness();
    res.json({ message: `Updated ${count} cards with negate effectiveness data` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/all', async (_req: Request, res: Response) => {
  let step = 'init';
  try {
    await clearCache('mdm');
    step = 'syncCards';
    const cardCount = await syncCards();
    await syncArchetypes();
    await recordSync('ygoprodeck', 'success');
    step = 'syncDeckTypes';
    const dtCount = await syncDeckTypes();
    step = 'syncTopDecks';
    const tdCount = await syncTopDecks();
    await recordSync('mdm_deck_types', 'success');
    step = 'syncTournaments';
    const tCount = await syncTournaments();
    await recordSync('mdm_tournaments', 'success');
    step = 'syncUntapped';
    const uCount = await syncUntapped();
    await recordSync('untapped', 'success');
    step = 'syncNegate';
    const nCount = await syncCardNegateEffectiveness();
    res.json({
      message: 'Full sync complete',
      cards: cardCount, deckTypes: dtCount, topDecks: tdCount,
      tournaments: tCount, untappedArchetypes: uCount, cardNegateEffectiveness: nCount,
    });
  } catch (err: any) {
    const source: SyncSource =
      step === 'syncTournaments' ? 'mdm_tournaments' :
      step === 'syncUntapped'    ? 'untapped'        :
      (step === 'syncDeckTypes' || step === 'syncTopDecks') ? 'mdm_deck_types' : 'ygoprodeck';
    await recordSync(source, 'failed', String(err?.message || err));
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json(await getSyncStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
