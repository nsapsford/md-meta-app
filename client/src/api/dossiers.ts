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
  depth: 'quick' | 'detailed';
  status: 'completed' | 'failed';
  error: string | null;
  generated_at: number;
}

export type NoteCategory = 'negate-priority' | 'play-around' | 'combo-line' | 'general';
export type DossierDepth = 'quick' | 'detailed';

// Live model calls can take well over axios's default 30s timeout, especially
// for the larger pilot-guide prompt or under free-tier latency variance.
const GENERATE_TIMEOUT_MS = 90000;

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

// Passing depth fetches the latest version generated at that specific depth
// (or null if that depth has never been generated), rather than the latest
// version overall — this is what lets the UI switch between an already-
// generated quick and detailed dossier instantly, without regenerating.
export async function getOpponentDossier(archetype: string, depth?: DossierDepth): Promise<{ dossier: DossierRow<OpponentDossierContent> | null; notes: DossierNote[]; stale: boolean }> {
  const { data } = await api.get(`/dossiers/opponent/${encodeURIComponent(archetype)}`, { params: { depth } });
  return data;
}

export async function getPilotDossier(deckId: number, depth?: DossierDepth): Promise<{ dossier: DossierRow<PilotDossierContent> | null; notes: DossierNote[]; stale: boolean }> {
  const { data } = await api.get(`/dossiers/pilot/${deckId}`, { params: { depth } });
  return data;
}

export async function generateOpponentDossier(archetype: string, depth: DossierDepth = 'detailed'): Promise<DossierRow<OpponentDossierContent>> {
  const { data } = await api.post(
    `/dossiers/opponent/${encodeURIComponent(archetype)}/generate`,
    { depth },
    { headers: { Authorization: `Bearer ${getAdminToken()}` }, timeout: GENERATE_TIMEOUT_MS }
  );
  return data;
}

export async function generatePilotDossier(deckId: number, depth: DossierDepth = 'detailed'): Promise<DossierRow<PilotDossierContent>> {
  const { data } = await api.post(
    `/dossiers/pilot/${deckId}/generate`,
    { depth },
    { headers: { Authorization: `Bearer ${getAdminToken()}` }, timeout: GENERATE_TIMEOUT_MS }
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
