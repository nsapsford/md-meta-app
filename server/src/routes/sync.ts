import { Router, Request, Response } from 'express';
import {
  syncCards, syncArchetypes, syncDeckTypes, syncTopDecks,
  syncTournaments, syncUntapped, syncCardNegateEffectiveness
} from '../services/syncService.js';
import { recordSync, getSyncStatus, SyncSource } from '../services/syncStatusService.js';
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

interface SyncStage {
  key: 'cards' | 'deckTypes' | 'topDecks' | 'tournaments' | 'untappedArchetypes' | 'cardNegateEffectiveness';
  label: string;
  failSource: SyncSource;
  run: () => Promise<number>;
}

// Ordered stages of a full sync. Each resolves to a count and is reported as one
// progress tick so the client can render an accurate progress bar.
const FULL_SYNC_STAGES: SyncStage[] = [
  {
    key: 'cards', label: 'Cards', failSource: 'ygoprodeck',
    run: async () => { const c = await syncCards(); await syncArchetypes(); await recordSync('ygoprodeck', 'success'); return c; },
  },
  { key: 'deckTypes', label: 'Deck types', failSource: 'mdm_deck_types', run: () => syncDeckTypes() },
  {
    key: 'topDecks', label: 'Top decks', failSource: 'mdm_deck_types',
    run: async () => { const c = await syncTopDecks(); await recordSync('mdm_deck_types', 'success'); return c; },
  },
  {
    key: 'tournaments', label: 'Tournaments', failSource: 'mdm_tournaments',
    run: async () => { const c = await syncTournaments(); await recordSync('mdm_tournaments', 'success'); return c; },
  },
  {
    key: 'untappedArchetypes', label: 'Untapped archetypes', failSource: 'untapped',
    run: async () => { const c = await syncUntapped(); await recordSync('untapped', 'success'); return c; },
  },
  { key: 'cardNegateEffectiveness', label: 'Card negate data', failSource: 'ygoprodeck', run: () => syncCardNegateEffectiveness() },
];

export interface FullSyncProgress { index: number; total: number; label: string; key: SyncStage['key'] }

async function runFullSync(onProgress?: (p: FullSyncProgress) => void): Promise<Record<string, number>> {
  await clearCache('mdm');
  invalidateTierListCache();
  invalidateFeaturedCache();

  const total = FULL_SYNC_STAGES.length;
  const results: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    const stage = FULL_SYNC_STAGES[i];
    try {
      results[stage.key] = await stage.run();
    } catch (err: any) {
      await recordSync(stage.failSource, 'failed', String(err?.message || err));
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { stageLabel: stage.label });
    }
    onProgress?.({ index: i + 1, total, label: stage.label, key: stage.key });
  }
  return results;
}

router.post('/all', async (_req: Request, res: Response) => {
  try {
    const r = await runFullSync();
    res.json({
      message: 'Full sync complete',
      cards: r.cards, deckTypes: r.deckTypes, topDecks: r.topDecks,
      tournaments: r.tournaments, untappedArchetypes: r.untappedArchetypes,
      cardNegateEffectiveness: r.cardNegateEffectiveness,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Server-Sent Events variant of /all that streams per-stage progress so the
// client can render an accurate progress bar. EventSource only issues GET.
router.get('/all/stream', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (e.g. nginx)
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Prime the stream so the client shows 0% immediately.
  send('progress', { index: 0, total: FULL_SYNC_STAGES.length, label: 'Starting', key: 'cards' });

  try {
    const r = await runFullSync((p) => send('progress', p));
    send('done', { message: 'Full sync complete', ...r });
  } catch (err: any) {
    send('syncerror', { error: String(err?.message || err), stage: err?.stageLabel });
  } finally {
    res.end();
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
