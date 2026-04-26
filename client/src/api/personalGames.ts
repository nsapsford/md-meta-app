import api from './client';

export interface PersonalGame {
  id: number;
  deck_played: string;
  opponent_deck: string;
  result: 'win' | 'loss' | 'draw';
  went_first: boolean | null;
  notes: string | null;
  played_at: number;
}

export interface PersonalSpread {
  deck_played: string;
  opponent_deck: string;
  total: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export async function logGame(
  game: Pick<PersonalGame, 'deck_played' | 'opponent_deck' | 'result' | 'went_first' | 'notes'>
): Promise<PersonalGame> {
  const { data } = await api.post<PersonalGame>('/personal-games', game);
  return data;
}

export async function getGames(params?: { deck?: string; limit?: number; offset?: number }): Promise<PersonalGame[]> {
  const { data } = await api.get<PersonalGame[]>('/personal-games', { params });
  return data;
}

export async function deleteGame(id: number): Promise<void> {
  await api.delete(`/personal-games/${id}`);
}

export async function getSpread(params?: { deck?: string; days?: number }): Promise<PersonalSpread[]> {
  const { data } = await api.get<PersonalSpread[]>('/personal-games/spread', { params });
  return data;
}
