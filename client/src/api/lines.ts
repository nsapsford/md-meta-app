import api from './client';
import { getAdminToken } from '../utils/adminToken';

export type LineStatus = 'draft' | 'verified';
export type LineSource = 'manual' | 'ai-draft' | 'guide' | 'solver';
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface LineBranch {
  id: string;
  interruption: string;
  response: string;
}

export interface LineStep {
  id: string;
  text: string;
  branches: LineBranch[];
}

export interface ComboLine {
  id: number;
  deck_id: number;
  name: string;
  /** Lower = better end board. Decides the "correct" line when a hand can play several. */
  rank: number;
  status: LineStatus;
  source: LineSource;
  /** Slots of interchangeable passcodes; each slot needs its own card in hand. */
  starters: number[][];
  steps: LineStep[];
  end_board: string | null;
  /** The checkable plan behind a generated line (card moves per step). */
  plan?: unknown | null;
  /** Latest automatic checks; null for hand-written or edited lines. */
  checks?: LineChecks | null;
  created_at: number;
  updated_at: number;
}

export interface CheckIssue {
  severity: 'error' | 'warning';
  step: number | null;
  source: string;
  message: string;
}

export interface LineChecks {
  ok: boolean;
  issues: CheckIssue[];
  verifiers: string[];
  generator: string;
  checkedAt: number;
  repairs: number;
}

export type LinePayload = Pick<ComboLine, 'name' | 'rank' | 'status' | 'source' | 'starters' | 'steps' | 'end_board'>;

export interface DrillReview {
  item_key: string;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_at: number;
  last_grade: Grade | null;
  updated_at: number;
}

export interface ResolvedCard {
  id: number;
  name: string;
  type: string | null;
  image_small_url: string | null;
}

export async function getLines(deckId: number): Promise<ComboLine[]> {
  return (await api.get('/lines', { params: { deck_id: deckId } })).data;
}

export async function createLine(deckId: number, line: LinePayload): Promise<ComboLine> {
  return (await api.post('/lines', { ...line, deck_id: deckId })).data;
}

export async function updateLine(id: number, line: LinePayload): Promise<ComboLine> {
  return (await api.put(`/lines/${id}`, line)).data;
}

export async function deleteLine(id: number): Promise<void> {
  await api.delete(`/lines/${id}`);
}

export async function getDrillReviews(deckId: number): Promise<DrillReview[]> {
  return (await api.get('/lines/reviews', { params: { deck_id: deckId } })).data;
}

export async function gradeItem(deckId: number, itemKey: string, grade: Grade): Promise<DrillReview> {
  return (await api.post('/lines/reviews', { deck_id: deckId, item_key: itemKey, grade })).data;
}

/** Card names/images for a deck's passcodes. */
export async function resolveCards(passcodes: number[]): Promise<ResolvedCard[]> {
  return (await api.post('/decks-io/resolve', { passcodes })).data.cards;
}

export async function setLineStatus(id: number, status: LineStatus): Promise<ComboLine> {
  return (await api.patch(`/lines/${id}/status`, { status })).data;
}

// ── Line generator ──

export async function getGenerator(): Promise<{ serverModel: string | null }> {
  return (await api.get('/lines/generator')).data;
}

export async function getGeneratePrompt(deckId: number): Promise<{ prompt: string; missing: number[] }> {
  return (await api.get(`/lines/generate-prompt/${deckId}`)).data;
}

export interface ImportResult {
  created: ComboLine[];
  rejected: Array<{ name: string; error: string }>;
  failing: number;
  repairPrompt: string | null;
}

export async function importGenerated(deckId: number, text: string): Promise<ImportResult> {
  return (await api.post(`/lines/import-generated/${deckId}`, { text, generator: 'Claude (pasted)' })).data;
}

export interface GenerationJob {
  id: string;
  deckId: number;
  status: 'running' | 'done' | 'failed';
  progress: string[];
  created: number;
  error?: string;
}

export async function startGeneration(deckId: number): Promise<GenerationJob> {
  return (await api.post(`/lines/generate/${deckId}`, {}, { headers: { Authorization: `Bearer ${getAdminToken()}` } })).data;
}

export async function getGenerationJob(id: string): Promise<GenerationJob> {
  return (await api.get(`/lines/generate/jobs/${id}`)).data;
}
