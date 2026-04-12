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

export async function getMatchupMatrix(source: 'blended' | 'untapped' | 'tournament' = 'blended', infer: boolean = false, signal?: AbortSignal): Promise<MatchupMatrix> {
  const res = await api.get('/matchups/matrix', { params: { source, ...(infer ? { infer: 'true' } : {}) }, signal });
  return res.data;
}

export async function getMatchupAdvisor(deck: string, signal?: AbortSignal): Promise<AdvisorResult> {
  const res = await api.get('/matchups/advisor', { params: { deck }, signal });
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
