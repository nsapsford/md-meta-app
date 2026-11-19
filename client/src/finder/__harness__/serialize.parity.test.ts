// Serialize parity: for first-001…first-030, replay the baseline line on both engines (the path
// translated to the new engine's keys) and compare what goes to the page: `serializeLine` field by
// field, and the Line Trainer export (`toGenerated`) exactly but for the ACCEPTED_EXPORT entries
// (acceptedDiffs.ts; the counts they matched are printed at the end).
//
// Field names that changed: `mul` → `drawFx`, step `nibiru` → `wipeHere`, `firstDroll` →
// `firstDeckAdd`, step `curtain`/`gaze` → the effect's `lineNote` (deck-file data), board
// monsters' `gaze` → `marks` (not compared: nothing on the page reads it), chokes `ash`/`droll`/`mon`
// → `deckTouch`/`deckAdd`/`fieldMon`; step tags through the tag map; `notes` as sets of labels.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../engine';
import type { GeneratedLine, SerializedLine } from '../engine/serialize';
import { ACCEPTED_EXPORT, ACCEPTED_EXPORT_TEXT } from './acceptedDiffs';
import { loadDeckFiles } from './groupParity';
import { loadReference } from './loadReference';
import { translatePath } from './lockstep';
import { newTags, refTags, toCfg } from './mapping';
import { buildSituations, type BaselineRow } from './situations';

const EPS = 1e-9;
const IDS = Array.from({ length: 30 }, (_, i) => `first-${String(i + 1).padStart(3, '0')}`);
const CURTAIN_NOTE = 'They may also Special Summon a DARK Spellcaster from hand or Deck.';
const GAZE_NOTE = 'This Fusion is banished at the end of their next turn.';

const stripKey = (k: string | undefined): string | null => (k == null ? null : k[0] === '~' ? k.slice(1) : k[0] === '!' ? JSON.parse(k.slice(1)).k : k[0] === '@' || k[0] === '^' ? null : k);
const sortItems = (x: [string, number][] | null) => (x ? [...x].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] - q[1])) : []);
const sameNum = (a: number, b: number) => Math.abs(a - b) <= EPS;
const j = (x: unknown) => JSON.stringify(x);

function compare(ra: any, nb: SerializedLine, refPath: string[], newPath: string[], markBit: Record<string, number>): string[] {
  const d: string[] = [];
  const eq = (what: string, a: unknown, b: unknown) => { if (j(a) !== j(b)) d.push(`${what}: ${j(a)} vs ${j(b)}`); };
  eq('tag', ra.tag, nb.tag);
  if (!sameNum(ra.score, nb.score)) d.push(`score: ${ra.score} vs ${nb.score}`);
  // Numbers summed in another order differ by ~1e-13 (the Task 8 tolerance).
  const sa = ra.summary as Record<string, unknown>, sb = nb.summary as Record<string, unknown>;
  const sameSummary = Object.keys(sa).sort().join() === Object.keys(sb).sort().join()
    && Object.keys(sa).every((k) => (typeof sa[k] === 'number' && typeof sb[k] === 'number' ? sameNum(sa[k] as number, sb[k] as number) : sa[k] === sb[k]));
  if (!sameSummary) d.push(`summary: ${j(sa)} vs ${j(sb)}`);
  const ia = sortItems(ra.items), ib = sortItems(nb.items);
  if (ia.length !== ib.length || !ia.every((p, i) => p[0] === ib[i][0] && sameNum(p[1], ib[i][1]))) d.push(`items: ${j(ia)} vs ${j(ib)}`);
  eq('sets', ra.sets, nb.sets);
  eq('chokes', ra.chokes && { deckTouch: ra.chokes.ash, deckAdd: ra.chokes.droll, fieldMon: ra.chokes.mon }, nb.chokes);
  eq('safest', ra.safest, nb.safest);
  eq('path', newPath, nb.path);
  eq('summons', ra.summons, nb.summons);
  eq('opening', ra.opening, nb.opening);
  eq('drawFx', ra.mul, nb.drawFx);
  eq('step count', ra.steps.length, nb.steps.length);
  ra.steps.forEach((a: any, i: number) => {
    const b = nb.steps[i];
    if (!b) return;
    const at = (f: string) => `step ${i + 1} ${f}`;
    eq(at('pathIdx'), a.pathIdx, b.pathIdx);
    // Keys differ between the engines; each must name its own side's path entry at pathIdx.
    eq(at('key'), [a.key, b.key], [stripKey(refPath[a.pathIdx]), stripKey(newPath[b.pathIdx])]);
    for (const f of ['ev', 'mons', 'sts', 'oppPresent', 'summoned', 'extraSummon', 'draws', 'oppCount', 'text', 'interrupted', 'summonsAfter', 'canNeg']) eq(at(f), a[f], (b as any)[f]);
    eq(at('tags'), refTags(a.tags), newTags(b.tags, markBit));
    eq(at('wipeHere'), a.nibiru, b.wipeHere);
    eq(at('firstDeckAdd'), a.firstDroll, b.firstDeckAdd);
    eq(at('notes'), [...a.notes].sort(), [...b.notes].sort());
    eq(at('lineNote'), a.curtain ? CURTAIN_NOTE : a.gaze ? GAZE_NOTE : null, b.lineNote);
  });
  eq('board.mons', ra.board.mons.map((m: any) => [m.id, m.uses]), nb.board.mons.map((m) => [m.id, m.uses]));
  eq('board.st', ra.board.st, nb.board.st);
  const byKey = (h: Record<string, number>) => Object.entries(h).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  eq('board.hand', byKey(ra.board.hand), byKey(nb.board.hand));
  eq('board.lp', ra.board.lp, nb.board.lp);
  eq('board.opp', ra.board.opp, nb.board.opp);
  return d;
}

describe('serialize parity: first-001…first-030', () => {
  const { engine: ref, cards } = loadReference();
  const sits = new Map(buildSituations(ref, cards).map((s) => [s.id, s]));
  const rows = new Map((JSON.parse(readFileSync(fileURLToPath(new URL('./baseline.json', import.meta.url)), 'utf8')) as BaselineRow[]).map((r) => [r.id, r]));
  let neu: Engine;
  beforeAll(() => { const l = loadDeckFiles(); if (!l.ok) throw new Error(l.errors); neu = l.engine; });

  for (const id of IDS) {
    it(id, () => {
      const sit = sits.get(id)!, row = rows.get(id)!;
      expect(sit && row).toBeTruthy();
      const hand = Object.entries(sit.cfg.hand).flatMap(([c, n]) => Array<string>(n).fill(c));
      const newPath = translatePath(ref, neu, sit.cfg, row.path);
      const la = (ref as any).asLine(ref.replay(sit.cfg, row.path));
      const lb = neu.asLine(neu.replay(toCfg(sit.cfg), newPath));
      const ra = ref.serializeLine(la, hand, 'Line 1');
      const nb = neu.serializeLine(lb, hand, 'Line 1');
      expect(compare(ra, nb, row.path, newPath, neu.deck.markBit).join('\n')).toBe('');
      expect(generatedDiff(ra.generated, nb.generated).join('\n')).toBe('');
      expect(generatedDiff(ref.toGenerated(la, 'Exported', hand), neu.toGenerated(lb, 'Exported', hand)).join('\n')).toBe('');
    });
  }
  it('the lines above reach every step flag compared', () => {
    const seen = new Set<string>();
    for (const id of IDS) {
      const sit = sits.get(id)!, row = rows.get(id)!;
      const l = neu.serializeLine(neu.asLine(neu.replay(toCfg(sit.cfg), translatePath(ref, neu, sit.cfg, row.path))), [], 't');
      for (const st of l.steps) {
        for (const nt of st.notes) seen.add('note:' + nt);
        if (st.lineNote) seen.add(st.lineNote === CURTAIN_NOTE ? 'curtain' : st.lineNote === GAZE_NOTE ? 'gaze' : 'other');
        if (st.firstDeckAdd) seen.add('firstDeckAdd');
      }
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining(['curtain', 'firstDeckAdd', 'gaze', 'note:dragoon', 'note:talisman']));
  });
  afterAll(() => { console.info(`serialize parity: accepted export differences: ${j(acceptedHits)}`); });
});

const acceptedHits: Record<string, number> = {};
const hit = (what: string) => { acceptedHits[what] = (acceptedHits[what] ?? 0) + 1; };

/** The Line Trainer export compared exactly, except for the ACCEPTED_EXPORT entries. */
function generatedDiff(a: GeneratedLine, b: GeneratedLine): string[] {
  const d: string[] = [];
  for (const f of ['name', 'starters', 'freeCards', 'endBoard', 'notes'] as const) if (j(a[f]) !== j(b[f])) d.push(`${f}: ${j(a[f])} vs ${j(b[f])}`);
  if (a.endBoardText !== b.endBoardText) {
    if (ACCEPTED_EXPORT_TEXT.test(a.endBoardText ?? '', b.endBoardText ?? '')) hit('endBoardText: in-hand order'); else d.push(`endBoardText: ${j(a.endBoardText)} vs ${j(b.endBoardText)}`);
  }
  if (a.steps.length !== b.steps.length) d.push(`steps: ${a.steps.length} vs ${b.steps.length}`);
  a.steps.forEach((sa, i) => {
    const sb = b.steps[i];
    if (!sb || j(sa) === j(sb)) return;
    if (ACCEPTED_EXPORT.some((x) => x.test(sa as never, sb as never))) { hit(sa.text); return; }
    d.push(`step ${i + 1}: ${j(sa)}\n   vs ${j(sb)}`);
  });
  return d;
}
