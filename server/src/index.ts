import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cron from 'node-cron';
import { config } from './config.js';
import { initDb, getPool } from './db/connection.js';
import { queryOne } from './utils/dbHelpers.js';
import cardsRouter from './routes/cards.js';
import tierListRouter, { warmTierListCache } from './routes/tierList.js';
import decksRouter, { warmFeaturedCache } from './routes/decks.js';
import matchupsRouter from './routes/matchups.js';
import banListRouter from './routes/banList.js';
import metaTrendsRouter from './routes/metaTrends.js';
import metaRouter from './routes/meta.js';
import tournamentsRouter from './routes/tournaments.js';
import deckBuilderRouter from './routes/deckBuilder.js';
import syncRouter from './routes/sync.js';
import personalGamesRouter from './routes/personalGames.js';
import deckIORouter from './routes/deckIO.js';
import dossiersRouter from './routes/dossiers.js';
import linesRouter from './routes/lines.js';
import authRouter from './routes/auth.js';
import { syncCards, syncArchetypes, syncDeckTypes, syncTopDecks, syncTournaments, computeDeckTypeCards } from './services/syncService.js';
import { updateTiersFromScrape } from './services/tierListService.js';
import { runFullSync } from './services/fullSyncService.js';
import { isSyncStale } from './services/syncStatusService.js';

// Matches the twice-daily cron cadence below. A host that spins the service
// down on idle (e.g. Render's free tier) can miss a scheduled run entirely —
// kill the process and node-cron's timer dies with it, with no catch-up — so
// anything that wakes the process (a real request, or the external pinger in
// .github/workflows/sync-wake.yml) also checks staleness and catches up.
const SYNC_STALE_SECONDS = 12 * 60 * 60;

async function main() {
  // Init DB first
  await initDb();

  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  // gzip JSON responses. The matchup matrix, meta trends and deck profiles are
  // large, highly repetitive JSON; uncompressed they dominate transfer time on
  // a phone connection. (A proxy in front that already compresses sees
  // Content-Encoding set and leaves the body alone.)
  app.use(compression());

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
  app.use('/api/meta', metaRouter);
  app.use('/api/tournaments', tournamentsRouter);
  app.use('/api/deck-builder', deckBuilderRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/personal-games', personalGamesRouter);
  app.use('/api/decks-io', deckIORouter);
  app.use('/api/dossiers', dossiersRouter);
  app.use('/api/lines', linesRouter);
  app.use('/api/auth', authRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    // Render sets RENDER_GIT_COMMIT, so this shows which build is live.
    res.json({ status: 'ok', time: new Date().toISOString(), commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null });
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

        // Data already exists, so this isn't a fresh deploy — but if every
        // source is stale, the process was very likely asleep (or crash-
        // looping) through its last scheduled sync. Catch up immediately
        // instead of waiting for the next fixed cron time.
        if (await isSyncStale(SYNC_STALE_SECONDS)) {
          console.log('[Startup] Sync data is stale — catching up now...');
          void runFullSync();
        }
      }
    } catch (err) {
      console.error('[Startup] Initial sync failed:', err);
    }
  })();

  // Scheduled sync — every source plus its derived data, twice daily.
  // node-cron reads the host clock unless told otherwise, so pin UTC explicitly.
  cron.schedule('0 6,18 * * *', () => {
    console.log('[Cron] Running scheduled full sync...');
    void runFullSync();
  }, { timezone: 'Etc/UTC' });

  // Safety net for while the process is actually running: node-cron only
  // fires at the exact scheduled minute, so a restart that lands a few
  // minutes either side of 06:00/18:00 can still miss a run. Checking
  // hourly catches that without waiting up to 12h for the next fixed slot.
  setInterval(() => {
    isSyncStale(SYNC_STALE_SECONDS)
      .then((stale) => {
        if (stale) {
          console.log('[Cron] Sync data is stale — running catch-up sync...');
          void runFullSync();
        }
      })
      .catch((e: any) => console.error('[Cron] Staleness check failed:', e?.message));
  }, 60 * 60 * 1000);

  app.listen(config.port, () => {
    console.log(`[Server] Running on http://localhost:${config.port}`);
  });
}

main().catch(console.error);
