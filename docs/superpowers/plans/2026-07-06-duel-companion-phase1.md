# Duel Companion Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-generated archetype dossiers (opponent scouting + own-deck pilot guides) and a mobile-first "Duel Mode" live second-screen page, so the app actively coaches in-game decisions instead of only reporting meta stats.

**Architecture:** Two new Postgres tables (`dossiers`, versioned; `dossier_notes`, categorized) store dossier content generated once via the Anthropic API and served from the DB thereafter. A new `dossierService.ts` grounds prompts in the app's existing Untapped top-decks data and local card DB, validates model output against a fixed JSON schema, and never overwrites a good version with a failed one. A new `/api/dossiers` router exposes read endpoints (public) and generate endpoints (admin-token gated, reusing the existing sync admin-token pattern). A new `DuelMode.tsx` client page lets the user pick their deck once, look up an opponent archetype mid-duel, read both dossiers, add categorized notes, and log the result in one tap.

**Tech Stack:** Express + `@neondatabase/serverless` (Postgres) on the server; `@anthropic-ai/sdk` (new dependency, model `claude-sonnet-5`) for generation; React + react-router + axios on the client; vitest for unit tests, following the existing pure-function test pattern (`deckCodecService.test.ts`).

**Spec:** `docs/superpowers/specs/2026-07-06-duel-companion-phase1-design.md`

---

## Task 1: Database schema — `dossiers` and `dossier_notes` tables

**Files:**
- Modify: `server/src/db/schema.sql`

- [ ] **Step 1: Append the new tables to schema.sql**

Add this block to the end of `server/src/db/schema.sql`:

```sql
-- Duel Companion: versioned AI-generated dossiers. 'opponent' dossiers are
-- keyed by archetype (matching deck_types.name); 'pilot' dossiers are keyed
-- to a specific saved deck so lines match the user's exact list. Regeneration
-- inserts a new version rather than overwriting; a failed generation is
-- recorded but never becomes the version served to the client.
CREATE TABLE IF NOT EXISTS dossiers (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('opponent', 'pilot')),
  archetype TEXT,
  deck_id INTEGER REFERENCES user_decks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  error TEXT,
  generated_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  CHECK (
    (kind = 'opponent' AND archetype IS NOT NULL AND deck_id IS NULL) OR
    (kind = 'pilot' AND deck_id IS NOT NULL AND archetype IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dossiers_opponent_lookup
  ON dossiers(LOWER(archetype), version DESC) WHERE kind = 'opponent';
CREATE INDEX IF NOT EXISTS idx_dossiers_pilot_lookup
  ON dossiers(deck_id, version DESC) WHERE kind = 'pilot';

-- Personal notes layered onto a dossier. category slots the note into the
-- matching dossier section in the UI. game_id is unused until Phase 2 (review
-- loop) but included now to avoid a later migration.
CREATE TABLE IF NOT EXISTS dossier_notes (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('opponent', 'pilot')),
  archetype TEXT,
  deck_id INTEGER REFERENCES user_decks(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('negate-priority', 'play-around', 'combo-line', 'general')),
  note TEXT NOT NULL,
  game_id INTEGER REFERENCES personal_games(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
  CHECK (
    (kind = 'opponent' AND archetype IS NOT NULL AND deck_id IS NULL) OR
    (kind = 'pilot' AND deck_id IS NOT NULL AND archetype IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dossier_notes_opponent ON dossier_notes(LOWER(archetype)) WHERE kind = 'opponent';
CREATE INDEX IF NOT EXISTS idx_dossier_notes_pilot ON dossier_notes(deck_id) WHERE kind = 'pilot';
```

- [ ] **Step 2: Apply the schema locally**

`initDb()` in `server/src/db/connection.ts` re-runs `schema.sql` (all `CREATE TABLE IF NOT EXISTS`) on every server start, so no separate migration step is needed. Verify it applies cleanly:

Run: `cd server && npm run dev`
Expected: console prints `[DB] Schema initialized` with no errors, then the normal startup logs. Stop the server with Ctrl+C once confirmed.

- [ ] **Step 3: Commit**

```bash
git add server/src/db/schema.sql
git commit -m "feat(server): add dossiers and dossier_notes tables"
```

---

## Task 2: Anthropic SDK dependency and config

**Files:**
- Modify: `server/package.json`
- Modify: `server/src/config.ts`

- [ ] **Step 1: Install the SDK**

Run: `cd server && npm install @anthropic-ai/sdk`
Expected: `package.json` gains a `"@anthropic-ai/sdk": "^..."` dependency and `package-lock.json` updates.

- [ ] **Step 2: Add config keys**

Edit `server/src/config.ts`, add to the `config` object (after `adminToken`):

```ts
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  dossierModel: 'claude-sonnet-5',
```

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json server/src/config.ts
git commit -m "feat(server): add Anthropic SDK dependency and dossier config"
```

---

## Task 3: Dossier content types, validators, and JSON parsing (TDD)

**Files:**
- Create: `server/src/services/dossierService.ts`
- Create: `server/src/services/dossierService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/dossierService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validateOpponentContent,
  validatePilotContent,
  parseModelJson,
  type OpponentDossierContent,
  type PilotDossierContent,
} from './dossierService.js';

const validOpponent: OpponentDossierContent = {
  overview: 'Aggro deck that floods the board turn one.',
  keyStarters: ['Card A', 'Card B'],
  chokePoints: ['Negate the first extender before it links.'],
  typicalEndBoards: ['Two link monsters plus a floodgate.'],
  playArounds: ['Hold hand traps for the second main phase.'],
};

const validPilot: PilotDossierContent = {
  ...validOpponent,
  comboLines: ['Normal summon A, link into B.'],
  underInterruption: ['If negated on A, pivot to the backup line via C.'],
  matchupTips: [{ opponent: 'Kashtira', tip: 'Play around Unicorn by spacing summons.' }],
};

describe('validateOpponentContent', () => {
  it('accepts a well-formed opponent dossier', () => {
    expect(validateOpponentContent(validOpponent)).toBe(true);
  });

  it('rejects missing fields', () => {
    const { overview, ...rest } = validOpponent;
    expect(validateOpponentContent(rest)).toBe(false);
  });

  it('rejects empty arrays', () => {
    expect(validateOpponentContent({ ...validOpponent, keyStarters: [] })).toBe(false);
  });

  it('rejects non-string array entries', () => {
    expect(validateOpponentContent({ ...validOpponent, chokePoints: [1, 2] })).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(validateOpponentContent(null)).toBe(false);
    expect(validateOpponentContent('nope')).toBe(false);
  });
});

describe('validatePilotContent', () => {
  it('accepts a well-formed pilot dossier', () => {
    expect(validatePilotContent(validPilot)).toBe(true);
  });

  it('rejects a pilot dossier missing matchupTips', () => {
    const { matchupTips, ...rest } = validPilot;
    expect(validatePilotContent(rest)).toBe(false);
  });

  it('rejects matchupTips entries missing a tip', () => {
    expect(validatePilotContent({ ...validPilot, matchupTips: [{ opponent: 'Kashtira' }] })).toBe(false);
  });

  it('rejects an opponent-shaped payload (missing pilot-only fields)', () => {
    expect(validatePilotContent(validOpponent)).toBe(false);
  });
});

describe('parseModelJson', () => {
  it('parses plain JSON', () => {
    expect(parseModelJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('strips a ```json fenced block', () => {
    expect(parseModelJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('strips a plain ``` fenced block', () => {
    expect(parseModelJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/dossierService.test.ts`
Expected: FAIL — `dossierService.ts` does not exist / exports not found.

- [ ] **Step 3: Implement the types, validators, and parser**

Create `server/src/services/dossierService.ts`:

```ts
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
  const c = raw as Record<string, unknown>;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/dossierService.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dossierService.ts server/src/services/dossierService.test.ts
git commit -m "feat(server): dossier content types and validators"
```

---

## Task 4: Prompt builders (TDD)

**Files:**
- Modify: `server/src/services/dossierService.ts`
- Modify: `server/src/services/dossierService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `server/src/services/dossierService.test.ts`:

```ts
import { buildOpponentPrompt, buildPilotPrompt, type CardPoolEntry } from './dossierService.js';

const pool: CardPoolEntry[] = [
  { name: 'Card A', desc: 'Special Summon this card.', count: 3 },
  { name: 'Card B', desc: null, count: 1 },
];

describe('buildOpponentPrompt', () => {
  it('includes the archetype name, card names, usage counts, and a JSON-only instruction', () => {
    const prompt = buildOpponentPrompt('Kashtira', pool);
    expect(prompt).toContain('Kashtira');
    expect(prompt).toContain('Card A (used 3x): Special Summon this card.');
    expect(prompt).toContain('Card B (used 1x)');
    expect(prompt).toMatch(/only.*JSON/i);
    expect(prompt).toContain('keyStarters');
  });
});

describe('buildPilotPrompt', () => {
  it('includes the deck name, archetype, card pool, and pilot-only schema fields', () => {
    const prompt = buildPilotPrompt('My Kashtira Build', 'Kashtira', pool);
    expect(prompt).toContain('My Kashtira Build');
    expect(prompt).toContain('Kashtira');
    expect(prompt).toContain('Card A (used 3x): Special Summon this card.');
    expect(prompt).toContain('comboLines');
    expect(prompt).toContain('matchupTips');
  });

  it('omits the archetype clause when the deck has no archetype', () => {
    const prompt = buildPilotPrompt('Homebrew Deck', null, pool);
    expect(prompt).toContain('Homebrew Deck');
    expect(prompt).not.toMatch(/a null build/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/dossierService.test.ts`
Expected: FAIL — `buildOpponentPrompt`, `buildPilotPrompt`, `CardPoolEntry` not exported.

- [ ] **Step 3: Implement the prompt builders**

Add to `server/src/services/dossierService.ts` (after the validators):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/dossierService.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dossierService.ts server/src/services/dossierService.test.ts
git commit -m "feat(server): dossier prompt builders"
```

---

## Task 5: Card-pool resolution, generation, and retrieval (DB-backed)

**Files:**
- Modify: `server/src/services/dossierService.ts`

These functions touch the Neon pool directly, matching the untested-DB-layer convention already used throughout `server/src/routes/*` and `server/src/services/*` (only pure logic like `deckCodecService.ts` has unit tests in this codebase). They're verified manually in Task 7's end-to-end check instead of with vitest.

- [ ] **Step 1: Implement card-pool resolution, the Anthropic call, versioning, and CRUD reads**

Add to `server/src/services/dossierService.ts` (top of file, add imports; rest appended at the end):

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from '@neondatabase/serverless';
import { config } from '../config.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';
```

Append:

```ts
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
    return await queryOne(pool,
      `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status)
       VALUES ('opponent', $1, NULL, $2, $3, $4, 'completed') RETURNING *`,
      [archetype, version, JSON.stringify(parsed), config.dossierModel]
    );
  } catch (err: any) {
    await run(pool,
      `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status, error)
       VALUES ('opponent', $1, NULL, $2, '{}', $3, 'failed', $4)`,
      [archetype, version, config.dossierModel, String(err?.message || err)]
    );
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
    return await queryOne(pool,
      `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status)
       VALUES ('pilot', NULL, $1, $2, $3, $4, 'completed') RETURNING *`,
      [deckId, version, JSON.stringify(parsed), config.dossierModel]
    );
  } catch (err: any) {
    await run(pool,
      `INSERT INTO dossiers (kind, archetype, deck_id, version, content_json, model, status, error)
       VALUES ('pilot', NULL, $1, $2, '{}', $3, 'failed', $4)`,
      [deckId, version, config.dossierModel, String(err?.message || err)]
    );
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
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `cd server && npx vitest run`
Expected: PASS — all existing suites plus `dossierService.test.ts` still pass (the new DB-backed functions aren't unit tested, so they don't add failures here).

- [ ] **Step 3: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/dossierService.ts
git commit -m "feat(server): dossier generation, card-pool grounding, and retrieval"
```

---

## Task 6: `/api/dossiers` router

**Files:**
- Create: `server/src/routes/dossiers.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create the router**

Create `server/src/routes/dossiers.ts`:

```ts
import { Router, Request, Response } from 'express';
import type { Pool } from '@neondatabase/serverless';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';
import { config } from '../config.js';
import {
  generateOpponentDossier,
  generatePilotDossier,
  getLatestDossier,
  getDossierHistory,
} from '../services/dossierService.js';

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!config.adminToken || token !== config.adminToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Dossiers key off the canonical deck_types.name so casing/spacing always
// matches, regardless of how the client typed the archetype. Also returns
// updated_at so callers can flag a dossier stale when the meta has moved
// since it was generated.
async function resolveCanonicalArchetype(pool: Pool, name: string): Promise<{ name: string; updated_at: number } | null> {
  const row = await queryOne(pool, 'SELECT name, updated_at FROM deck_types WHERE LOWER(name) = LOWER($1)', [name]);
  return row ?? null;
}

router.get('/opponent/:archetype', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const deckType = await resolveCanonicalArchetype(pool, req.params.archetype);
    if (!deckType) return res.status(404).json({ error: 'Unknown archetype' });
    const dossier = await getLatestDossier(pool, 'opponent', deckType.name, null);
    const notes = await queryAll(pool,
      `SELECT * FROM dossier_notes WHERE kind = 'opponent' AND LOWER(archetype) = LOWER($1) ORDER BY created_at DESC`,
      [deckType.name]
    );
    // Stale = the archetype's tier-list data has been refreshed since this
    // dossier was generated, i.e. the meta may have moved under it.
    const stale = dossier ? deckType.updated_at > dossier.generated_at : false;
    res.json({ dossier, notes, stale });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/opponent/:archetype/history', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const deckType = await resolveCanonicalArchetype(pool, req.params.archetype);
    if (!deckType) return res.status(404).json({ error: 'Unknown archetype' });
    res.json(await getDossierHistory(pool, 'opponent', deckType.name, null));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/opponent/:archetype/generate', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const pool = getPool();
    const deckType = await resolveCanonicalArchetype(pool, req.params.archetype);
    if (!deckType) return res.status(404).json({ error: 'Unknown archetype' });
    res.status(201).json(await generateOpponentDossier(pool, deckType.name));
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

router.post('/bulk-generate', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const pool = getPool();
    const limit = Math.min(parseInt(req.body?.limit) || 10, 25);
    const archetypes = await queryAll(pool,
      `SELECT name FROM deck_types WHERE power IS NOT NULL AND power > 0 ORDER BY power DESC LIMIT $1`,
      [limit]
    );
    const results: Array<{ archetype: string; ok: boolean; error?: string }> = [];
    for (const { name } of archetypes) {
      try {
        await generateOpponentDossier(pool, name);
        results.push({ archetype: name, ok: true });
      } catch (err: any) {
        results.push({ archetype: name, ok: false, error: err.message });
      }
    }
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pilot/:deckId', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const deckId = parseInt(req.params.deckId);
    const deckRow = await queryOne(pool, 'SELECT updated_at FROM user_decks WHERE id = $1', [deckId]);
    if (!deckRow) return res.status(404).json({ error: 'Deck not found' });
    const dossier = await getLatestDossier(pool, 'pilot', null, deckId);
    const notes = await queryAll(pool,
      `SELECT * FROM dossier_notes WHERE kind = 'pilot' AND deck_id = $1 ORDER BY created_at DESC`,
      [deckId]
    );
    // Stale = the saved deck was edited since this pilot guide was generated.
    const stale = dossier ? deckRow.updated_at > dossier.generated_at : false;
    res.json({ dossier, notes, stale });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pilot/:deckId/history', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    res.json(await getDossierHistory(pool, 'pilot', null, parseInt(req.params.deckId)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pilot/:deckId/generate', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const pool = getPool();
    res.status(201).json(await generatePilotDossier(pool, parseInt(req.params.deckId)));
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

const NOTE_CATEGORIES = ['negate-priority', 'play-around', 'combo-line', 'general'];

router.get('/notes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { kind, archetype, deck_id } = req.query as { kind?: string; archetype?: string; deck_id?: string };
    if (kind !== 'opponent' && kind !== 'pilot') return res.status(400).json({ error: 'kind must be opponent or pilot' });

    let rows;
    if (kind === 'opponent') {
      if (!archetype) return res.status(400).json({ error: 'archetype is required' });
      rows = await queryAll(pool,
        `SELECT * FROM dossier_notes WHERE kind = 'opponent' AND LOWER(archetype) = LOWER($1) ORDER BY created_at DESC`,
        [archetype]
      );
    } else {
      if (!deck_id) return res.status(400).json({ error: 'deck_id is required' });
      rows = await queryAll(pool,
        `SELECT * FROM dossier_notes WHERE kind = 'pilot' AND deck_id = $1 ORDER BY created_at DESC`,
        [parseInt(deck_id)]
      );
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes', async (req: Request, res: Response) => {
  try {
    const { kind, archetype, deck_id, category, note, game_id } = req.body;
    if (kind !== 'opponent' && kind !== 'pilot') return res.status(400).json({ error: 'kind must be opponent or pilot' });
    if (!NOTE_CATEGORIES.includes(category)) return res.status(400).json({ error: `category must be one of ${NOTE_CATEGORIES.join(', ')}` });
    if (!note || typeof note !== 'string') return res.status(400).json({ error: 'note is required' });
    if (kind === 'opponent' && !archetype) return res.status(400).json({ error: 'archetype is required for opponent notes' });
    if (kind === 'pilot' && !deck_id) return res.status(400).json({ error: 'deck_id is required for pilot notes' });

    const pool = getPool();
    const row = await queryOne(pool,
      `INSERT INTO dossier_notes (kind, archetype, deck_id, category, note, game_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [kind, kind === 'opponent' ? archetype : null, kind === 'pilot' ? deck_id : null, category, note, game_id ?? null]
    );
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notes/:id', async (req: Request, res: Response) => {
  try {
    await run(getPool(), 'DELETE FROM dossier_notes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Register the router**

In `server/src/index.ts`, add the import near the other route imports (after `import deckIORouter from './routes/deckIO.js';`):

```ts
import dossiersRouter from './routes/dossiers.js';
```

Add the mount near the other `app.use('/api/...')` lines (after `app.use('/api/decks-io', deckIORouter);`):

```ts
  app.use('/api/dossiers', dossiersRouter);
```

- [ ] **Step 3: Type-check and start the server**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

Run: `cd server && npm run dev` (then Ctrl+C once confirmed)
Expected: starts cleanly, no route-registration errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/dossiers.ts server/src/index.ts
git commit -m "feat(server): add /api/dossiers routes"
```

---

## Task 7: Manual verification of the generation pipeline

**Files:** none (verification only)

- [ ] **Step 1: Set the API key**

Add `ANTHROPIC_API_KEY=sk-ant-...` to `server/.env` (alongside the existing `DATABASE_URL`, `ADMIN_TOKEN`, etc — check `server/.env.example` or existing `.env` for the exact variable list to preserve).

- [ ] **Step 2: Start the server**

Run: `cd server && npm run dev`
Expected: starts cleanly.

- [ ] **Step 3: Generate a real opponent dossier for a known archetype**

Pick an archetype that exists in your `deck_types` table (e.g. one visible on the live tier list). Run (replace `<ADMIN_TOKEN>` and `<Archetype>`):

```bash
curl -X POST http://localhost:3001/api/dossiers/opponent/<Archetype>/generate \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Expected: `201` with a JSON body where `status: "completed"` and `content_json` contains `overview`, `keyStarters`, `chokePoints`, `typicalEndBoards`, `playArounds`.

- [ ] **Step 4: Fetch it back**

Run: `curl http://localhost:3001/api/dossiers/opponent/<Archetype>`
Expected: `{ "dossier": { ...same content... }, "notes": [] }`

- [ ] **Step 5: Generate a pilot dossier for a saved deck**

Get a deck id from `curl http://localhost:3001/api/decks-io/saved`, then:

```bash
curl -X POST http://localhost:3001/api/dossiers/pilot/<deckId>/generate \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Expected: `201` with `content_json` additionally containing `comboLines`, `underInterruption`, `matchupTips`.

- [ ] **Step 6: Confirm versioning on regeneration**

Re-run Step 3's curl command a second time, then:

Run: `curl http://localhost:3001/api/dossiers/opponent/<Archetype>/history`
Expected: an array with two entries, `version: 2` then `version: 1`, both `status: "completed"`.

No commit for this task — it's a manual check of already-committed code.

---

## Task 8: Client — shared admin-token utility

**Files:**
- Create: `client/src/utils/adminToken.ts`
- Modify: `client/src/pages/Admin.tsx`

Duel Mode's on-demand dossier generation reuses the same admin token Admin.tsx already stores in `localStorage`, so it doesn't need its own login flow. Extract the key/getter so both places share it.

- [ ] **Step 1: Create the utility**

Create `client/src/utils/adminToken.ts`:

```ts
export const ADMIN_TOKEN_KEY = 'admin_token';

export function getAdminToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}
```

- [ ] **Step 2: Point Admin.tsx at the shared constant**

In `client/src/pages/Admin.tsx`, replace:

```ts
const TOKEN_KEY = 'admin_token';
```

with:

```ts
import { ADMIN_TOKEN_KEY as TOKEN_KEY } from '../utils/adminToken';
```

(Place this import line with the other imports at the top of the file; the `as TOKEN_KEY` alias means no other line in the file needs to change.)

- [ ] **Step 3: Verify the client still builds**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/adminToken.ts client/src/pages/Admin.tsx
git commit -m "refactor(client): extract shared admin-token utility"
```

---

## Task 9: Client — `api/dossiers.ts`

**Files:**
- Create: `client/src/api/dossiers.ts`

- [ ] **Step 1: Create the API client module**

Create `client/src/api/dossiers.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/api/dossiers.ts
git commit -m "feat(client): add dossiers API client"
```

---

## Task 10: Client — `DuelMode.tsx` page

**Files:**
- Create: `client/src/pages/DuelMode.tsx`

- [ ] **Step 1: Create the page**

Create `client/src/pages/DuelMode.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react';
import { getSavedDecks, type SavedDeck } from '../api/deckIO';
import { getGames, logGame } from '../api/personalGames';
import {
  getOpponentDossier, getPilotDossier,
  generateOpponentDossier, generatePilotDossier,
  addDossierNote, type OpponentDossierContent, type PilotDossierContent,
  type DossierRow, type DossierNote, type NoteCategory,
} from '../api/dossiers';
import ErrorBanner from '../components/common/ErrorBanner';
import { hapticLight } from '../utils/haptics';

const MY_DECK_KEY = 'duel_mode_deck_id';

const CATEGORY_LABEL: Record<NoteCategory, string> = {
  'negate-priority': 'Negate priority',
  'play-around': 'Play-around',
  'combo-line': 'Combo line',
  general: 'General',
};

function DossierNotes({ notes, onAdd }: { notes: DossierNote[]; onAdd: (category: NoteCategory, text: string) => void }) {
  const [category, setCategory] = useState<NoteCategory>('general');
  const [text, setText] = useState('');

  return (
    <div className="mt-4 pt-4 border-t border-md-border/40">
      <h4 className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-2">Your notes</h4>
      {notes.length === 0 ? (
        <p className="text-xs text-md-textMuted mb-3">No notes yet.</p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {notes.map((n) => (
            <li key={n.id} className="text-sm text-md-textSecondary">
              <span className="text-[10px] font-bold text-md-blue uppercase mr-1.5">{CATEGORY_LABEL[n.category]}</span>
              {n.note}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)}
          className="bg-md-bg border border-md-border rounded-lg px-2 py-2 text-xs text-md-text focus:outline-none focus:border-md-blue">
          {(Object.keys(CATEGORY_LABEL) as NoteCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note..."
          className="flex-1 min-w-[140px] bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue" />
        <button
          onClick={() => { if (text.trim()) { onAdd(category, text.trim()); setText(''); } }}
          className="px-3 py-2 text-xs font-bold rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 hover:bg-md-blue/25 transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

function OpponentDossierView({
  content, notes, onAddNote,
}: { content: OpponentDossierContent; notes: DossierNote[]; onAddNote: (c: NoteCategory, t: string) => void }) {
  return (
    <div>
      <p className="text-sm text-md-text mb-4">{content.overview}</p>
      <Section title="Key starters" items={content.keyStarters} />
      <Section title="Choke points — negate these" items={content.chokePoints} accentClass="text-md-red" />
      <Section title="Typical end boards" items={content.typicalEndBoards} />
      <Section title="Play-arounds" items={content.playArounds} accentClass="text-md-green" />
      <DossierNotes notes={notes} onAdd={onAddNote} />
    </div>
  );
}

function PilotDossierView({
  content, notes, onAddNote,
}: { content: PilotDossierContent; notes: DossierNote[]; onAddNote: (c: NoteCategory, t: string) => void }) {
  return (
    <div>
      <p className="text-sm text-md-text mb-4">{content.overview}</p>
      <Section title="Combo lines" items={content.comboLines} accentClass="text-md-blue" />
      <Section title="Playing under interruption" items={content.underInterruption} accentClass="text-md-red" />
      <Section title="Key cards" items={content.keyStarters} />
      <Section title="Matchup tips" items={content.matchupTips.map((t) => `vs ${t.opponent}: ${t.tip}`)} />
      <DossierNotes notes={notes} onAdd={onAddNote} />
    </div>
  );
}

// accentClass takes the full Tailwind class (e.g. "text-md-red"), not just the
// color token — Tailwind's JIT scanner only picks up literal class strings in
// source, so building the class via `text-${accent}` interpolation would
// silently produce no styling in a production build.
function Section({ title, items, accentClass }: { title: string; items: string[]; accentClass?: string }) {
  return (
    <div className="mb-4">
      <h4 className={`text-xs font-bold uppercase tracking-widest mb-1.5 ${accentClass || 'text-md-textMuted'}`}>{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-md-textSecondary leading-snug">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function DuelMode() {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [recentOpponents, setRecentOpponents] = useState<string[]>([]);
  const [myDeckId, setMyDeckId] = useState<number | null>(() => {
    const stored = localStorage.getItem(MY_DECK_KEY);
    return stored ? Number(stored) : null;
  });
  const [opponentInput, setOpponentInput] = useState('');
  const [activeOpponent, setActiveOpponent] = useState<string | null>(null);
  const [tab, setTab] = useState<'opponent' | 'pilot'>('opponent');

  const [opponentDossier, setOpponentDossier] = useState<DossierRow<OpponentDossierContent> | null>(null);
  const [opponentNotes, setOpponentNotes] = useState<DossierNote[]>([]);
  const [opponentStale, setOpponentStale] = useState(false);
  const [pilotDossier, setPilotDossier] = useState<DossierRow<PilotDossierContent> | null>(null);
  const [pilotNotes, setPilotNotes] = useState<DossierNote[]>([]);
  const [pilotStale, setPilotStale] = useState(false);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [logFlash, setLogFlash] = useState('');

  useEffect(() => {
    getSavedDecks().then(setDecks).catch(() => {});
    getGames({ limit: 50 })
      .then((games) => {
        const seen = new Set<string>();
        const recent: string[] = [];
        for (const g of games) {
          if (!seen.has(g.opponent_deck)) { seen.add(g.opponent_deck); recent.push(g.opponent_deck); }
        }
        setRecentOpponents(recent.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  const myDeck = useMemo(() => decks.find((d) => d.id === myDeckId) ?? null, [decks, myDeckId]);

  function pickMyDeck(id: number) {
    setMyDeckId(id);
    localStorage.setItem(MY_DECK_KEY, String(id));
  }

  async function loadDossiers(archetype: string) {
    setLoading(true);
    setError('');
    try {
      const opp = await getOpponentDossier(archetype);
      setOpponentDossier(opp.dossier);
      setOpponentNotes(opp.notes);
      setOpponentStale(opp.stale);
      if (myDeckId) {
        const pilot = await getPilotDossier(myDeckId);
        setPilotDossier(pilot.dossier);
        setPilotNotes(pilot.notes);
        setPilotStale(pilot.stale);
      }
      setActiveOpponent(archetype);
    } catch (e: any) {
      setError(e.message || 'Failed to load dossier');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateOpponent() {
    if (!activeOpponent) return;
    setGenerating(true);
    try {
      await generateOpponentDossier(activeOpponent);
      await loadDossiers(activeOpponent);
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGeneratePilot() {
    if (!myDeckId) return;
    setGenerating(true);
    try {
      const pilot = await generatePilotDossier(myDeckId);
      setPilotDossier(pilot);
      setPilotStale(false);
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddNote(kind: 'opponent' | 'pilot', category: NoteCategory, note: string) {
    const note_ = await addDossierNote(
      kind === 'opponent'
        ? { kind, archetype: activeOpponent!, category, note }
        : { kind, deck_id: myDeckId!, category, note }
    );
    if (kind === 'opponent') setOpponentNotes((prev) => [note_, ...prev]);
    else setPilotNotes((prev) => [note_, ...prev]);
  }

  async function handleLogResult(result: 'win' | 'loss' | 'draw') {
    if (!myDeck || !activeOpponent) return;
    hapticLight();
    try {
      await logGame({ deck_played: myDeck.archetype || myDeck.name, opponent_deck: activeOpponent, result, went_first: null, notes: null });
      setLogFlash(`✓ ${result.toUpperCase()} logged`);
      setTimeout(() => setLogFlash(''), 2500);
    } catch (e: any) {
      setLogFlash(`Failed: ${e.message || 'unknown error'}`);
      setTimeout(() => setLogFlash(''), 4000);
    }
  }

  if (!myDeck) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-md-text">Duel Mode</h1>
        <p className="text-sm text-md-textSecondary">Pick the deck you're playing this session.</p>
        {decks.length === 0 ? (
          <p className="text-sm text-md-textMuted">No saved decks yet — save one in My Decks first.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {decks.map((d) => (
              <button key={d.id} onClick={() => pickMyDeck(d.id)}
                className="press text-left p-4 rounded-xl bg-md-surface border border-md-border hover:border-md-blue/40 transition-colors">
                <p className="font-bold text-md-text">{d.name}</p>
                {d.archetype && <p className="text-xs text-md-textMuted">{d.archetype}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-md-text">Duel Mode</h1>
          <p className="text-xs text-md-textMuted">Playing {myDeck.name}</p>
        </div>
        <button onClick={() => setMyDeckId(null)} className="text-xs text-md-blue">Switch deck</button>
      </div>

      {error && <ErrorBanner message={error} />}

      {!activeOpponent ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={opponentInput} onChange={(e) => setOpponentInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && opponentInput.trim() && loadDossiers(opponentInput.trim())}
              placeholder="Opponent's archetype..."
              className="flex-1 bg-md-surface border border-md-border rounded-xl px-3 py-3 text-base text-md-text focus:outline-none focus:border-md-blue" />
            <button onClick={() => opponentInput.trim() && loadDossiers(opponentInput.trim())}
              className="px-4 py-3 rounded-xl bg-md-blue/15 text-md-blue border border-md-blue/30 font-bold">
              Go
            </button>
          </div>
          {recentOpponents.length > 0 && (
            <div>
              <p className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-2">Recent opponents</p>
              <div className="flex flex-wrap gap-2">
                {recentOpponents.map((o) => (
                  <button key={o} onClick={() => loadDossiers(o)}
                    className="press px-3 py-2 rounded-lg bg-md-surface border border-md-border text-sm text-md-textSecondary hover:border-md-blue/40">
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setActiveOpponent(null)} className="text-xs text-md-blue">← Back</button>
            <h2 className="text-lg font-bold text-md-text">{activeOpponent}</h2>
            <div className="w-10" />
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('opponent')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${tab === 'opponent' ? 'bg-md-blue/15 text-md-blue border border-md-blue/30' : 'bg-md-surface text-md-textMuted border border-md-border'}`}>
              Answer them
            </button>
            <button onClick={() => setTab('pilot')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${tab === 'pilot' ? 'bg-md-blue/15 text-md-blue border border-md-blue/30' : 'bg-md-surface text-md-textMuted border border-md-border'}`}>
              Your lines
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-md-textMuted">Loading...</p>
          ) : tab === 'opponent' ? (
            opponentDossier ? (
              <div>
                {opponentStale && (
                  <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-md-orange/10 border border-md-orange/30">
                    <span className="text-xs text-md-orange">Meta has moved since this was generated.</span>
                    <button onClick={handleGenerateOpponent} disabled={generating}
                      className="text-xs font-bold text-md-orange underline disabled:opacity-50">
                      {generating ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                )}
                <OpponentDossierView
                  content={opponentDossier.content_json}
                  notes={opponentNotes}
                  onAddNote={(c, t) => handleAddNote('opponent', c, t)}
                />
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-md-surface border border-md-border text-center">
                <p className="text-sm text-md-textMuted mb-3">No dossier yet for {activeOpponent}.</p>
                <button onClick={handleGenerateOpponent} disabled={generating}
                  className="px-4 py-2 rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 text-sm font-bold disabled:opacity-50">
                  {generating ? 'Generating...' : 'Generate dossier'}
                </button>
              </div>
            )
          ) : pilotDossier ? (
            <div>
              {pilotStale && (
                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-md-orange/10 border border-md-orange/30">
                  <span className="text-xs text-md-orange">This deck changed since the guide was generated.</span>
                  <button onClick={handleGeneratePilot} disabled={generating}
                    className="text-xs font-bold text-md-orange underline disabled:opacity-50">
                    {generating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              )}
              <PilotDossierView
                content={pilotDossier.content_json}
                notes={pilotNotes}
                onAddNote={(c, t) => handleAddNote('pilot', c, t)}
              />
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-md-surface border border-md-border text-center">
              <p className="text-sm text-md-textMuted mb-3">No pilot guide yet for {myDeck.name}.</p>
              <button onClick={handleGeneratePilot} disabled={generating}
                className="px-4 py-2 rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 text-sm font-bold disabled:opacity-50">
                {generating ? 'Generating...' : 'Generate pilot guide'}
              </button>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-md-border/40">
            <p className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-2">Log result</p>
            {logFlash && <p className="text-xs text-md-green mb-2">{logFlash}</p>}
            <div className="flex gap-2">
              {(['win', 'loss', 'draw'] as const).map((r) => (
                <button key={r} onClick={() => handleLogResult(r)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    r === 'win' ? 'bg-md-green/15 text-md-green border-md-green/30'
                    : r === 'loss' ? 'bg-md-red/15 text-md-red border-md-red/30'
                    : 'bg-md-textMuted/15 text-md-textMuted border-md-border'
                  }`}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/DuelMode.tsx
git commit -m "feat(client): add Duel Mode page"
```

---

## Task 11: Client — routing

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add the lazy import**

In `client/src/App.tsx`, add after `const MyGames = lazy(() => import('./pages/MyGames'));`:

```ts
const DuelMode = lazy(() => import('./pages/DuelMode'));
```

- [ ] **Step 2: Add the route**

Add after `<Route path="/my-games" element={<MyGames />} />`:

```tsx
              <Route path="/duel-mode" element={<DuelMode />} />
```

- [ ] **Step 3: Verify the client builds and the route resolves**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(client): route /duel-mode to the Duel Mode page"
```

---

## Task 12: Client — navigation entries

**Files:**
- Modify: `client/src/components/layout/MobileBottomNav.tsx`
- Modify: `client/src/components/layout/MobileMoreSheet.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`

Duel Mode is the live-use, mid-duel feature, so it takes a primary slot in the mobile bottom nav. Trends (dashboard-browsing, not live-use) moves into the "More" sheet to make room. Desktop's Sidebar keeps every page in one list, so Duel Mode is simply added there.

- [ ] **Step 1: Swap Trends for Duel Mode in the bottom nav**

In `client/src/components/layout/MobileBottomNav.tsx`, replace the `Trends` entry in the `tabs` array:

```ts
  { to: '/trends', label: 'Trends', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
```

with:

```ts
  { to: '/duel-mode', label: 'Duel', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
```

- [ ] **Step 2: Add Trends to the More sheet**

In `client/src/components/layout/MobileMoreSheet.tsx`, add to the `items` array (after the `Admin` entry):

```ts
  { to: '/trends', label: 'Meta Trends', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
```

- [ ] **Step 3: Add Duel Mode to the desktop Sidebar**

In `client/src/components/layout/Sidebar.tsx`, add to the `navItems` array (after the `Dashboard` entry, so it's prominent):

```ts
  { to: '/duel-mode', label: 'Duel Mode', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
```

- [ ] **Step 4: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/layout/MobileBottomNav.tsx client/src/components/layout/MobileMoreSheet.tsx client/src/components/layout/Sidebar.tsx
git commit -m "feat(client): surface Duel Mode in navigation"
```

---

## Task 13: Client — Admin bulk-generation control

**Files:**
- Modify: `client/src/pages/Admin.tsx`

- [ ] **Step 1: Add the bulk-generate section**

In `client/src/pages/Admin.tsx`, add the import (with the other imports):

```ts
import { bulkGenerateOpponentDossiers } from '../api/dossiers';
```

Add state (with the other `useState` calls):

```ts
  const [dossierBusy, setDossierBusy] = useState(false);
  const [dossierResult, setDossierResult] = useState<string>('');
```

Add the handler (with the other handlers, e.g. after `runSync`):

```ts
  async function runBulkDossiers() {
    setDossierBusy(true);
    setDossierResult('');
    try {
      const { results } = await bulkGenerateOpponentDossiers(10);
      const ok = results.filter((r) => r.ok).length;
      setDossierResult(`${ok}/${results.length} dossiers generated`);
    } catch (e: any) {
      setDossierResult(`Failed: ${e.message || 'unknown error'}`);
    } finally {
      setDossierBusy(false);
    }
  }
```

Add the section to the JSX, after the closing `</div>` of the sync-sources `<div className="bg-md-surface border border-md-border rounded-2xl divide-y divide-md-border">...</div>` block:

```tsx
      <div className="mt-6 bg-md-surface border border-md-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-md-text">Opponent Dossiers</p>
          <button
            onClick={runBulkDossiers}
            disabled={dossierBusy}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-md-blue/15 text-md-blue border border-md-blue/30 hover:bg-md-blue/25 disabled:opacity-50 transition-colors"
          >
            {dossierBusy ? 'Generating…' : 'Generate top 10'}
          </button>
        </div>
        <p className="text-xs text-md-textMuted">Generates AI scouting dossiers for the top 10 archetypes by power.</p>
        {dossierResult && <p className="text-xs text-md-green mt-2">{dossierResult}</p>}
      </div>
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Admin.tsx
git commit -m "feat(client): bulk opponent-dossier generation in Admin"
```

---

## Task 14: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start both servers**

Run: `cd server && npm run dev` (background)
Run: `cd client && npm run dev` (background)

- [ ] **Step 2: Bulk-generate dossiers from Admin**

Open the client in a browser, go to `/admin`, enter the admin token, click "Generate top 10". Confirm the result text shows `N/10 dossiers generated` with `N > 0`.

- [ ] **Step 3: Walk the Duel Mode flow**

Go to `/duel-mode`. Pick a saved deck. Enter (or tap a recent) opponent archetype that was just bulk-generated. Confirm:
- The "Answer them" tab shows overview, key starters, choke points, end boards, and play-arounds.
- Switching to "Your lines" either shows a pilot dossier (if previously generated) or an on-demand "Generate pilot guide" button; click it and confirm the pilot content appears with combo lines, under-interruption guidance, and matchup tips.
- Adding a note in each tab persists it (reload the page and confirm the note is still there).
- Tapping WIN/LOSS/DRAW shows the log confirmation; then check `/my-games` and confirm a new row appears with the correct deck/opponent/result.

- [ ] **Step 4: Confirm staleness detection**

Re-run the meta sync (`Admin` page's "Sync now" for Deck Types, or `POST /api/sync/run/mdm_deck_types`), which bumps `deck_types.updated_at`. Reopen the same archetype in Duel Mode's "Answer them" tab and confirm the orange "Meta has moved since this was generated" banner appears with a working "Regenerate" button. Repeat for a saved deck: edit and re-save it in My Decks, then reopen its "Your lines" tab and confirm the equivalent stale banner appears.

- [ ] **Step 5: Confirm nav placement**

At a mobile viewport width, confirm the bottom nav shows a "Duel" tab and that "Trends" is reachable from the "More" sheet. At desktop width, confirm the Sidebar lists "Duel Mode".

- [ ] **Step 6: Confirm failed generation doesn't clobber a good version**

Temporarily set an invalid `ANTHROPIC_API_KEY` in `server/.env`, restart the server, and call the generate endpoint again for an archetype that already has a completed dossier:

```bash
curl -X POST http://localhost:3001/api/dossiers/opponent/<Archetype>/generate -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Expected: `422` error response. Then `curl http://localhost:3001/api/dossiers/opponent/<Archetype>` still returns the previous completed dossier, unchanged. Restore the correct API key afterward.

No commit for this task — it's a manual verification pass over already-committed code.
