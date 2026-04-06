import api from './client';
import type { Tournament, TournamentResult } from '../types/meta';

export async function getTournaments(): Promise<Tournament[]> {
  const res = await api.get('/tournaments');
  return res.data;
}

export async function getTournament(id: string): Promise<Tournament> {
  const res = await api.get(`/tournaments/${id}`);
  return res.data;
}

export async function getRecentTournamentResults(): Promise<TournamentResult[]> {
  const res = await api.get('/tournaments/recent-results');
  return res.data;
}
