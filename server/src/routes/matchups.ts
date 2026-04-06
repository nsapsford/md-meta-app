import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { queryAll, run } from '../utils/dbHelpers.js';
import * as mdm from '../services/mdmService.js';
import { blendMatchupRates } from '../services/matchupBlendService.js';

const router = Router();

// Existing: per-deck matchup list (unchanged behaviour)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { deck } = req.query;
    const db = getDb();

    if (deck) {
      let rows = queryAll(db, 'SELECT * FROM matchups WHERE deck_a = ? COLLATE NOCASE', [deck as string]);
      if (rows.length === 0) {
        const scraped = await mdm.scrapeMatchups(deck as string);
        for (const m of scraped) {
          run(db, "INSERT OR REPLACE INTO matchups (deck_a, deck_b, win_rate_a, sample_size, updated_at) VALUES (?, ?, ?, ?, strftime('%s','now'))",
            [deck, m.opponent, m.winRate, m.sampleSize]);
        }
        rows = queryAll(db, 'SELECT * FROM matchups WHERE deck_a = ? COLLATE NOCASE', [deck as string]);
      }
      return res.json(rows);
    }

    res.json(queryAll(db, 'SELECT * FROM matchups ORDER BY deck_a, deck_b'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// New: full NxN heatmap matrix
router.get('/matrix', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string) || 'blended';
    const db = getDb();

    const decks = (queryAll(db,
      'SELECT name FROM deck_types WHERE tier IS NOT NULL AND tier <= 3 ORDER BY tier, name'
    ) as { name: string }[]).map((d) => d.name);

    const rows = queryAll(db, 'SELECT * FROM matchup_sources') as {
      deck_a: string; deck_b: string; source: string; win_rate: number; sample_size: number;
    }[];

    // Also pull from legacy matchups table (MDM-scraped data stored as percentages 0-100)
    const legacyRows = queryAll(db, 'SELECT deck_a, deck_b, win_rate_a, sample_size FROM matchups') as {
      deck_a: string; deck_b: string; win_rate_a: number; sample_size: number;
    }[];

    const matrix: Record<string, Record<string, {
      rate: number; n_untapped: number; n_tournament: number; confidence: string;
    }>> = {};

    for (const a of decks) {
      matrix[a] = {};
      for (const b of decks) {
        if (a === b) continue;

        const sourceRow  = rows.find((r) => r.deck_a === a && r.deck_b === b && r.source === 'untapped');
        const tournRow   = rows.find((r) => r.deck_a === a && r.deck_b === b && r.source === 'tournament');
        // Legacy MDM data is stored as 0-100 percentage — normalise to 0-1
        const legacyRow  = legacyRows.find((r) =>
          r.deck_a.toLowerCase() === a.toLowerCase() && r.deck_b.toLowerCase() === b.toLowerCase()
        );

        const untappedData = sourceRow
          ? { rate: sourceRow.win_rate, n: sourceRow.sample_size ?? 0 }
          : legacyRow
          ? { rate: legacyRow.win_rate_a / 100, n: legacyRow.sample_size ?? 0 }
          : null;
        const tournData = tournRow ? { rate: tournRow.win_rate, n: tournRow.sample_size ?? 0 } : null;

        if (!untappedData && !tournData) continue;
        if (source === 'tournament' && !tournData) continue;
        if (source === 'untapped' && !untappedData) continue;

        const blend = source === 'tournament'
          ? blendMatchupRates(null, tournData)
          : source === 'untapped'
          ? blendMatchupRates(untappedData, null)
          : blendMatchupRates(untappedData, tournData);

        matrix[a][b] = {
          rate: blend.rate,
          n_untapped: untappedData?.n ?? 0,
          n_tournament: tournData?.n ?? 0,
          confidence: blend.confidence,
        };
      }
    }

    res.json({ decks, matrix });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// New: meta advisor for a specific deck
router.get('/advisor', async (req: Request, res: Response) => {
  try {
    const { deck } = req.query;
    if (!deck) return res.status(400).json({ error: 'deck parameter required' });

    const db = getDb();

    // Field composition from last 3 tournaments
    const tournaments = queryAll(db,
      'SELECT placements_json FROM tournaments ORDER BY updated_at DESC LIMIT 3'
    ) as { placements_json: string }[];

    const deckCounts: Record<string, number> = {};
    let total = 0;
    for (const t of tournaments) {
      let placements: any[] = [];
      try { placements = JSON.parse(t.placements_json || '[]'); } catch { /* ignore parse errors */ }
      for (const p of placements) {
        const name: string | undefined = p.deck_type_name || p.deckType || p.deck || p.name;
        if (name) { deckCounts[name] = (deckCounts[name] || 0) + 1; total++; }
      }
    }

    if (total === 0) {
      return res.json({ deck, opponents: [], weighted_win_rate: 0.5, note: 'No tournament placement data available' });
    }

    // Matchup rates: prefer matchup_sources, fall back to legacy matchups table
    const matchupRows = queryAll(db,
      'SELECT * FROM matchup_sources WHERE deck_a = ? COLLATE NOCASE',
      [deck as string]
    ) as { deck_b: string; source: string; win_rate: number; sample_size: number }[];

    const legacyMatchups = queryAll(db,
      'SELECT deck_b, win_rate_a, sample_size FROM matchups WHERE deck_a = ? COLLATE NOCASE',
      [deck as string]
    ) as { deck_b: string; win_rate_a: number; sample_size: number }[];

    const opponents = Object.entries(deckCounts)
      .filter(([name]) => name.toLowerCase() !== (deck as string).toLowerCase())
      .map(([name, count]) => {
        const fieldPct = count / total;
        const untapRow = matchupRows.find((r) => r.deck_b === name && r.source === 'untapped');
        const tournRow = matchupRows.find((r) => r.deck_b === name && r.source === 'tournament');
        const legacyRow = legacyMatchups.find((r) => r.deck_b.toLowerCase() === name.toLowerCase());

        const untappedData = untapRow
          ? { rate: untapRow.win_rate, n: untapRow.sample_size ?? 0 }
          : legacyRow
          ? { rate: legacyRow.win_rate_a / 100, n: legacyRow.sample_size ?? 0 }
          : null;
        const tournData = tournRow ? { rate: tournRow.win_rate, n: tournRow.sample_size ?? 0 } : null;
        const blend = blendMatchupRates(untappedData, tournData);

        return { opponent: name, field_pct: fieldPct, win_rate: blend.rate, confidence: blend.confidence };
      })
      .sort((a, b) => b.field_pct - a.field_pct);

    const totalWeight = opponents.reduce((s, o) => s + o.field_pct, 0) || 1;
    const weightedWinRate = opponents.reduce((s, o) => s + o.win_rate * o.field_pct, 0) / totalWeight;

    res.json({ deck, opponents, weighted_win_rate: weightedWinRate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
