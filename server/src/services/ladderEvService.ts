import type { Pool } from '@neondatabase/serverless';
import { queryAll } from '../utils/dbHelpers.js';
import { buildFullMatrix, type MatrixCell } from './matchupBlendService.js';

export interface MatchupSummary {
  opponent: string;
  win_rate: number;
  play_rate: number;
  confidence: 'high' | 'medium' | 'low';
  inferred: boolean;
}

export interface LadderEvResult {
  deck: string;
  tier: number | null;
  ev: number;
  n_effective: number;
  low_confidence_fraction: number;
  top_good_matchups: MatchupSummary[];
  top_bad_matchups: MatchupSummary[];
  coverage: number; // fraction of opponent pool with matchup data
}

export async function computeLadderEv(
  pool: Pool,
  source: string = 'blended',
  infer: boolean = true,
  includePersonal: boolean = false
): Promise<LadderEvResult[]> {
  const [matrix, deckRows] = await Promise.all([
    buildFullMatrix(pool, source, infer, includePersonal),
    queryAll<{ name: string; tier: number; play_rate: number | null }>(pool,
      'SELECT name, tier, play_rate FROM deck_types WHERE tier IS NOT NULL AND tier <= 3 ORDER BY tier, name'
    ),
  ]);

  // Build a play-rate map. Decks with null play_rate get a small baseline.
  const playRateMap = new Map<string, number>();
  for (const d of deckRows) {
    playRateMap.set(d.name, d.play_rate ?? 0.5);
  }
  const tierMap = new Map<string, number | null>(deckRows.map((d) => [d.name, d.tier]));

  const results: LadderEvResult[] = [];

  for (const deck of matrix.decks) {
    const row = matrix.matrix[deck];
    if (!row) continue;

    // Gather all opponent cells that have data
    const entries: Array<{ opponent: string; cell: MatrixCell; playRate: number }> = [];
    for (const opponent of matrix.decks) {
      if (opponent === deck) continue;
      const cell = row[opponent];
      if (!cell) continue;
      const pr = playRateMap.get(opponent) ?? 0;
      entries.push({ opponent, cell, playRate: pr });
    }

    if (entries.length === 0) {
      results.push({
        deck,
        tier: tierMap.get(deck) ?? null,
        ev: 0.5,
        n_effective: 0,
        low_confidence_fraction: 1,
        top_good_matchups: [],
        top_bad_matchups: [],
        coverage: 0,
      });
      continue;
    }

    // Normalize play rates over the opponents we have data for
    const totalPlayRate = entries.reduce((s, e) => s + e.playRate, 0) || 1;

    // EV = Σ(win_rate × normalized_play_rate)
    // Low-confidence cells are still counted but flagged
    let ev = 0;
    let nEffective = 0;
    let lowConfCount = 0;

    for (const { cell, playRate } of entries) {
      const weight = playRate / totalPlayRate;
      ev += cell.rate * weight;
      nEffective += (cell.n_untapped + cell.n_tournament) * weight;
      if (cell.confidence === 'low') lowConfCount++;
    }

    const lowConfFraction = entries.length > 0 ? lowConfCount / entries.length : 0;
    const coverage = entries.length / (matrix.decks.length - 1);

    // Sort by win rate for top/bottom matchups
    const sorted = entries
      .map(({ opponent, cell, playRate }) => ({
        opponent,
        win_rate: cell.rate,
        play_rate: playRate / totalPlayRate,
        confidence: cell.confidence,
        inferred: cell.inferred ?? false,
      }))
      .sort((a, b) => b.win_rate - a.win_rate);

    results.push({
      deck,
      tier: tierMap.get(deck) ?? null,
      ev,
      n_effective: Math.round(nEffective),
      low_confidence_fraction: lowConfFraction,
      top_good_matchups: sorted.slice(0, 3),
      top_bad_matchups: sorted.slice(-3).reverse(),
      coverage,
    });
  }

  return results.sort((a, b) => b.ev - a.ev);
}
