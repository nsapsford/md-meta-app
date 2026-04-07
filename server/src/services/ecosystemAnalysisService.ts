import type { Database } from 'sql.js';
import { queryAll } from '../utils/dbHelpers.js';
import { buildFullMatrix, type MatrixCell } from './matchupBlendService.js';

// ── Types ──

export interface PredatorPreyRelationship {
  predator: string;
  prey: string;
  win_rate: number;
  strength: 'hard_counter' | 'soft_counter' | 'slight_edge';
  meta_impact: number;
  confidence: 'high' | 'medium' | 'low';
  sample_size: number;
  mechanism: 'direct' | 'inferred';
}

export interface DeckEcosystemProfile {
  deck: string;
  tier: number | null;
  power: number | null;
  win_rate: number | null;
  play_rate: number | null;
  predators: PredatorPreyRelationship[];
  prey: PredatorPreyRelationship[];
  neutral: string[];
  polarization_index: number;
  suppression_score: number;
  vulnerability_score: number;
  meta_fitness: number;
  matchup_spread: number;
}

export interface RockPaperScissorsCycle {
  decks: string[];
  cycle_strength: number;
  meta_relevance: number;
}

export interface EcosystemAnalysis {
  profiles: DeckEcosystemProfile[];
  cycles: RockPaperScissorsCycle[];
  food_chain: PredatorPreyRelationship[];
  meta_health_index: number;
  computed_at: string;
}

// ── Helpers ──

interface DeckMeta {
  tier: number | null;
  power: number | null;
  win_rate: number | null;
  play_rate: number | null;
}

function classifyStrength(rate: number): 'hard_counter' | 'soft_counter' | 'slight_edge' {
  if (rate >= 0.60) return 'hard_counter';
  if (rate >= 0.55) return 'soft_counter';
  return 'slight_edge';
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 5) return 0;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// ── Main computation ──

export function computeEcosystemAnalysis(db: Database, source: string = 'blended'): EcosystemAnalysis {
  const { decks, matrix } = buildFullMatrix(db, source);

  // Load deck metadata
  const deckMetaRows = queryAll(db,
    'SELECT name, tier, power, win_rate, play_rate FROM deck_types WHERE name IN (' +
    decks.map(() => '?').join(',') + ')',
    decks
  ) as (DeckMeta & { name: string })[];

  const deckMeta: Record<string, DeckMeta> = {};
  for (const row of deckMetaRows) {
    // DB stores win_rate and play_rate as percentages (0-100); normalise to 0-1
    deckMeta[row.name] = {
      tier: row.tier,
      power: row.power,
      win_rate: row.win_rate != null ? row.win_rate / 100 : null,
      play_rate: row.play_rate != null ? row.play_rate / 100 : null,
    };
  }

  // Step 1: Classify all pairwise relationships
  const allRelationships: PredatorPreyRelationship[] = [];

  for (const a of decks) {
    for (const b of decks) {
      if (a === b) continue;
      const cell = matrix[a]?.[b];
      if (!cell) continue;
      if (cell.rate < 0.52) continue; // a doesn't have an edge over b

      const opponentPlayRate = deckMeta[b]?.play_rate ?? 0;
      const metaImpact = (cell.rate - 0.5) * opponentPlayRate;

      allRelationships.push({
        predator: a,
        prey: b,
        win_rate: cell.rate,
        strength: classifyStrength(cell.rate),
        meta_impact: metaImpact,
        confidence: cell.confidence,
        sample_size: cell.n_untapped + cell.n_tournament,
        mechanism: 'direct',
      });
    }
  }

  // Step 2: Tournament anti-correlation inference for missing pairs
  const inferredRelationships = inferFromTournamentCorrelation(db, decks, matrix, deckMeta);
  allRelationships.push(...inferredRelationships);

  // Step 3: Build per-deck profiles
  const profiles: DeckEcosystemProfile[] = decks.map((deck) => {
    const meta = deckMeta[deck] || { tier: null, power: null, win_rate: null, play_rate: null };

    const prey = allRelationships.filter((r) => r.predator === deck);
    const predators = allRelationships.filter((r) => r.prey === deck);
    const involvedDecks = new Set([...prey.map((r) => r.prey), ...predators.map((r) => r.predator)]);
    const neutral = decks.filter((d) => d !== deck && !involvedDecks.has(d));

    // Polarization: stdev of all win rates against opponents
    const rates: number[] = [];
    for (const other of decks) {
      if (other === deck) continue;
      const cell = matrix[deck]?.[other];
      if (cell) rates.push(cell.rate);
    }
    // Normalize: max theoretical stdev for rates in [0,1] is 0.5
    const polarizationIndex = rates.length >= 3 ? Math.min(stddev(rates) / 0.5, 1) : -1;

    // Matchup spread: best - worst
    const matchupSpread = rates.length >= 2 ? Math.max(...rates) - Math.min(...rates) : 0;

    // Suppression score: how much this deck's presence hurts others
    const myPlayRate = meta.play_rate ?? 0;
    let suppressionScore = 0;
    for (const r of prey) {
      suppressionScore += (r.win_rate - 0.5) * myPlayRate;
    }

    // Vulnerability score: how exposed to popular counters
    let vulnerabilityScore = 0;
    for (const r of predators) {
      const predatorPlayRate = deckMeta[r.predator]?.play_rate ?? 0;
      vulnerabilityScore += (r.win_rate - 0.5) * predatorPlayRate;
    }

    // Meta fitness: weighted win rate against the field (by play rate)
    let totalWeight = 0, weightedWR = 0;
    for (const other of decks) {
      if (other === deck) continue;
      const cell = matrix[deck]?.[other];
      const otherPlayRate = deckMeta[other]?.play_rate ?? 0;
      if (cell && otherPlayRate > 0) {
        weightedWR += cell.rate * otherPlayRate;
        totalWeight += otherPlayRate;
      }
    }
    const metaFitness = totalWeight > 0 ? weightedWR / totalWeight : (meta.win_rate ?? 0.5);

    return {
      deck,
      tier: meta.tier,
      power: meta.power,
      win_rate: meta.win_rate,
      play_rate: meta.play_rate,
      predators: predators.sort((a, b) => b.meta_impact - a.meta_impact),
      prey: prey.sort((a, b) => b.meta_impact - a.meta_impact),
      neutral,
      polarization_index: polarizationIndex,
      suppression_score: suppressionScore,
      vulnerability_score: vulnerabilityScore,
      meta_fitness: metaFitness,
      matchup_spread: matchupSpread,
    };
  });

  // Step 4: Detect RPS cycles (A>B>C>A where each edge >= 55%)
  const cycles = detectRPSCycles(decks, matrix, deckMeta);

  // Step 5: Meta health index
  const playRates = decks.map((d) => deckMeta[d]?.play_rate ?? 0).filter((r) => r > 0);
  let metaHealthIndex = 0.5;
  if (playRates.length >= 2) {
    const maxPR = Math.max(...playRates);
    const avgPR = playRates.reduce((s, v) => s + v, 0) / playRates.length;
    metaHealthIndex = maxPR > 0 ? 1 - (maxPR - avgPR) / maxPR : 0.5;
  }

  // Sort food chain by meta_impact descending
  const foodChain = [...allRelationships]
    .filter((r) => r.strength !== 'slight_edge')
    .sort((a, b) => b.meta_impact - a.meta_impact);

  return {
    profiles,
    cycles,
    food_chain: foodChain,
    meta_health_index: metaHealthIndex,
    computed_at: new Date().toISOString(),
  };
}

// ── Inference: Tournament anti-correlation ──

function inferFromTournamentCorrelation(
  db: Database,
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  deckMeta: Record<string, DeckMeta>,
): PredatorPreyRelationship[] {
  const inferred: PredatorPreyRelationship[] = [];

  // Get last 14+ days of snapshots
  const snapshots = queryAll(db,
    "SELECT deck_type_name, power, snapshot_date FROM meta_snapshots WHERE snapshot_date >= date('now', '-30 days') ORDER BY snapshot_date"
  ) as { deck_type_name: string; power: number; snapshot_date: string }[];

  if (snapshots.length < 10) return inferred;

  // Group by deck -> date-ordered power values
  const deckPowerSeries: Record<string, { date: string; power: number }[]> = {};
  for (const s of snapshots) {
    if (!deckPowerSeries[s.deck_type_name]) deckPowerSeries[s.deck_type_name] = [];
    deckPowerSeries[s.deck_type_name].push({ date: s.snapshot_date, power: s.power });
  }

  // For pairs without direct matchup data, check anti-correlation
  for (let i = 0; i < decks.length; i++) {
    for (let j = i + 1; j < decks.length; j++) {
      const a = decks[i], b = decks[j];
      // Skip if we already have direct data in both directions
      if (matrix[a]?.[b] && matrix[b]?.[a]) continue;

      const seriesA = deckPowerSeries[a];
      const seriesB = deckPowerSeries[b];
      if (!seriesA || !seriesB) continue;

      // Align on shared dates
      const datesA = new Map(seriesA.map((s) => [s.date, s.power]));
      const aligned: { pa: number; pb: number }[] = [];
      for (const sb of seriesB) {
        const pa = datesA.get(sb.date);
        if (pa !== undefined) aligned.push({ pa, pb: sb.power });
      }
      if (aligned.length < 5) continue;

      const r = pearsonCorrelation(aligned.map((p) => p.pa), aligned.map((p) => p.pb));
      if (r >= -0.5) continue; // Not anti-correlated enough

      // Strong anti-correlation: when A rises B falls → A might be suppressing B
      // Determine direction: the one currently rising is the predator
      const recentA = seriesA.slice(-5);
      const recentB = seriesB.slice(-5);
      const trendA = recentA.length >= 2 ? recentA[recentA.length - 1].power - recentA[0].power : 0;
      const trendB = recentB.length >= 2 ? recentB[recentB.length - 1].power - recentB[0].power : 0;

      const predator = trendA > trendB ? a : b;
      const prey = predator === a ? b : a;
      const opponentPlayRate = deckMeta[prey]?.play_rate ?? 0;

      inferred.push({
        predator,
        prey,
        win_rate: 0.55, // Estimated — we don't have exact data
        strength: 'soft_counter',
        meta_impact: 0.05 * opponentPlayRate, // Conservative estimate
        confidence: 'low',
        sample_size: 0,
        mechanism: 'inferred',
      });
    }
  }

  return inferred;
}

// ── RPS Cycle Detection ──

function detectRPSCycles(
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  deckMeta: Record<string, DeckMeta>,
): RockPaperScissorsCycle[] {
  const cycles: RockPaperScissorsCycle[] = [];

  // Build adjacency: edge A->B if A has >= 55% vs B
  const edges: Record<string, Set<string>> = {};
  const edgeRates: Record<string, number> = {};
  for (const a of decks) {
    edges[a] = new Set();
    for (const b of decks) {
      if (a === b) continue;
      const cell = matrix[a]?.[b];
      if (cell && cell.rate >= 0.55) {
        edges[a].add(b);
        edgeRates[`${a}|${b}`] = cell.rate;
      }
    }
  }

  // Find all 3-cycles
  const seen = new Set<string>();
  for (const a of decks) {
    for (const b of edges[a] || []) {
      for (const c of edges[b] || []) {
        if (c === a || c === b) continue;
        if (!edges[c]?.has(a)) continue;

        const key = [a, b, c].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const strength = (
          edgeRates[`${a}|${b}`] + edgeRates[`${b}|${c}`] + edgeRates[`${c}|${a}`]
        ) / 3;

        const relevance = (
          (deckMeta[a]?.play_rate ?? 0) +
          (deckMeta[b]?.play_rate ?? 0) +
          (deckMeta[c]?.play_rate ?? 0)
        );

        cycles.push({
          decks: [a, b, c],
          cycle_strength: strength,
          meta_relevance: relevance,
        });
      }
    }
  }

  // Sort by relevance, limit to top 5
  return cycles.sort((a, b) => b.meta_relevance - a.meta_relevance).slice(0, 5);
}
