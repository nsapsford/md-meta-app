import type { Database } from 'sql.js';
import { queryAll } from '../utils/dbHelpers.js';

export interface MatchupSource {
  rate: number;
  n: number;
}

export interface BlendResult {
  rate: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface MatrixCell {
  rate: number;
  n_untapped: number;
  n_tournament: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface FullMatrix {
  decks: string[];
  matrix: Record<string, Record<string, MatrixCell>>;
}

export function blendMatchupRates(
  untapped: MatchupSource | null,
  tournament: MatchupSource | null,
  weights = { untapped: 0.7, tournament: 0.3 }
): BlendResult {
  if (!untapped && !tournament) return { rate: 0.5, confidence: 'low' };
  if (!untapped) return { rate: tournament!.rate, confidence: tournament!.n >= 30 ? 'medium' : 'low' };
  if (!tournament) return { rate: untapped.rate, confidence: untapped.n >= 100 ? 'high' : 'medium' };
  const rate = untapped.rate * weights.untapped + tournament.rate * weights.tournament;
  return { rate, confidence: 'high' };
}

/**
 * Build the full NxN matchup matrix for tier 1-3 decks, blending data sources.
 */
export function buildFullMatrix(db: Database, source: string = 'blended'): FullMatrix {
  const decks = (queryAll(db,
    'SELECT name FROM deck_types WHERE tier IS NOT NULL AND tier <= 3 ORDER BY tier, name'
  ) as { name: string }[]).map((d) => d.name);

  const rows = queryAll(db, 'SELECT * FROM matchup_sources') as {
    deck_a: string; deck_b: string; source: string; win_rate: number; sample_size: number;
  }[];

  const legacyRows = queryAll(db, 'SELECT deck_a, deck_b, win_rate_a, sample_size FROM matchups') as {
    deck_a: string; deck_b: string; win_rate_a: number; sample_size: number;
  }[];

  const matrix: Record<string, Record<string, MatrixCell>> = {};

  for (const a of decks) {
    matrix[a] = {};
    for (const b of decks) {
      if (a === b) continue;

      const al = a.toLowerCase(), bl = b.toLowerCase();
      const sourceRow  = rows.find((r) => r.deck_a.toLowerCase() === al && r.deck_b.toLowerCase() === bl && r.source === 'untapped');
      const tournRow   = rows.find((r) => r.deck_a.toLowerCase() === al && r.deck_b.toLowerCase() === bl && r.source === 'tournament');
      const legacyRow  = legacyRows.find((r) => r.deck_a.toLowerCase() === al && r.deck_b.toLowerCase() === bl);

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

  return { decks, matrix };
}
