import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { config } from './config.js';
import 'dotenv/config';
import { initDb, getPool } from './db/connection.js';
import { queryOne } from './utils/dbHelpers.js';
import cardsRouter from './routes/cards.js';
import tierListRouter, { warmTierListCache } from './routes/tierList.js';
import decksRouter, { warmFeaturedCache } from './routes/decks.js';
import matchupsRouter from './routes/matchups.js';
import banListRouter from './routes/banList.js';
import metaTrendsRouter from './routes/metaTrends.js';
import tournamentsRouter from './routes/tournaments.js';
import deckBuilderRouter from './routes/deckBuilder.js';
import syncRouter from './routes/sync.js';
import personalGamesRouter from './routes/personalGames.js';
import deckIORouter from './routes/deckIO.js';
import dossiersRouter from './routes/dossiers.js';
import authRouter from './routes/auth.js';
import { syncCards, syncArchetypes, syncDeckTypes, syncTopDecks, syncTournaments, syncUntapped, computeDeckTypeCards } from './services/syncService.js';
import { updateTiersFromScrape } from './services/tierListService.js';
import { recordSync } from './services/syncStatusService.js';

async function main() {
  // Init DB first
  await initDb();

  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));

  const allowedOrigins: (string | RegExp)[] = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://localhost', 'capacitor://localhost'];
  // Vercel preview deployments get a unique per-branch subdomain, which an
  // exact-match CORS_ORIGIN list can never cover — accept this project's
  // preview origins (md-meta-app-*-nsapsfords-projects.vercel.app) as well.
  allowedOrigins.push(/^https:\/\/md-meta-app-[a-z0-9-]+-nsapsfords-projects\.vercel\.app$/);
  app.use(cors({ origin: allowedOrigins }));

  app.use(express.json());

  // Routes
  app.use('/api/cards', cardsRouter);
  app.use('/api/tier-list', tierListRouter);
  app.use('/api/decks', decksRouter);
  app.use('/api/matchups', matchupsRouter);
  app.use('/api/ban-list', banListRouter);
  app.use('/api/meta-trends', metaTrendsRouter);
  app.use('/api/tournaments', tournamentsRouter);
  app.use('/api/deck-builder', deckBuilderRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/personal-games', personalGamesRouter);
  app.use('/api/decks-io', deckIORouter);
  app.use('/api/dossiers', dossiersRouter);
  app.use('/api/auth', authRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Warm tier-list + featured caches immediately after startup (non-blocking)
  // This ensures the first real user request hits in-memory cache, not cold DB
  setTimeout(() => {
    warmTierListCache().catch((e: any) => console.error('[Warmup] tier-list failed:', e?.message));
    warmFeaturedCache().catch((e: any) => console.error('[Warmup] featured failed:', e?.message));
  }, 2000); // 2s delay so DB connection pool is fully ready

  // Initial data sync on startup (non-blocking)
  (async () => {
    try {
      const pool = getPool();
      const cardCount = await queryOne(pool, 'SELECT COUNT(*) as c FROM cards');
      if (!cardCount || cardCount.c === 0) {
        console.log('[Startup] No cards found, running initial sync...');
        await syncCards();
        await syncArchetypes();
        console.log('[Startup] Card sync complete');
      }

      const dtCount = await queryOne(pool, 'SELECT COUNT(*) as c FROM deck_types');
      if (!dtCount || dtCount.c === 0) {
        console.log('[Startup] No deck types found, syncing meta data...');
        await syncDeckTypes();
        await syncTopDecks();
        await syncTournaments();
        await updateTiersFromScrape();
        await computeDeckTypeCards();
        console.log('[Startup] Meta sync complete');
      } else {
        // Ensure computed_cards_json is populated (handles first deploy with new column)
        const uncomputed = await queryOne(pool,
          'SELECT COUNT(*) as c FROM deck_types WHERE computed_cards_json IS NULL');
        if (uncomputed && uncomputed.c > 0) {
          console.log(`[Startup] Computing card images for ${uncomputed.c} deck types...`);
          computeDeckTypeCards().catch((e: any) =>
            console.error('[Startup] computeDeckTypeCards failed:', e?.message));
        }
      }
    } catch (err) {
      console.error('[Startup] Initial sync failed:', err);
    }
  })();

  // Scheduled syncs — per-source schedules
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Running deck-type sync...');
    try {
      await syncDeckTypes();
      await syncTopDecks();
      await updateTiersFromScrape();
      await computeDeckTypeCards();
      await recordSync('mdm_deck_types', 'success');
    } catch (err: any) {
      await recordSync('mdm_deck_types', 'failed', String(err?.message || err));
      console.error('[Cron] Deck-type sync failed:', err);
    }
  });

  cron.schedule('0 */2 * * *', async () => {
    console.log('[Cron] Running tournament sync...');
    try {
      await syncTournaments();
      await recordSync('mdm_tournaments', 'success');
    } catch (err: any) {
      await recordSync('mdm_tournaments', 'failed', String(err?.message || err));
      console.error('[Cron] Tournament sync failed:', err);
    }
  });

  cron.schedule('0 */3 * * *', async () => {
    console.log('[Cron] Running untapped sync...');
    try {
      await syncUntapped();
      await recordSync('untapped', 'success');
    } catch (err: any) {
      await recordSync('untapped', 'failed', String(err?.message || err));
      console.error('[Cron] Untapped sync failed:', err);
    }
  });

  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron] Running card sync...');
    try {
      await syncCards();
      await syncArchetypes();
      await recordSync('ygoprodeck', 'success');
    } catch (err: any) {
      await recordSync('ygoprodeck', 'failed', String(err?.message || err));
      console.error('[Cron] Card sync failed:', err);
    }
  });

  app.listen(config.port, () => {
    console.log(`[Server] Running on http://localhost:${config.port}`);
  });
}

main().catch(console.error);
