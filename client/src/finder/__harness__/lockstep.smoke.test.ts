import { describe, it, expect } from 'vitest';
import { loadReference } from './loadReference';
import { buildSituations, FIELDS, oppField } from './situations';
import { newTags, refTags, toCfg, toIntr } from './mapping';
import { ACCEPTED, withoutAccepted } from './acceptedDiffs';
import { SAME_NAMES } from './observe';
import { formatDiffs, lockstepSides, reducedDeck, refSide, translateSides, type Side } from './lockstep';
import { G1, G7, groupSituations } from './groupParity';

// The reference walked against itself must show no differences, and the walk must notice a
// move one side drops or a score one side changes (so a parity test cannot pass silently).
const { engine, cards } = loadReference();
const sits = buildSituations(engine, cards).filter((s) => /^first-00[1-5]$/.test(s.id));
const first = sits[0];

describe('lockstep harness', () => {
  it('has the five situations', () => { expect(sits.map((s) => s.id)).toEqual(['first-001', 'first-002', 'first-003', 'first-004', 'first-005']); });

  for (const sit of sits) {
    it(`finds no differences between the reference and itself: ${sit.id}`, () => {
      const diffs = lockstepSides(refSide(engine, SAME_NAMES), refSide(engine, SAME_NAMES), sit.cfg, { id: sit.id, width: 20, depth: 26 });
      expect(formatDiffs(diffs)).toBe('');
    });
  }

  it('translatePath maps a reference line to the same line', () => {
    const path: string[] = engine.solveBeam(engine.newState(first.cfg), { width: 20, rounds: 1, timeMs: 3_600_000 }).lines[0].state.path;
    expect(path.length).toBeGreaterThan(1);
    expect(translateSides(refSide(engine, SAME_NAMES), refSide(engine, SAME_NAMES), first.cfg, path)).toEqual(path);
  });

  it('translatePath keeps a negated step', () => {
    const root = engine.newState(first.cfg);
    const a = engine.gen(root).find((x) => x.neg);
    expect(a).toBeDefined();
    expect(translateSides(refSide(engine, SAME_NAMES), refSide(engine, SAME_NAMES), first.cfg, ['~' + a!.k])).toEqual(['~' + a!.k]);
  });

  it('translatePath names the first step with no match', () => {
    const root = engine.newState(first.cfg);
    const k = engine.gen(root)[0].k;
    const ref = refSide(engine, SAME_NAMES);
    const dropped: Side = { ...ref, gen: (s) => ref.gen(s).filter((x) => x.k !== k) };
    expect(() => translateSides(ref, dropped, first.cfg, [k])).toThrow(`step 1 (${k})`);
  });

  it('reports a move the other side does not offer', () => {
    const root = engine.newState(first.cfg);
    const k = engine.gen(root)[0].k;
    const ref = refSide(engine, SAME_NAMES);
    const dropped: Side = { ...ref, gen: (s) => (s.path.length ? ref.gen(s) : ref.gen(s).filter((x) => x.k !== k)) };
    const diffs = lockstepSides(ref, dropped, first.cfg, { id: first.id, width: 5, depth: 2 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ situation: 'first-001', depth: 0, path: [], extra: [], evalDiff: null });
    expect(diffs[0].missing.map((m) => m.key)).toContain(k);
    expect(formatDiffs(diffs)).toContain(`missing ${k}`);
    // And the other way round: the move shows as extra.
    const back = lockstepSides(dropped, ref, first.cfg, { id: first.id, width: 5, depth: 2 });
    expect(back[0].extra.map((m) => m.key)).toContain(k);
  });

  it('group G7 is the whole 40-card list', () => {
    expect(new Set(G7).size).toBe(40);
    expect([...G7].sort()).toEqual(Object.keys(engine.NAMES).filter((k) => k !== 'UNK').sort());
  });

  it('draws group situations from the group only', () => {
    const g = groupSituations(engine, cards, G1, { first: 3, second: 14, seed: 7 });
    expect(g.map((s) => s.id).slice(0, 4)).toEqual(['first-001', 'first-002', 'first-003', 'second-001']);
    for (const s of g) {
      expect(Object.keys(s.cfg.hand).every((id) => G1.includes(id))).toBe(true);
      expect(Object.values(s.cfg.hand).reduce((t, n) => t + n, 0)).toBe(s.cfg.mode === 'first' ? 5 : 6);
      expect(s.cfg.extra).toEqual({});
    }
    const second = g.filter((s) => s.cfg.mode === 'second');
    expect(second[13].cfg.opp).toEqual(second[0].cfg.opp);    // 13 fields, in turn
    expect(second[1].cfg.opp).not.toEqual(second[0].cfg.opp);
    expect(groupSituations(engine, cards, G1, { first: 3, second: 14, seed: 7 })).toEqual(g);
  });

  it('reducedDeck refuses an id the reference does not have', () => {
    expect(() => reducedDeck(engine, cards, ['DM', 'NOPE'])).toThrow('NOPE');
  });

  it('maps tags, interruption kinds and the config', () => {
    expect(refTags({ ash: true, droll: false, field: true, dm: true })).toEqual(['deckTouch', 'dm', 'fieldMon']);
    expect(newTags({ deckTouch: true, fieldMon: true, deckAdd: false, marks: 2 }, { other: 0, dm: 1 })).toEqual(['deckTouch', 'dm', 'fieldMon']);
    expect(toIntr({ kind: 'imperm', src: 'hand', label: 'Infinite Impermanence' })).toEqual({ kind: 'negFieldMon', src: 'hand', label: 'Infinite Impermanence' });
    const c = toCfg({ ...sits[0].cfg, mode: 'second', mul: 5, dpen: 40, opp: oppField(FIELDS[3]) });
    expect(c).toMatchObject({ drawFx: 5, drawPenalty: 40, hand: sits[0].cfg.hand });
    expect(c.opp!.mons[0].intr).toBe('negMon');
    expect(toCfg(sits[0].cfg)).not.toHaveProperty('drawFx');
  });

  it('takes accepted differences out', () => {
    const v = { key: 'x', text: '', tags: [], negatable: false, negated: false, obs: '' };
    const d = [{ situation: 's', depth: 0, path: [], missing: [v], extra: [{ ...v, key: 'y' }], evalDiff: null }];
    expect(withoutAccepted(d, [])).toEqual(d);
    expect(withoutAccepted(d, [{ side: 'missing', test: (m) => m.key === 'x', reason: 'r' }])[0].missing).toEqual([]);
    expect(withoutAccepted(d, [{ side: 'missing', test: () => true, reason: 'r' }, { side: 'extra', test: () => true, reason: 'r' }])).toEqual([]);
    // Every accepted difference states its card-rule reason.
    for (const a of ACCEPTED) expect(a.reason.length).toBeGreaterThan(40);
  });
  it("the Magicians' Souls entry takes out only a repeated send with a field card", () => {
    const view = (key: string) => ({ key, text: '', tags: [], negatable: true, negated: false, obs: '' });
    const hit = (key: string) => ACCEPTED.some((a) => a.side === 'missing' && a.test(view(key)));
    expect(hit('souls1:fCIRC0+hCURT#1')).toBe(true);
    expect(hit('souls1:fCIRC0+hCURT')).toBe(false);
    expect(hit('souls1:hCIRC+hCURT#1')).toBe(false);
    expect(hit('souls1:fCIRC0+fCURT1#1')).toBe(false);
  });

  it('reports a score difference', () => {
    const ref = refSide(engine, SAME_NAMES);
    const off: Side = { ...ref, evaluate: (s, full) => { const e = ref.evaluate(s, full); return { ...e, score: e.score + 0.5 }; } };
    const diffs = lockstepSides(ref, off, first.cfg, { id: first.id, width: 2, depth: 1 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].evalDiff).toMatch(/^score /);
  });
});
