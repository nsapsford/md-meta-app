import { Router, Request, Response } from 'express';
import {
  syncCards, syncArchetypes, syncDeckTypes, syncTopDecks,
  syncTournaments, syncUntapped, syncCardNegateEffectiveness
} from '../services/syncService.js';
import { recordSync, getSyncStatus, SyncSource } from '../services/syncStatusService.js';
import { runFullSync } from '../services/fullSyncService.js';
import { clearCache } from '../services/cacheService.js';
import { config } from '../config.js';
import { updateTiersFromScrape } from '../services/tierListService.js';
import { invalidateTierListCache } from './tierList.js';
import { invalidateFeaturedCache } from './decks.js';

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

// Shares runFullSync with the scheduled job so the manual and automatic paths
// can't drift — including the derived-data and cache-refresh stages.
router.post('/all', async (_req: Request, res: Response) => {
  try {
    const result = await runFullSync();
    res.json({
      message: result.errors.length === 0
        ? 'Full sync complete'
        : `Full sync completed with ${result.errors.length} failed stage(s)`,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json(await getSyncStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run/:source', async (req: Request, res: Response) => {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!config.adminToken || token !== config.adminToken) {
    return void res.status(401).json({ error: 'Unauthorized' });
  }

  const source = req.params.source as SyncSource;
  try {
    switch (source) {
      case 'ygoprodeck':
        await syncCards();
        await syncArchetypes();
        await recordSync('ygoprodeck', 'success');
        break;
      case 'mdm_deck_types':
        await clearCache('mdm');
        invalidateTierListCache();
        invalidateFeaturedCache();
        await syncDeckTypes();
        await syncTopDecks();
        await updateTiersFromScrape();
        await recordSync('mdm_deck_types', 'success');
        break;
      case 'mdm_tournaments':
        await syncTournaments();
        await recordSync('mdm_tournaments', 'success');
        break;
      case 'untapped':
        await clearCache('untapped');
        await syncUntapped();
        await recordSync('untapped', 'success');
        break;
      default:
        return void res.status(400).json({ error: `Unknown source: ${source}` });
    }
    res.json({ ok: true, source });
  } catch (err: any) {
    await recordSync(source, 'failed', String(err?.message || err));
    res.status(500).json({ error: err.message });
  }
});

export default router;
