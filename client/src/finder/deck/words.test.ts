// Each seed word, compiled and run through a made-up PROBE card added to the toy deck.
import { describe, it, expect } from 'vitest';
import { compileDeck, DeckCompileError } from './compile';
import { validateDeckFile, type CardDef, type DeckFile, type EffectDef } from './schema';
import type { Word } from './vocabulary';
import { TOY_FACTS, TOY_FILE, toyCfg } from '../engine/__toy__/toyDeck';
import { driver } from '../engine/__toy__/driver';
import type { CardId, State } from '../engine/types';

const PROBE_FACT = { passcode: 9000099, name: 'Toy Probe', type: 'Effect Monster', race: 'Fiend', attr: 'DARK', level: 3, link: null, atk: 1200, def: 0, text: '' };
const FACTS = [...TOY_FACTS, PROBE_FACT];

const eff = (e: Partial<EffectDef>): EffectDef => ({ key: 'p', phase: 'main', from: 'hand', do: [], tags: {}, text: 'Probe.', ...e });

function fileWith(effects: EffectDef[], extra: Partial<DeckFile> = {}, card: Partial<CardDef> = {}): DeckFile {
  const f: DeckFile = { ...TOY_FILE, ...extra, cards: [...TOY_FILE.cards, { id: 'PROBE', passcodes: [9000099], short: 'Probe', effects, ...card }] };
  const v = validateDeckFile(f, {});
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return f;
}
const probe = (effects: EffectDef[], extra: Partial<DeckFile> = {}, card: Partial<CardDef> = {}) => driver(fileWith(effects, extra, card), FACTS);

const OPP = { lp: 8000, mons: [{ uid: 'm1', kind: 'mon' as const, name: 'Foe', atk: 2000 }, { uid: 'm2', kind: 'mon' as const, name: 'Shy', noTarget: true }], st: [{ uid: 's1', kind: 'st' as const, name: 'Lid', faceDown: true }] };

/** Offered or not: an effect whose only content is these conditions. */
function offered(cond: Word[], prep: (s: State, d: ReturnType<typeof probe>) => void = () => {}, extra: Partial<DeckFile> = {}, hand: Record<CardId, number> = { PROBE: 1 }): boolean {
  const d = probe([eff({ cond })], extra);
  const s = d.state(hand);
  prep(s, d);
  return d.mainKeys(s).includes('p');
}
const onField = (d: ReturnType<typeof probe>, s: State, id: CardId) => { s.mons.push({ id: d.deck.ix[id], nm: d.deck.ix[id], emz: false, noEff: false, uses: 0, lvl: 4, marks: 0, uid: s.uid++ }); };
const withOpp = (d: ReturnType<typeof probe>, hand: Record<CardId, number>) => d.deck.state.newState({ ...toyCfg(hand), opp: OPP }, d.deck.ix);

describe('conditions', () => {
  it('has / count look in a zone, by card, group or any', () => {
    expect(offered([{ has: { zone: 'deck', card: 'BIG' } }])).toBe(true);
    expect(offered([{ has: { zone: 'gy' } }])).toBe(false);
    expect(offered([{ has: { zone: 'deck', group: 'spells' } }])).toBe(true);
    expect(offered([{ has: { zone: 'field', card: 'BIG' } }], (s, d) => onField(d, s, 'BIG'))).toBe(true);
    expect(offered([{ count: { zone: 'deck', card: 'BIG', atLeast: 3, atMost: 3 } }])).toBe(true);
    expect(offered([{ count: { zone: 'deck', atMost: 10 } }])).toBe(false);
  });
  it('has with a filter sees each candidate as self', () => {
    expect(offered([{ has: { zone: 'hand', filter: { has: { zone: 'deck', card: 'BIG' } } } }])).toBe(true);
  });
  it('control checks kind and face-up', () => {
    const set = (s: State, d: ReturnType<typeof probe>) => { s.st.push({ id: d.deck.ix.WALL, up: false, now: true }); };
    expect(offered([{ control: { kind: 'st', faceUp: false } }], set)).toBe(true);
    expect(offered([{ control: { kind: 'st', faceUp: true } }], set)).toBe(false);
    expect(offered([{ control: { kind: 'mon' } }], set)).toBe(false);
    expect(offered([{ control: { card: 'BIG' } }], (s, d) => onField(d, s, 'BIG'))).toBe(true);
  });
  it('zone counts', () => {
    const fill = (n: number) => (s: State, d: ReturnType<typeof probe>) => { for (let i = 0; i < n; i++) onField(d, s, 'BIG'); };
    expect(offered([{ monsterZoneFree: true }], fill(4))).toBe(true);
    expect(offered([{ monsterZoneFree: true }], fill(5))).toBe(false);
    expect(offered([{ monsterZoneFree: 2 }], fill(4))).toBe(false);
    expect(offered([{ stZoneFree: 5 }])).toBe(true);
    expect(offered([{ stZoneFree: 1 }], (s, d) => { for (let i = 0; i < 5; i++) s.st.push({ id: d.deck.ix.WALL, up: false, now: true }); })).toBe(false);
  });
  it('notUsed reads a once-per-turn slot', () => {
    expect(offered([{ notUsed: 'drawtwo' }])).toBe(true);
    expect(offered([{ notUsed: 'drawtwo' }], (s, d) => { d.deck.state.setOpt(s, 0); })).toBe(false);
  });
  it('flag, addLockOff, lpAbove, spellActivatedThisTurn', () => {
    expect(offered([{ flag: 'f' }], () => {}, { flags: ['f'] })).toBe(false);
    expect(offered([{ flag: 'f' }], (s) => { s.flags = 1; }, { flags: ['f'] })).toBe(true);
    expect(offered([{ addLockOff: true }], (s) => { s.addLock = true; })).toBe(false);
    expect(offered([{ lpAbove: 7999 }])).toBe(true);
    expect(offered([{ lpAbove: 8000 }])).toBe(false);
    expect(offered([{ spellActivatedThisTurn: true }])).toBe(false);
    expect(offered([{ spellActivatedThisTurn: true }], (s) => { s.spell = true; })).toBe(true);
  });
  it('not and any', () => {
    expect(offered([{ not: { lpAbove: 8000 } }])).toBe(true);
    expect(offered([{ any: [{ lpAbove: 8000 }, { has: { zone: 'hand' } }] }])).toBe(true);
    expect(offered([{ any: [{ lpAbove: 8000 }, { has: { zone: 'gy' } }] }])).toBe(false);
  });
  it('oppHasTarget describes the opponent card', () => {
    const d = probe([eff({ cond: [{ oppHasTarget: { kind: 'st', faceUp: true } }] })]);
    expect(d.mainKeys(withOpp(d, { PROBE: 1 }))).toEqual([]);
    const d2 = probe([eff({ cond: [{ oppHasTarget: true }] })]);
    expect(d2.mainKeys(d2.state({ PROBE: 1 }))).toEqual([]);
    expect(d2.mainKeys(withOpp(d2, { PROBE: 1 }))).toEqual(['p']);
  });
});

describe('picks', () => {
  const keys = (pick: Word, hand: Record<CardId, number>, prep: (s: State, d: ReturnType<typeof probe>) => void = () => {}, opp = false) => {
    const d = probe([eff({ choose: [{ as: 'c', pick }] })]);
    const s = opp ? withOpp(d, hand) : d.state(hand);
    prep(s, d);
    return d.mainKeys(s);
  };
  it('fromZone by group and by filter', () => {
    expect(keys({ fromZone: { zone: 'deck', group: 'spells' } }, { PROBE: 1 })).toEqual(['p:DRAWTWO']);
    expect(keys({ fromZone: { zone: 'deck', filter: { lpAbove: 0 } } }, { PROBE: 1 })).toEqual(['p:BIG', 'p:DRAWTWO', 'p:SEEKER', 'p:TUNER', 'p:WALL']);
  });
  it('fromField by kind', () => {
    expect(keys({ fromField: { kind: 'mon' } }, { PROBE: 1 }, (s, d) => { onField(d, s, 'BIG'); s.st.push({ id: d.deck.ix.WALL, up: true, now: false }); })).toEqual(['p:BIG']);
    expect(keys({ fromField: {} }, { PROBE: 1 }, (s, d) => { onField(d, s, 'BIG'); s.st.push({ id: d.deck.ix.WALL, up: true, now: false }); })).toEqual(['p:BIG', 'p:WALL']);
  });
  it('otherHandCard skips this card unless another copy is in hand', () => {
    expect(keys({ otherHandCard: true }, { PROBE: 1, BIG: 1 })).toEqual(['p:BIG']);
    expect(keys({ otherHandCard: true }, { PROBE: 2, BIG: 1 })).toEqual(['p:BIG', 'p:PROBE']);
  });
  it('cheapest keeps the lowest discard values', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { cheapest: { of: { otherHandCard: true } } } }] })], {}, {});
    const f = { ...fileWith([eff({ choose: [{ as: 'c', pick: { cheapest: { of: { otherHandCard: true } } } }] })]) };
    f.cards = f.cards.map((c) => (c.id === 'WALL' ? { ...c, discardValue: 1 } : c));
    const d2 = driver(f, FACTS);
    expect(d.mainKeys(d.state({ PROBE: 1, BIG: 1, WALL: 1 }))).toEqual(['p:BIG']);
    expect(d2.mainKeys(d2.state({ PROBE: 1, BIG: 1, WALL: 1 }))).toEqual(['p:WALL']);
  });
  it('subsets gives each set of min..max', () => {
    expect(keys({ subsets: { of: { otherHandCard: true }, min: 1, max: 2 } }, { PROBE: 1, BIG: 1, WALL: 1 })).toEqual(['p:BIG', 'p:BIG+WALL', 'p:WALL']);
  });
  it('oppCard lists matching opponent cards', () => {
    expect(keys({ oppCard: { targetable: true } }, { PROBE: 1 }, () => {}, true)).toEqual(['p:om1', 'p:os1']);
    expect(keys({ oppCard: { kind: 'mon' } }, { PROBE: 1 }, () => {}, true)).toEqual(['p:om1', 'p:om2']);
  });
  it('a later pick does not reuse a card an earlier one took', () => {
    const d = probe([eff({ choose: [{ as: 'a', pick: { otherHandCard: true } }, { as: 'b', pick: { otherHandCard: true } }] })]);
    expect(d.mainKeys(d.state({ PROBE: 1, BIG: 1, WALL: 1 }))).toEqual(['p:BIG:WALL', 'p:WALL:BIG']);
  });
  it('an optional choice with nothing to choose still offers the move', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { fromZone: { zone: 'gy', group: 'spells' } }, optional: true }] })]);
    expect(d.mainKeys(d.state({ PROBE: 1 }))).toEqual(['p:-']);
  });
});

describe('actions', () => {
  const after = (e: Partial<EffectDef>, hand: Record<CardId, number>, key = 'p', opts: { extra?: Partial<DeckFile>; prep?: (s: State, d: ReturnType<typeof probe>) => void; opp?: boolean } = {}) => {
    const d = probe([eff(e)], opts.extra ?? {});
    const s = opts.opp ? withOpp(d, hand) : d.state(hand);
    opts.prep?.(s, d);
    return { d, n: d.run(s, key) };
  };
  it('move a chosen card from the Deck to the hand, with a ledger entry', () => {
    const { d, n } = after({ choose: [{ as: 'c', pick: { fromZone: { zone: 'deck', group: 'spells' } } }], do: [{ move: { what: 'c', to: 'hand' } }] }, { PROBE: 1 }, 'p:DRAWTWO');
    expect(d.count(n, 'hand', 'DRAWTWO')).toBe(1);
    expect(d.count(n, 'deck', 'DRAWTWO')).toBe(2);
    expect(n.log[0].seq).toEqual([['a', d.deck.ix.PROBE, 0, 'hand'], ['m', d.deck.ix.DRAWTWO, 'deck', 'hand']]);
  });
  it('move self from the field to the GY', () => {
    const { d, n } = after({ from: 'field', do: [{ move: { what: 'self', to: 'gy' } }] }, {}, 'p', { prep: (s, d) => onField(d, s, 'PROBE') });
    expect(n.mons).toHaveLength(0);
    expect(d.count(n, 'gy', 'PROBE')).toBe(1);
  });
  it('summon self from hand', () => {
    const { d, n } = after({ do: [{ summon: { what: 'self' } }], tags: { inherent: true } }, { PROBE: 1 });
    expect(n.mons.map((m) => m.id)).toEqual([d.deck.ix.PROBE]);
    expect(n.summons).toBe(1);
    expect(n.log[0].seq).toEqual([['s', d.deck.ix.PROBE, 'special', 'hand', null, null]]);
    expect(n.log[0].fS && n.log[0].fH).toBe(true);
  });
  it('summon under another name with effects negated', () => {
    const { d, n } = after({ do: [{ summon: { what: 'self', noEff: true, as: 'BIG' } }] }, { PROBE: 1 });
    expect(n.mons[0]).toMatchObject({ nm: d.deck.ix.BIG, noEff: true });
  });
  it('discard, draw, payLp, burn, noDirectAttacks, setFlag', () => {
    const { d, n } = after({ choose: [{ as: 'c', pick: { otherHandCard: true } }], do: [{ discard: { what: 'c' } }, { draw: 1 }, { payLp: 1000 }, { burn: 500 }, { noDirectAttacks: true }, { setFlag: 'f' }] }, { PROBE: 1, BIG: 1 }, 'p:BIG', { extra: { flags: ['f'] }, opp: true });
    expect(d.count(n, 'gy', 'BIG')).toBe(1);
    expect(d.count(n, 'hand', 'UNK')).toBe(1);
    expect(n.lp).toBe(7000);
    expect(n.burn).toBe(500);
    expect(n.opp!.lp).toBe(7500);
    expect(n.noDirect).toBe(true);
    expect(n.flags).toBe(1);
  });
  it('payLp half', () => { expect(after({ do: [{ payLp: 'half' }] }, { PROBE: 1 }).n.lp).toBe(4000); });
  it('setFromDeck then faceUp', () => {
    const { d, n: set } = after({ choose: [{ as: 'c', pick: { fromZone: { zone: 'deck', group: 'traps' } } }], do: [{ setFromDeck: { what: 'c' } }] }, { PROBE: 1 }, 'p:WALL', { extra: { groups: { ...TOY_FILE.groups, traps: ['WALL'] } } });
    expect(set.st).toEqual([{ id: d.deck.ix.WALL, up: false, now: true }]);
    expect(d.count(set, 'deck', 'WALL')).toBe(2);
    const up = after({ from: 'faceDown', do: [{ faceUp: { what: 'self' } }] }, {}, 'p', { prep: (s, d) => { s.st.push({ id: d.deck.ix.PROBE, up: false, now: false }); } }).n;
    expect(up.st[0].up).toBe(true);
  });
  it('placeOnTop puts a card on top, and a draw takes it', () => {
    const { d, n } = after({ choose: [{ as: 'c', pick: { otherHandCard: true } }], do: [{ placeOnTop: { what: 'c' } }, { draw: 1 }] }, { PROBE: 1, BIG: 1 }, 'p:BIG');
    expect(d.count(n, 'hand', 'BIG')).toBe(1);
    expect(n.top).toEqual([]);
  });
  it('oppRemove destroys the chosen opponent card', () => {
    const { n } = after({ choose: [{ as: 't', pick: { oppCard: { kind: 'mon', targetable: true } } }], do: [{ oppRemove: { what: 't', how: 'destroy' } }] }, { PROBE: 1 }, 'p:om1', { opp: true });
    expect(n.opp!.mons.map((m) => m.uid)).toEqual(['m2']);
    expect(n.removed).toBe(1);
  });
  it('queue puts an effect first in the pending list', () => {
    const d = probe([eff({ do: [{ queue: 'q' }] }), eff({ key: 'q', from: 'hand', trigger: { oppMonsterToGy: true }, text: 'Q.' })]);
    const n = d.run(d.state({ PROBE: 1 }), 'p');
    expect(n.pend).toHaveLength(1);
    expect(d.pendKeys(n)).toEqual(['q']);
  });
});

describe('triggers', () => {
  it('specialSummoned (from a zone) queues after a summon', () => {
    const d = probe([eff({ do: [{ summon: { what: 'self' } }] }), eff({ key: 't', from: 'field', trigger: { specialSummoned: { from: 'hand' } }, text: 'T.' })]);
    const n = d.run(d.state({ PROBE: 1 }), 'p');
    expect(d.pendKeys(n)).toEqual(['t']);
    expect(n.pend[0].a).toBe(n.mons[0].uid);
  });
  it('summonedNamed fires for another card summoned under that name', () => {
    const d = probe([eff({ key: 't', from: 'hand', trigger: { summonedNamed: { name: 'SEEKER' } }, text: 'T.' })]);
    expect(d.summonForTest(d.state({ PROBE: 1, SEEKER: 1 }), 'SEEKER').pend).toHaveLength(2);
    expect(d.summonForTest(d.state({ SEEKER: 1 }), 'SEEKER').pend).toHaveLength(1);
  });
  it('leftField and sentToGy fire on a move to the GY', () => {
    const d = probe([
      eff({ from: 'field', do: [{ move: { what: 'self', to: 'gy' } }] }),
      eff({ key: 'l', from: 'gy', trigger: { leftField: { to: 'gy' } }, text: 'L.' }),
      eff({ key: 's', from: 'gy', trigger: { sentToGy: { from: 'hand' } }, text: 'S.' }),
    ]);
    const s = d.state({});
    onField(d, s, 'PROBE');
    const n = d.run(s, 'p');
    expect(n.pend.map((x) => x.e)).toHaveLength(1);
    expect(d.pendKeys(n)).toEqual(['l']);
  });
  it('sentToGy fires for a discard', () => {
    const d = probe([eff({ key: 's', from: 'gy', trigger: { sentToGy: true }, text: 'S.' })]);
    const dd = d.run(d.state({ DRAWTWO: 1, PROBE: 1 }), 'drawtwo:PROBE');
    expect(dd.pend).toHaveLength(1);
  });
  it('oppMonsterToGy fires when an opponent monster is destroyed', () => {
    const d = probe([
      eff({ choose: [{ as: 't', pick: { oppCard: { kind: 'mon' } } }], do: [{ oppRemove: { what: 't', how: 'destroy' } }] }),
      eff({ key: 'o', from: 'hand', trigger: { oppMonsterToGy: true }, text: 'O.' }),
    ]);
    const n = d.run(withOpp(d, { PROBE: 1 }), 'p:om1');
    expect(d.pendKeys(n)).toEqual(['o']);
  });
});

describe('compile errors', () => {
  const err = (e: Partial<EffectDef>) => { try { compileDeck(fileWith([eff(e)]), FACTS); } catch (x) { return (x as DeckCompileError).errors; } return null; };
  it('names the card and field of a move to the field', () => {
    expect(err({ do: [{ move: { what: 'self', to: 'field' } }] })).toEqual([{ card: 'PROBE', field: 'effects[0].do[0].move.to', message: 'use summon or setFromDeck to put a card on the field' }]);
  });
  it('refuses an unknown text placeholder', () => {
    expect(err({ text: 'Probe: {nope}.' })![0]).toMatchObject({ card: 'PROBE', field: 'effects[0].text' });
  });
  it('refuses notUsed on an effect with no limit', () => {
    expect(err({ cond: [{ notUsed: 'seeker-search' }] })![0]).toMatchObject({ field: 'effects[0].cond[0].notUsed', message: 'effect "seeker-search" has no once-per-turn limit' });
  });
});
