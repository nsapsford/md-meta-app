import type { Pool } from '@neondatabase/serverless';
import { queryAll } from '../utils/dbHelpers.js';
import { computeEcosystemAnalysis } from './ecosystemAnalysisService.js';

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
  inferred?: boolean;
  inference_method?: string;
}

export interface FullMatrix {
  decks: string[];
  matrix: Record<string, Record<string, MatrixCell>>;
}

export function blendMatchupRates(
  untapped: MatchupSource | null,
  tournament: MatchupSource | null,
  personal: MatchupSource | null = null,
  weights = { untapped: 0.7, tournament: 0.3 }
): BlendResult {
  // When personal has enough data, blend it in with weight 0.4
  if (personal && personal.n >= 10) {
    const personalWeight = 0.4;
    const baseWeight = 1 - personalWeight;
    let baseRate: number;
    let baseConfidence: 'high' | 'medium' | 'low';
    if (untapped && tournament) {
      const uFrac = weights.untapped / (weights.untapped + weights.tournament);
      const tFrac = 1 - uFrac;
      baseRate = untapped.rate * uFrac + tournament.rate * tFrac;
      baseConfidence = 'high';
    } else if (untapped) {
      baseRate = untapped.rate;
      baseConfidence = untapped.n >= 100 ? 'high' : 'medium';
    } else if (tournament) {
      baseRate = tournament.rate;
      baseConfidence = tournament.n >= 30 ? 'medium' : 'low';
    } else {
      baseRate = 0.5;
      baseConfidence = 'low';
    }
    const rate = baseRate * baseWeight + personal.rate * personalWeight;
    const confidence = baseConfidence === 'low' ? 'medium' : baseConfidence;
    return { rate, confidence };
  }

  if (!untapped && !tournament) return { rate: 0.5, confidence: 'low' };
  if (!untapped) return { rate: tournament!.rate, confidence: tournament!.n >= 30 ? 'medium' : 'low' };
  if (!tournament) return { rate: untapped.rate, confidence: untapped.n >= 100 ? 'high' : 'medium' };
  const rate = untapped.rate * weights.untapped + tournament.rate * weights.tournament;
  return { rate, confidence: 'high' };
}

/**
 * Build the full NxN matchup matrix for tier 1-3 decks, blending data sources.
 * When infer=true, fills gaps using ecosystem analysis (predator/prey relationships,
 * inverse matchups, and win-rate estimation).
 */
export async function buildFullMatrix(
  pool: Pool,
  source: string = 'blended',
  infer: boolean = false,
  includePersonal: boolean = false
): Promise<FullMatrix> {
  const decks = (await queryAll(pool,
    'SELECT name FROM deck_types WHERE tier IS NOT NULL AND tier <= 3 ORDER BY tier, name'
  ) as { name: string }[]).map((d) => d.name);

  const rows = await queryAll(pool, 'SELECT * FROM matchup_sources') as {
    deck_a: string; deck_b: string; source: string; win_rate: number; sample_size: number;
  }[];

  const legacyRows = await queryAll(pool, 'SELECT deck_a, deck_b, win_rate_a, sample_size FROM matchups') as {
    deck_a: string; deck_b: string; win_rate_a: number; sample_size: number;
  }[];

  // Load personal spread if requested
  type PersonalSpreadRow = { deck_played: string; opponent_deck: string; wins: number; total: number };
  const personalRows: PersonalSpreadRow[] = includePersonal
    ? await queryAll(pool, `
        SELECT deck_played, opponent_deck,
          SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END)::INTEGER AS wins,
          COUNT(*)::INTEGER AS total
        FROM personal_games
        GROUP BY deck_played, opponent_deck
      `)
    : [];

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

      const personalRow = personalRows.find(
        (r) => r.deck_played.toLowerCase() === al && r.opponent_deck.toLowerCase() === bl
      );
      const personalData = personalRow && personalRow.total > 0
        ? { rate: personalRow.wins / personalRow.total, n: personalRow.total }
        : null;

      if (!untappedData && !tournData && !personalData) continue;
      if (source === 'tournament' && !tournData) continue;
      if (source === 'untapped' && !untappedData) continue;

      const blend = source === 'tournament'
        ? blendMatchupRates(null, tournData, personalData)
        : source === 'untapped'
        ? blendMatchupRates(untappedData, null, personalData)
        : blendMatchupRates(untappedData, tournData, personalData);

      matrix[a][b] = {
        rate: blend.rate,
        n_untapped: untappedData?.n ?? 0,
        n_tournament: tournData?.n ?? 0,
        confidence: blend.confidence,
      };
    }
  }

  // Fill gaps with inferred data from ecosystem analysis
  if (infer) {
    await fillMatrixGaps(pool, decks, matrix, source);
  }

  return { decks, matrix };
}

/**
 * Fill empty matrix cells using multiple inference strategies:
 * 1. Inverse: if B vs A exists, A vs B = 1 - B_vs_A
 * 2. Ecosystem predator/prey relationships (direct + tournament-correlated)
 * 3. Win-rate estimation from overall deck strength
 */
async function fillMatrixGaps(
  pool: Pool,
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  source: string
): Promise<void> {
  // Pass 1: Inverse inference — if we have B vs A but not A vs B
  for (const a of decks) {
    for (const b of decks) {
      if (a === b || matrix[a]?.[b]) continue;
      const inverse = matrix[b]?.[a];
      if (inverse) {
        if (!matrix[a]) matrix[a] = {};
        matrix[a][b] = {
          rate: 1 - inverse.rate,
          n_untapped: inverse.n_untapped,
          n_tournament: inverse.n_tournament,
          confidence: inverse.confidence,
          inferred: true,
          inference_method: 'inverse',
        };
      }
    }
  }

  // Pass 2: Ecosystem relationships (predator/prey + anti-correlation)
  try {
    const ecosystem = await computeEcosystemAnalysis(pool, source);
    const deckSet = new Set(decks.map((d) => d.toLowerCase()));

    for (const profile of ecosystem.profiles) {
      const aName = decks.find((d) => d.toLowerCase() === profile.deck.toLowerCase());
      if (!aName) continue;

      // From prey relationships: this deck beats prey
      for (const rel of profile.prey) {
        const bName = decks.find((d) => d.toLowerCase() === rel.prey.toLowerCase());
        if (!bName || aName === bName) continue;
        if (matrix[aName]?.[bName]) continue; // don't overwrite real data
        if (!matrix[aName]) matrix[aName] = {};
        matrix[aName][bName] = {
          rate: rel.win_rate,
          n_untapped: 0,
          n_tournament: 0,
          confidence: rel.confidence,
          inferred: true,
          inference_method: rel.mechanism === 'inferred' ? 'anti-correlation' : 'ecosystem',
        };
      }

      // From predator relationships: this deck loses to predators
      for (const rel of profile.predators) {
        const bName = decks.find((d) => d.toLowerCase() === rel.predator.toLowerCase());
        if (!bName || aName === bName) continue;
        if (matrix[aName]?.[bName]) continue;
        if (!matrix[aName]) matrix[aName] = {};
        matrix[aName][bName] = {
          rate: 1 - rel.win_rate, // flip: predator's win_rate is their advantage
          n_untapped: 0,
          n_tournament: 0,
          confidence: rel.confidence,
          inferred: true,
          inference_method: rel.mechanism === 'inferred' ? 'anti-correlation' : 'ecosystem',
        };
      }
    }

    // Pass 3: Win-rate estimation for remaining gaps
    // Estimate from overall win rates: E(A vs B) ≈ wrA / (wrA + wrB)
    const wrMap = new Map<string, number>();
    const powerMap = new Map<string, number>();
    for (const p of ecosystem.profiles) {
      if (p.win_rate != null) wrMap.set(p.deck.toLowerCase(), p.win_rate);
      if (p.power != null) powerMap.set(p.deck.toLowerCase(), p.power);
    }

    for (const a of decks) {
      for (const b of decks) {
        if (a === b || matrix[a]?.[b]) continue;
        const wrA = wrMap.get(a.toLowerCase());
        const wrB = wrMap.get(b.toLowerCase());
        if (wrA == null || wrB == null) continue;
        // Bradley-Terry model: P(A beats B) ≈ wrA / (wrA + wrB)
        const estimated = wrA / (wrA + wrB);
        if (!matrix[a]) matrix[a] = {};
        matrix[a][b] = {
          rate: estimated,
          n_untapped: 0,
          n_tournament: 0,
          confidence: 'low',
          inferred: true,
          inference_method: 'win-rate-model',
        };
      }
    }

    // Pass 4: Power-based estimation for decks with no win rate
    // Use MDM power rating as a proxy: normalize to 0-1 range, apply Bradley-Terry
    if (powerMap.size > 0) {
      const maxPower = Math.max(...powerMap.values());
      const minPower = Math.min(...powerMap.values());
      const range = maxPower - minPower || 1;

      for (const a of decks) {
        for (const b of decks) {
          if (a === b || matrix[a]?.[b]) continue;
          // Use win rate if available, otherwise estimate from power
          const sA = wrMap.get(a.toLowerCase()) ?? (powerMap.has(a.toLowerCase())
            ? 0.45 + 0.10 * ((powerMap.get(a.toLowerCase())! - minPower) / range)
            : null);
          const sB = wrMap.get(b.toLowerCase()) ?? (powerMap.has(b.toLowerCase())
            ? 0.45 + 0.10 * ((powerMap.get(b.toLowerCase())! - minPower) / range)
            : null);
          if (sA == null || sB == null) continue;
          const estimated = sA / (sA + sB);
          if (!matrix[a]) matrix[a] = {};
          matrix[a][b] = {
            rate: estimated,
            n_untapped: 0,
            n_tournament: 0,
            confidence: 'low',
            inferred: true,
            inference_method: 'power-model',
          };
        }
      }
    }
  } catch {
    // If ecosystem computation fails, gaps remain unfilled
  }
}
