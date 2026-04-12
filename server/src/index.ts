import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { config } from './config.js';
import 'dotenv/config';
import { initDb, getPool } from './db/connection.js';
import { queryOne } from './utils/dbHelpers.js';
import cardsRouter from './routes/cards.js';
import tierListRouter from './routes/tierList.js';
import decksRouter from './routes/decks.js';
import matchupsRouter from './routes/matchups.js';
import banListRouter from './routes/banList.js';
import metaTrendsRouter from './routes/metaTrends.js';
import tournamentsRouter from './routes/tournaments.js';
import deckBuilderRouter from './routes/deckBuilder.js';
import syncRouter from './routes/sync.js';
import { syncCards, syncArchetypes, syncDeckTypes, syncTopDecks, syncTournaments, syncUntapped } from './services/syncService.js';
import { updateTiersFromScrape } from './services/tierListService.js';

async function main() {
  // Init DB first
  await initDb();

  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
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

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

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
        console.log('[Startup] Meta sync complete');
      }
    } catch (err) {
      console.error('[Startup] Initial sync failed:', err);
    }
  })();

  // Scheduled syncs
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Running meta sync...');
    try {
      await syncDeckTypes();
      await syncTopDecks();
      await syncTournaments();
      await updateTiersFromScrape();
      await syncUntapped();
    } catch (err) {
      console.error('[Cron] Meta sync failed:', err);
    }
  });

  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron] Running card sync...');
    try {
      await syncCards();
      await syncArchetypes();
    } catch (err) {
      console.error('[Cron] Card sync failed:', err);
    }
  });

  app.listen(config.port, () => {
    console.log(`[Server] Running on http://localhost:${config.port}`);
  });
}

main().catch(console.error);
