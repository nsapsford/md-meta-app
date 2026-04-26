import api from './client';
import type { Matchup, EcosystemAnalysis, DeckEcosystemResponse } from '../types/meta';

export interface MatchupMatrixCell {
  rate: number;
  n_untapped: number;
  n_tournament: number;
  confidence: 'high' | 'medium' | 'low';
  inferred?: boolean;
  inference_method?: string;
}

export interface MatchupMatrix {
  decks: string[];
  matrix: Record<string, Record<string, MatchupMatrixCell>>;
}

export interface AdvisorOpponent {
  opponent: string;
  field_pct: number;
  win_rate: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface AdvisorResult {
  deck: string;
  opponents: AdvisorOpponent[];
  weighted_win_rate: number;
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

export interface LadderEvMatchup {
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
  top_good_matchups: LadderEvMatchup[];
  top_bad_matchups: LadderEvMatchup[];
  coverage: number;
}

export async function getLadderEv(
  signal?: AbortSignal,
  includePersonal: boolean = false
): Promise<LadderEvResult[]> {
  const params: Record<string, string> = {};
  if (includePersonal) params.include_personal = 'true';
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
