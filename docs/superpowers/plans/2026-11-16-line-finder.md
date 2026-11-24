# Line Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the DM Azamina Line Finder into the Line Trainer as a native "Finder" tab, driven by a solver that knows no cards and reads each deck from a data file, with deck files for DM Azamina and Branded Dracotail.

**Architecture:** A TypeScript solver in `client/src/finder/` has two halves: an engine (state, moves, search, scoring, opponent mechanisms) and a deck compiler that turns a JSON deck file into the functions the engine runs. It runs in Web Workers behind a small pool, and React components in `client/src/components/finder/` render the page from a framework-free model. The artifact's own engine is kept in the repo as a test fixture, and every DM Azamina card is ported against it move by move.

**Tech Stack:** TypeScript 5, React, Vite 5 (module Web Workers), vitest 4, Tailwind `md-*` tokens, TanStack Query; Express server (one small change). No new npm packages.

**Spec:** `docs/superpowers/specs/2026-11-15-line-finder-design.md`. Read it before any task. The artifact it describes is the reference for behaviour and layout.

## Global Constraints

- Base the work on `origin/master` (fetch first) on branch `feat/line-finder`, in a worktree. The main checkout is 9 commits behind and has uncommitted changes in `server/`; do not build on it or touch those changes.
- Install with `npm ci` in `client/` and `server/`. Never run `npm install`, never add a dependency, never let either `package-lock.json` change.
- New files use LF line endings (the repo has no `.gitattributes`).
- **No card knowledge in the solver.** No card name, deck-file card id, short name or passcode in `client/src/finder/engine/**`, `client/src/finder/deck/{schema,vocabulary,compile,match}.ts`, `client/src/finder/worker/**`, `client/src/finder/model/**` or `client/src/components/finder/**`. When a card needs something the vocabulary cannot say, add a **general** word to `vocabulary.ts`, named for what it does. Never a check for a particular card.
- The order of cards and effects in a deck file must not change any result. Moves are ordered by (`order` hint, move key); card indices are assigned by sorted card id.
- Finding a line never needs a server call.
- A search never runs on the main thread, except the fallback when Workers are unavailable, in slices of at most 700 ms.
- `client/src/finder/__harness__/reference/engine.cjs` is the artifact's engine, verbatim. Never edit it.
- Search settings, copied from the artifact's page: a solve task uses `width: 60, growth: 4`; default budget `timeMs: 2500`; "Search deeper" `timeMs: 6000`; three line tabs (`top: 3`); draw-penalty variants `[15, 55, 110]` with 55 the default; hand of up to 7.
- The Finder is offered for a saved deck when a deck file knows at least half of its different Main Deck cards.
- Exact copy: tab "Finder"; buttons "Find lines", "Save to my lines", "Copy", "Search deeper"; Duel Mode link "Find a line". Saved lines get `source: 'solver'` and generator `"Line Finder"`.
- Styling uses the app's `md-*` Tailwind tokens and the existing trainer components (`client/src/components/trainer/shared.tsx`), laid out phone-first.
- Not in the first version: reading a screenshot (and the board import that comes with it), stepping through the opponent's turn, the artifact's YDKE paste box (the list comes from the saved deck).
- Commit on `feat/line-finder` only, each message ending `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. No push, pull request or merge without the user saying so.

## Review Focus

1. **The saved list changed since last visit** (a card removed, fewer copies) while the remembered hand still holds it: the hand entry is dropped, nothing throws. Test in Task 22.
2. **A deck file with a mistake** (unknown word, a group naming a card that does not exist): the page shows an error naming the card and field; the Finder never runs on a half-understood file. Tests in Tasks 4 and 21, message in Task 24.
3. **An empty hand, or a hand of only blanks:** the result is the "do nothing" line with its board value, not an exception or an endless spinner. Tests in Tasks 8 and 23.
4. **Workers missing or crashing** (old Android WebView): the solve still finishes through the main-thread fallback and the page stays responsive. Test in Task 21.
5. **Server unreachable** when saving a line, or when opening a deck never opened on this device: a plain message, the line stays on screen, no spinner forever. Tests in Tasks 26 and 27.

## File Map

```
client/src/finder/
  engine/        types.ts state.ts zones.ts record.ts moves.ts summon.ts score.ts search.ts
                 opponent.ts replay.ts robust.ts serialize.ts index.ts   (+ *.test.ts, __toy__/toyDeck.ts)
  deck/          schema.ts vocabulary.ts compile.ts match.ts registry.ts manifest.ts
    files/       dm-azamina.json dm-azamina.cards.json branded-dracotail.json branded-dracotail.cards.json
                 staples.json staples.cards.json hand-traps.json
  data/          card-index.txt cardIndex.ts
  model/         finderState.ts buildCfg.ts storage.ts solveSession.ts lineText.ts
  worker/        protocol.ts runTask.ts finder.worker.ts pool.ts
  __harness__/   reference/{engine.cjs,card-data.json,app.reference.js,page.reference.html}
                 loadReference.ts situations.ts baseline.json mapping.ts observe.ts lockstep.ts
                 groupParity.ts acceptedDiffs.ts *.smoke.test.ts *.parity.test.ts *.report.test.ts
client/src/components/finder/   FinderTab.tsx SetupPanel.tsx HandPicker.tsx OppFieldEditor.tsx
                 ResultsPanel.tsx LineView.tsx BranchView.tsx RecordEvent.tsx CardInspect.tsx HowItDecides.tsx
client/vitest.config.ts  client/vitest.finder.config.ts  client/vitest.report.config.ts
client/scripts/finder-card-data.mjs
docs/finder/     vocabulary.md adding-a-deck.md dm-azamina-parity-report.md branded-dracotail-hands.md
```

`__harness__/` is Node-only test code, excluded from `tsc`. Unit tests sit beside the code they test and stay type-checked.

Test commands (run from `client/`): `npx vitest run <file>` for one file; `npm test` for the default suite; `npm run test:parity` for the long reference comparisons.

---

# Part 1: The solver and DM Azamina

Ends with: every DM Azamina check green and a parity report for the user. No screen yet.

### Task 1: Workspace, reference fixture, test plumbing

**Files:**
- Create: `client/src/finder/__harness__/reference/engine.cjs`, `card-data.json`, `app.reference.js`, `page.reference.html`
- Create: `client/src/finder/data/card-index.txt`
- Create: `client/src/finder/__harness__/loadReference.ts`, `client/src/finder/__harness__/reference.smoke.test.ts`
- Create: `client/vitest.config.ts`, `client/vitest.finder.config.ts`, `client/vitest.report.config.ts`
- Modify: `client/tsconfig.json`, `client/package.json` (scripts only)
- Create: `docs/superpowers/specs/2026-11-15-line-finder-design.md`, `docs/superpowers/plans/2026-11-16-line-finder.md` (copied from the main checkout, where they are untracked)

**Interfaces:**
- Produces:
  ```ts
  // loadReference.ts
  export interface RefCard { pass_: number; count: number; zone: 'main' | 'extra'; name: string; type: string; race: string; attr?: string; level?: number; atk?: number; dfn?: number; desc: string }
  export interface RefCfg { mode: 'first' | 'second'; hand: Record<string, number>; deck: Record<string, number>; extra: Record<string, number>; opp?: { lp: number; mons: any[]; st: any[] }; mul?: number; dpen?: number; base?: string[] }
  export interface RefAction { k: string; tags: Record<string, boolean>; neg: boolean; run(s: any, neg: boolean): any }
  export interface RefIntr { kind: string; src: 'hand' | 'board'; label?: string; uid?: string; cardKind?: 'mon' | 'st'; force?: boolean }
  export type RefEngine = { NAMES: Record<string, string>; SHORT: Record<string, string>; BY_NAME: Record<string, string>; P: Record<string, any>; newState(cfg: RefCfg): any; gen(s: any): RefAction[]; evaluate(s: any, full?: boolean): any; solveBeam(root: any, opts?: any): any; replay(cfg: RefCfg, path: string[]): any; interrupt(pre: any, act: RefAction, it: RefIntr): any; eligible(view: any, it: RefIntr): boolean; stateKey(s: any): number; potential(s: any): number; serialize(r: any, hand: string[], k?: number): any; serializeLine(l: any, hand: string[], tag: string): any; toGenerated(l: any, name: string, hand: string[]): any; branchTask(t: any): any; planOf(cfg: RefCfg, path: string[]): any }
  export function loadReference(): { engine: RefEngine; cards: RefCard[] }     // createRequire(import.meta.url)('./reference/engine.cjs'); engine.init(cards)
  export function refExec(s: any, a: RefAction, neg: boolean): any             // a.run, then path = s.path.concat(neg ? '~' + a.k : a.k), as the reference's private exec does
  export function refFullDeck(engine: RefEngine, cards: RefCard[]): { deck: Record<string, number>; extra: Record<string, number> }
  ```

- [ ] **Step 1: Create the worktree and install**

Use superpowers:using-git-worktrees: `git fetch origin`, branch `feat/line-finder` from `origin/master`. Run `npm ci` in `client/` and in `server/`. Copy the spec and this plan from the main checkout into the worktree at the same paths.

- [ ] **Step 2: Save the artifact as fixtures**

Read the artifact with the artifacts tool (link in the spec; it is 16,643 lines, read it in parts). Split it by its `<script id="…">` blocks, tags removed, content otherwise byte-for-byte:
`engine` → `reference/engine.cjs`; `card-data` → `reference/card-data.json`; `app` → `reference/app.reference.js`; `card-index` → `data/card-index.txt`; everything before the first data script (styles and markup) → `reference/page.reference.html`.

- [ ] **Step 3: Write the failing test** (`reference.smoke.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { loadReference, refFullDeck } from './loadReference';

describe('reference fixture', () => {
  const { engine, cards } = loadReference();
  it('is the 40-card engine', () => {
    expect(cards).toHaveLength(40);
    expect(Object.keys(engine.NAMES)).toHaveLength(41);          // 40 cards + UNK
    expect(engine.P.ROD.kind).toBe('M');
  });
  it('finds a line for Rod plus four blanks', () => {
    const { deck, extra } = refFullDeck(engine, cards);
    deck.ROD -= 1;
    const r = engine.solveBeam(engine.newState({ mode: 'first', hand: { ROD: 1, UNK: 4 }, deck, extra }), { width: 60, rounds: 1, timeMs: 3_600_000 });
    expect(r.lines[0].score).toBeGreaterThan(0);
    expect(r.lines[0].state.log[0].text).toBe('Normal Summon Rod.');
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run src/finder/__harness__/reference.smoke.test.ts`
Expected: FAIL, cannot find `./loadReference`.

- [ ] **Step 5: Write `loadReference.ts` and the config**

`client/tsconfig.json`: add `"resolveJsonModule": true` and `"exclude": ["src/finder/__harness__"]`.
`client/vitest.config.ts`: `defineConfig` from `vitest/config`, `test.exclude = [...configDefaults.exclude, 'src/finder/__harness__/**/*.parity.test.ts', 'src/finder/__harness__/**/*.report.test.ts']`.
`client/vitest.finder.config.ts`: `test.include = ['src/finder/__harness__/**/*.parity.test.ts']`, `testTimeout: 1_800_000`.
`client/vitest.report.config.ts`: `test.include = ['src/finder/__harness__/**/*.report.test.ts']`, `testTimeout: 1_800_000`.
`client/package.json` scripts: `"test:parity": "vitest run --config vitest.finder.config.ts"`, `"finder:baseline": "vitest run --config vitest.report.config.ts baseline"`, `"finder:report": "vitest run --config vitest.report.config.ts higher"`, `"finder:bench": "vitest run --config vitest.report.config.ts bench"`, `"finder:hands": "vitest run --config vitest.report.config.ts hands"`.

- [ ] **Step 6: Run the test, the default suite and the build**

Run: `npx vitest run src/finder/__harness__/reference.smoke.test.ts` → PASS (2 tests).
Run: `npm test` → all existing tests still pass. Run: `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers client/src/finder client/vitest.config.ts client/vitest.finder.config.ts client/vitest.report.config.ts client/tsconfig.json client/package.json
git commit -m "test(finder): add the artifact engine as a reference fixture"
```

### Task 2: Situation set and reference baseline

**Files:**
- Create: `client/src/finder/__harness__/situations.ts`, `situations.smoke.test.ts`, `baseline.report.test.ts`, `baseline.json` (generated, committed)

**Interfaces:**
- Consumes: `loadReference`, `refFullDeck`, `RefCfg`, `RefIntr` (Task 1); `mulberry32` from `client/src/utils/trainer.ts`.
- Produces:
  ```ts
  export const PIN = { width: 240, rounds: 1, timeMs: 3_600_000, top: 3 } as const;   // one round, never clock-limited
  export const SEED = 20261115;
  export interface Situation { id: string; group: 'first' | 'second' | 'trap' | 'draw' | 'mid'; cfg: RefCfg; policy?: RefIntr[] }
  export function buildSituations(engine: RefEngine, cards: RefCard[]): Situation[]
  export function refRoot(engine: RefEngine, cfg: RefCfg): any          // cfg.base?.length ? replay(cfg, cfg.base) : newState(cfg)
  export interface BaselineRow { id: string; score: number; path: string[]; nodes: number }
  ```
- The set, in this order, ids `first-001`…:
  - `first` × 200: 5 cards drawn from the full 42-card Main Deck.
  - `second` × 65: 6-card hands, 5 for each of 13 opponent fields: (1) empty, LP 8000; (2) one 3000 ATK monster with no effect; (3) a 2500 ATK and a 2000 DEF monster in Defense; (4) a monster with `intr: 'negMon'`; (5) a monster with `intr: 'negAny'` and `noTarget`; (6) a Set card with `intr: 'negSummon'`; (7) a Set card with `intr: 'pop'`; (8) a monster with `intr: 'floodExtra'`; (9) a Spell with `intr: 'floodSpell'`; (10) a monster with `intr: 'floodMon'`; (11) a face-down monster and a Set card with `intr: 'negST'`; (12) LP 2000 and one 1500 ATK monster; (13) five monsters, one `noDestroy`.
  - `trap` × 54: going first, 5 hands for each of the nine hand-trap kinds as a one-item `policy` (`ash, imperm, veiler, droll, nibiru, belle, fuwalos, purulia, maxxc`, each `{ kind, src: 'hand', label }`), then 3 hands for each pair `ash+imperm`, `ash+droll`, `nibiru+maxxc`.
  - `draw` × 21: 7 hands for each `mul` of 1, 2 and 4.
  - `mid` × 20: going first; `cfg.base` is the first half (rounded up) of the reference's best path for that hand at `{ width: 60, rounds: 1, timeMs: 3_600_000 }` (kept small so building the set stays quick).

- [ ] **Step 1: Write the failing test** (`situations.smoke.test.ts`)

```ts
it('builds the same 360 situations every time', () => {
  const { engine, cards } = loadReference();
  const a = buildSituations(engine, cards), b = buildSituations(engine, cards);
  expect(a).toHaveLength(360);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(a.filter((s) => s.group === 'first')).toHaveLength(200);
  expect(a.filter((s) => s.group === 'second')).toHaveLength(65);
  expect(new Set(a.map((s) => s.id)).size).toBe(360);
  for (const s of a) expect(Object.values(s.cfg.hand).reduce((t, n) => t + n, 0)).toBe(s.group === 'second' ? 6 : 5);
});
```

- [ ] **Step 2: Run it** → FAIL, `buildSituations` not defined.
- [ ] **Step 3: Implement `situations.ts`.** Hands are drawn without replacement from the expanded Main Deck with `mulberry32(SEED + groupOffset)`; the drawn cards come out of `cfg.deck`.
- [ ] **Step 4: Run it** → PASS.
- [ ] **Step 5: Write `baseline.report.test.ts`.** For every situation: `engine.solveBeam(refRoot(engine, cfg), { ...PIN, policy })`, record `{ id, score: lines[0].score, path: lines[0].state.path, nodes }`, write `baseline.json` (2-space JSON, sorted by id). It runs the set twice and fails if the two results differ.
- [ ] **Step 6: Run** `npm run finder:baseline` → PASS; `baseline.json` has 360 rows.
- [ ] **Step 7: Commit** `test(finder): situation set and reference baseline`.

### Task 3: Engine state

**Files:**
- Create: `client/src/finder/engine/types.ts`, `zones.ts`, `state.ts`
- Test: `client/src/finder/engine/state.test.ts`

**Interfaces:**
- Produces (`types.ts`), the shapes every later task uses:
  ```ts
  export type CardId = string;
  export type ZoneName = 'hand' | 'deck' | 'extra' | 'gy' | 'ban';
  export interface OppCard { uid: string | number; kind: 'mon' | 'st'; name: string; atk?: number; def?: number; pos?: 'atk' | 'def' | 'set'; attr?: string; race?: string; ext?: boolean; faceDown?: boolean; noDestroy?: boolean; noTarget?: boolean; intr?: string | null }
  export interface Cfg { mode: 'first' | 'second'; hand: Record<CardId, number>; deck: Record<CardId, number>; extra: Record<CardId, number>; opp?: { lp: number; mons: OppCard[]; st: OppCard[] }; drawFx?: number; drawPenalty?: number; base?: string[] }
  export interface Mon { id: number; nm: number; emz: boolean; noEff: boolean; uses: number; lvl: number; marks: number; uid: number }
  export interface ST { id: number; up: boolean; now: boolean; endSet?: boolean }
  export interface Tags { deckTouch?: boolean; deckAdd?: boolean; fieldMon?: boolean; handMon?: boolean; gy?: boolean; spell?: boolean; trap?: boolean; noResp?: boolean; inherent?: boolean; removal?: boolean; dig?: boolean; marks?: number }
  export interface StepRec { text: string; tags: Tags; seq: unknown[] | null; ns: number; xs: number; summonsAfter: number; interrupted: string | null; pre: State | null; act: Move | null; fD: boolean; fH: boolean; fS: boolean; draws: number; ev?: boolean }
  export interface Move { k: string; tags: Tags; neg: boolean; run(s: State, negated: boolean): State }
  export interface Interruption { kind: string; src: 'hand' | 'board'; label: string; uid?: OppCard['uid']; cardKind?: 'mon' | 'st'; monster?: boolean; param?: number; force?: boolean }
  export interface StepView { tags: Tags; canNeg: boolean; summonsAfter: number; summoned: boolean; oppCount: number; oppPresent: OppCard['uid'][]; interrupted?: string | null; ev?: boolean }
  export type TurnEvent = { t: 'lose'; id: CardId; to: 'hand' | 'gy' | 'ban'; by?: string } | { t: 'gain'; id: CardId; replace?: boolean } | { t: 'oppAdd'; mon: Partial<OppCard> };
  export interface FinalBoard { hand: Uint8Array; deck: Uint8Array; extra: Uint8Array; gy: Uint8Array; mons: Mon[]; st: ST[]; opp: State['opp']; lp: number; noDirect: boolean; flags: number }
  export interface State { /* zones as Uint8Array per ZoneName with copy-on-write; mons; st; top; opt: Uint32Array; flags: number;
    ns; spell; summons; lp; addLock; pend: { e: number; a?: number }[]; opp; burn; removed; noDirect; log: StepRec[]; uid; path: string[];
    spent; cur; cDeckTouch; cDeckAdd; cFieldMon; drawFx; oppDraws; drawPenalty; opening: string[] | null;
    mode: 'first' | 'second'; turn: 'me' | 'opp'; phase: 'main' | 'battle' | 'end' */ }
  ```
  The state mirrors the reference's `newState`/`clone` field for field, with these renames: `mul`→`drawFx`, `dpen`→`drawPenalty`, `droll`→`addLock`, `cAsh/cDroll/cMon`→`cDeckTouch/cDeckAdd/cFieldMon`, `o1/o2`→`opt`, `deceReset`→ a bit in `flags` (flag names come from the deck file). `turn` and `phase` are new and fixed at `'me'`/`'main'` in this version.
- Produces (`state.ts`): `export interface StateOps { newState(cfg: Cfg, ix: Record<CardId, number>): State; clone(s: State): State; W(s: State, z: ZoneName): Uint8Array; OW(s: State): NonNullable<State['opp']>; getOpt(s: State, i: number): boolean; setOpt(s: State, i: number): void; stateKey(s: State): number }` and `export function createStateOps(nCards: number, nOpt: number, nFlags: number): StateOps`.

- [ ] **Step 1: Write the failing tests** (`state.test.ts`): `newState` puts `cfg.hand` counts in the hand zone; writing `W(clone, 'hand')` leaves the parent's hand unchanged and a zone not written is the same array object in parent and clone; two states reached by different `path`/`log` but equal zones, field, flags and `opt` have equal `stateKey`; flipping one `opt` bit, `ns`, `addLock`, one `Mon.noEff`, or `drawFx` changes `stateKey`; `stateKey` is a safe integer; `newState` sets `turn: 'me'`, `phase: 'main'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Port the reference's `zone`/`W`/`OW`/`newState`/`clone`/`zkey`/`stateKey` (engine.cjs) with numeric card indices in place of string ids.
- [ ] **Step 4: Run** → PASS. Run `npx tsc -b` → clean.
- [ ] **Step 5: Commit** `feat(finder): engine state with copy-on-write zones`.

### Task 4: Deck file schema, vocabulary registry, validator

**Files:**
- Create: `client/src/finder/deck/schema.ts`, `client/src/finder/deck/vocabulary.ts`, `docs/finder/vocabulary.md`
- Test: `client/src/finder/deck/schema.test.ts`

**Interfaces:**
- Produces (`schema.ts`):
  ```ts
  export const VOCAB_VERSION = 1;
  export interface CardFacts { passcode: number; name: string; type: string; race: string | null; attr: string | null; level: number | null; link: number | null; atk: number | null; def: number | null; text: string }
  export type Word = Record<string, unknown>;            // exactly one key: the word; its value: the arguments
  export interface DeckFile {
    vocab: number; id: string; name: string; uses?: string[];          // uses: shared files merged in first
    marks?: string[]; flags?: string[];                                 // deck-defined tag marks and state flags
    cards: CardDef[];
    groups: Record<string, CardId[] | { filter: Word }>;
    extraDeck?: ExtraRule[];
    protections?: ProtectionDef[];
    endOfTurn: { setOrder: CardId[]; keepOneInHandIf?: Word[]; setOnlyIf?: Record<CardId, Word[]> };
    boardValue: BoardValueDef[];
  }
  export interface CardDef { id: CardId; passcodes: number[]; short: string; discardValue?: number; heldValue?: number; immuneToRemoval?: boolean;
    hints?: { normalSummon?: boolean }; fieldName?: CardId | { if: Word[]; name: CardId }[]; gyName?: CardId; effects?: EffectDef[] }
  export type Loc = 'hand' | 'field' | 'setNotThisTurn' | 'faceDown' | 'faceUp' | 'gy' | 'ban' | 'extra';
  export interface EffectDef { key: string; order?: number; phase: 'main' | 'end' | 'oppTurn';
    from: Loc | Loc[];                                                  // where the card must be
    trigger?: Word; limit?: 'oncePerTurn' | { shared: string }; cond?: Word[]; cost?: Word[];
    choose?: { as: string; pick: Word; optional?: boolean }[]; do: Word[]; onNegated?: Word[];
    tags: Record<string, boolean | Word>; marks?: string[]; negatable?: boolean; activates?: 'spell' | 'trap';
    text: string; negText?: string; ledger?: { effect?: number } }
  export type ExtraRule =
    | { card: CardId; method: 'synchro'; level: number; min: number; max: number; tuners: 'exactlyOne' | 'atMostOne'; mats?: Word; then?: string }
    | { card: CardId; method: 'link'; rating: number; min: number; max: number; mats?: Word; bottomArrows?: boolean; then?: string }
    | { card: CardId; method: 'fusion'; slots: Word[]; relations?: ('sameRace' | 'sameAttr' | 'differentRace' | 'differentNames')[]; then?: string };
  export interface ProtectionDef { id: string; label: string; order: number; where: Word[]; covers?: { marks?: string[]; monsterOnly?: boolean; inResponseOnly?: boolean }; limit?: string; consume: Word[]; stepNote?: string }
  export interface BoardValueDef { id: string; when: 'oppTurn' | 'endPhase'; on: Word; base: { if?: Word[]; value: number; label: string }[]; adds?: { if: Word[]; value: number; label: string }[]; extraCopies?: { value: number; label: string }; effect?: EffectDef }
  export interface DeckFileError { card: string | null; field: string; message: string }
  export function validateDeckFile(raw: unknown, shared: Record<string, unknown>): { ok: true; file: DeckFile } | { ok: false; errors: DeckFileError[] }
  ```
  `validateDeckFile` returns the file with its `uses` already merged in. `then` on an `ExtraRule` is the key of an effect queued after the summon. `BoardValueDef.effect` is validated and otherwise ignored in this version.
- Produces (`vocabulary.ts`): four registries, `conds`, `picks`, `acts`, `triggers`, each `Map<string, { doc: string; args: ArgSpec; compile(args, ctx): Function }>`, filled through `defineCond`, `definePick`, `defineAct`, `defineTrigger`. Seed words, to be extended under the vocabulary rule:
  - conds: `has`, `count`, `control`, `monsterZoneFree`, `stZoneFree`, `notUsed`, `flag`, `addLockOff`, `lpAbove`, `oppHasTarget`, `spellActivatedThisTurn`, `not`, `any`
  - picks: `fromZone` (zone + group or filter), `fromField`, `otherHandCard`, `cheapest`, `subsets`, `oppCard`
  - acts: `move`, `summon`, `discard`, `draw`, `setFromDeck`, `faceUp`, `placeOnTop`, `payLp`, `burn`, `oppRemove`, `setFlag`, `queue`, `noDirectAttacks`
  - triggers: `normalSummoned`, `specialSummoned`, `summonedNamed`, `leftField`, `sentToGy`, `oppMonsterToGy`

- [ ] **Step 1: Write the failing tests** (`schema.test.ts`), each on a small inline file:

```ts
it('accepts a minimal file', () => { expect(validateDeckFile(MINIMAL, {}).ok).toBe(true); });
it('names the card and field of an unknown word', () => {
  const r = validateDeckFile(withEffect({ do: [{ mvoe: { what: 'chosen', to: 'hand' } }] }), {});
  expect(r).toEqual({ ok: false, errors: [{ card: 'A', field: 'effects[0].do[0]', message: 'unknown action "mvoe"' }] });
});
it('rejects a group that names a missing card', () => {
  expect(errorsOf({ ...MINIMAL, groups: { g: ['A', 'ZZ'] } })).toEqual([{ card: null, field: 'groups.g[1]', message: 'unknown card "ZZ"' }]);
});
it('rejects another vocabulary version', () => { expect(errorsOf({ ...MINIMAL, vocab: 99 })[0].message).toBe('written for vocabulary 99, this app has 1'); });
it('rejects duplicate card ids and duplicate effect keys', () => { /* two errors, each naming the duplicate */ });
it('merges a shared file named in uses', () => { /* card from shared.staples is present in file.cards */ });
it('every word has a doc line', () => { for (const reg of Object.values(WORDS)) for (const w of reg.values()) expect(w.doc.length).toBeGreaterThan(10); });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the types, registries with `doc` and argument specs (no behaviour yet beyond validation), and `validateDeckFile`. Write `docs/finder/vocabulary.md` as a table of word, kind, arguments, meaning.
- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): deck file schema, vocabulary registry and validator`.

### Task 5: Deck compiler and the toy deck

**Files:**
- Create: `client/src/finder/deck/compile.ts`, `client/src/finder/engine/__toy__/toyDeck.ts`
- Test: `client/src/finder/deck/compile.test.ts`

**Interfaces:**
- Consumes: `DeckFile`, `CardFacts`, the registries (Task 4); `State`, `Move`, `Tags` (Task 3).
- Produces:
  ```ts
  export interface CardProps { id: CardId; name: string; short: string; kind: 'M' | 'S' | 'T' | '?'; st: string | null; ext: boolean; sub: 'Normal' | 'Effect' | 'Ritual' | 'Fusion' | 'Synchro' | 'Xyz' | 'Link' | '?'; tuner: boolean; race: string | null; attr: string | null; lv: number | null; link: number | null; atk: number; def: number; discardValue: number; heldValue: number; normalSummon: boolean; immuneToRemoval: boolean }
  export type Push = (key: string, tags: Tags, run: Move['run'], negatable?: boolean) => void;
  export interface CompiledDeck {
    file: DeckFile; ids: CardId[]; ix: Record<CardId, number>; UNK: number; props: CardProps[]; nOpt: number; nFlags: number; markBit: Record<string, number>;
    genMain(s: State, push: Push): void; genPending(s: State, push: Push): void;
    onPlace(s: State, m: Mon, special: boolean): void; onLeaveField(s: State, id: number, kind: 'mon' | 'st', wasFaceUp: boolean): void; onOppMonsterToGy(s: State): void;
    extra: CompiledExtraRule[]; protections: CompiledProtection[];
    finalize(s: State): { n: FinalBoard; sets: number[] };
    boardValue(n: FinalBoard, full: boolean): { sum: number; items: [string, number][] | null };
  }
  export function compileDeck(file: DeckFile, facts: CardFacts[]): CompiledDeck      // throws DeckCompileError { errors: DeckFileError[] } for a card with no facts
  ```
  `ids` is the sorted card ids followed by `'UNK'`. `propsOf` reads the same type strings the reference's `init` does. `CompiledExtraRule`, `CompiledProtection` and `class DeckCompileError extends Error { errors: DeckFileError[] }` are exported from `compile.ts`. The compiled deck makes only card moves; Normal Summons, Tribute Summons and the `dec:` decline come from Task 6.
- Produces (`toyDeck.ts`): `TOY_FILE`, `TOY_FACTS`, `toyCfg(hand: Record<CardId, number>): Cfg` (going first; Deck of 3 copies of each Main Deck card less the hand; Extra Deck 1 `SYNC`). Six made-up cards: `SEEKER` (Level 4, short "Seeker"; effect `seeker-search`: when Normal Summoned, add a card of group `spells` (`['DRAWTWO']`) from Deck; tags `deckTouch`, `deckAdd`, `fieldMon`), `TUNER` (Level 4 Tuner; effect `tuner-ss`: Special Summon itself from hand while you control a monster, once per turn, tag `inherent`), `BIG` (Level 6, no effect), `DRAWTWO` (Normal Spell, short "Draw Two"; effect `drawtwo`: discard 1 other card as cost, draw 2; once per turn), `WALL` (Continuous Trap, Set at end of turn, board value 0.5 "Wall: negate"), `SYNC` (Level 8 Synchro, `tuners: 'exactlyOne'`, board value 1.0).

- [ ] **Step 1: Write the failing tests** (`compile.test.ts`), using a tiny driver: `mainKeys(s)` and `pendKeys(s)` collect what `genMain` / `genPending` push, `run(s, key, negated?)` runs one pushed move, `summonForTest(s, id)` moves a card from hand to the field and calls `deck.onPlace(s, mon, false)`:

```ts
it('offers moves in (order, key) order', () => { expect(mainKeys(toyState({ SEEKER: 1, DRAWTWO: 1, BIG: 1 }))).toEqual(['drawtwo:BIG', 'drawtwo:SEEKER']); });
it('queues a trigger when its card is Normal Summoned', () => {
  const s = summonForTest(toyState({ SEEKER: 1 }), 'SEEKER');
  expect(s.pend).toHaveLength(1); expect(pendKeys(s)).toEqual(['seeker-search:DRAWTWO']);
});
it('pays the cost but skips the effect when negated', () => {
  const s = run(toyState({ DRAWTWO: 1, BIG: 1 }), 'drawtwo:BIG', true);
  expect(count(s, 'gy', 'BIG')).toBe(1); expect(count(s, 'gy', 'DRAWTWO')).toBe(1); expect(handSize(s)).toBe(0);
});
it('draws two when not negated', () => { expect(handSize(run(toyState({ DRAWTWO: 1, BIG: 1 }), 'drawtwo:BIG'))).toBe(2); });
it('honours once per turn', () => { expect(mainKeys(run(toyState({ DRAWTWO: 2, BIG: 2 }), 'drawtwo:BIG'))).toEqual([]); });
it('honours a condition', () => { expect(mainKeys(toyState({ TUNER: 1 }))).toEqual([]); });
it('gives the same moves when cards and effects are listed in reverse', () => { /* compile TOY_FILE with cards and each effects array reversed; mainKeys equal for three states */ });
it('fills step text from the template', () => { expect(lastText(run(summonForTest(toyState({ SEEKER: 1 }), 'SEEKER'), 'seeker-search:DRAWTWO'))).toBe('Seeker: add Draw Two.'); });
it('refuses a card with no facts', () => { expect(() => compileDeck(TOY_FILE, TOY_FACTS.slice(1))).toThrow(/no card facts for/); });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `compileDeck`.** Each effect becomes a closure built once; `choose` entries nest; text templates take `{name}` of each `choose.as` and `{zone}`. The compiler holds no word-specific code: it asks the registries.
- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): deck compiler`.

### Task 6: Move generation and step recording

**Files:**
- Create: `client/src/finder/engine/record.ts`, `client/src/finder/engine/moves.ts`
- Test: `client/src/finder/engine/moves.test.ts`

**Interfaces:**
- Consumes: `CompiledDeck`, `Push` (Task 5), state ops (Task 3).
- Produces:
  ```ts
  // record.ts: port of the reference's step / done / L (act, sum, mv) / ledObjs
  export function step(s: State, text: string, tags?: Tags): StepRec
  export function done(s: State): State                     // counts chokes, applies live draw effects by mechanism bit, appends to log
  export const DRAW_BIT = { drawDeckExtraSummon: 1, drawHandSummon: 2, drawSpecialSummon: 4 } as const;
  // moves.ts
  export interface PlaceOpts { special?: boolean; emz?: boolean; nm?: number; noEff?: boolean; uses?: number; lvl?: number; marks?: number; ownProc?: boolean }
  export function createMoves(deck: CompiledDeck, ops: StateOps): { gen(s: State): Move[]; exec(s: State, a: Move, neg: boolean): State; place(s: State, id: number, o?: PlaceOpts): Mon; monToGy(s: State, idx: number, ledger?: boolean): Mon; stToGy(s: State, idx: number): ST; oppTargets(s: State): OppCard[]; oppRemove(s: State, uid: OppCard['uid'], how: 'destroy' | 'banish' | 'material'): OppCard | null }
  ```
  `gen`: if `s.pend.length`, only `genPending` moves plus a `dec:<effect key>` decline; otherwise Normal Summon (`ns:<id>`, Level ≤ 4, not Ritual, `hints.normalSummon !== false`), Tribute Summon (`tri:<id>:<tributed id>`, Level 5–6, one tribute), then `deck.genMain`. Floodgates on the opponent's face-up cards drop moves: `floodExtra` drops Extra Deck summons, `floodSpell` drops moves whose effect `activates: 'spell'`, `floodMon` drops moves tagged `fieldMon`. A repeated key gets `#1`, `#2`. `exec` appends the key to `path`, prefixed `~` when negated.

- [ ] **Step 1: Write the failing tests** (`moves.test.ts`, toy deck): `gen` for a hand of `SEEKER`, `DRAWTWO`, `BIG` returns keys `['ns:SEEKER', 'drawtwo:BIG', 'drawtwo:SEEKER']`; no `ns:` key is offered after a Normal Summon; `BIG` needs a monster to tribute and the key is `tri:BIG:SEEKER`; a card with `hints.normalSummon: false` gets no `ns:` key; after `ns:SEEKER` the only keys are `['dec:seeker-search', 'seeker-search:DRAWTWO']`, and `dec:seeker-search` adds no log step; each floodgate drops its class of moves; `exec(..., true)` records `~key`; a second monster placed raises `summons` to 2 and `StepRec.summonsAfter` matches; with `drawFx: 4` a Special Summon step has `draws: 1` and `oppDraws` rises by 1.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, porting the reference's `gen` preamble (`push`, floodgates, Normal/Tribute Summon), `exec`, `place`, `monToGY`, `stToGY`, `oppTargets`, `oppRemove`. Card-specific lines in those functions become calls to `deck.onPlace`, `deck.onLeaveField`, `deck.onOppMonsterToGy`.
- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): move generation and step recording`.

### Task 7: Extra Deck summons

**Files:**
- Create: `client/src/finder/engine/summon.ts`
- Test: `client/src/finder/engine/summon.test.ts`

**Interfaces:**
- Consumes: `ExtraRule` (Task 4), `createMoves` (Task 6).
- Produces: `genSynchro(s, push)`, `genLinks(s, push)`, and `fusionOptions(s: State, pool: MatView[], rules: CompiledExtraRule[]): { card: number; mats: MatView[] }[]` where `MatView = { side: 'me' | 'opp'; idx?: number; uid?: OppCard['uid']; id: number; nm: number; race: string; attr: string; sub: string; ext: boolean }`. Keys: `syn:<card>:<sorted material ids joined by +>`, `link:<card>:<same>`. Fusion moves are made by the effect that performs the Fusion (an `acts` word), which calls `fusionOptions`. Xyz is not built in this plan: neither deck has an Xyz monster to test against. `ExtraRule.method` leaves room for it.

- [ ] **Step 1: Write the failing tests** (toy deck plus two inline rules): `TUNER` and `SEEKER` on the field offer `syn:SYNC:SEEKER+TUNER`; two `SEEKER` offer nothing under `exactlyOne` and one move under an inline `atMostOne` rule; `TUNER` and `BIG` (Level 10) offer nothing for a Level 8 rule; a Link rule with `rating: 2` takes exactly two monsters; a Link-2 monster counts as 1 or 2 toward a rating of 3; a second Link is refused when the Extra Monster Zone is taken and the rule has no `bottomArrows`; `fusionOptions` with `relations: ['sameAttr', 'differentRace']` returns only pairs that satisfy both; an opponent's monster in the pool can be a material; a summon rule's `then` effect is queued after the summon.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, porting the reference's `genSynchro`, `mkSynchro`, `genLinks` and the pair logic inside its Super Polymerization block, with the rule data in place of the card checks.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(finder): Synchro, Link and Fusion material rules`.

### Task 8: Scoring and search

**Files:**
- Create: `client/src/finder/engine/score.ts`, `client/src/finder/engine/search.ts`
- Test: `client/src/finder/engine/search.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LineEval { score: number; summary: Record<string, number | boolean>; items: [string, number][] | null; sets: number[]; final: FinalBoard; chokes: { deckTouch: number; deckAdd: number; fieldMon: number } | null; state?: State; sig?: string; safest?: boolean }
  export function createScore(deck: CompiledDeck): { evaluate(s: State, full: boolean): LineEval; battle(n: FinalBoard): number; boardSig(e: LineEval): string; potential(s: State): number }
  export interface SolveOpts { timeMs?: number; top?: number; width?: number; growth?: number; maxWidth?: number; rounds?: number; converge?: boolean; policy?: Interruption[]; onRound?(r: SolveResult): void; strict?: boolean }
  export interface SolveResult { lines: LineEval[]; safest: LineEval | null; frontier: LineEval[] | null; all: LineEval[]; nodes: number; ms: number; width: number; rounds: number; errors: number }
  export function topK(h: ArrayLike<number>, m: number, k: number): number[]
  export function createSearch(moves, score, ops, hooks?: { eligible(v: StepView, it: Interruption): boolean; interrupt(pre: State, act: Move, it: Interruption): State }): { solveBeam(root: State, opts?: SolveOpts): SolveResult }
  ```
  The scoring formulas, `potential`, `battle`, `boardSig`, `topK` and the `solveBeam` loop are the reference's, number for number (engine.cjs `evaluate`, `potential`, `battle`, `boardSig`, `topK`, `solveBeam`). Deck values come from `deck.boardValue`, `deck.finalize` and `CardProps.heldValue`; a monster with no board-value entry is worth `min(0.2, atk / 15000)` under its short name. One deliberate difference: where the reference silently skips a move that throws, this search counts it in `errors`, and with `strict: true` throws it. Every harness and parity call passes `strict: true`; the worker does not. `policy` needs `hooks`, which Task 17 supplies.

- [ ] **Step 1: Write the failing tests** (`search.test.ts`, toy deck):

```ts
it('topK returns the k best, earlier index first on ties', () => { expect(topK([5, 9, 9, 1, 7], 5, 3)).toEqual([1, 2, 4]); });
it('finds the two-card Synchro line', () => {
  const r = solve({ SEEKER: 1, TUNER: 1 }, { width: 60, rounds: 1, timeMs: 3_600_000, strict: true });
  expect(endBoard(r.lines[0])).toContain('SYNC'); expect(r.errors).toBe(0);
  expect(r.lines[0].state.path.at(-1)).toBe('syn:SYNC:SEEKER+TUNER');
});
it('is repeatable at a fixed width', () => { /* two runs: identical lines[0].state.path */ });
it('does not depend on the order of the deck file', () => { /* TOY_FILE with cards and effects reversed: same path, same score */ });
it('stops on the clock', () => { const t = Date.now(); solve({ SEEKER: 1, TUNER: 1, BIG: 1, DRAWTWO: 1, WALL: 1 }, { timeMs: 200 }); expect(Date.now() - t).toBeLessThan(450); });
it('counts a move that throws and carries on, or throws when strict', () => {
  // the test registers an act word `testThrow` and adds it to a copy of TOY_FILE as a second effect on BIG
  expect(solveWith(BROKEN_FILE, { BIG: 1, SEEKER: 1 }, { rounds: 1 }).errors).toBeGreaterThan(0);
  expect(() => solveWith(BROKEN_FILE, { BIG: 1, SEEKER: 1 }, { rounds: 1, strict: true })).toThrow();
});
it('returns the do-nothing line for an empty hand', () => { const r = solve({}, { rounds: 1 }); expect(r.lines).toHaveLength(1); expect(r.lines[0].state.log).toHaveLength(0); });
it('returns the do-nothing line for a hand of blanks', () => { const r = solve({ UNK: 5 }, { rounds: 1 }); expect(r.lines[0].state.log).toHaveLength(0); });
it('Sets end-of-turn cards and counts their value', () => { const r = solve({ WALL: 1 }, { rounds: 1 }); expect(r.lines[0].sets).toHaveLength(1); expect(r.lines[0].items).toContainEqual(['Wall: negate', 0.5]); });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): scoring and beam search`.

### Task 9: Lockstep harness

**Files:**
- Create: `client/src/finder/__harness__/mapping.ts`, `observe.ts`, `lockstep.ts`, `acceptedDiffs.ts`, `groupParity.ts`, `lockstep.smoke.test.ts`
- Create: `client/src/finder/engine/index.ts` (first cut: `gen`, `exec`, `evaluate`, `potential`, `stateKey`, `solveBeam`, `newState`)

**Interfaces:**
- Produces (`index.ts`): `createEngine(deck: CompiledDeck): Engine`. `Engine` grows in Tasks 17 and 18; after this task it has `deck`, `newState(cfg)`, `gen`, `exec`, `evaluate`, `potential`, `stateKey`, `solveBeam`.
- Produces (`mapping.ts`), the only place reference names meet new names:
  ```ts
  export const TAG_MAP = { ash: 'deckTouch', droll: 'deckAdd', field: 'fieldMon', handEff: 'handMon', gy: 'gy', spell: 'spell', trap: 'trap', noResp: 'noResp', inherent: 'inherent', removal: 'removal', dig: 'dig' } as const;   // reference tag `dm` → deck mark 'dm'
  export const KIND_MAP = { ash: 'negDeckTouch', imperm: 'negFieldMon', veiler: 'negFieldMon', belle: 'negGy', droll: 'lockDeckAdds', nibiru: 'wipeAtSummons', negMon: 'negMon', negST: 'negST', negAny: 'negAny', negSummon: 'negSummon', pop: 'pop', force: 'force', fuwalos: 'drawDeckExtraSummon', purulia: 'drawHandSummon', maxxc: 'drawSpecialSummon' } as const;
  export function toCfg(ref: RefCfg): Cfg                  // mul → drawFx, dpen → drawPenalty, opp intr kinds through KIND_MAP
  export function toIntr(ref: RefIntr): Interruption
  ```
- Produces (`observe.ts`): `refObserve(engine: RefEngine, s: any): string` and `newObserve(engine: Engine, s: State): string`, the same canonical JSON from either engine: each zone as sorted `name: count`, monsters (name, field name, `noEff`, `uses`, `lvl`, `emz`), Spell/Traps (name, `up`, `now`), `top`, `ns`, `spell`, add lock, `lp`, `summons`, `burn`, `removed`, `noDirect`, number of pending triggers, the opponent's remaining uids and LP, draws given.
- Produces (`lockstep.ts`):
  ```ts
  export interface MoveView { key: string; text: string; tags: string[]; negatable: boolean; negated: boolean; obs: string }
  export interface StepDiff { situation: string; depth: number; path: string[]; missing: MoveView[]; extra: MoveView[]; evalDiff: string | null }
  export function lockstep(ref: RefEngine, neu: Engine, cfg: RefCfg, o: { id: string; width: number; depth: number }): StepDiff[]
  export function translatePath(ref: RefEngine, neu: Engine, cfg: RefCfg, refPath: string[]): string[]    // throws naming the first step with no match
  export function reducedDeck(engine: RefEngine, cards: RefCard[], ids: string[]): { deck: Record<string, number>; extra: Record<string, number> }
  ```
  The walk follows the reference's beam: at each layer the reference's `width` best states by `score + potential`, each paired with the new engine's matching state. At a pair, every move is run plain and, when negatable, negated, on both sides, and results are matched on `(obs, text, tags, negatable, negated)`. Unmatched reference results are `missing`, unmatched new results are `extra`. `evalDiff` is set when `evaluate(s, true)` differs in `score` (beyond 1e-9), `items` or `sets`.
- Produces (`acceptedDiffs.ts`): `export const ACCEPTED: { side: 'missing' | 'extra'; test(m: MoveView): boolean; reason: string }[]`, starting empty. An entry needs a card-rule reason ("the reference throws here: …", "legal by the card text: …"). Every entry is printed in the Task 19 report.
- Produces (`groupParity.ts`): `groupParity(name: string, ids: string[], o: { first: number; second: number; seed: number }): void`. It defines a `describe` that loads `dm-azamina.json`, checks `validateDeckFile` is ok, restricts both engines to `ids` with `reducedDeck`, draws `o.first` going-first hands (5 cards) and `o.second` going-second situations (6 cards, cycling the 13 fields of Task 2), and expects `lockstep(…, { width: 40, depth: 26 })` minus `ACCEPTED` to be empty for each. It also exports the cumulative id lists `G1`…`G7` used by Tasks 10–16: `G1 = ['DM', 'ASH', 'DROLL', 'FUWA', 'MAXX']`, `G2 = [...G1, 'ROD', 'CIRC', 'CURT', 'TALI', 'SSRV']`, `G3 = [...G2, 'SOULS', 'SERV', 'IOC', 'PREP']`, `G4 = [...G3, 'SARC', 'FSIL', 'DMG', 'DMBM', 'GAND']`, `G5 = [...G4, 'DIA', 'WANT', 'DECE', 'HALL', 'ILIA', 'RCIE']`, `G6 = [...G5, 'GAZE', 'SPOLY', 'DRAG', 'MOC', 'DMOD', 'MUD', 'CHOR', 'GAR']`, `G7 = [...G6, 'BAR', 'CANG', 'MASQ', 'SHEEP', 'SPLK', 'FANCY', 'CHARM']` (all 40).

- [ ] **Step 1: Write the failing test** (`lockstep.smoke.test.ts`): wrap the reference itself as an `Engine`-shaped object (`asEngine(ref)`), run `lockstep` on `first-001`…`first-005` at `{ width: 20, depth: 26 }`, expect no diffs; expect `translatePath` of a reference path against the wrapped reference to return the same path.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `test(finder): lockstep comparison against the reference`.

### Tasks 10–16: The DM Azamina deck file, one card group per task

Each of these tasks writes part of `client/src/finder/deck/files/dm-azamina.json`, adds the general words its cards need to `vocabulary.ts` (with a unit test per new word in `client/src/finder/deck/vocabulary.test.ts` and a row in `docs/finder/vocabulary.md`), and is done when its `groupParity` test passes with every earlier group still passing. The source for every effect is the reference: the card's block in `gen`, its trigger in `genPending`, and its lines in `place`, `monToGY`, `stToGY`, `toOppGY`, `afterExtraSummon`, `finalize`, `gazeLive`, `interruptions`, `pickFodder`, `fieldName`, `gyName`. Card ids equal the reference's `NAMES` keys, step text equals the reference's sentences word for word, and `marks: ['dm']` goes on every effect the reference tags `dm`.

Steps for each (shown once; each task below gives its own files, cards and test):
- [ ] **Step 1:** Write the task's parity test file and one failing unit test per new vocabulary word.
- [ ] **Step 2:** Run `npx vitest run --config vitest.finder.config.ts <the test file>` → FAIL listing missing moves.
- [ ] **Step 3:** Write the cards' entries and the new words until both pass. A diff that is a real rule difference goes in `acceptedDiffs.ts` with its reason; anything else is fixed.
- [ ] **Step 4:** Run `npm run test:parity` (all groups so far) and `npm test` → PASS; `npx tsc -b` clean.
- [ ] **Step 5:** Commit `feat(finder): DM Azamina deck file, <group name>`.

### Task 10: Group 1, staples and basics

**Files:**
- Create: `deck/files/dm-azamina.json`, `dm-azamina.cards.json`, `staples.json`, `staples.cards.json`, `__harness__/dm.g1.parity.test.ts`, `deck/files/files.test.ts`

**Cards:** `DM` (Normal Monster, in `dm-azamina.json`); `ASH`, `DROLL`, `FUWA`, `MAXX` in `staples.json` with `heldValue` 1.0, 0.9, 0.8, 0.8, `discardValue` 5, and `hints.normalSummon: false` on all but `ASH`. Facts files are converted from `reference/card-data.json` (`pass_`→`passcode`, `dfn`→`def`, `desc`→`text`). `DROLL` lists passcodes `[94145021, 94145022]`.

**Test:**
```ts
// dm.g1.parity.test.ts
groupParity('g1 basics', G1, { first: 20, second: 13, seed: 1 });
// files.test.ts (default suite)
it('every card has facts and the reference name', () => { /* for each card in dm-azamina.json + staples.json: facts found by passcodes[0]; facts.name === reference NAMES[id] read from card-data.json names */ });
it('validates', () => { expect(validateDeckFile(dmFile, { staples }).ok).toBe(true); });
```

### Task 11: Group 2, Rod and the Dark Magician Spells and Traps

**Files:** Modify `dm-azamina.json`, `vocabulary.ts`, `vocabulary.test.ts`; create `__harness__/dm.g2.parity.test.ts`.

**Cards and effect keys (reference key prefixes in brackets):** `ROD` (`rod` trigger); `CIRC` (`circ1` activate and look at the top 3, `circ2` trigger when a monster named DM is summoned); `CURT` (`curt`, from hand or Set-not-this-turn, monster comes out with effects negated); `TALI` (`tali3` trigger from the GY, costs LP; its Set value 0.5); `SSRV` (`ssrv` place on top of the Deck, `ssrv2` banish from GY to draw). Groups `DM_ST`, `CIRC_ADD`, `SSRV_PLACE`, `CURT_SS` as in the reference. End-of-turn `setOrder` gains `TALI`, `CURT`, `SSRV`. Board values for `CURT` (base 0.4 or 0.1, plus 0.6 with Circle up, plus 0.2 with Talisman in GY) and the second-copy rule (0.05).

**Test:** `groupParity('g2 rod and DM spells', G2, { first: 40, second: 13, seed: 2 });`

### Task 12: Group 3, Souls, Servant, Illusion of Chaos, Preparation of Rites

**Files:** Modify `dm-azamina.json`, `vocabulary.ts`, `vocabulary.test.ts`; create `__harness__/dm.g3.parity.test.ts`.

**Cards and keys:** `SOULS` (`souls` options a and b from hand, `souls1` on the field: send up to 2 Spells/Traps from hand or field, draw that many); `SERV` (`serv` reveal a Spell, Special Summon, Set a DM Spell/Trap from Deck; `servwipe` on the field; `fieldName: 'DM'`, `gyName: 'DM'`); `IOC` (`ioc`); `PREP` (`prep`). Group `SOULS_SEND`, `IOC_ADD`. `SERV` board value 0.6 with a Spell in hand, else 0.1. `endOfTurn.keepOneInHandIf` gains "control `SERV`".

**Test:** `groupParity('g3 souls and servant', G3, { first: 40, second: 13, seed: 3 });`

### Task 13: Group 4, the Sarcophagus package

**Files:** Modify `dm-azamina.json`, `vocabulary.ts`, `vocabulary.test.ts`; create `__harness__/dm.g4.parity.test.ts`.

**Cards and keys:** `SARC` (`sarc` activate, `sarc1` search; value 0.3 with a Spell in hand, else 0.1); `FSIL` (`fsil`); `DMG` (`dmg` discard to Special Summon, name becomes Dark Magician Girl by its own procedure only; `dmg1` trigger; Tribute Summon also queues it); `DMBM` (`dmbm`; `fieldName: 'DM'`); `GAND` (`gand`, `gand2`: pay half LP, wipe the field). Groups `SARC_ADD`, `SARC_MON`. `setOrder` gains `FSIL`.

**Test:** `groupParity('g4 sarcophagus', G4, { first: 40, second: 13, seed: 4 });`

### Task 14: Group 5, Sinful Spoils and Azamina

**Files:** Modify `dm-azamina.json`, `vocabulary.ts`, `vocabulary.test.ts`; create `__harness__/dm.g5.parity.test.ts`.

**Cards and keys:** `DIA` (`dia` from hand by sending a card from hand, a monster or a Spell/Trap from the field; `dia1` trigger; value 0.2); `WANT` (`want` from Deck or GY, `want2` from GY; Set value 0.1); `DECE` (`dece` activate, `dece1` Tribute to search, the 1500 drain when an opponent's monster goes to the GY while an Azamina is controlled, the End Phase re-Set flag worth 0.1); `HALL` (`hall`, `hallG`); `ILIA` (value 1.0 "Ilia Silvia: Tribute to negate"); `RCIE` (`rcie` trigger). Group `SINFUL`. `setOrder` gains `WANT`.

**Test:** `groupParity('g5 sinful spoils', G5, { first: 40, second: 13, seed: 5 });`

### Task 15: Group 6, Fusions

**Files:** Modify `dm-azamina.json`, `staples.json` (Super Polymerization moves here), `vocabulary.ts`, `vocabulary.test.ts`; create `__harness__/dm.g6.parity.test.ts`.

**Cards and keys:** `GAZE` (`gaze`: a monster named DM on the field or in the GY is shuffled back and a Fusion that lists it is summoned; counts Dragoon's destroys; `endOfTurn.setOnlyIf.GAZE` is the reference's `gazeLive`); `SPOLY` (`spoly`: discard the cheapest of up to 2 choices, any `fusion` rule met by two monsters from either field, cannot be responded to); `DRAG` (`drag` destroy and burn, `uses` per Normal material, `immuneToRemoval`, value 1.0 / 0.4 / 0.25 by what is left to discard); `MOC` (`moc1` trigger, `moc2`); `DMOD` (`dmod` its own procedure after a Spell was activated, `dmodS` trigger, once per turn; `fieldName` and `gyName` `'DM'`); `MUD` (value 0.5; counts as any Attribute as material); `CHOR` (0.3); `GAR` (`gar` trigger when it leaves the field as cost or material). `extraDeck` fusion rules for `DMOD`, `DRAG`, `GAR`, `MUD`, `CHOR`, `ILIA`, `RCIE` as in the reference's Super Polymerization block. `setOrder` gains `GAZE`, `SPOLY`.

**Test:** `groupParity('g6 fusions', G6, { first: 50, second: 26, seed: 6 });`

### Task 16: Group 7, Synchro and Link monsters

**Files:** Modify `dm-azamina.json`, `vocabulary.ts`, `vocabulary.test.ts`; create `__harness__/dm.g7.parity.test.ts`.

**Cards and keys:** `BAR` (Level 10, `tuners: 'exactlyOne'`, value 1.0); `CANG` (Level 10, `atMostOne`, LIGHT/DARK materials, `cang` trigger, value 0.3); `MASQ` (Link-2, non-Link materials, 0.4); `SHEEP` (Link-2, different names); `SPLK` (Link-2, non-Normal, `splk` trigger when an Extra Deck monster was used, 0.9); `FANCY` (Link-3, 2–3 non-Normal); `CHARM` (Link-4, 2–4, 0.4). All four of `MASQ`, `SHEEP`, `FANCY`, `CHARM` have `bottomArrows: true`.

**Test:** `groupParity('g7 synchro and link', G7, { first: 60, second: 26, seed: 7 });`

### Task 17: Opponent mechanisms, hand-trap data, protections

**Files:**
- Create: `client/src/finder/engine/opponent.ts`, `client/src/finder/deck/files/hand-traps.json`, `__harness__/interrupt.parity.test.ts`
- Modify: `dm-azamina.json` (`protections`), `engine/index.ts`, `engine/search.ts` (policy hook)
- Test: `client/src/finder/engine/opponent.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // deck/schema.ts
  export interface HandTrapEntry { id: string; name: string; label: string; short: string; mechanism: string; monster: boolean; param?: number; passcodes: number[] }
  export interface HandTrapFile { vocab: number; traps: HandTrapEntry[]; boardOptions: { kind: string; label: string }[] }
  // engine/opponent.ts  (Interruption, StepView, TurnEvent are in types.ts since Task 3)
  export const MECHANISMS: string[];      // negDeckTouch negFieldMon negGy lockDeckAdds wipeAtSummons negMon negST negAny negSummon pop force drawDeckExtraSummon drawHandSummon drawSpecialSummon
  export function eligible(v: StepView, it: Interruption): boolean        // needs no deck; the page imports it directly
  export function createOpponent(deck, moves, ops): { interrupt(pre: State, act: Move, it: Interruption): State; startDraw(s: State, it: Interruption): State; applyEvent(s: State, ev: TurnEvent): State; protectionFor(pre: State, it: Interruption, tags: Tags): CompiledProtection | null }
  ```
  `Engine` gains `eligible`, `interrupt`, `startDraw`, `applyEvent`, and `solveBeam` now honours `policy`. A `kind` may join mechanisms with `+`. `wipeAtSummons` uses `it.param` (5 in the data). `hand-traps.json` holds the nine cards of the artifact's `HT_LIST` with their mechanisms, and `boardOptions` holds its `INTR_OPTS` list with kinds mapped through `KIND_MAP`, plus the three floodgates.
- `dm-azamina.json` protections, in this `order`: Talisman (Set, covers marks `['dm']`, `monsterOnly`, `inResponseOnly`, needs a Spellcaster of group `SPELLCASTER_IN_HAND` in hand, consumed to the GY), Baronne (once), Dragoon (once, discard the cheapest card, destroys the source if it is on their board), Ilia Silvia (Tributed). Labels as the reference's `PROT_LABEL`.

- [ ] **Step 1: Write the failing tests.** `opponent.test.ts` (toy deck): one test per mechanism's eligibility rule from the reference's `kindEligible`; `negDeckTouch` negates and keeps the cost paid; `lockDeckAdds` sets `addLock` and later search moves vanish; `wipeAtSummons` with `param: 5` is eligible only once `summonsAfter >= 5` and clears monsters and pending triggers; `negSummon` sends the new monster to the GY and drops its triggers; `pop` removes the highest-ATK new monster that is not `immuneToRemoval`; the three draw mechanisms set their bit and the note text; a toy protection is consumed and the step resolves; `applyEvent` for `lose`, `gain` (with and without `replace`) and `oppAdd`, each throwing the reference's message when impossible. `interrupt.parity.test.ts`: for the 54 `trap` situations, take the baseline line, and for every step and every interruption that is `eligible`, compare `refObserve(interrupt(...))` with `newObserve(interrupt(...))` and the `interrupted` note text.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, porting `kindEligible`, `eligible`, `pickKind`, `protectionFor`, `consumeProtection`, `interrupt`, `startMul`, `applyEvent`, with protections read from the compiled deck.
- [ ] **Step 4: Run** both → PASS; `npm run test:parity` and `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(finder): opponent mechanisms, hand-trap data and protections`.

### Task 18: Replay, plans, branches, robustness, export

**Files:**
- Create: `client/src/finder/engine/replay.ts`, `robust.ts`, `serialize.ts`; modify `engine/index.ts`
- Test: `client/src/finder/engine/replay.test.ts`, `__harness__/serialize.parity.test.ts`

**Interfaces:**
- Produces, completing `Engine`: `replay(cfg, path): State`, `planOf(cfg, path): LineEval`, `asLine(s): LineEval`, `branchTask(t: BranchTask)`, `serialize(r, hand, k?): SerializedResult`, `serializeLine(l, hand, tag): SerializedLine`, `toGenerated(l, name, hand): GeneratedLine`.
  ```ts
  export interface SerializedStep { pathIdx: number; key: string | null; ev: boolean; mons: CardId[]; sts: CardId[]; oppPresent: OppCard['uid'][]; summoned: boolean; extraSummon: boolean; draws: number; oppCount: number; text: string; tags: Tags; interrupted: string | null; summonsAfter: number; canNeg: boolean; wipeHere: boolean; firstDeckAdd: boolean; notes: string[] }
  export interface SerializedLine { tag: string; score: number; summary: LineEval['summary']; items: [string, number][]; sets: CardId[]; chokes: LineEval['chokes']; safest: boolean; path: string[]; steps: SerializedStep[]; summons: number; opening: string[]; drawFx: number; board: { mons: { id: CardId; uses: number; marks: string[] }[]; st: { id: CardId; up: boolean; endSet: boolean }[]; hand: Record<CardId, number>; lp: number; opp: string[] }; generated: GeneratedLine; bait?: boolean }
  export interface SerializedResult { lines: SerializedLine[]; safest: SerializedLine | null; frontier: SerializedLine[] | null; nodes: number; ms: number; width: number }
  export interface BranchTask { type: 'branch'; cfg: Cfg; prefix: string[]; key: string | null; it: Interruption; start?: boolean; quick?: boolean; timeMs?: number; width?: number; maxWidth?: number; hand?: CardId[]; frontier?: boolean; drawPenalty?: number }
  // robust.ts: runs on the page and farms branch tasks out through `run`
  export interface RobustOpts { handMax?: number; firstMoves?: number; from?: number; branchMs?: number; hand?: CardId[]; stopBelow?(): number; expired?(): boolean }
  export function robust(cfg: Cfg, line: SerializedLine, intrs: Interruption[], run: (t: BranchTask) => Promise<any>, opts?: RobustOpts): Promise<{ line: SerializedLine; applied: { it: Interruption; step: number | null }[]; score: number; pruned?: boolean; partial?: boolean }>
  ```
  `GeneratedLine` is the server's type (`server/src/services/lineGen/types.ts`), re-declared in `serialize.ts`. `SerializedStep.notes` holds the `stepNote` of each protection available before that step; the reference's `nibiru` and `firstDroll` flags become `wipeHere` and `firstDeckAdd`; its `curtain` and `gaze` flags are dropped unless `app.reference.js` uses them, in which case they become effect-level data in the deck file, not engine code.

- [ ] **Step 1: Write the failing tests.** `replay.test.ts` (toy deck): `replay(cfg, line.state.path)` has the line's `stateKey`; a path with `~`, `!`, `@` and `^` entries replays; a path naming a missing move throws `replay: <key>`; `planOf` of an interrupted path returns a line at least as good as stopping there; `branchTask` with `quick` returns `{ score }`; `toGenerated` puts blanks in `freeCards`, one starter slot per named hand card, a "Set …" step per end-of-turn Set, and `endBoardText` from items worth 0.3 or more; `robust` with a fake `run` spends every interruption and returns the lowest-scoring chain. `serialize.parity.test.ts`: for `first-001`…`first-030`, translate the baseline path, and compare `serializeLine` field by field with the reference's (names mapped, `notes` compared as sets of labels), and `toGenerated` exactly.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, porting `replay`, `planOf`, `asLine`, `branchTask`, `worstUse`, `worstRound`, `robust`, `serializeLine`, `serialize`, `toGenerated`, `ledgerParts`, `cleanLed`.
- [ ] **Step 4: Run** → PASS; `npm run test:parity`, `npm test`, `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): replay, robustness testing and line export`.

### Task 19: The gates and the parity report

**Files:**
- Create: `__harness__/score.parity.test.ts`, `ledger.parity.test.ts`, `speed.parity.test.ts`, `higher.report.test.ts`, `bench.report.test.ts`
- Create: `client/src/finder/engine/noCardKnowledge.test.ts`
- Create: `docs/finder/dm-azamina-parity-report.md` (generated)

**Interfaces:**
- Consumes: everything above; `checkLineLedger` imported from `../../../../server/src/services/lineGen/ledgerChecker` (harness only), with a `DeckContext` built from the deck's `CardFacts` (`passcode, name, type, text, level, linkRating, attribute, race, copies, zone`).

- [ ] **Step 1: Write `noCardKnowledge.test.ts`** (default suite). It reads every `.ts`/`.tsx` file under the directories named in Global Constraints (skipping `*.test.ts` and `__toy__`), and for every card in every file under `deck/files/` fails on: the full name (case-insensitive), the id as a quoted string (`'ROD'`, `"ROD"`, `` `ROD` ``), the short name as a quoted string, or any passcode as a number. It also fails on the words `mulcharmy`, `maxx`, `nibiru`, `droll`, `ash blossom`, `impermanence`, `veiler`.
- [ ] **Step 2: Run** `npx vitest run src/finder/engine/noCardKnowledge.test.ts` → PASS, or fix what it finds.
- [ ] **Step 3: Write `score.parity.test.ts`.**

```ts
const base = new Map((baselineJson as BaselineRow[]).map((r) => [r.id, r]));
for (const sit of situations) it(sit.id, () => {
  const cfg = toCfg(sit.cfg);
  if (sit.cfg.base) cfg.base = translatePath(ref, neu, sit.cfg, sit.cfg.base);
  const r = neu.solveBeam(cfg.base ? neu.replay(cfg, cfg.base) : neu.newState(cfg), { ...PIN, strict: true, policy: sit.policy?.map(toIntr) });
  expect(r.lines[0].score).toBeGreaterThanOrEqual(base.get(sit.id)!.score - 1e-9);
});
```

- [ ] **Step 4: Run** `npx vitest run --config vitest.finder.config.ts score.parity` and work the failures. For each failing id: run `lockstep` on it at `{ width: 240, depth: 26 }`; a missing move is fixed in the deck file or vocabulary; a difference in which equal-scored state the beam kept is fixed with `order` hints. Repeat until green. A situation that cannot be made green is not skipped: it is written into the report's "Lower than today" section with both lines, and the user is told before this task is called done.
- [ ] **Step 5: Write `ledger.parity.test.ts`**: for the 200 `first` and 65 `second` situations plus 40 more seeded hands, `checkLineLedger(engine.toGenerated(line, 'Line', hand), ctx)` has no issue with `severity: 'error'`. Run → PASS.
- [ ] **Step 6: Write `speed.parity.test.ts`**: `first-001`…`first-020` at `PIN` through both engines, three runs each, best total; expect `neuNodes / neuMs >= 0.9 * (refNodes / refMs)`. Run → PASS, or profile and fix.
- [ ] **Step 7: Write the two reports.** `higher.report.test.ts` writes `docs/finder/dm-azamina-parity-report.md`: counts (same, higher, lower), every `ACCEPTED` entry with its reason, and for each situation where the new score is higher, both lines side by side (step text, end board, score) and that line's ledger result. `bench.report.test.ts` runs the set through both engines with the real settings (`width: 60, growth: 4, timeMs: 2500`) and appends a section listing every situation where the new engine scored lower in equal time.
- [ ] **Step 8: Run** `npm run finder:report` and `npm run finder:bench`; read the report; fix any higher-scoring line the ledger rejects.
- [ ] **Step 9: Commit** `test(finder): parity, speed, ledger and no-card-knowledge gates`, then show the user `docs/finder/dm-azamina-parity-report.md`.

---

# Part 2: The Finder page

Ends with: the Finder working in the app for DM Azamina, checked on a phone-sized screen and desktop.

### Task 20: Card index, deck registry, matching

**Files:**
- Create: `client/src/finder/data/cardIndex.ts`, `client/src/finder/deck/manifest.ts`, `registry.ts`, `match.ts`, `client/scripts/finder-card-data.mjs`
- Test: `client/src/finder/data/cardIndex.test.ts`, `client/src/finder/deck/match.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // cardIndex.ts
  export interface IndexCard { name: string; mon: boolean; atk?: number; def?: number; level?: number; attr?: string; race?: string; kind?: 'main' | 'fusion' | 'synchro' | 'xyz' | 'link'; st?: 'S' | 'T' }
  export function parseCardIndex(text: string): { all: IndexCard[]; by: Map<string, IndexCard> }      // key: lower-cased name
  export function loadCardIndex(): Promise<ReturnType<typeof parseCardIndex>>                           // import('./card-index.txt?raw'), parsed once
  export function searchIndex(ix: ReturnType<typeof parseCardIndex>, q: string, limit: number): IndexCard[]
  // manifest.ts: light, safe to import from the trainer page
  export const DECK_MANIFEST: { id: string; name: string; main: number[] }[]      // every passcode of every Main Deck card each file knows
  // match.ts
  export type DeckList = { main: { passcode: number; count: number }[]; extra: { passcode: number; count: number }[] };
  export function matchDeckFile(list: DeckList, manifest?: typeof DECK_MANIFEST): { fileId: string; known: number; total: number; unknown: number[] } | null
  // registry.ts
  export function loadDeck(fileId: string): Promise<{ file: unknown; shared: Record<string, unknown>; facts: CardFacts[]; traps: HandTrapFile }>   // dynamic imports; traps are for the page, the worker gets the rest
  ```
- `finder-card-data.mjs <deck-file-id>` rewrites that file's `.cards.json` from `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=<passcodes>` (the source the server syncs from); `finder-card-data.mjs --index` rewrites `card-index.txt` in the artifact's format. It sends passcodes only.

- [ ] **Step 1: Write the failing tests.** `cardIndex.test.ts`: parsing the shipped file gives more than 12,000 cards; `by.get('dark magician')` is a monster with ATK 2500 and DEF 2100; `searchIndex(ix, 'baronne', 5)[0].name` is `Baronne de Fleur`; `searchIndex(ix, 'zzzz', 5)` is empty. `match.test.ts`:

```ts
const m = (codes: number[]) => ({ main: codes.map((passcode) => ({ passcode, count: 1 })), extra: [] });
it('matches at half coverage', () => { expect(matchDeckFile(m([1, 2, 3, 9]), [{ id: 'a', name: 'A', main: [1, 2, 3] }])).toEqual({ fileId: 'a', known: 3, total: 4, unknown: [9] }); });
it('refuses below half', () => { expect(matchDeckFile(m([1, 8, 9]), [{ id: 'a', name: 'A', main: [1, 2] }])).toBeNull(); });
it('prefers the file that knows more, then the lower id', () => { /* a knows 2 of 4, b knows 3 of 4 → b; equal → 'a' */ });
it('counts different cards, not copies', () => { /* three copies of one known card and one unknown → known 1, total 2 */ });
it('the manifest matches the deck files', () => { /* for each manifest row: equals the passcodes of that file's non-Extra cards, staples included */ });
it('the artifact list matches dm-azamina with nothing unknown', () => { /* list built from reference/card-data.json */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): card index, deck registry and deck matching`.

### Task 21: Worker, protocol, pool

**Files:**
- Create: `client/src/finder/worker/protocol.ts`, `runTask.ts`, `finder.worker.ts`, `pool.ts`
- Modify: `client/vite.config.ts` (add `worker: { format: 'es' }`)
- Test: `client/src/finder/worker/pool.test.ts`, `runTask.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // protocol.ts
  export interface InitMsg { type: 'init'; file: unknown; shared: Record<string, unknown>; facts: CardFacts[] }
  export type Task = { type: 'solve'; cfg: Cfg; hand: CardId[]; timeMs: number; top?: number; policy?: Interruption[] } | { type: 'plan'; cfg: Cfg; path: string[]; hand: CardId[] } | BranchTask;
  export type Reply = { type: 'ready' } | { type: 'initError'; errors: DeckFileError[] } | { type: 'partial' | 'done'; id: number; result: unknown } | { type: 'error'; id: number; message: string };
  // runTask.ts: the artifact's runTask
  export function buildEngine(init: InitMsg): Engine                 // validateDeckFile → compileDeck → createEngine; throws DeckCompileError
  export function runTask(engine: Engine, m: Task, post?: (p: SerializedResult) => void): unknown
  // pool.ts
  export const CANCEL: { cancelled: true };
  export interface WorkerLike { postMessage(m: unknown): void; terminate(): void; onmessage: ((e: { data: Reply }) => void) | null; onerror: ((e: unknown) => void) | null }
  export interface Pool { run<T = unknown>(task: Task, onPartial?: (p: SerializedResult) => void, front?: boolean): Promise<T>; cancelAll(): void; dispose(): void; size: number; ready: Promise<void> }
  export function createPool(init: InitMsg, o?: { size?: number; makeWorker?: () => WorkerLike }): Pool
  ```
  A solve task runs `solveBeam(root, { timeMs, top: top ?? 4, policy, width: 60, growth: 4, onRound })`; with a `policy` it returns `{ paths, nodes }`. Pool size is `max(1, min(6, hardwareConcurrency − 1))`. `ready` rejects with `DeckCompileError` on `initError`. When no worker can be made, or all have failed, tasks run on the main thread after `setTimeout(0)` with `timeMs` capped at 700.

- [ ] **Step 1: Write the failing tests** (fake `WorkerLike`s): a third task waits while two workers are busy and starts when one finishes; `partial` replies reach `onPartial` and do not resolve; a worker's `onerror` puts its job back at the front and another worker finishes it; when `makeWorker` throws, the task still resolves through the fallback and the `timeMs` it ran with is 700 for a requested 2500; `cancelAll` rejects running and queued jobs with `CANCEL` and terminates busy workers; an `initError` reply rejects `ready` with the errors; `runTask` solve on the toy deck returns `SerializedResult` with `lines.length >= 1` and calls `post` at least once; `buildEngine` with a broken file throws `DeckCompileError` whose first error names a card and field.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, porting the artifact's `runTask`, `workerMain` and `Pool`; the worker is created with `new Worker(new URL('./finder.worker.ts', import.meta.url), { type: 'module' })`. **Step 4: Run** → PASS; `npm run build` succeeds and emits a worker chunk.
- [ ] **Step 5: Commit** `feat(finder): worker pool with a main-thread fallback`.

### Task 22: Finder model: state, cfg building, storage

**Files:**
- Create: `client/src/finder/model/finderState.ts`, `buildCfg.ts`, `storage.ts`
- Test: `client/src/finder/model/finderState.test.ts`, `storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OppMonInput { uid: string; name: string; atk: number; def: number; pos: 'atk' | 'def' | 'set'; attr: string; race: string; kind: 'main' | 'fusion' | 'synchro' | 'xyz' | 'link'; intr: string; uses: number; noDestroy: boolean; noTarget: boolean }
  export interface OppStInput { uid: string; name: string; intr: string; uses: number; noDestroy: boolean; noTarget: boolean; stype: 'S' | 'T' }
  export interface FinderSnapshot { v: 1; mode: 'first' | 'second'; hand: CardId[]; hts: string[]; live: string[]; oppHand: number | null; setAssume: string; opp: { lp: number; mons: OppMonInput[]; st: OppStInput[] } }
  export interface ResolvedList { main: Record<CardId, number>; extra: Record<CardId, number>; blanks: number; unknown: number[] }
  export const DEFAULT_SNAPSHOT: FinderSnapshot      // mode 'first', hand [], hts ['ash'], live [], oppHand 5, setAssume '', opp { lp: 8000, mons: [], st: [] }
  export function resolveList(list: DeckList, file: DeckFile): ResolvedList
  export function restoreSnapshot(raw: unknown, list: ResolvedList, traps: HandTrapFile): FinderSnapshot
  export function setMode(s: FinderSnapshot, mode: 'first' | 'second'): FinderSnapshot     // oppHand becomes 5 going first, null going second
  export function buildCfg(s: FinderSnapshot, list: ResolvedList): Cfg
  export function buildIntrs(s: FinderSnapshot, traps: HandTrapFile): Interruption[]
  // storage.ts
  export interface RememberedList { name: string; list: DeckList; savedAt: number }
  export function createFinderStorage(store?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): { loadState(deckId: number): unknown; saveState(deckId: number, s: FinderSnapshot): void; remember(deckId: number, r: RememberedList): void; recall(deckId: number): RememberedList | null }
  ```
  Keys `finder_state_<deckId>` and `finder_list_<deckId>`. `'UNK'` in `hand` is a blank. Storage errors are swallowed, as in the artifact.

- [ ] **Step 1: Write the failing tests:**

```ts
it('drops hand cards the list no longer has, and extra copies', () => {
  const s = restoreSnapshot({ v: 1, hand: ['ROD', 'ROD', 'GONE', 'UNK'] }, { main: { ROD: 1 }, extra: {}, blanks: 0, unknown: [] }, TRAPS);
  expect(s.hand).toEqual(['ROD', 'UNK']);
});
it('falls back to defaults for junk', () => { for (const raw of [null, 7, 'x', { v: 2 }, { v: 1, hand: 'no' }]) expect(restoreSnapshot(raw, LIST, TRAPS)).toEqual(DEFAULT_SNAPSHOT); });
it('caps the hand at 7', () => { expect(restoreSnapshot({ v: 1, hand: Array(9).fill('UNK') }, LIST, TRAPS).hand).toHaveLength(7); });
it('drops hand traps and live effects the data file does not have', () => { /* hts ['ash', 'zzz'] → ['ash'] */ });
it('takes hand cards out of the deck; blanks are never in it', () => { const c = buildCfg({ ...DEFAULT_SNAPSHOT, hand: ['ROD', 'UNK'] }, { main: { ROD: 3 }, extra: {}, blanks: 2, unknown: [] }); expect(c.deck).toEqual({ ROD: 2 }); expect(c.hand).toEqual({ ROD: 1, UNK: 1 }); });
it('builds their field only going second, with the Set-card assumption', () => { /* unnamed Set card + setAssume 'negST' → intr 'negST'; going first → cfg.opp undefined */ });
it('lists interruptions: switched-on hand traps not already live, board cards once per use, no floodgates, no face-down monsters', () => { /* … */ });
it('counts unknown cards as blanks', () => { expect(resolveList({ main: [{ passcode: 999, count: 2 }], extra: [] }, FILE)).toEqual({ main: {}, extra: {}, blanks: 2, unknown: [999] }); });
it('remembers a list per deck and survives a throwing store', () => { /* … */ });
```

As in the artifact's `buildCfg`, blanks are not put in `cfg.deck`: a draw from an unknown Deck already gives a blank. `blanks` is only shown to the user.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, porting `snapshot`, `restore`, `setMode`, `buildCfg`, `buildIntrs`. **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): finder state, cfg building and device storage`.

### Task 23: Solve session

**Files:**
- Create: `client/src/finder/model/solveSession.ts`, `lineText.ts`
- Test: `client/src/finder/model/solveSession.test.ts`

**Interfaces:**
- Consumes: `Pool`, `Task`, `CANCEL` (Task 21); `robust` (Task 18); `buildCfg`, `buildIntrs` (Task 22).
- Produces:
  ```ts
  export interface BranchResult { step: number; it: Interruption; line: SerializedLine | null; frontier: SerializedLine[] }
  export interface SessionView { phase: 'idle' | 'solving' | 'testing' | 'done' | 'error'; lines: ViewLine[]; safest: ViewLine | null; trade: ViewLine[]; selected: string | null; nodes: number; ms: number; tested: number; total: number; deep: boolean; message: string; better: string | null; base: { steps: number; events: TurnEvent[] }; branch: BranchResult | null }
  export interface ViewLine { key: string; line: SerializedLine; worst: { score: number; applied: { it: Interruption; step: number | null }[]; line: SerializedLine } | null; badges: string[] }
  export function createSolveSession(d: { pool: Pool; traps: HandTrapFile; onChange(v: SessionView): void; now?: () => number }): {
    start(snap: FinderSnapshot, list: ResolvedList, o?: { deep?: boolean; debounceMs?: number }): void;
    select(key: string): void; lockTo(stepIndex: number): void; record(ev: TurnEvent): void; undo(): void; startOver(): void;
    whatIf(stepIndex: number, it: Interruption): void; closeBranch(): void; dispose(): void; view(): SessionView }
  // lineText.ts
  export function lineName(l: SerializedLine, short: (id: CardId) => string): string
  export function lineText(l: SerializedLine, short: (id: CardId) => string): string       // the artifact's plain-text copy format
  ```
  This is the artifact's `startSolve`, `tradeOptions`, `adopt`, `branchRun`, `finish`, `worstVerdict`, `commitEvent`, `undoEvent`, `whatIf`, `whatIfDraw`, `lineName` and `lineText`, with the page state passed in. A new `start` cancels the run before it (`pool.cancelAll()`); results from a cancelled run are ignored. Budgets 2500 ms and 6000 ms (`deep`). With a draw effect switched on or live, three solves run with `drawPenalty` 15, 55 and 110. The number of hand traps used against a line is capped by `oppHand`.

- [ ] **Step 1: Write the failing tests** (fake pool that resolves scripted results): `start` moves `idle → solving → testing → done` and ends with the scripted lines in score order; partial results appear before `done`; a second `start` before the first resolves cancels it and only the second's lines show; `debounceMs: 500` starts one solve for three quick calls; `deep: true` sends `timeMs: 6000`; a worker error ends in `phase: 'error'` with the message; with no interruptions chosen there is no testing phase; an empty hand ends `done` with one line that has no steps (Review Focus 3); `lockTo(2)` then `start` sends `cfg.base` of the first two path keys; `undo` removes the last recorded event and `startOver` clears `base`; `whatIf` fills `branch` from a branch task.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): solve session`.

### Task 24: Finder screen, setup side

**Files:**
- Create: `client/src/components/finder/FinderTab.tsx`, `SetupPanel.tsx`, `HandPicker.tsx`, `OppFieldEditor.tsx`, `CardInspect.tsx`
- Modify: `client/src/pages/LineTrainer.tsx` (temporary: render `FinderTab` under a fourth tab so it can be opened; Task 27 finishes the wiring)

**Interfaces:**
- Consumes: Tasks 20–23.
- Produces: `export default function FinderTab(p: { deckId: number; deckName: string; list: DeckList | null; fromDevice: boolean; onSaved(): void; onUseAiPanel(): void })`. It matches the list to a deck file, loads the deck, creates the pool and session, restores the snapshot, and remembers the list. Layout: two columns from `md:` up (setup left, lines right); on a phone one column with a two-button view switch "Setup" / "Lines", as the artifact's `setView` and dock.
- `SetupPanel` sections, in the artifact's order and with its wording: Going first / Going second; "Their field" (going second only: LP, monster rows, Spell/Trap rows, "+ Unknown monster", "+ Set Spell/Trap", "Clear field"; names complete from the card index and fill ATK/DEF, Attribute, Type and kind; each row has the "what it does on your turn" select from `traps.boardOptions`, uses, "can't be destroyed", "can't be targeted"); "Your hand" (cards of the list grouped as the artifact's `GROUPS` by card kind, copies left, a blank card, type-to-find, tap a hand card to remove, "Clear"); "Play around their hand traps"; "What you can't see" (cards in their hand; what an unknown Set card can do); "Already live on you this turn".
- States the screen must show: loading the deck; a deck-file error (`"This deck's data file has a mistake"` followed by each error as `card · field · message`, and no search runs); unknown cards (`"N cards the Finder doesn't know are counted as blanks:"` and their names, or passcodes when names are not available); no deck file (`"The Line Finder doesn't know this deck yet."` with a "Generate lines" button calling `onUseAiPanel`); list from the device (`"Using the list saved on this device."`).
- `CardInspect`: tapping a card shows its facts and full text from the deck's `.cards.json`. No server call.

- [ ] **Step 1: Build the components**, reading `page.reference.html` and `app.reference.js` (`renderHand`, `renderPicker`, `addCard`, `removeCard`, `renderOpp`, `acSearch`, `renderHts`, `renderUnseen`, `openInspect`) for behaviour. No card names in component code: every label comes from the deck file, its facts, or `hand-traps.json`.
- [ ] **Step 2: Check it in the browser.** Start the client dev server (`.claude/launch.json` entry running `npm run dev` in `client/`, port 5173), open `/trainer`, pick a deck holding the DM Azamina list. In a 375×812 viewport and on desktop, verify: tapping cards fills the hand to 7 and no further; copies left count down and a card with none left is disabled; a blank can be added; going second shows "Their field" and typing "Baronne" fills 3000/2400; the hand traps toggle; reloading the page restores everything; with the dev server's `/api` blocked the Finder still opens for that deck and shows the device note. Save a screenshot of each viewport.
- [ ] **Step 3: Run** `npm test`, `npx tsc -b` → clean (`noCardKnowledge.test.ts` now also covers these components).
- [ ] **Step 4: Commit** `feat(finder): Finder tab, setup side`.

### Task 25: Finder screen, results side

**Files:**
- Create: `client/src/components/finder/ResultsPanel.tsx`, `LineView.tsx`, `BranchView.tsx`, `RecordEvent.tsx`, `HowItDecides.tsx`
- Modify: `FinderTab.tsx`

**Interfaces:**
- Consumes: `SessionView` and session methods (Task 23).
- `ResultsPanel`: the status line (positions searched, time, "tested N of M" while testing); up to three line tabs with their badges, a "Safest lethal" tab when `safest` is set, and the draw trade-off options when `trade` has entries (the best board for each number of cards given away); the banner naming the line that holds up best and its worst case (`worstVerdict`); "Search deeper".
- `LineView`: the steps with a stepper (previous, next, progress kept per line), the opening notes, each step's interruption note, the protection notes from `SerializedStep.notes`, the per-step "what if they … here" chips for the chosen interruptions that are `eligible`, the end board with end-of-turn Sets, and "What it does on their turn" (the `items` list with values).
- `BranchView`: "what you do instead" for one interruption at one step, with the way back to the line.
- `RecordEvent`: "what has happened so far": lock the steps up to here, record a card lost, a card drawn or added, a monster they summoned, undo, "start the turn over".
- `HowItDecides`: the artifact's explainer text, with the deck's name and values read from data.

- [ ] **Step 1: Build the components**, following `renderStatus`, `headline`, `renderTabs`, `selectLine`, `stepHtml`, `stepperHtml`, `applyProgress`, `stepBy`, `boardRows`, `turnList`, `verdictHtml`, `renderLine`, `renderBranch`, `recTypes`, `recFormHtml`, `renderDock` in `app.reference.js`.
- [ ] **Step 2: Check it in the browser**, phone-sized and desktop, against the artifact opened beside it with the same inputs. Hand: Magician's Rod, Magicians' Souls, Dark Magical Circle, two blanks, going first, Ash switched on. Verify: lines appear within 3 seconds and the page scrolls smoothly while it searches; the three tabs, end board and their-turn list name the same cards as the artifact's; the stepper walks every step; the worst-case banner appears after testing; a "what if" chip opens the branch view; locking two steps and searching again continues from there; undo and start-over work; "Search deeper" runs about 6 seconds; switching Fuwalos on shows the trade-off options; an empty hand shows the do-nothing line. Save screenshots.
- [ ] **Step 3: Run** `npm test`, `npx tsc -b`, `npm run build` → clean.
- [ ] **Step 4: Commit** `feat(finder): Finder tab, results side`.

### Task 26: Save to my lines, and Copy

**Files:**
- Modify: `server/src/services/lineGen/convert.ts`, `server/src/routes/lines.ts`, `server/src/services/lineGen/ledgerChecker.test.ts`
- Modify: `client/src/api/lines.ts`, `client/src/components/trainer/shared.tsx`, `client/src/components/finder/FinderTab.tsx`
- Create: `client/src/finder/model/saveLine.ts`; Test: `client/src/finder/model/saveLine.test.ts`

**Interfaces:**
- Server: `toTrainerLine(gen, ctx, rank, newId?, source: 'ai-draft' | 'solver' = 'ai-draft')`; `export function importSource(body: unknown): 'ai-draft' | 'solver'` in `convert.ts` (`'solver'` only when `body.source === 'solver'`); `saveGenerated(deckId, items, generator, source)` writes that source on insert and on replace; the import route passes `importSource(req.body)`.
- Client: `importGenerated(deckId: number, text: string, o?: { generator?: string; source?: 'solver' }): Promise<ImportResult>` (defaults keep today's behaviour: generator `'Claude (pasted)'`, no source). `StatusBadge` shows `'Line Finder · unverified'` for a draft with `source === 'solver'`.
- `saveLine.ts`: `export async function saveFoundLine(deckId: number, line: SerializedLine, name: string, send: typeof importGenerated): Promise<{ ok: true; message: string } | { ok: false; message: string }>`. It imports the API layer as a type only; an unreachable server is recognised by `err.name === 'ApiError' && err.status === null`.
  - sends `JSON.stringify({ lines: [{ ...line.generated, name }] })` with `{ generator: 'Line Finder', source: 'solver' }`
  - success, no failing: `"Saved to your lines as a draft."`; with `failing > 0`: `"Saved as a draft. The card ledger flagged it; check it in Lines."`; with a rejection: `"The server could not read that line: <error>"`
  - `ApiError` with `status === null`: `"Can't reach the server. The line stays here; try again in a minute."`; any other error: its message.

- [ ] **Step 1: Write the failing tests.** Server, in `ledgerChecker.test.ts`: `toTrainerLine(rodLine(), ctx, 10, () => 'id', 'solver').source` is `'solver'`, the default is `'ai-draft'`; `importSource({ source: 'solver' })` is `'solver'`, and `importSource({ source: 'manual' })`, `importSource(null)` are `'ai-draft'`. Client, `saveLine.test.ts`: one test per message above, with a fake `send`; the payload sent parses to one line with the given name.
- [ ] **Step 2: Run** `npx vitest run src/services/lineGen/ledgerChecker.test.ts` in `server/` and the client test → FAIL.
- [ ] **Step 3: Implement.** In `FinderTab`: "Save to my lines" calls `saveFoundLine` with `lineName(...)`, shows the message, and on success calls `onSaved` (which refreshes the lines query); "Copy" calls `copyText(lineText(...))` from `client/src/utils/deckShare.ts`.
- [ ] **Step 4: Run** both suites → PASS; `npm run build` in `server/` and `client/` → clean.
- [ ] **Step 5: Commit** `feat(finder): save found lines as solver drafts`.

### Task 27: Line Trainer and Duel Mode wiring, and the page checks

**Files:**
- Modify: `client/src/pages/LineTrainer.tsx`, `client/src/components/trainer/LineLibrary.tsx`, `client/src/pages/DuelMode.tsx`
- Create: `client/src/finder/model/trainerTab.ts`; Test: `client/src/finder/model/trainerTab.test.ts`

**Interfaces:**
- `trainerTab.ts`: `export type TrainerTab = 'drill' | 'lines' | 'coverage' | 'finder'`; `export function initialTab(search: string): TrainerTab` (`'finder'` for `?tab=finder`, else `'drill'`); `export function finderSource(deck: { name: string; main_json: DeckList['main']; extra_json: DeckList['extra'] } | null, recalled: RememberedList | null): { list: DeckList; name: string; fromDevice: boolean } | null` (the saved deck when loaded, else the remembered list, else null).
- `LineTrainer.tsx`: `Tab` becomes `TrainerTab`; the initial tab comes from `initialTab(location.search)`; a fourth tab button "Finder"; `FinderTab` is loaded with `React.lazy`; when the tab is `finder` and the decks query has no data yet, the page renders `FinderTab` from `finderSource(null, storage.recall(deckId))` instead of the loading or error state; with neither, it shows `"Can't reach the server, and this deck has not been opened in the Finder on this device yet."`.
- `LineLibrary.tsx`: new prop `finderAvailable: boolean`; the button reads "Find lines" when true and "Generate lines" otherwise. In `LineTrainer`, `finderAvailable` is `matchDeckFile(list) != null`, and `onGenerate` switches to the Finder tab when it is true and opens `GeneratePanel` as today when false.
- `DuelMode.tsx`: beside "Switch deck", a link "Find a line" to `/trainer?tab=finder` that first writes `localStorage.trainer_deck_id = String(myDeckId)`.

- [ ] **Step 1: Write the failing tests** (`trainerTab.test.ts`): `initialTab('?tab=finder')` is `'finder'`; `initialTab('')` and `initialTab('?tab=zzz')` are `'drill'`; `finderSource(deck, recalled)` prefers the deck with `fromDevice: false`; `finderSource(null, recalled)` gives the remembered list with `fromDevice: true`; `finderSource(null, null)` is null.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`, `npx tsc -b`, `npm run build` → clean; confirm in the build output that the solver, deck files and card index are in chunks separate from the trainer page's.
- [ ] **Step 5: Page checks (spec check 6)**, phone-sized and desktop, with screenshots: `/trainer?tab=finder` opens the Finder; the Lines tab button says "Find lines" for the DM Azamina deck and opens the Finder; a deck with no deck file says "Generate lines" and opens the AI panel, and its Finder tab shows the no-deck-file message; a DM list with two unknown cards lists them as blanks; "Save to my lines" adds a draft marked "Line Finder · unverified" that appears in Lines; with the API blocked, saving shows the can't-reach message and the line stays; with the API blocked and the page reloaded, the Finder opens from the device copy and finds a line; Duel Mode's "Find a line" opens the Finder on the deck being played.
- [ ] **Step 6: Commit** `feat(finder): Finder tab in the Line Trainer and a link from Duel Mode`.

---

# Part 3: Branded Dracotail

Ends with: the second deck working in the Finder, and a page of hands with their lines for the user to judge.

### Task 28: Vocabulary for Fusion-centred decks

**Files:**
- Modify: `client/src/finder/deck/vocabulary.ts`, `vocabulary.test.ts`, `schema.ts`, `compile.ts`, `engine/summon.ts`, `docs/finder/vocabulary.md`
- Create: `client/src/finder/deck/files/branded-dracotail.cards.json` (run `node scripts/finder-card-data.mjs branded-dracotail` with the passcodes of spec Appendix A)

**Interfaces:**
- Produces general words, each with a unit test on a toy file. Read every card's text in the new facts file first, list what the existing vocabulary cannot say, then add words for exactly that list. Expected at least:
  - act `fusionSummon`: `{ pool: ('hand' | 'field' | 'deck' | 'gy' | 'oppField')[]; matsTo: 'gy' | 'ban' | 'deck'; of?: Word; lockExtraTo?: Word }` (which Fusions it may make, where materials come from and go, and a summon restriction for the rest of the turn);
  - trigger `usedAsMaterial` (`{ method: 'fusion' }`) and trigger `sentToGyByEffect`;
  - cond `sentToGyThisTurn`, cond `summonRestriction`;
  - a state-level summon lock ("only Fusion Monsters from the Extra Deck this turn") that `gen` respects for every Extra Deck summon;
  - `BoardValueDef.when: 'endPhase'` entries are scored and listed under an "In the End Phase" heading in `items`.
- `VOCAB_VERSION` stays 1 while only words are added; it changes only if an existing word's meaning changes.

- [ ] **Step 1:** Write a failing unit test per new word in `vocabulary.test.ts`. **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npm test`, `npm run test:parity` → PASS (DM Azamina unchanged), `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(finder): vocabulary for Fusion-centred decks`.

### Task 29: The Branded Dracotail deck file

**Files:**
- Create: `client/src/finder/deck/files/branded-dracotail.json`, `client/src/finder/deck/files/branded-dracotail.effects.test.ts`
- Modify: `staples.json`, `staples.cards.json` (Mulcharmy Purulia, Ghost Ogre & Snow Rabbit, Triple Tactics Talent), `manifest.ts`, `registry.ts`

**Interfaces:**
- Consumes: the vocabulary (Tasks 4–28); spec Appendix A for the list (23 Main Deck cards, 14 Extra Deck cards).
- The file covers every card in Appendix A: an effect entry for every effect usable in your own Main Phase, a `boardValue` entry (`oppTurn` or `endPhase`) for every effect that matters after your turn, `extraDeck` fusion rules for all 13 Fusion Monsters and the Link rule for Predaplant Verte Anaconda, `endOfTurn.setOrder` for the Traps and Quick-Play Spells worth Setting, and `heldValue` for the hand traps. Starting board values follow the DM file's scale: 1.0 for a negate, 0.9 for strong removal, 0.5–0.6 for a conditional disruption, 0.1–0.3 for minor value.

- [ ] **Step 1: Write the failing tests** (`branded-dracotail.effects.test.ts`, default suite): the file validates; for every effect in the file, one test that sets up the smallest state where it applies, runs the move, and checks the zones against the card's text (what moved where, what was summoned, which once-per-turn is spent), plus one test that the move is absent when its condition fails. Also: `matchDeckFile` on the Appendix A list picks `branded-dracotail` with nothing unknown; and the manifest test of Task 20 still passes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Write the file**, card by card from the card text in `branded-dracotail.cards.json`. **Step 4: Run** `npm test`, `npx tsc -b` → PASS (`noCardKnowledge.test.ts` now also scans for this file's cards).
- [ ] **Step 5: Commit** `feat(finder): Branded Dracotail deck file`.

### Task 30: Branded Dracotail checks and hands to judge

**Files:**
- Create: `__harness__/dracotail.ledger.parity.test.ts`, `__harness__/hands.report.test.ts`, `docs/finder/branded-dracotail-hands.md` (generated)

- [ ] **Step 1: Write `dracotail.ledger.parity.test.ts`**: 300 seeded hands (200 going first with 5 cards, 100 going second with 6 against the 13 fields), `solveBeam` at `PIN`, `errors === 0`, and `checkLineLedger` reports no error for any best line.
- [ ] **Step 2: Run** `npx vitest run --config vitest.finder.config.ts dracotail` → work failures until PASS. A ledger error is a deck-file mistake until shown otherwise.
- [ ] **Step 3: Write `hands.report.test.ts`**: 12 hands (one built around each Main Deck starter of the list, the rest seeded), each solved for 6 seconds going first; the report gives the hand, the steps, the end board, the their-turn and End Phase lists with values, and the score, in plain words.
- [ ] **Step 4: Run** `npm run finder:hands`; read the report for anything plainly wrong and fix the deck file.
- [ ] **Step 5: Check in the browser**: save the Appendix A list as a deck, open the Finder, enter three of the report's hands, confirm the same lines appear, phone-sized and desktop.
- [ ] **Step 6: Commit** `test(finder): Branded Dracotail ledger check and hands report`, then give the user `docs/finder/branded-dracotail-hands.md` to judge and try in Master Duel. Board-value changes that come back are deck-file edits re-run through Steps 2–4.

### Task 31: "Adding a deck" note and final sweep

**Files:**
- Create: `docs/finder/adding-a-deck.md`
- Modify: `docs/finder/vocabulary.md`

- [ ] **Step 1: Write `adding-a-deck.md`**: the steps a deck author follows (get the list, run `finder-card-data.mjs`, write the file group by group with an effects test per effect, add it to `manifest.ts` and `registry.ts`, run the ledger check, produce a hands report), the vocabulary rule, and that a new deck reaches Android through an app update. Bring `vocabulary.md` up to date with every registered word; a default-suite test fails when a registered word is missing from it.
- [ ] **Step 2: Run everything**: in `client/`, `npm test`, `npm run test:parity`, `npx tsc -b`, `npm run build`; in `server/`, `npm test`, `npm run build`. All green.
- [ ] **Step 3: Check the diff** touches no `package-lock.json` and that `git status` in the worktree is clean after committing.
- [ ] **Step 4: Commit** `docs(finder): how to add a deck`. Tell the user the branch is ready and ask how they want it integrated (superpowers:finishing-a-development-branch).
