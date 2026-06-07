# Neuron Import/Export — Phase 1 (.ydk Interchange Core + Persistence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship bidirectional deck import/export via the `.ydk` format plus a saved-deck library, as the reliable foundation for the later Konami DB and OCR phases.

**Architecture:** A server-side `deckCodecService` owns the single source of truth for `.ydk` parse/build (pure, unit-tested with Vitest) and DB-backed passcode↔name resolution (`cards.id` is the Konami passcode). A new `deckIO` Express route exposes parse/export/resolve plus `user_decks` CRUD. The React `DeckBuilder` gains an Import/Export modal and a side deck; a new `MyDecks` page lists saved decks. Native share/clipboard/file actions use Capacitor plugins with web fallbacks gated by `useIsNative`.

**Tech Stack:** Node/Express + Postgres (Neon), TypeScript, Vitest (added to server), React/Vite, Capacitor 8 (`@capacitor/share`, `@capacitor/clipboard`, `@capacitor/filesystem`).

**Scope note:** This plan is Phase 1 only. The Konami DB URL channel, OCR fallback, Android share-target, and export-to-Neuron live in later plans (they depend on Phase 0 spikes in the design spec). Out of scope here: camera, ML Kit, QR.

---

## File Structure

**Server**
- Create `server/vitest.config.ts` — Vitest config (node env).
- Create `server/src/services/deckCodecService.ts` — pure `.ydk` parse/build + DB resolution.
- Create `server/src/services/deckCodecService.test.ts` — unit tests for pure functions.
- Create `server/src/routes/deckIO.ts` — `/parse-ydk`, `/export-ydk`, `/resolve`, `user_decks` CRUD.
- Modify `server/src/db/schema.sql` — append `user_decks` table.
- Modify `server/src/index.ts` — register the route.
- Modify `server/package.json` — add Vitest + `test` script.

**Client**
- Create `client/src/api/deckIO.ts` — typed API wrappers.
- Create `client/src/utils/deckShare.ts` — clipboard/share/download, native vs web.
- Create `client/src/components/decks/DeckImportExport.tsx` — import/export modal.
- Create `client/src/pages/MyDecks.tsx` — saved-deck library.
- Modify `client/src/pages/DeckBuilder.tsx` — store passcode `id`, add side deck, mount modal, link to My Decks.
- Modify `client/src/App.tsx` — add `/my-decks` route.
- Modify `client/src/components/layout/Sidebar.tsx` — add My Decks nav item.
- Modify `client/package.json` — add Capacitor plugins.

---

## Task 1: Add Vitest to the server

**Files:**
- Modify: `server/package.json`
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Install Vitest**

Run (in `server/`):
```
npm install -D vitest@^2
```
Expected: `added N packages`.

- [ ] **Step 2: Add the test script**

In `server/package.json`, add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify the runner starts (no tests yet)**

Run (in `server/`): `npm test`
Expected: Vitest runs and reports "No test files found" (exit 0 or 1 is fine — it confirms Vitest is wired).

- [ ] **Step 5: Commit**

```
git add server/package.json server/package-lock.json server/vitest.config.ts
git commit -m "test(server): add vitest runner"
```

---

## Task 2: `deckCodecService` — parse `.ydk`

**Files:**
- Create: `server/src/services/deckCodecService.ts`
- Test: `server/src/services/deckCodecService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/deckCodecService.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseYdk } from './deckCodecService.js';

describe('parseYdk', () => {
  it('parses main, extra, and side sections into passcode arrays', () => {
    const ydk = [
      '#created by MD Meta',
      '#main',
      '10497636',
      '10497636',
      '#extra',
      '1561110',
      '!side',
      '14558127',
      '',
    ].join('\n');

    expect(parseYdk(ydk)).toEqual({
      main: [10497636, 10497636],
      extra: [1561110],
      side: [14558127],
    });
  });

  it('tolerates a missing side section', () => {
    const ydk = '#main\n10497636\n#extra\n';
    expect(parseYdk(ydk)).toEqual({ main: [10497636], extra: [], side: [] });
  });

  it('ignores blank lines and comment lines', () => {
    const ydk = '#main\n\n10497636\n# a comment\n';
    expect(parseYdk(ydk)).toEqual({ main: [10497636], extra: [], side: [] });
  });

  it('throws with line context on a non-numeric token', () => {
    const ydk = '#main\n10497636\nnot-a-passcode\n';
    expect(() => parseYdk(ydk)).toThrow(/line 3/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `server/`): `npm test -- deckCodecService`
Expected: FAIL — `parseYdk` not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `server/src/services/deckCodecService.ts`:
```ts
export interface DeckPasscodes {
  main: number[];
  extra: number[];
  side: number[];
}

type Section = keyof DeckPasscodes;

export function parseYdk(text: string): DeckPasscodes {
  const deck: DeckPasscodes = { main: [], extra: [], side: [] };
  let section: Section | null = null;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line === '#main') { section = 'main'; continue; }
    if (line === '#extra') { section = 'extra'; continue; }
    if (line === '!side') { section = 'side'; continue; }
    if (line.startsWith('#') || line.startsWith('!')) continue; // other comments/sections

    if (section === null) continue; // tokens before any section header
    if (!/^\d+$/.test(line)) {
      throw new Error(`Invalid .ydk: non-numeric card id "${line}" on line ${i + 1}`);
    }
    deck[section].push(Number(line));
  }

  return deck;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (in `server/`): `npm test -- deckCodecService`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```
git add server/src/services/deckCodecService.ts server/src/services/deckCodecService.test.ts
git commit -m "feat(server): parse .ydk into passcode arrays"
```

---

## Task 3: `deckCodecService` — build `.ydk`

**Files:**
- Modify: `server/src/services/deckCodecService.ts`
- Test: `server/src/services/deckCodecService.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/src/services/deckCodecService.test.ts`:
```ts
import { buildYdk } from './deckCodecService.js';

describe('buildYdk', () => {
  it('serializes a deck with all three sections', () => {
    const ydk = buildYdk({ main: [10497636, 10497636], extra: [1561110], side: [14558127] });
    expect(ydk).toBe(
      ['#created by MD Meta', '#main', '10497636', '10497636', '#extra', '1561110', '!side', '14558127', ''].join('\n')
    );
  });

  it('round-trips: parseYdk(buildYdk(x)) === x', () => {
    const deck = { main: [111, 111, 222], extra: [333], side: [] };
    expect(parseYdk(buildYdk(deck))).toEqual(deck);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `server/`): `npm test -- deckCodecService`
Expected: FAIL — `buildYdk` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `server/src/services/deckCodecService.ts`:
```ts
export function buildYdk(deck: DeckPasscodes): string {
  const lines: string[] = ['#created by MD Meta', '#main'];
  for (const id of deck.main) lines.push(String(id));
  lines.push('#extra');
  for (const id of deck.extra) lines.push(String(id));
  lines.push('!side');
  for (const id of deck.side) lines.push(String(id));
  lines.push(''); // trailing newline
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (in `server/`): `npm test -- deckCodecService`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```
git add server/src/services/deckCodecService.ts server/src/services/deckCodecService.test.ts
git commit -m "feat(server): build .ydk from passcode arrays"
```

---

## Task 4: `deckCodecService` — DB resolution helpers

**Files:**
- Modify: `server/src/services/deckCodecService.ts`

No unit test: these are thin SQL wrappers and the repo has no test database. They are exercised by the route smoke test in Task 8.

- [ ] **Step 1: Add resolution types and functions**

Append to `server/src/services/deckCodecService.ts`:
```ts
import type { Pool } from '@neondatabase/serverless';
import { queryAll } from '../utils/dbHelpers.js';

export interface ResolvedCard {
  id: number;            // passcode
  name: string;
  type: string | null;
  image_small_url: string | null;
}

export interface ResolveResult {
  cards: ResolvedCard[];     // de-duplicated card info, in DB order
  unresolved: number[];      // passcodes with no matching card row
}

/** Map passcodes -> card info. Unknown passcodes returned in `unresolved`. */
export async function resolvePasscodes(pool: Pool, passcodes: number[]): Promise<ResolveResult> {
  const unique = [...new Set(passcodes)];
  if (unique.length === 0) return { cards: [], unresolved: [] };
  const rows = await queryAll(pool,
    'SELECT id, name, type, image_small_url FROM cards WHERE id = ANY($1)',
    [unique]
  );
  const found = new Set<number>(rows.map((r: any) => Number(r.id)));
  const unresolved = unique.filter((p) => !found.has(p));
  return { cards: rows as ResolvedCard[], unresolved };
}

export interface NameResolveResult {
  resolved: Record<string, number>; // lowercased name -> passcode
  unresolved: string[];
}

/** Exact (case-insensitive) name -> passcode. */
export async function resolveNames(pool: Pool, names: string[]): Promise<NameResolveResult> {
  const unique = [...new Set(names.map((n) => n.toLowerCase()))];
  if (unique.length === 0) return { resolved: {}, unresolved: [] };
  const rows = await queryAll(pool,
    'SELECT id, name FROM cards WHERE LOWER(name) = ANY($1)',
    [unique]
  );
  const resolved: Record<string, number> = {};
  for (const r of rows as any[]) resolved[r.name.toLowerCase()] = Number(r.id);
  const unresolved = unique.filter((n) => !(n in resolved));
  return { resolved, unresolved };
}
```

- [ ] **Step 2: Verify it compiles**

Run (in `server/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add server/src/services/deckCodecService.ts
git commit -m "feat(server): add passcode/name DB resolution helpers"
```

---

## Task 5: `user_decks` table

**Files:**
- Modify: `server/src/db/schema.sql`

- [ ] **Step 1: Append the table definition**

Add to the end of `server/src/db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS user_decks (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  archetype   TEXT,
  main_json   TEXT NOT NULL,   -- JSON: [{ "passcode": <int>, "count": <int> }]
  extra_json  TEXT,
  side_json   TEXT,
  source      TEXT,            -- 'manual' | 'ydk' | 'neuron-url' | 'ocr'
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

- [ ] **Step 2: Verify the schema applies**

Start the server config (it runs `initDb()` which executes `schema.sql`):
Run (in `server/`): `npm run dev`
Expected: log line `[DB] Schema initialized` with no SQL error. Stop the server (Ctrl-C) after the line appears.

> If `DATABASE_URL` is not set locally, skip running and instead verify the SQL is valid by inspection; the table uses only standard Postgres syntax already present in this file.

- [ ] **Step 3: Commit**

```
git add server/src/db/schema.sql
git commit -m "feat(server): add user_decks table"
```

---

## Task 6: `deckIO` route — parse / export / resolve

**Files:**
- Create: `server/src/routes/deckIO.ts`

- [ ] **Step 1: Create the route with the three stateless endpoints**

Create `server/src/routes/deckIO.ts`:
```ts
import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { parseYdk, buildYdk, resolvePasscodes, type DeckPasscodes } from '../services/deckCodecService.js';

const router = Router();

// POST /api/decks-io/parse-ydk { ydk } -> { main, extra, side, cards, unresolved }
router.post('/parse-ydk', async (req: Request, res: Response) => {
  try {
    const { ydk } = req.body as { ydk?: string };
    if (typeof ydk !== 'string') return res.status(400).json({ error: 'ydk (string) is required' });

    let deck: DeckPasscodes;
    try {
      deck = parseYdk(ydk);
    } catch (e: any) {
      return res.status(422).json({ error: e.message });
    }

    const all = [...deck.main, ...deck.extra, ...deck.side];
    const { cards, unresolved } = await resolvePasscodes(getPool(), all);
    res.json({ ...deck, cards, unresolved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/decks-io/export-ydk { main, extra, side } -> { ydk }
router.post('/export-ydk', (req: Request, res: Response) => {
  try {
    const { main = [], extra = [], side = [] } = req.body as Partial<DeckPasscodes>;
    const toInts = (arr: unknown): number[] =>
      Array.isArray(arr) ? arr.map((n) => Number(n)).filter((n) => Number.isInteger(n)) : [];
    const ydk = buildYdk({ main: toInts(main), extra: toInts(extra), side: toInts(side) });
    res.json({ ydk });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/decks-io/resolve { passcodes } -> { cards, unresolved }
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const { passcodes } = req.body as { passcodes?: number[] };
    if (!Array.isArray(passcodes)) return res.status(400).json({ error: 'passcodes (array) is required' });
    const result = await resolvePasscodes(getPool(), passcodes.map(Number));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Verify it compiles**

Run (in `server/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add server/src/routes/deckIO.ts
git commit -m "feat(server): add deckIO parse/export/resolve endpoints"
```

---

## Task 7: `deckIO` route — saved deck CRUD

**Files:**
- Modify: `server/src/routes/deckIO.ts`

- [ ] **Step 1: Add CRUD endpoints**

Add to `server/src/routes/deckIO.ts`, immediately before `export default router;`. Add the `queryAll, queryOne, run` import at the top alongside the existing imports:
```ts
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';
```
```ts
const NOW = () => Math.floor(Date.now() / 1000);

// GET /api/decks-io/saved -> deck rows (newest first)
router.get('/saved', async (_req: Request, res: Response) => {
  try {
    const rows = await queryAll(getPool(),
      'SELECT * FROM user_decks ORDER BY updated_at DESC');
    res.json(rows.map((d: any) => ({
      ...d,
      main_json: JSON.parse(d.main_json),
      extra_json: d.extra_json ? JSON.parse(d.extra_json) : [],
      side_json: d.side_json ? JSON.parse(d.side_json) : [],
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/decks-io/saved { name, archetype?, main, extra, side, source? } -> row
router.post('/saved', async (req: Request, res: Response) => {
  try {
    const { name, archetype = null, main = [], extra = [], side = [], source = 'manual' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const now = NOW();
    const row = await queryOne(getPool(),
      `INSERT INTO user_decks (name, archetype, main_json, extra_json, side_json, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [name, archetype, JSON.stringify(main), JSON.stringify(extra), JSON.stringify(side), source, now]
    );
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/decks-io/saved/:id { name, archetype?, main, extra, side } -> row
router.put('/saved/:id', async (req: Request, res: Response) => {
  try {
    const { name, archetype = null, main = [], extra = [], side = [] } = req.body;
    const row = await queryOne(getPool(),
      `UPDATE user_decks SET name=$1, archetype=$2, main_json=$3, extra_json=$4, side_json=$5, updated_at=$6
       WHERE id=$7 RETURNING *`,
      [name, archetype, JSON.stringify(main), JSON.stringify(extra), JSON.stringify(side), NOW(), req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Deck not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/decks-io/saved/:id -> { success }
router.delete('/saved/:id', async (req: Request, res: Response) => {
  try {
    await run(getPool(), 'DELETE FROM user_decks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify it compiles**

Run (in `server/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add server/src/routes/deckIO.ts
git commit -m "feat(server): add user_decks CRUD endpoints"
```

---

## Task 8: Register the route + smoke test

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Import and mount the router**

In `server/src/index.ts`, add the import alongside the other route imports (after line 18):
```ts
import deckIORouter from './routes/deckIO.js';
```
And mount it with the other routes (after the `personal-games` line):
```ts
  app.use('/api/decks-io', deckIORouter);
```

- [ ] **Step 2: Smoke-test export (pure, no DB needed)**

Start the server (`npm run dev` in `server/`), then in a second terminal:
```
curl -s -X POST http://localhost:3001/api/decks-io/export-ydk -H "Content-Type: application/json" -d "{\"main\":[10497636,10497636],\"extra\":[1561110],\"side\":[]}"
```
Expected JSON: `{"ydk":"#created by MD Meta\n#main\n10497636\n10497636\n#extra\n1561110\n!side\n"}`

- [ ] **Step 3: Smoke-test parse + resolve (requires DATABASE_URL with synced cards)**

```
curl -s -X POST http://localhost:3001/api/decks-io/parse-ydk -H "Content-Type: application/json" -d "{\"ydk\":\"#main\n10497636\n#extra\n\"}"
```
Expected: JSON containing `main`, `extra`, `side`, a `cards` array, and an `unresolved` array. (If the DB has no cards locally, `cards` may be empty and the passcode appears in `unresolved` — that still proves the endpoint and resolver run without error.) Stop the server afterward.

- [ ] **Step 4: Commit**

```
git add server/src/index.ts
git commit -m "feat(server): mount /api/decks-io route"
```

---

## Task 9: Client API wrappers

**Files:**
- Create: `client/src/api/deckIO.ts`

- [ ] **Step 1: Create the typed wrappers**

Create `client/src/api/deckIO.ts`:
```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run (in `client/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add client/src/api/deckIO.ts
git commit -m "feat(client): add deckIO API client"
```

---

## Task 10: Share/clipboard/download util + Capacitor plugins

**Files:**
- Modify: `client/package.json`
- Create: `client/src/utils/deckShare.ts`

- [ ] **Step 1: Install Capacitor plugins (versions matched to core ^8)**

Run (in `client/`):
```
npm install @capacitor/share@^8 @capacitor/clipboard@^8 @capacitor/filesystem@^8
```
Expected: `added N packages`.

- [ ] **Step 2: Create the util**

Create `client/src/utils/deckShare.ts`:
```ts
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const isNative = () => Capacitor.isNativePlatform();

/** Copy text to the clipboard (native plugin or web Clipboard API). */
export async function copyText(text: string): Promise<void> {
  if (isNative()) {
    await Clipboard.write({ string: text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}

/** Share `.ydk` text via the OS share sheet (native) or download a file (web). */
export async function shareYdk(ydk: string, filename = 'deck.ydk'): Promise<void> {
  if (isNative()) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: ydk,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: result.uri });
  } else {
    downloadYdk(ydk, filename);
  }
}

/** Web-only: trigger a browser download of the `.ydk` text. */
export function downloadYdk(ydk: string, filename = 'deck.ydk'): void {
  const blob = new Blob([ydk], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Verify it compiles**

Run (in `client/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```
git add client/package.json client/package-lock.json client/src/utils/deckShare.ts
git commit -m "feat(client): add deck share/clipboard/download util + capacitor plugins"
```

---

## Task 11: Give DeckBuilder cards a passcode + a side deck

**Files:**
- Modify: `client/src/pages/DeckBuilder.tsx`

The current `DeckCard` lacks `id` (passcode) and there is no side deck. Export needs passcodes; round-trip fidelity needs side.

- [ ] **Step 1: Extend the `DeckCard` interface and add `id` on add**

In `client/src/pages/DeckBuilder.tsx`, change the `DeckCard` interface (around line 10) to include the passcode:
```ts
interface DeckCard {
  id: number;
  name: string;
  count: number;
  image_small_url: string;
  type: string;
}
```
In `addCard` (the `return [...prev, {...}]` branch, around line 54), include `id`:
```ts
      return [...prev, { id: card.id, name: card.name, count: 1, image_small_url: card.image_small_url, type: card.type }];
```

- [ ] **Step 2: Add side deck state and helpers**

After the `extraDeck` state declaration (around line 25) add:
```ts
  const [sideDeck, setSideDeck] = useState<DeckCard[]>([]);
```
Side cards are added manually via a Shift-click on a search result. Update `addCard` to accept a target and route Shift to side. Replace the `addCard` callback signature/first lines (around line 44) with:
```ts
  const addCard = useCallback((card: Card, toSide = false) => {
    const setter = toSide ? setSideDeck : (isExtraDeck(card.type) ? setExtraDeck : setMainDeck);
```
And update the search-result button (around line 92) to route Shift-click to side:
```tsx
            <button
              key={card.id}
              onClick={(e) => addCard(card, e.shiftKey)}
```
Add a `sideCount` near the other counts (around line 69):
```ts
  const sideCount = sideDeck.reduce((s, c) => s + c.count, 0);
```

- [ ] **Step 3: Render a Side Deck section**

After the Extra Deck section's closing `</div>` (around line 195), add a Side Deck block mirroring Extra (note `removeCard` needs to target side — see Step 4):
```tsx
        {/* Side Deck */}
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="font-semibold mb-3">
            Side Deck <span className={`text-sm ${sideCount > 15 ? 'text-md-red' : 'text-md-textMuted'}`}>({sideCount}/15)</span>
          </h3>
          {sideDeck.length === 0 ? (
            <p className="text-sm text-md-textMuted text-center py-4">Shift-click a search result to add it here</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sideDeck.map((card) => (
                <button key={card.name} onClick={() => removeCard(card.name, 'side')} className="relative group" title={`${card.name} (click to remove)`}>
                  <img src={card.image_small_url} alt={card.name} className="w-14 h-20 object-cover rounded" />
                  {card.count > 1 && (
                    <span className="absolute -top-1 -right-1 bg-md-green text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{card.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 4: Update `removeCard` to take a section**

Replace the `removeCard` callback (around line 58) so it targets main/extra/side:
```ts
  const removeCard = useCallback((name: string, section: 'main' | 'extra' | 'side') => {
    const setter = section === 'side' ? setSideDeck : section === 'extra' ? setExtraDeck : setMainDeck;
    setter((prev) => {
      const card = prev.find((c) => c.name === name);
      if (!card) return prev;
      if (card.count > 1) return prev.map((c) => c.name === name ? { ...c, count: c.count - 1 } : c);
      return prev.filter((c) => c.name !== name);
    });
  }, []);
```
Then update the existing Main and Extra `onClick` handlers (around lines 147 and 175) from the old boolean call to the new section string:
- Main: `onClick={() => removeCard(card.name, 'main')}`
- Extra: `onClick={() => removeCard(card.name, 'extra')}`

- [ ] **Step 5: Verify it compiles and renders**

Run (in `client/`): `npx tsc --noEmit`
Expected: no errors.
Then verify in the running preview (server `client` on port 5173): the Deck Builder page shows a Side Deck section; adding a card with Shift-click places it in Side, plain click in Main/Extra; the count badge appears.

- [ ] **Step 6: Commit**

```
git add client/src/pages/DeckBuilder.tsx
git commit -m "feat(client): store passcode on builder cards and add side deck"
```

---

## Task 12: Import/Export modal wired into DeckBuilder

**Files:**
- Create: `client/src/components/decks/DeckImportExport.tsx`
- Modify: `client/src/pages/DeckBuilder.tsx`

- [ ] **Step 1: Create the modal component**

Create `client/src/components/decks/DeckImportExport.tsx`:
```tsx
import { useState } from 'react';
import { parseYdk, exportYdk, createSavedDeck, type ResolvedCard } from '../../api/deckIO';
import { copyText, shareYdk } from '../../utils/deckShare';

export interface BuilderCard {
  id: number;
  name: string;
  count: number;
  image_small_url: string;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // Current builder contents, for export + save.
  main: BuilderCard[];
  extra: BuilderCard[];
  side: BuilderCard[];
  // Called when an import resolves; parent loads these into the builder.
  onImport: (cards: ResolvedCard[], sections: { main: number[]; extra: number[]; side: number[] }) => void;
}

const flatten = (cards: BuilderCard[]): number[] => cards.flatMap((c) => Array(c.count).fill(c.id));
const toPayload = (cards: BuilderCard[]) => cards.map((c) => ({ passcode: c.id, count: c.count }));

export default function DeckImportExport({ open, onClose, main, extra, side, onImport }: Props) {
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [ydkInput, setYdkInput] = useState('');
  const [ydkOutput, setYdkOutput] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleImport = async () => {
    setBusy(true); setStatus('');
    try {
      const parsed = await parseYdk(ydkInput);
      onImport(parsed.cards, { main: parsed.main, extra: parsed.extra, side: parsed.side });
      if (parsed.unresolved.length > 0) {
        setStatus(`Imported. ${parsed.unresolved.length} card id(s) not found and skipped: ${parsed.unresolved.join(', ')}`);
      } else {
        setStatus('Imported successfully.');
        onClose();
      }
    } catch (e: any) {
      setStatus(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const buildExport = async () => {
    setBusy(true); setStatus('');
    try {
      const ydk = await exportYdk(flatten(main), flatten(extra), flatten(side));
      setYdkOutput(ydk);
    } catch (e: any) {
      setStatus(e.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const name = window.prompt('Deck name?');
    if (!name) return;
    setBusy(true); setStatus('');
    try {
      await createSavedDeck({
        name,
        main: toPayload(main),
        extra: toPayload(extra),
        side: toPayload(side),
        source: 'manual',
      });
      setStatus(`Saved "${name}".`);
    } catch (e: any) {
      setStatus(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-md-surface border border-md-border rounded-lg w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setTab('import')} className={`text-sm font-semibold ${tab === 'import' ? 'text-md-gold' : 'text-md-textMuted'}`}>Import</button>
          <button onClick={() => { setTab('export'); buildExport(); }} className={`text-sm font-semibold ${tab === 'export' ? 'text-md-gold' : 'text-md-textMuted'}`}>Export</button>
          <button onClick={onClose} className="ml-auto text-md-textMuted hover:text-md-text">✕</button>
        </div>

        {tab === 'import' ? (
          <div className="space-y-3">
            <p className="text-xs text-md-textMuted">Paste a .ydk deck list (passcodes).</p>
            <textarea
              value={ydkInput}
              onChange={(e) => setYdkInput(e.target.value)}
              rows={8}
              className="w-full bg-md-bg border border-md-border rounded p-2 text-xs font-mono"
              placeholder={'#main\n10497636\n...'}
            />
            <button disabled={busy || !ydkInput.trim()} onClick={handleImport} className="bg-md-blue text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
              Import into builder
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea readOnly value={ydkOutput} rows={8} className="w-full bg-md-bg border border-md-border rounded p-2 text-xs font-mono" />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => copyText(ydkOutput)} className="bg-md-surfaceHover text-sm px-3 py-2 rounded">Copy</button>
              <button disabled={busy} onClick={() => shareYdk(ydkOutput)} className="bg-md-surfaceHover text-sm px-3 py-2 rounded">Share / Download</button>
              <button disabled={busy} onClick={handleSave} className="bg-md-blue text-white text-sm font-semibold px-3 py-2 rounded ml-auto">Save to My Decks</button>
            </div>
          </div>
        )}

        {status && <p className="mt-3 text-xs text-md-textSecondary">{status}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the modal in DeckBuilder and add the Import/Export button**

In `client/src/pages/DeckBuilder.tsx`:
- Add imports at the top:
```ts
import { Link } from 'react-router-dom';
import DeckImportExport from '../components/decks/DeckImportExport';
import type { ResolvedCard } from '../api/deckIO';
```
- Add modal state near the other `useState` calls:
```ts
  const [ioOpen, setIoOpen] = useState(false);
```
- Add an import handler that loads resolved cards into the three sections. The server returns per-copy passcode arrays plus de-duplicated `cards`; rebuild counts from the passcode arrays:
```ts
  const loadImported = useCallback((cards: ResolvedCard[], sections: { main: number[]; extra: number[]; side: number[] }) => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const build = (ids: number[]): DeckCard[] => {
      const counts = new Map<number, number>();
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
      const out: DeckCard[] = [];
      for (const [id, count] of counts) {
        const info = byId.get(id);
        if (!info) continue; // unresolved already reported by the modal
        out.push({ id, name: info.name, count, image_small_url: info.image_small_url || '', type: info.type || '' });
      }
      return out;
    };
    setMainDeck(build(sections.main));
    setExtraDeck(build(sections.extra));
    setSideDeck(build(sections.side));
  }, []);
```
- In the header row (around line 114, next to the `<h2>`), add the controls:
```tsx
          <button onClick={() => setIoOpen(true)} className="bg-md-blue text-white text-sm font-semibold px-3 py-1.5 rounded">Import / Export</button>
          <Link to="/my-decks" className="text-sm text-md-textMuted hover:text-md-text underline">My Decks</Link>
```
- Before the final closing `</div>` of the component's return, mount the modal:
```tsx
      <DeckImportExport
        open={ioOpen}
        onClose={() => setIoOpen(false)}
        main={mainDeck}
        extra={extraDeck}
        side={sideDeck}
        onImport={loadImported}
      />
```

- [ ] **Step 3: Verify it compiles and round-trips**

Run (in `client/`): `npx tsc --noEmit`
Expected: no errors.
In the preview: open Deck Builder → click **Import / Export** → paste `#main\n10497636\n#extra\n` → **Import into builder** (a card appears if that passcode is in your DB, else an "unresolved" message). Switch to **Export** → a `.ydk` string renders → **Copy** works. This proves the round trip.

- [ ] **Step 4: Commit**

```
git add client/src/components/decks/DeckImportExport.tsx client/src/pages/DeckBuilder.tsx
git commit -m "feat(client): deck import/export modal in builder"
```

---

## Task 13: My Decks page + route + nav

**Files:**
- Create: `client/src/pages/MyDecks.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create the page**

Create `client/src/pages/MyDecks.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { getSavedDecks, deleteSavedDeck, exportYdk, type SavedDeck } from '../api/deckIO';
import { copyText, shareYdk } from '../utils/deckShare';
import ErrorBanner from '../components/common/ErrorBanner';

const flatten = (rows: Array<{ passcode: number; count: number }>): number[] =>
  rows.flatMap((r) => Array(r.count).fill(r.passcode));

export default function MyDecks() {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getSavedDecks().then(setDecks).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (id: number) => {
    if (!window.confirm('Delete this deck?')) return;
    try { await deleteSavedDeck(id); setDecks((d) => d.filter((x) => x.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  const exportDeck = async (deck: SavedDeck, action: 'copy' | 'share') => {
    try {
      const ydk = await exportYdk(flatten(deck.main_json), flatten(deck.extra_json), flatten(deck.side_json));
      if (action === 'copy') await copyText(ydk); else await shareYdk(ydk, `${deck.name}.ydk`);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-md-gold">My Decks</h2>
      {error && <ErrorBanner message={error} onRetry={() => { setError(''); load(); }} />}
      {loading ? (
        <p className="text-sm text-md-textMuted">Loading…</p>
      ) : decks.length === 0 ? (
        <p className="text-sm text-md-textMuted">No saved decks yet. Build one and use Import / Export → Save.</p>
      ) : (
        <div className="space-y-2">
          {decks.map((deck) => {
            const total = deck.main_json.reduce((s, c) => s + c.count, 0);
            return (
              <div key={deck.id} className="bg-md-surface border border-md-border rounded-lg p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{deck.name}</p>
                  <p className="text-xs text-md-textMuted">{total} main · {deck.source ?? 'manual'}</p>
                </div>
                <button onClick={() => exportDeck(deck, 'copy')} className="text-xs bg-md-surfaceHover px-2 py-1 rounded">Copy</button>
                <button onClick={() => exportDeck(deck, 'share')} className="text-xs bg-md-surfaceHover px-2 py-1 rounded">Share</button>
                <button onClick={() => remove(deck.id)} className="text-xs text-md-red px-2 py-1 rounded">Delete</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `client/src/App.tsx`, add the import alongside the other page imports:
```ts
import MyDecks from './pages/MyDecks';
```
And add the route inside `<Routes>` (after the `deck-builder` route):
```tsx
                  <Route path="/my-decks" element={<MyDecks />} />
```

- [ ] **Step 3: Add the Sidebar nav item**

In `client/src/components/layout/Sidebar.tsx`, add to the `navItems` array (after the `deck-builder` entry):
```ts
  { to: '/my-decks', label: 'My Decks', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
```

- [ ] **Step 4: Verify it compiles and works end to end**

Run (in `client/`): `npx tsc --noEmit`
Expected: no errors.
In the preview: navigate to **My Decks** via the sidebar (desktop) or the My Decks link in Deck Builder. Build a deck → Import/Export → Save to My Decks → it appears in the list → Copy produces a `.ydk` → Delete removes it.

- [ ] **Step 5: Commit**

```
git add client/src/pages/MyDecks.tsx client/src/App.tsx client/src/components/layout/Sidebar.tsx
git commit -m "feat(client): My Decks saved-deck library page"
```

---

## Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Server tests pass**

Run (in `server/`): `npm test`
Expected: PASS (6 codec tests).

- [ ] **Step 2: Type checks pass both sides**

Run (in `server/`): `npx tsc --noEmit` → no errors.
Run (in `client/`): `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Manual round-trip in the preview**

With both `server` (3001) and `client` (5173) running:
1. Deck Builder → add several main + extra cards, Shift-click a side card.
2. Import / Export → Export → Copy the `.ydk`.
3. Clear the deck (reload) → Import → paste the copied `.ydk` → confirm the same cards return in the same sections.
4. Export → Save to My Decks → open My Decks → Copy/Share/Delete all work.

Expected: the deck round-trips with identical counts per section; unresolved ids (if any) are reported, never silently dropped.

- [ ] **Step 4: Final commit (if any cleanup)**

```
git add -A
git commit -m "chore: phase 1 neuron import/export verification"
```

---

## Self-Review (completed by plan author)

- **Spec coverage (Phase 1 scope):** `.ydk` parse/build (Tasks 2–3), passcode resolution backbone (Task 4), `user_decks` persistence (Tasks 5, 7), `deckIO` route incl. `/resolve` (Tasks 6–8), client API (Task 9), share/clipboard/download with native+web fallbacks via `useIsNative`/`Capacitor.isNativePlatform` (Task 10), import/export UI + side deck (Tasks 11–12), My Decks library + nav (Task 13), explicit `unresolved[]` surfacing never silently dropped (Tasks 6, 12, and verification). Deferred-by-design (own plans): Konami DB URL channel, OCR, Android share-target, export-to-Neuron, QR — all gated on Phase 0 spikes.
- **Placeholder scan:** none — every code step contains full code; commands have expected output.
- **Type consistency:** `DeckPasscodes`, `ResolvedCard`, `SavedDeck`, `DeckPayload`, and the `{passcode,count}` saved-deck shape are used consistently across server and client; `removeCard(name, section)` and `addCard(card, toSide)` signatures are updated at every call site listed.
