import type { Pool } from '@neondatabase/serverless';
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

export interface GameTheoryProfile {
  expected_payoff: number;         // expected WR against current field distribution
  nash_deviation: number;          // how far current play rate is from Nash equilibrium (-1 to 1)
  best_response_to: string | null; // this deck is the optimal counter-pick to which popular deck
  dominated_by: string[];          // decks that beat this one in EVERY matchup it plays
  dominates: string[];             // decks this one beats in EVERY matchup they play
  strategy_type: 'dominant' | 'counter_pick' | 'generalist' | 'niche' | 'dominated';
}

export interface TournamentFieldEntry {
  deck: string;
  field_pct: number;
  top_cut_pct: number;
  conversion_rate: number; // top_cut_pct / field_pct — how well it converts
  appearances: number;
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
  game_theory: GameTheoryProfile;
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
  tournament_field: TournamentFieldEntry[];
  nash_equilibrium: Record<string, number>; // deck -> optimal play rate
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

// ── Tournament field composition ──

async function buildTournamentField(pool: Pool, decks: string[]): Promise<TournamentFieldEntry[]> {
  const tournaments = await queryAll(pool,
    'SELECT placements_json FROM tournaments ORDER BY updated_at DESC LIMIT 5'
  ) as { placements_json: string }[];

  const deckCounts: Record<string, { total: number; topCut: number }> = {};
  let grandTotal = 0;

  for (const t of tournaments) {
    let placements: any[] = [];
    try { placements = JSON.parse(t.placements_json || '[]'); } catch { continue; }

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const name: string | undefined = p.deck_type_name || p.deckType || p.deck || p.name;
      if (!name) continue;

      if (!deckCounts[name]) deckCounts[name] = { total: 0, topCut: 0 };
      deckCounts[name].total++;
      // Top cut = top 25% of placements
      if (i < placements.length * 0.25) deckCounts[name].topCut++;
      grandTotal++;
    }
  }

  if (grandTotal === 0) return [];

  const deckSet = new Set(decks.map((d) => d.toLowerCase()));
  return Object.entries(deckCounts)
    .filter(([name]) => deckSet.has(name.toLowerCase()))
    .map(([deck, counts]) => {
      const fieldPct = counts.total / grandTotal;
      const topCutPct = counts.topCut / grandTotal;
      return {
        deck,
        field_pct: fieldPct,
        top_cut_pct: topCutPct,
        conversion_rate: fieldPct > 0 ? topCutPct / fieldPct : 0,
        appearances: counts.total,
      };
    })
    .sort((a, b) => b.field_pct - a.field_pct);
}

// ── Game Theory: Nash Equilibrium approximation ──
// Uses fictitious play: iteratively compute best responses until convergence

function computeNashEquilibrium(
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
): Record<string, number> {
  const n = decks.length;
  if (n === 0) return {};

  // Build payoff matrix (row = player's deck, col = opponent's deck, value = win rate)
  const payoff: number[][] = [];
  for (let i = 0; i < n; i++) {
    payoff[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { payoff[i][j] = 0.5; continue; }
      payoff[i][j] = matrix[decks[i]]?.[decks[j]]?.rate ?? 0.5;
    }
  }

  // Fictitious play: track cumulative counts of each strategy
  const counts = new Array(n).fill(1); // start uniform
  const iterations = 200;

  for (let iter = 0; iter < iterations; iter++) {
    const total = counts.reduce((s: number, v: number) => s + v, 0);
    const freq = counts.map((c: number) => c / total);

    // Find best response: deck with highest expected payoff against current distribution
    let bestIdx = 0, bestPayoff = -1;
    for (let i = 0; i < n; i++) {
      let ep = 0;
      for (let j = 0; j < n; j++) {
        ep += payoff[i][j] * freq[j];
      }
      if (ep > bestPayoff) { bestPayoff = ep; bestIdx = i; }
    }
    counts[bestIdx]++;
  }

  const total = counts.reduce((s: number, v: number) => s + v, 0);
  const result: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    result[decks[i]] = counts[i] / total;
  }
  return result;
}

// ── Game Theory: per-deck strategy classification ──

function computeGameTheoryProfile(
  deck: string,
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  deckMeta: Record<string, DeckMeta>,
  nashEq: Record<string, number>,
  tournamentField: TournamentFieldEntry[],
): GameTheoryProfile {
  // Expected payoff: weighted average WR against field (use tournament field if available, else play rates)
  const fieldMap = new Map(tournamentField.map((e) => [e.deck.toLowerCase(), e.field_pct]));

  let totalWeight = 0, weightedPayoff = 0;
  for (const other of decks) {
    if (other === deck) continue;
    const cell = matrix[deck]?.[other];
    const rate = cell?.rate ?? 0.5;
    // Prefer tournament field composition, fall back to untapped play rate
    const weight = fieldMap.get(other.toLowerCase()) ?? (deckMeta[other]?.play_rate ?? 0);
    if (weight > 0) {
      weightedPayoff += rate * weight;
      totalWeight += weight;
    }
  }
  const expectedPayoff = totalWeight > 0 ? weightedPayoff / totalWeight : 0.5;

  // Nash deviation: actual play rate vs Nash equilibrium play rate
  const actualPlayRate = deckMeta[deck]?.play_rate ?? 0;
  const nashRate = nashEq[deck] ?? (1 / decks.length);
  // Positive = overplayed, negative = underplayed relative to equilibrium
  const nashDeviation = nashRate > 0 ? (actualPlayRate - nashRate) / nashRate : 0;

  // Best response to: which popular deck (>5% play rate) does this deck counter best?
  let bestResponseTo: string | null = null;
  let bestResponseRate = 0;
  for (const other of decks) {
    if (other === deck) continue;
    const otherPlayRate = deckMeta[other]?.play_rate ?? 0;
    if (otherPlayRate < 0.03) continue; // only consider relevant decks
    const cell = matrix[deck]?.[other];
    if (cell && cell.rate > bestResponseRate) {
      bestResponseRate = cell.rate;
      bestResponseTo = other;
    }
  }
  // Only report if it's actually a counter (>55%)
  if (bestResponseRate < 0.55) bestResponseTo = null;

  // Dominance: check if any other deck beats this one in every matchup
  const dominated_by: string[] = [];
  const dominates: string[] = [];

  for (const other of decks) {
    if (other === deck) continue;
    // Does `other` dominate `deck`? (other beats every opponent that deck faces, by a better margin)
    let otherDominates = true;
    let thisDominates = true;
    let comparisonCount = 0;

    for (const opponent of decks) {
      if (opponent === deck || opponent === other) continue;
      const myRate = matrix[deck]?.[opponent]?.rate;
      const theirRate = matrix[other]?.[opponent]?.rate;
      if (myRate == null || theirRate == null) continue;
      comparisonCount++;
      if (theirRate <= myRate) otherDominates = false;
      if (myRate <= theirRate) thisDominates = false;
    }

    if (comparisonCount >= 3) {
      if (otherDominates) dominated_by.push(other);
      if (thisDominates) dominates.push(other);
    }
  }

  // Strategy type classification
  let strategy_type: GameTheoryProfile['strategy_type'];
  if (dominated_by.length > 0) {
    strategy_type = 'dominated';
  } else if (dominates.length > 0) {
    strategy_type = 'dominant';
  } else if (bestResponseTo && bestResponseRate >= 0.58) {
    strategy_type = 'counter_pick';
  } else {
    // Check matchup variance — low variance = generalist, high variance = niche
    const rates: number[] = [];
    for (const other of decks) {
      if (other === deck) continue;
      const cell = matrix[deck]?.[other];
      if (cell) rates.push(cell.rate);
    }
    const avg = rates.length > 0 ? rates.reduce((s, v) => s + v, 0) / rates.length : 0.5;
    const variance = rates.length > 1
      ? rates.reduce((s, v) => s + (v - avg) ** 2, 0) / rates.length
      : 0;
    strategy_type = variance < 0.003 ? 'generalist' : 'niche';
  }

  return {
    expected_payoff: expectedPayoff,
    nash_deviation: Math.max(-1, Math.min(1, nashDeviation)),
    best_response_to: bestResponseTo,
    dominated_by,
    dominates,
    strategy_type,
  };
}

// ── Main computation ──

export async function computeEcosystemAnalysis(pool: Pool, source: string = 'blended'): Promise<EcosystemAnalysis> {
  const { decks, matrix } = await buildFullMatrix(pool, source);

  // Load deck metadata
  const placeholders = decks.map((_, i) => `$${i + 1}`).join(',');
  const deckMetaRows = await queryAll(pool,
    'SELECT name, tier, power, win_rate, play_rate FROM deck_types WHERE name IN (' +
    placeholders + ')',
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

  // Tournament field composition from recent events
  const tournamentField = await buildTournamentField(pool, decks);

  // Nash equilibrium via fictitious play
  const nashEq = computeNashEquilibrium(decks, matrix);

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
  const inferredRelationships = await inferFromTournamentCorrelation(pool, decks, matrix, deckMeta);
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

    // Meta fitness: weighted win rate against the field
    // Prefer tournament field composition for weighting, fall back to play rates
    const fieldMap = new Map(tournamentField.map((e) => [e.deck.toLowerCase(), e.field_pct]));
    let totalWeight = 0, weightedWR = 0;
    for (const other of decks) {
      if (other === deck) continue;
      const cell = matrix[deck]?.[other];
      const weight = fieldMap.get(other.toLowerCase()) ?? (deckMeta[other]?.play_rate ?? 0);
      if (cell && weight > 0) {
        weightedWR += cell.rate * weight;
        totalWeight += weight;
      }
    }
    const metaFitness = totalWeight > 0 ? weightedWR / totalWeight : (meta.win_rate ?? 0.5);

    // Game theory profile
    const gameTheory = computeGameTheoryProfile(deck, decks, matrix, deckMeta, nashEq, tournamentField);

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
      game_theory: gameTheory,
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
    tournament_field: tournamentField,
    nash_equilibrium: nashEq,
    computed_at: new Date().toISOString(),
  };
}

// ── Inference: Tournament anti-correlation ──

async function inferFromTournamentCorrelation(
  pool: Pool,
  decks: string[],
  matrix: Record<string, Record<string, MatrixCell>>,
  deckMeta: Record<string, DeckMeta>,
): Promise<PredatorPreyRelationship[]> {
  const inferred: PredatorPreyRelationship[] = [];

  // Get last 14+ days of snapshots
  const snapshots = await queryAll(pool,
    "SELECT deck_type_name, power, snapshot_date FROM meta_snapshots WHERE snapshot_date::date >= CURRENT_DATE - INTERVAL '30 days' ORDER BY snapshot_date"
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
