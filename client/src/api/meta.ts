import api from './client';
import type { TierList, Matchup, MetaSnapshot, Tournament, BanListData } from '../types/meta';
import type { DeckType, DeckProfile } from '../types/deck';

export async function getTierList(): Promise<TierList> {
  const res = await api.get('/tier-list');
  return res.data;
}

export async function getDecks(tier?: number): Promise<DeckType[]> {
  const res = await api.get('/decks', { params: tier != null ? { tier } : {} });
  return res.data;
}

export async function getDeckProfile(name: string): Promise<DeckProfile> {
  const res = await api.get(`/decks/${encodeURIComponent(name)}`);
  return res.data;
}

export async function getDeckTopLists(name: string) {
  const res = await api.get(`/decks/${encodeURIComponent(name)}/top-lists`);
  return res.data;
}

export async function getMatchups(deck?: string): Promise<Matchup[]> {
  const res = await api.get('/matchups', { params: deck ? { deck } : {} });
  return res.data;
}

export async function getBanList(): Promise<BanListData> {
  const res = await api.get('/ban-list');
  return res.data;
}

export async function getMetaTrends(): Promise<Record<string, MetaSnapshot[]>> {
  const res = await api.get('/meta-trends');
  return res.data;
}

export async function getDeckTrends(deckName: string): Promise<MetaSnapshot[]> {
  const res = await api.get(`/meta-trends/${encodeURIComponent(deckName)}`);
  return res.data;
}

export async function getTournaments(): Promise<Tournament[]> {
  const res = await api.get('/tournaments');
  return res.data;
}

export async function getTournament(id: string): Promise<Tournament> {
  const res = await api.get(`/tournaments/${id}`);
  return res.data;
}

export async function scoreDeck(main: string[], extra: string[]) {
  const res = await api.post('/deck-builder/score', { main, extra });
  return res.data;
}

export async function validateDeck(main: string[], extra: string[], side: string[]) {
  const res = await api.post('/deck-builder/validate', { main, extra, side });
  return res.data;
}

export async function getFeaturedDecks(): Promise<Array<{
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  thumbnail_image: string | null;
  win_rate: number | null;
  play_rate: number | null;
  cards: Array<{ name: string; image: string | null }>;
}>> {
  const res = await api.get('/decks/featured');
  return res.data;
}

export async function syncAll() {
  const res = await api.post('/sync/all');
  return res.data;
}

export async function syncUntapped() {
  const res = await api.post('/sync/untapped');
  return res.data;
}
