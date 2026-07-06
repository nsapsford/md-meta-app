import api from './client';
import { getAdminToken } from '../utils/adminToken';

export interface OpponentDossierContent {
  overview: string;
  keyStarters: string[];
  chokePoints: string[];
  typicalEndBoards: string[];
  playArounds: string[];
}

export interface PilotDossierContent extends OpponentDossierContent {
  comboLines: string[];
  underInterruption: string[];
  matchupTips: Array<{ opponent: string; tip: string }>;
}

export interface DossierRow<T> {
  id: number;
  kind: 'opponent' | 'pilot';
  archetype: string | null;
  deck_id: number | null;
  version: number;
  content_json: T;
  model: string;
  status: 'completed' | 'failed';
  error: string | null;
  generated_at: number;
}

export type NoteCategory = 'negate-priority' | 'play-around' | 'combo-line' | 'general';

export interface DossierNote {
  id: number;
  kind: 'opponent' | 'pilot';
  archetype: string | null;
  deck_id: number | null;
  category: NoteCategory;
  note: string;
  game_id: number | null;
  created_at: number;
}

export async function getOpponentDossier(archetype: string): Promise<{ dossier: DossierRow<OpponentDossierContent> | null; notes: DossierNote[]; stale: boolean }> {
  const { data } = await api.get(`/dossiers/opponent/${encodeURIComponent(archetype)}`);
  return data;
}

export async function getPilotDossier(deckId: number): Promise<{ dossier: DossierRow<PilotDossierContent> | null; notes: DossierNote[]; stale: boolean }> {
  const { data } = await api.get(`/dossiers/pilot/${deckId}`);
  return data;
}

export async function generateOpponentDossier(archetype: string): Promise<DossierRow<OpponentDossierContent>> {
  const { data } = await api.post(
    `/dossiers/opponent/${encodeURIComponent(archetype)}/generate`,
    null,
    { headers: { Authorization: `Bearer ${getAdminToken()}` } }
  );
  return data;
}

export async function generatePilotDossier(deckId: number): Promise<DossierRow<PilotDossierContent>> {
  const { data } = await api.post(
    `/dossiers/pilot/${deckId}/generate`,
    null,
    { headers: { Authorization: `Bearer ${getAdminToken()}` } }
  );
  return data;
}

export async function bulkGenerateOpponentDossiers(limit = 10): Promise<{ results: Array<{ archetype: string; ok: boolean; error?: string }> }> {
  const { data } = await api.post(
    '/dossiers/bulk-generate',
    { limit },
    { headers: { Authorization: `Bearer ${getAdminToken()}` } }
  );
  return data;
}

export async function addDossierNote(input: {
  kind: 'opponent' | 'pilot';
  archetype?: string;
  deck_id?: number;
  category: NoteCategory;
  note: string;
  game_id?: number;
}): Promise<DossierNote> {
  const { data } = await api.post('/dossiers/notes', input);
  return data;
}

export async function deleteDossierNote(id: number): Promise<void> {
  await api.delete(`/dossiers/notes/${id}`);
}
