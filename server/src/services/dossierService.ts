import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from '@neondatabase/serverless';
import { config } from '../config.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';

export type DossierKind = 'opponent' | 'pilot';

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

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);
}

export function validateOpponentContent(raw: unknown): raw is OpponentDossierContent {
  if (typeof raw !== 'object' || raw === null) return false;
  const c = raw as Record<string, unknown>;
  return (
    isNonEmptyString(c.overview) &&
    isStringArray(c.keyStarters) &&
    isStringArray(c.chokePoints) &&
    isStringArray(c.typicalEndBoards) &&
    isStringArray(c.playArounds)
  );
}

export function validatePilotContent(raw: unknown): raw is PilotDossierContent {
  if (!validateOpponentContent(raw)) return false;
  const c = raw as unknown as Record<string, unknown>;
  if (!isStringArray(c.comboLines) || !isStringArray(c.underInterruption)) return false;
  if (!Array.isArray(c.matchupTips) || c.matchupTips.length === 0) return false;
  return c.matchupTips.every(
    (t: unknown) =>
      typeof t === 'object' && t !== null &&
      isNonEmptyString((t as Record<string, unknown>).opponent) &&
      isNonEmptyString((t as Record<string, unknown>).tip)
  );
}

// Models sometimes wrap JSON output in a ```json fenced block despite being
// asked not to; strip that before parsing.
export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(trimmed);
}

export interface CardPoolEntry {
  name: string;
  desc: string | null;
  count: number;
}

const OPPONENT_SCHEMA_HINT = `{
  "overview": "2-3 sentence summary of the archetype's gameplan",
  "keyStarters": ["card name", "..."],
  "chokePoints": ["what to negate/interrupt and when, one per entry"],
  "typicalEndBoards": ["description of a common end board, one per entry"],
  "playArounds": ["how to play around or answer this deck, one per entry"]
}`;

const PILOT_SCHEMA_HINT = `{
  "overview": "...", "keyStarters": ["..."], "chokePoints": ["..."],
  "typicalEndBoards": ["..."], "playArounds": ["..."],
  "comboLines": ["standard combo line, one per entry"],
  "underInterruption": ["how to play the line under a common interruption, one per entry"],
  "matchupTips": [{"opponent": "archetype name", "tip": "matchup-specific tip"}]
}`;

function formatCardPool(pool: CardPoolEntry[]): string {
  return pool
    .map((c) => `- ${c.name} (used ${c.count}x)${c.desc ? `: ${c.desc.slice(0, 200)}` : ''}`)
    .join('\n');
}

export function buildOpponentPrompt(archetype: string, cardPool: CardPoolEntry[]): string {
  return [
    `You are a Yu-Gi-Oh! Master Duel coach. Write a scouting dossier for the "${archetype}" archetype so a player can beat it in real time, mid-duel.`,
    `Ground every claim in these cards actually played by the archetype (most-used first):`,
    formatCardPool(cardPool),
    `Respond with ONLY minified JSON matching this shape (no markdown fences, no commentary):`,
    OPPONENT_SCHEMA_HINT,
  ].join('\n\n');
}

export function buildPilotPrompt(deckName: string, archetype: string | null, cardPool: CardPoolEntry[]): string {
  return [
    `You are a Yu-Gi-Oh! Master Duel coach. Write a pilot guide for this exact deck ("${deckName}"${archetype ? `, a ${archetype} build` : ''}) so its owner plays it correctly mid-duel.`,
    `The deck's actual cards (most-used first):`,
    formatCardPool(cardPool),
    `Respond with ONLY minified JSON matching this shape (no markdown fences, no commentary):`,
    PILOT_SCHEMA_HINT,
  ].join('\n\n');
}

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY environment variable is required');
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

async function callModel(prompt: string): Promise<string> {
  const client = getAnthropicClient();
  const msg = await client.messages.create({
    model: config.dossierModel,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = msg.content[0];
  if (!block || block.type !== 'text') throw new Error('Model returned no text content');
  return block.text;
}

async function nextVersion(pool: Pool, kind: DossierKind, archetype: string | null, deckId: number | null): Promise<number> {
  const row = await queryOne(pool,
    `SELECT COALESCE(MAX(version), 0) AS v FROM dossiers
     WHERE kind = $1 AND archetype IS NOT DISTINCT FROM $2 AND deck_id IS NOT DISTINCT FROM $3`,
    [kind, archetype, deckId]
  );
  return Number(row?.v ?? 0) + 1;
}

// Ranks an archetype's most-used cards from recent top-decks data, enriched
// with card text from the local card DB, for grounding the opponent prompt.
export async function resolveArchetypeCardPool(pool: Pool, archetype: string, limit = 15): Promise<CardPoolEntry[]> {
  const topDecks = await queryAll(pool,
    `SELECT main_deck_json FROM top_decks WHERE LOWER(deck_type_name) = LOWER($1) ORDER BY created_at DESC LIMIT 10`,
    [archetype]
  );
  const counts = new Map<string, number>();
  for (const d of topDecks) {
    const main = d.main_deck_json ? JSON.parse(d.main_deck_json) : [];
    for (const c of main) {
      if (c.cardName) counts.set(c.cardName, (counts.get(c.cardName) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (ranked.length === 0) return [];

  const names = ranked.map(([name]) => name);
  const placeholders = names.map((_, i) => `$${i + 1}`).join(',');
  const cardRows = await queryAll(pool,
    `SELECT name, description FROM cards WHERE LOWER(name) IN (${placeholders})`,
    names.map((n) => n.toLowerCase())
  );
  const descByLower = new Map(cardRows.map((r: any) => [r.name.toLowerCase(), r.description as string | null]));

  return ranked.map(([name, count]) => ({ name, count, desc: descByLower.get(name.toLowerCase()) ?? null }));
}

// Resolves a saved deck's exact card list for grounding the pilot prompt.
export async function resolveDeckCardPool(
  pool: Pool, deckId: number
): Promise<{ deckName: string; archetype: string | null; cardPool: CardPoolEntry[] }> {
  const deck = await queryOne(pool, 'SELECT * FROM user_decks WHERE id = $1', [deckId]);
  if (!deck) throw new Error(`Deck ${deckId} not found`);

  const main: Array<{ passcode: number; count: number }> = JSON.parse(deck.main_json);
  const passcodes = main.map((c) => Number(c.passcode));
  const cardRows = passcodes.length
    ? await queryAll(pool, `SELECT id, name, description FROM cards WHERE id = ANY($1::int[])`, [passcodes])
    : [];
  const byId = new Map(cardRows.map((r: any) => [Number(r.id), r]));

  const cardPool: CardPoolEntry[] = main
    .map((c) => {
      const card = byId.get(Number(c.passcode));
      return card ? { name: card.name, desc: card.description, count: Number(c.count) } : null;
    })
    .filter((c): c is CardPoolEntry => !!c)
    .sort((a, b) => b.count - a.count);

  return { deckName: deck.name, archetype: deck.archetype, cardPool };
}

export async function generateOpponentDossier(pool: Pool, archetype: string) {
  const version = await nextVersion(pool, 'opponent', archetype, null);
  try {
    const cardPool = await resolveArchetypeCardPool(pool, archetype);
    const prompt = buildOpponentPrompt(archetype, cardPool);
    const parsed = parseModelJson(await callModel(prompt));
    if (!validateOpponentContent(parsed)) throw new Error('Model output failed schema validation');
    const row = await queryOne(pool,
      `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status)
       VALUES ('opponent', $1, NULL, $2, $3, $4, 'completed') RETURNING *`,
      [archetype, version, JSON.stringify(parsed), config.dossierModel]
    );
    return { ...row, content_json: parsed };
  } catch (err: any) {
    try {
      await run(pool,
        `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status, error)
         VALUES ('opponent', $1, NULL, $2, '{}', $3, 'failed', $4)`,
        [archetype, version, config.dossierModel, String(err?.message || err)]
      );
    } catch {
      // Failure-record insert itself collided (e.g. a concurrent call already
      // took this version) — ignore and still surface the original error below.
    }
    throw err;
  }
}

export async function generatePilotDossier(pool: Pool, deckId: number) {
  const version = await nextVersion(pool, 'pilot', null, deckId);
  try {
    const { deckName, archetype, cardPool } = await resolveDeckCardPool(pool, deckId);
    const prompt = buildPilotPrompt(deckName, archetype, cardPool);
    const parsed = parseModelJson(await callModel(prompt));
    if (!validatePilotContent(parsed)) throw new Error('Model output failed schema validation');
    const row = await queryOne(pool,
      `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status)
       VALUES ('pilot', NULL, $1, $2, $3, $4, 'completed') RETURNING *`,
      [deckId, version, JSON.stringify(parsed), config.dossierModel]
    );
    return { ...row, content_json: parsed };
  } catch (err: any) {
    try {
      await run(pool,
        `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status, error)
         VALUES ('pilot', NULL, $1, $2, '{}', $3, 'failed', $4)`,
        [deckId, version, config.dossierModel, String(err?.message || err)]
      );
    } catch {
      // Failure-record insert itself collided (e.g. a concurrent call already
      // took this version) — ignore and still surface the original error below.
    }
    throw err;
  }
}

export async function getLatestDossier(pool: Pool, kind: DossierKind, archetype: string | null, deckId: number | null) {
  const row = await queryOne(pool,
    `SELECT * FROM dossiers WHERE kind = $1 AND archetype IS NOT DISTINCT FROM $2 AND deck_id IS NOT DISTINCT FROM $3
     AND status = 'completed' ORDER BY version DESC LIMIT 1`,
    [kind, archetype, deckId]
  );
  if (!row) return null;
  return { ...row, content_json: JSON.parse(row.content_json) };
}

export async function getDossierHistory(pool: Pool, kind: DossierKind, archetype: string | null, deckId: number | null) {
  const rows = await queryAll(pool,
    `SELECT * FROM dossiers WHERE kind = $1 AND archetype IS NOT DISTINCT FROM $2 AND deck_id IS NOT DISTINCT FROM $3
     ORDER BY version DESC`,
    [kind, archetype, deckId]
  );
  return rows.map((r: any) => ({ ...r, content_json: r.status === 'completed' ? JSON.parse(r.content_json) : null }));
}
