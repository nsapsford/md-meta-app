import api from './client';
import type { CardSearchResult } from '../types/card';

export async function searchCards(params: Record<string, string>): Promise<CardSearchResult> {
  const res = await api.get('/cards/search', { params });
  return res.data;
}

export async function getCardById(id: number) {
  const res = await api.get(`/cards/${id}`);
  return res.data;
}

export async function getArchetypes(): Promise<string[]> {
  const res = await api.get('/cards/archetypes');
  return res.data;
}
