import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, run } from '../utils/dbHelpers.js';
import * as mdm from '../services/mdmService.js';
import { blendMatchupRates, buildFullMatrix } from '../services/matchupBlendService.js';
import { computeEcosystemAnalysis } from '../services/ecosystemAnalysisService.js';
import { computeLadderEv } from '../services/ladderEvService.js';

const router = Router();

// Existing: per-deck matchup list (unchanged behaviour)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { deck } = req.query;
    const pool = getPool();

    if (deck) {
      let rows = await queryAll(pool, 'SELECT * FROM matchups WHERE LOWER(deck_a) = LOWER($1)', [deck as string]);
      if (rows.length === 0) {
        const scraped = await mdm.scrapeMatchups(deck as string);
        for (const m of scraped) {
          await run(pool, "INSERT INTO matchups (deck_a, deck_b, win_rate_a, sample_size, updated_at) VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT (deck_a, deck_b) DO UPDATE SET win_rate_a = EXCLUDED.win_rate_a, sample_size = EXCLUDED.sample_size, updated_at = EXCLUDED.updated_at",
            [deck, m.opponent, m.winRate, m.sampleSize]);
        }
        rows = await queryAll(pool, 'SELECT * FROM matchups WHERE LOWER(deck_a) = LOWER($1)', [deck as string]);
      }
      return res.json(rows);
    }

    res.json(await queryAll(pool, 'SELECT * FROM matchups ORDER BY deck_a, deck_b'));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// New: full NxN heatmap matrix
router.get('/matrix', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string) || 'blended';
    const infer = req.query.infer === 'true';
    const includePersonal = req.query.include_personal === 'true';
    const pool = getPool();
    res.json(await buildFullMatrix(pool, source, infer, includePersonal));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// New: ecosystem analysis with predator/prey dynamics
router.get('/ecosystem', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string) || 'blended';
    const deckFilter = req.query.deck as string | undefined;
    const pool = getPool();
    const analysis = await computeEcosystemAnalysis(pool, source);

    if (deckFilter) {
      const profile = analysis.profiles.find(
        (p) => p.deck.toLowerCase() === deckFilter.toLowerCase()
      );
      const relatedCycles = analysis.cycles.filter(
        (c) => c.decks.some((d) => d.toLowerCase() === deckFilter.toLowerCase())
      );
      return res.json({
        profile: profile || null,
        related_cycles: relatedCycles,
        meta_health_index: analysis.meta_health_index,
        computed_at: analysis.computed_at,
      });
    }

    res.json(analysis);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// New: meta advisor for a specific deck
router.get('/advisor', async (req: Request, res: Response) => {
  try {
    const { deck } = req.query;
    const includePersonal = req.query.include_personal === 'true';
    if (!deck) return res.status(400).json({ error: 'deck parameter required' });

    const pool = getPool();

    // Field composition from last 3 tournaments
    const tournaments = await queryAll(pool,
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
    const matchupRows = await queryAll(pool,
      'SELECT * FROM matchup_sources WHERE LOWER(deck_a) = LOWER($1)',
      [deck as string]
    ) as { deck_b: string; source: string; win_rate: number; sample_size: number }[];

    const legacyMatchups = await queryAll(pool,
      'SELECT deck_b, win_rate_a, sample_size FROM matchups WHERE LOWER(deck_a) = LOWER($1)',
      [deck as string]
    ) as { deck_b: string; win_rate_a: number; sample_size: number }[];

    // Personal game spread (keyed by opponent name lowercase)
    const personalSpread = new Map<string, { rate: number; n: number }>();
    if (includePersonal) {
      const personalRows = await queryAll(pool,
        `SELECT opponent_deck,
           SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END)::INTEGER AS wins,
           COUNT(*)::INTEGER AS total
         FROM personal_games
         WHERE LOWER(deck_played) = LOWER($1)
         GROUP BY opponent_deck`,
        [deck as string]
      ) as { opponent_deck: string; wins: number; total: number }[];
      for (const r of personalRows) {
        if (r.total > 0) {
          personalSpread.set(r.opponent_deck.toLowerCase(), { rate: r.wins / r.total, n: r.total });
        }
      }
    }

    const opponents = Object.entries(deckCounts)
      .filter(([name]) => name.toLowerCase() !== (deck as string).toLowerCase())
      .map(([name, count]) => {
        const fieldPct = count / total;
        const nl = name.toLowerCase();
        const untapRow = matchupRows.find((r) => r.deck_b.toLowerCase() === nl && r.source === 'untapped');
        const tournRow = matchupRows.find((r) => r.deck_b.toLowerCase() === nl && r.source === 'tournament');
        const legacyRow = legacyMatchups.find((r) => r.deck_b.toLowerCase() === name.toLowerCase());

        const untappedData = untapRow
          ? { rate: untapRow.win_rate, n: untapRow.sample_size ?? 0 }
          : legacyRow
          ? { rate: legacyRow.win_rate_a / 100, n: legacyRow.sample_size ?? 0 }
          : null;
        const tournData = tournRow ? { rate: tournRow.win_rate, n: tournRow.sample_size ?? 0 } : null;
        const personalData = includePersonal ? personalSpread.get(nl) ?? null : null;
        const blend = blendMatchupRates(untappedData, tournData, personalData);

        return { opponent: name, field_pct: fieldPct, win_rate: blend.rate, confidence: blend.confidence };
      })
      .sort((a, b) => b.field_pct - a.field_pct);

    const totalWeight = opponents.reduce((s, o) => s + o.field_pct, 0) || 1;
    const weightedWinRate = opponents.reduce((s, o) => s + o.win_rate * o.field_pct, 0) / totalWeight;

    res.json({ deck, opponents, weighted_win_rate: weightedWinRate });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Ladder EV ranking
router.get('/ladder-ev', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string) || 'blended';
    const infer = req.query.infer !== 'false'; // default true
    const includePersonal = req.query.include_personal === 'true';
    const pool = getPool();
    const results = await computeLadderEv(pool, source, infer, includePersonal);
    res.json(results);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
