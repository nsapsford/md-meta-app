import api from './client';
import type { Matchup, EcosystemAnalysis, DeckEcosystemResponse } from '../types/meta';

export interface MatchupMatrixCell {
  rate: number;
  n_untapped: number;
  n_tournament: number;
  n_personal?: number;
  confidence: 'high' | 'medium' | 'low';
  inferred?: boolean;
  inference_method?: string;
  interaction_rationale?: string;
  interaction_adjusted?: boolean;
  reinforced?: boolean;
}

export interface MatchupMatrix {
  decks: string[];
  matrix: Record<string, Record<string, MatchupMatrixCell>>;
}

export interface AdvisorOpponent {
  opponent: string;
  field_pct: number;
  /** null = no measured data for this pairing. */
  win_rate: number | null;
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface AdvisorResult {
  deck: string;
  opponents: AdvisorOpponent[];
  /** Weighted over opponents that have data; null when none do. */
  weighted_win_rate: number | null;
  /** Share of the field that has measured matchup data, 0–1. */
  coverage: number;
}

export async function getMatchups(deck?: string, signal?: AbortSignal): Promise<Matchup[]> {
  const res = await api.get('/matchups', { params: deck ? { deck } : {}, signal });
  return res.data;
}

export async function getMatchupMatrix(
  source: 'blended' | 'untapped' | 'tournament' = 'blended',
  infer: boolean = false,
  signal?: AbortSignal,
  includePersonal: boolean = false
): Promise<MatchupMatrix> {
  const params: Record<string, string> = { source };
  if (infer) params.infer = 'true';
  if (includePersonal) params.include_personal = 'true';
  const res = await api.get('/matchups/matrix', { params, signal });
  return res.data;
}

export async function getMatchupAdvisor(deck: string, signal?: AbortSignal, includePersonal: boolean = false): Promise<AdvisorResult> {
  const params: Record<string, string> = { deck };
  if (includePersonal) params.include_personal = 'true';
  const res = await api.get('/matchups/advisor', { params, signal });
  return res.data;
}

export interface DeckInteractionSummary {
  strategy_class: string;
  hand_traps: number;
  floodgates: number;
  board_breakers: number;
  engines: { name: string; card_count: number }[];
  vs_top3_rationale: string;
}

export interface LadderEvResult {
  deck: string;
  tier: number | null;
  rank: string;
  /** Measured win rate at `rank`, mirror-match corrected, 0–1. */
  ev: number;
  win_rate_raw: number;
  win_rate_first: number | null;
  win_rate_second: number | null;
  games: number;
  /** Share of games at this rank, 0–1. */
  play_rate: number;
  low_sample: boolean;
  interaction?: DeckInteractionSummary;
}

export async function getLadderEv(
  signal?: AbortSignal,
  opts?: { rank?: string; reinforce?: boolean }
): Promise<LadderEvResult[]> {
  const params: Record<string, string> = {};
  if (opts?.rank) params.rank = opts.rank;
  if (opts?.reinforce) params.reinforce = 'true';
  const res = await api.get('/matchups/ladder-ev', { params, signal });
  return res.data;
}

export async function getEcosystemAnalysis(signal?: AbortSignal): Promise<EcosystemAnalysis> {
  const res = await api.get('/matchups/ecosystem', { signal });
  return res.data;
}

export async function getDeckEcosystem(deck: string, signal?: AbortSignal): Promise<DeckEcosystemResponse> {
  const res = await api.get('/matchups/ecosystem', { params: { deck }, signal });
  return res.data;
}
