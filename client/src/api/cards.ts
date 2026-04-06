import api from './client';
import type { CardSearchResult } from '../types/card';

export async function searchCards(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<CardSearchResult> {
  const res = await api.get('/cards', { params, signal });
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
