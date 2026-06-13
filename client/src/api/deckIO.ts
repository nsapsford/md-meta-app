import api from './client';

export interface ResolvedCard {
  id: number;
  name: string;
  type: string | null;
  image_small_url: string | null;
}

export interface ParsedDeck {
  main: number[];
  extra: number[];
  side: number[];
  cards: ResolvedCard[];
  unresolved: number[];
}

export interface SavedDeck {
  id: number;
  name: string;
  archetype: string | null;
  main_json: Array<{ passcode: number; count: number }>;
  extra_json: Array<{ passcode: number; count: number }>;
  side_json: Array<{ passcode: number; count: number }>;
  source: string | null;
  created_at: number;
  updated_at: number;
  /** Representative boss/archetype cards chosen server-side for the deck fan. */
  signature_cards?: Array<{ name: string; image: string | null }>;
}

export interface DeckPayload {
  name: string;
  archetype?: string | null;
  main: Array<{ passcode: number; count: number }>;
  extra: Array<{ passcode: number; count: number }>;
  side: Array<{ passcode: number; count: number }>;
  source?: string;
}

export async function parseYdk(ydk: string): Promise<ParsedDeck> {
  const res = await api.post('/decks-io/parse-ydk', { ydk });
  return res.data;
}

export async function exportYdk(main: number[], extra: number[], side: number[]): Promise<string> {
  const res = await api.post('/decks-io/export-ydk', { main, extra, side });
  return res.data.ydk;
}

export async function getSavedDecks(): Promise<SavedDeck[]> {
  const res = await api.get('/decks-io/saved');
  return res.data;
}

export async function createSavedDeck(deck: DeckPayload): Promise<SavedDeck> {
  const res = await api.post('/decks-io/saved', deck);
  return res.data;
}

export async function deleteSavedDeck(id: number): Promise<void> {
  await api.delete(`/decks-io/saved/${id}`);
}
