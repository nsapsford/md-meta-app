import { describe, expect, it } from 'vitest';
import { compileDeck } from '../deck/compile';
import { validateDeckFile, type CardFacts } from '../deck/schema';
import dmFile from '../deck/files/dm-azamina.json';
import dmFacts from '../deck/files/dm-azamina.cards.json';
import staples from '../deck/files/staples.json';
import staplesFacts from '../deck/files/staples.cards.json';
import { createEngine } from '../engine';
import { TOY_FACTS, TOY_FILE, toyCfg } from '../engine/__toy__/toyDeck';
import { withoutAccepted } from './acceptedDiffs';
import { loadReference, refExec, refOptNames, refOptsSet } from './loadReference';
import { formatDiffs, lockstepSides, refSide, type Side } from './lockstep';
import { mapRefNames, OPT_MAP, PEND_MAP } from './mapping';
import { newObserve, refObserve, SAME_NAMES } from './observe';

const { engine: ref } = loadReference();
const cfg = { mode: 'first' as const, hand: { ROD: 1, DM: 1 }, deck: { CIRC: 1, CURT: 1, DM: 1 }, extra: {} };
/** A reference position with a pending trigger (Rod's search) after its Normal Summon. */
function rodSummoned(): any {
  const s = ref.newState(cfg);
  return refExec(s, ref.gen(s).find((a) => a.k === 'ns:ROD')!, false);
}

describe('observe: pending triggers and once-per-turn slots', () => {
  it("reads the reference's once-per-turn slot names in bit order", () => {
    const names = refOptNames();
    expect(names).toHaveLength(35);
    expect(names.slice(0, 3)).toEqual(['barNeg', 'circ1', 'circ2']);
    expect(refOptsSet({ o1: (1 << 1) | (1 << 25), o2: 1 })).toEqual(['circ1', 'rod1', 'splk1']);
  });

  it('names reference triggers and slots through the tables, failing on an unmapped one', () => {
    const s = rodSummoned();
    expect(s.pend.map((p: any) => p.t)).toEqual(['rod']);
    expect(() => refObserve(ref, s, { pend: {}, opt: {} })).toThrow('unmapped reference trigger "rod"');
    expect(JSON.parse(refObserve(ref, s, { pend: { rod: 'rod-search' }, opt: {} })).pend).toEqual(['rod-search']);
    expect(JSON.parse(refObserve(ref, s, SAME_NAMES)).pend).toEqual(['rod']);
    const t = { ...s, pend: [], o1: 1 << 25 };
    expect(() => refObserve(ref, t, { pend: {}, opt: {} })).toThrow('unmapped reference once-per-turn slot "rod1"');
    expect(JSON.parse(refObserve(ref, t, { pend: {}, opt: { rod1: 'rod-search' } })).opts).toEqual(['rod-search']);
    expect(() => mapRefNames(['x'], {}, 'trigger')).toThrow('PEND_MAP');
  });

  it('names new-engine triggers and slots by effect key and limit, failing on an unmapped one', () => {
    const eng = createEngine(compileDeck(TOY_FILE, TOY_FACTS));
    const s = eng.newState(toyCfg({ SEEKER: 1 }));
    const e = eng.deck.effects.findIndex((x) => x.key === 'seeker-search');
    s.pend = [{ e }];
    eng.deck.state.setOpt(s, eng.deck.limitNames.indexOf('tuner-ss'));
    const maps = { pend: { rod: 'seeker-search' }, opt: { rod1: 'tuner-ss' } };
    const v = JSON.parse(newObserve(eng, s, maps));
    expect([v.pend, v.opts]).toEqual([['seeker-search'], ['tuner-ss']]);
    expect(() => newObserve(eng, s, { pend: {}, opt: maps.opt })).toThrow('unmapped new-engine trigger "seeker-search"');
    expect(() => newObserve(eng, s, { pend: maps.pend, opt: {} })).toThrow('unmapped new-engine once-per-turn slot "tuner-ss"');
    expect(JSON.parse(newObserve(eng, s, SAME_NAMES)).pend).toEqual(['seeker-search']);
  });

  it("every row of the shared tables names a trigger or a once-per-turn limit of the deck file", () => {
    const v = validateDeckFile(dmFile, { staples });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    const deck = compileDeck(v.file, [...dmFacts, ...staplesFacts] as CardFacts[]);
    const triggers = new Set(v.file.cards.flatMap((c) => (c.effects ?? []).filter((e) => e.trigger).map((e) => e.key)));
    for (const [r, k] of Object.entries(PEND_MAP)) expect(triggers.has(k), `${r} -> ${k}`).toBe(true);
    const refOpts = refOptNames();
    for (const [r, k] of Object.entries(OPT_MAP)) {
      expect(refOpts, r).toContain(r);
      expect(deck.limitNames, `${r} -> ${k}`).toContain(k);
    }
  });
});

describe('lockstep: the roots are compared', () => {
  it('reports two roots that look different, and keeps the diff past withoutAccepted', () => {
    const a = refSide(ref, SAME_NAMES);
    const b: Side = { ...a, root: (c) => ref.newState({ ...c, hand: { ...c.hand, DM: 2 } }) };
    const diffs = lockstepSides(a, b, cfg, { id: 'root', width: 1, depth: 0 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].obsDiff).toContain('"DM: 2"');
    expect(withoutAccepted(diffs)).toHaveLength(1);
    expect(formatDiffs(diffs)).toContain('root obs');
    expect(lockstepSides(a, a, cfg, { id: 'root', width: 1, depth: 0 })).toEqual([]);
  });
});
