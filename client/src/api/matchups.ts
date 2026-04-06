import api from './client';
import type { Matchup } from '../types/meta';

export interface MatchupMatrixCell {
  rate: number;
  n_untapped: number;
  n_tournament: number;
  confidence: 'high' | 'medium' | 'low';
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

export async function getMatchups(deck?: string): Promise<Matchup[]> {
  const res = await api.get('/matchups', { params: deck ? { deck } : {} });
  return res.data;
}

export async function getMatchupMatrix(source: 'blended' | 'untapped' | 'tournament' = 'blended', signal?: AbortSignal): Promise<MatchupMatrix> {
  const res = await api.get('/matchups/matrix', { params: { source }, signal });
  return res.data;
}

export async function getMatchupAdvisor(deck: string, signal?: AbortSignal): Promise<AdvisorResult> {
  const res = await api.get('/matchups/advisor', { params: { deck }, signal });
  return res.data;
}
