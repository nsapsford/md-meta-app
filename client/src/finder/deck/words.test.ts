// Each seed word, compiled and run through a made-up PROBE card added to the toy deck.
import { describe, it, expect } from 'vitest';
import { compileDeck, DeckCompileError } from './compile';
import { validateDeckFile, type CardDef, type DeckFile, type EffectDef } from './schema';
import type { Word } from './vocabulary';
import { TOY_FACTS, TOY_FILE, toyCfg } from '../engine/__toy__/toyDeck';
import { driver } from '../engine/__toy__/driver';
import type { CardId, Cfg, State } from '../engine/types';
import { createMoves } from '../engine/moves';
import { fieldPool, fusionOptions } from '../engine/summon';

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
  it('oppHasTarget with no arguments needs a targetable card', () => {
    const d = probe([eff({ cond: [{ oppHasTarget: true }] })]);
    const s = d.deck.state.newState({ ...toyCfg({ PROBE: 1 }), opp: { lp: 8000, mons: [OPP.mons[1]], st: [] } }, d.deck.ix);
    expect(d.mainKeys(s)).toEqual([]);
  });
});

describe('card property conditions', () => {
  // A candidate in a zone (a filter's `self`): its printed properties.
  const inZone = (filter: Word, hand: Record<CardId, number>, zone = 'hand') => offered([{ has: { zone, filter } }], () => {}, {}, hand);
  it('tuner', () => {
    expect(inZone({ tuner: true }, { PROBE: 1, TUNER: 1 })).toBe(true);
    expect(inZone({ tuner: true }, { PROBE: 1, SEEKER: 1 })).toBe(false);
  });
  it('attribute and race (one of)', () => {
    expect(inZone({ attribute: ['LIGHT'] }, { PROBE: 1 })).toBe(false);
    expect(inZone({ attribute: ['LIGHT'] }, { PROBE: 1, TUNER: 1 })).toBe(true);
    expect(inZone({ attribute: ['LIGHT', 'DARK'] }, { PROBE: 1 })).toBe(true);
    expect(inZone({ race: ['Dragon'] }, { PROBE: 1 })).toBe(false);
    expect(inZone({ race: ['Dragon', 'Warrior'] }, { PROBE: 1, BIG: 1 })).toBe(true);
  });
  it('frame and extraDeckMonster', () => {
    expect(inZone({ frame: ['Normal'] }, { PROBE: 1 })).toBe(false);
    expect(inZone({ frame: ['Normal'] }, { PROBE: 1, BIG: 1 })).toBe(true);
    expect(inZone({ frame: ['Synchro'] }, { PROBE: 1 }, 'extra')).toBe(true);
    expect(inZone({ extraDeckMonster: true }, { PROBE: 1 }, 'extra')).toBe(true);
    expect(inZone({ extraDeckMonster: true }, { PROBE: 1, BIG: 1 })).toBe(false);
  });
  it('named reads the printed name off the field', () => {
    expect(inZone({ named: 'BIG' }, { PROBE: 1, BIG: 1 })).toBe(true);
    expect(inZone({ named: 'BIG' }, { PROBE: 1 })).toBe(false);
  });

  // A material of an Extra Deck rule: one of your monsters (its name on the field) or an opponent's.
  const LNK_FACT = { passcode: 9000098, name: 'Toy Link', type: 'Link Effect Monster', race: 'Cyberse', attr: 'DARK', level: null, link: 2, atk: 0, def: 0, text: '' };
  function material(rule: Record<string, unknown>, field: [CardId, CardId?][], opp?: Cfg['opp']) {
    const f = { ...TOY_FILE, cards: [...TOY_FILE.cards, { id: 'LNK', passcodes: [9000098], short: 'Link' }], extraDeck: [{ card: 'LNK', ...rule }] } as DeckFile;
    const v = validateDeckFile(f, {});
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    const deck = compileDeck(f, [...TOY_FACTS, LNK_FACT]);
    const s = deck.state.newState({ ...toyCfg({}), extra: { LNK: 1 }, opp }, deck.ix);
    for (const [id, nm] of field) s.mons.push({ id: deck.ix[id], nm: deck.ix[nm ?? id], emz: false, noEff: false, uses: 0, lvl: 4, marks: 0, uid: s.uid++ });
    return {
      links: () => createMoves(deck).gen(s).map((m) => m.k).filter((k) => k.startsWith('link:')),
      fusions: () => fusionOptions(s, fieldPool(s, deck.props, deck.UNK), deck.extra).length,
    };
  }
  const link2 = (mats: Word) => ({ method: 'link', rating: 2, min: 2, max: 2, mats });
  it('named reads the name a monster has on the field', () => {
    expect(material(link2({ named: 'BIG' }), [['SEEKER', 'BIG'], ['TUNER', 'BIG']]).links()).toEqual(['link:LNK:SEEKER+TUNER']);
    expect(material(link2({ named: 'BIG' }), [['SEEKER'], ['TUNER', 'BIG']]).links()).toEqual([]);
  });
  it('uniqueName: no other material has the same name', () => {
    expect(material(link2({ uniqueName: true }), [['SEEKER'], ['SEEKER']]).links()).toEqual([]);
    expect(material(link2({ uniqueName: true }), [['SEEKER'], ['TUNER']]).links()).toEqual(['link:LNK:SEEKER+TUNER']);
    expect(material(link2({ uniqueName: true }), [['SEEKER', 'BIG'], ['TUNER', 'BIG']]).links()).toEqual([]);
  });
  it('tuner on a monster on the field', () => {
    expect(material(link2({ not: { tuner: true } }), [['SEEKER'], ['TUNER']]).links()).toEqual([]);
    expect(material(link2({ not: { tuner: true } }), [['SEEKER'], ['BIG']]).links()).toEqual(['link:LNK:BIG+SEEKER']);
  });
  it("reads an opponent's monster's own Attribute, Type and frame", () => {
    const opp = { lp: 8000, mons: [{ uid: 'o1', kind: 'mon' as const, name: 'Foe', race: 'Dragon', attr: 'LIGHT', ext: true }], st: [] };
    const fusion = (slots: Word[]) => material({ method: 'fusion', slots }, [['SEEKER']], opp).fusions();
    expect(fusion([{ extraDeckMonster: true }, { race: ['Spellcaster'] }])).toBe(1);
    expect(fusion([{ attribute: ['LIGHT'] }, { attribute: ['DARK'] }])).toBe(1);
    expect(fusion([{ race: ['Dragon'] }, { race: ['Dragon'] }])).toBe(0);
    expect(fusion([{ frame: ['Effect'] }, { not: { tuner: true } }])).toBe(1);
    expect(fusion([{ named: 'SEEKER' }, { named: 'SEEKER' }])).toBe(0);
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
    expect(keys({ oppCard: { kind: 'mon' } }, { PROBE: 1 }, () => {}, true)).toEqual(['p:om1']);
    expect(keys({ oppCard: true }, { PROBE: 1 }, () => {}, true)).toEqual(['p:om1', 'p:os1']);
    expect(keys({ oppCard: { kind: 'mon', targetable: false } }, { PROBE: 1 }, () => {}, true)).toEqual(['p:om2']);
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
  it('discardCheapest discards the n different lowest-value cards, ties in list order', () => {
    // Probe is worth more; Big and Seeker tie (list order: by id, Big first).
    const card = { discardValue: 9 };
    const one = (() => { const d = probe([eff({ do: [{ discardCheapest: true }] })], {}, card); return { d, n: d.run(d.state({ PROBE: 1, BIG: 2, SEEKER: 1 }), 'p') }; })();
    expect([one.d.count(one.n, 'gy', 'BIG'), one.d.count(one.n, 'gy', 'SEEKER'), one.d.count(one.n, 'gy', 'PROBE')]).toEqual([1, 0, 0]);
    const d = probe([eff({ do: [{ discardCheapest: 2 }] })], {}, card);
    const n = d.run(d.state({ PROBE: 1, BIG: 2, SEEKER: 1 }), 'p');
    expect([d.count(n, 'gy', 'BIG'), d.count(n, 'gy', 'SEEKER'), d.count(n, 'hand', 'BIG'), d.count(n, 'hand', 'PROBE')]).toEqual([1, 1, 1, 1]);
    expect(n.log[0].seq!.slice(1)).toEqual([['m', d.deck.ix.BIG, 'hand', 'gy'], ['m', d.deck.ix.SEEKER, 'hand', 'gy']]);
  });
  it('lineNote is put on the step when not negated', () => {
    const d = probe([eff({ lineNote: 'They may respond.' })]);
    const s = d.state({ PROBE: 1 });
    expect(d.run(s, 'p').log[0].note).toBe('They may respond.');
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
  it('a monster summoned with its effects negated does not run its own trigger', () => {
    const d = probe([eff({ do: [{ summon: { what: 'self', noEff: true } }] }), eff({ key: 't', from: 'field', trigger: { specialSummoned: true }, text: 'T.' })]);
    const n = d.run(d.state({ PROBE: 1 }), 'p');
    expect(n.pend).toEqual([]);
    // Nor does a pending entry for it resolve (if one was queued before its effects were negated).
    const keys = d.deck.file.cards.flatMap((c) => (c.effects ?? []).map((e) => e.key)).sort();
    n.pend = [{ e: keys.indexOf('t') + 1, a: n.mons[0].uid }];   // effect ids are 1.. by sorted key
    expect(d.pendKeys(n)).toEqual([]);
    n.mons[0] = { ...n.mons[0], noEff: false };
    expect(d.pendKeys(n)).toEqual(['t']);
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
  it('refuses chosen on self', () => {
    expect(err({ tags: { deckAdd: { chosen: { as: 'self' } } } })![0]).toMatchObject({ field: 'effects[0].tags.deckAdd.chosen.as' });
  });
});

const gy = (id: CardId) => (s: State, d: ReturnType<typeof probe>) => { d.deck.state.W(s, 'gy')[d.deck.ix[id]]++; };

describe('choices, the Deck top and names (conditions, picks, actions)', () => {
  const ON_TOP = (ids: CardId[]) => (s: State, d: ReturnType<typeof probe>) => { for (const id of ids) { d.deck.state.W(s, 'deck')[d.deck.ix[id]]--; s.top.push(d.deck.ix[id]); } };
  const SPELLS_HAND_OR_DECK: Word = { union: [{ fromZone: { zone: 'hand', group: 'spells' } }, { fromZone: { zone: 'deck', group: 'spells' } }] };

  it('chosen: the choice was made, from a zone, matching a filter', () => {
    const tagged = (tag: Word, hand: Record<CardId, number>) => {
      const d = probe([eff({ choose: [{ as: 'c', pick: SPELLS_HAND_OR_DECK }], tags: { deckAdd: tag } })]);
      return d.moves(d.state(hand)).find((m) => m.k.startsWith('p:'))!.tags.deckAdd === true;
    };
    expect(tagged({ chosen: { as: 'c' } }, { PROBE: 1 })).toBe(true);
    expect(tagged({ chosen: { as: 'c', zone: 'deck' } }, { PROBE: 1 })).toBe(true);
    expect(tagged({ chosen: { as: 'c', zone: 'hand' } }, { PROBE: 1 })).toBe(false);
    expect(tagged({ chosen: { as: 'c', zone: 'hand' } }, { PROBE: 1, DRAWTWO: 3 })).toBe(true);
    expect(tagged({ chosen: { as: 'c', filter: { named: 'DRAWTWO' } } }, { PROBE: 1 })).toBe(true);
    expect(tagged({ chosen: { as: 'c', filter: { named: 'BIG' } } }, { PROBE: 1 })).toBe(false);
    const d = probe([eff({ choose: [{ as: 'c', pick: { fromZone: { zone: 'gy', group: 'spells' } }, optional: true }], tags: { deckAdd: { chosen: { as: 'c' } } } })]);
    expect(d.moves(d.state({ PROBE: 1 }))[0].tags.deckAdd).toBeUndefined();
  });
  it('knownTop counts the known cards on top of the Deck', () => {
    expect(offered([{ knownTop: { atMost: 0 } }])).toBe(true);
    expect(offered([{ knownTop: { atMost: 0 } }], ON_TOP(['BIG']))).toBe(false);
    expect(offered([{ knownTop: { atLeast: 2 } }], ON_TOP(['BIG', 'WALL']))).toBe(true);
  });
  it('namesPresent counts names on the field (as named there) and in the GY (by GY name)', () => {
    expect(offered([{ namesPresent: { names: ['BIG'] } }])).toBe(false);
    expect(offered([{ namesPresent: { names: ['BIG'] } }], gy('BIG'))).toBe(true);
    expect(offered([{ namesPresent: { names: ['BIG'] } }], (s, d) => { s.mons.push({ id: d.deck.ix.SEEKER, nm: d.deck.ix.BIG, emz: false, noEff: true, uses: 0, lvl: 4, marks: 0, uid: s.uid++ }); })).toBe(true);
    expect(offered([{ namesPresent: { names: ['BIG', 'WALL'], atLeast: 2 } }], gy('BIG'))).toBe(false);
    expect(offered([{ namesPresent: { names: ['BIG', 'WALL'], atLeast: 2 } }], (s, d) => { gy('BIG')(s, d); gy('WALL')(s, d); })).toBe(true);
    expect(offered([{ namesPresent: { names: ['BIG', 'WALL'], atMost: 1 } }], (s, d) => { gy('BIG')(s, d); gy('BIG')(s, d); })).toBe(true);
    // A card whose GY name is another card counts as that name there.
    const d = probe([eff({ cond: [{ namesPresent: { names: ['BIG'] } }] })], {}, { gyName: 'BIG' });
    const s = d.state({ PROBE: 1 });
    gy('PROBE')(s, d);
    expect(d.mainKeys(s)).toEqual(['p']);
  });
  it('union offers each nested pick in turn', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: SPELLS_HAND_OR_DECK }], text: 'Probe: {c} from {zone}.' })]);
    const s = d.state({ PROBE: 1, DRAWTWO: 1 });
    expect(d.moves(s).filter((m) => m.k.startsWith('p:')).map((m) => m.run(s, false).log[0].text)).toEqual(['Probe: Draw Two from hand.', 'Probe: Draw Two from Deck.']);
  });
  it('onlyIf offers the nested pick only while its conditions hold (they see earlier choices)', () => {
    const e = eff({ choose: [{ as: 'a', pick: { otherHandCard: true } }, { as: 'b', optional: true, pick: { onlyIf: { if: [{ addLockOff: true }, { chosen: { as: 'a', filter: { named: 'BIG' } } }], of: { fromZone: { zone: 'deck', group: 'spells' } } } } }] });
    const d = probe([e]);
    expect(d.mainKeys(d.state({ PROBE: 1, BIG: 1, WALL: 1 }))).toEqual(['p:BIG:DRAWTWO', 'p:WALL:-']);
    const s = d.state({ PROBE: 1, BIG: 1 });
    s.addLock = true;
    expect(d.mainKeys(s)).toEqual(['p:BIG:-']);
  });
  it('fromTop picks among the top n known cards; taking one keeps the rest known', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { fromTop: { n: 2, group: 'spells' } } }], do: [{ move: { what: 'c', to: 'hand' } }] })], { groups: { ...TOY_FILE.groups, spells: ['DRAWTWO', 'WALL'] } });
    const s = d.state({ PROBE: 1 });
    ON_TOP(['BIG', 'WALL', 'DRAWTWO'])(s, d);
    expect(d.mainKeys(s)).toEqual(['p:WALL']);
    const n = d.run(s, 'p:WALL');
    expect(n.top.map((i) => d.deck.ids[i])).toEqual(['BIG', 'DRAWTWO']);
    expect(d.count(n, 'hand', 'WALL')).toBe(1);
    expect(d.count(n, 'deck', 'WALL')).toBe(2);
    expect(n.log[0].seq).toContainEqual(['m', d.deck.ix.WALL, 'deck', 'hand']);
  });
  it('setOnField Sets a card from where it is (here the GY)', () => {
    const d = probe([eff({ from: 'gy', do: [{ payLp: 100 }, { setOnField: { what: 'self' } }] })]);
    const s = d.state({});
    gy('PROBE')(s, d);
    const n = d.run(s, 'p');
    expect(n.st).toEqual([{ id: d.deck.ix.PROBE, up: false, now: true }]);
    expect(d.count(n, 'gy', 'PROBE')).toBe(0);
    expect(n.log[0].seq).toEqual([['a', d.deck.ix.PROBE, 0, 'gy'], ['m', d.deck.ix.PROBE, 'gy', 'field']]);
  });
});

describe('effect fields: stepTags, text alternatives, the Spell flag', () => {
  it('stepTags are recorded on the step, not on the move', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { otherHandCard: true } }], tags: { deckAdd: true }, stepTags: { spell: true, dig: { chosen: { as: 'c', filter: { named: 'BIG' } } } } })]);
    const s = d.state({ PROBE: 1, BIG: 1, WALL: 1 });
    expect(d.moves(s).map((m) => m.tags)).toEqual([{ deckAdd: true }, { deckAdd: true }]);
    expect(d.run(s, 'p:BIG').log[0].tags).toEqual({ deckAdd: true, spell: true, dig: true });
    expect(d.run(s, 'p:WALL').log[0].tags).toEqual({ deckAdd: true, spell: true });
  });
  it('{name?text|other} shows text (with $ for the name) when the choice was made, else other', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { fromZone: { zone: 'gy', group: 'spells' } }, optional: true }], text: 'Probe: look{c?, add $ from GY|, nothing}.', negText: 'Probe{c? ($)}: negated.' })]);
    const s = d.state({ PROBE: 1 });
    expect(d.lastText(d.run(s, 'p:-'))).toBe('Probe: look, nothing.');
    expect(d.lastText(d.run(s, 'p:-', true))).toBe('Probe: negated.');
    gy('DRAWTWO')(s, d);
    expect(d.lastText(d.run(s, 'p:DRAWTWO'))).toBe('Probe: look, add Draw Two from GY.');
    expect(d.lastText(d.run(s, 'p:DRAWTWO', true))).toBe('Probe (Draw Two): negated.');
  });
  it('an effect of a card in the GY does not count as activating a Spell', () => {
    const d = probe([eff({ key: 'g', from: 'gy', activates: 'spell' }), eff({ key: 'h', from: 'hand', activates: 'spell' })]);
    const s = d.state({});
    gy('PROBE')(s, d);
    expect(d.run(s, 'g').spell).toBe(false);
    expect(d.run(d.state({ PROBE: 1 }), 'h').spell).toBe(true);
  });
});

describe('group 3 words: cardKind, first, oppRemoveAll, fromZone plus/eachCopy, subsets join, list order, names', () => {
  const keysOf = (d: ReturnType<typeof probe>, s: State) => d.mainKeys(s).filter((k) => k === 'p' || k.startsWith('p:'));
  const withOrder = (effects: EffectDef[], order: Record<CardId, number>) => {
    const f = fileWith(effects);
    f.cards = f.cards.map((c) => (c.id in order ? { ...c, listOrder: order[c.id] } : c));
    return driver(f, FACTS);
  };
  it('cardKind reads Monster, Spell or Trap', () => {
    const inHand = (k: string[], hand: Record<CardId, number>) => offered([{ has: { zone: 'hand', filter: { cardKind: k } } }], () => {}, {}, hand);
    expect(inHand(['spell'], { PROBE: 1, DRAWTWO: 1 })).toBe(true);
    expect(inHand(['spell'], { PROBE: 1, WALL: 1 })).toBe(false);
    expect(inHand(['trap'], { PROBE: 1, WALL: 1 })).toBe(true);
    expect(inHand(['spell', 'trap'], { PROBE: 1, BIG: 1 })).toBe(false);
    expect(inHand(['monster'], { PROBE: 1 })).toBe(true);
  });
  it('first keeps only the first choices of the nested pick', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { first: { of: { otherHandCard: true } } } }] })]);
    expect(keysOf(d, d.state({ PROBE: 1, BIG: 1, WALL: 1 }))).toEqual(['p:BIG']);
    const d2 = probe([eff({ choose: [{ as: 'c', pick: { first: { of: { otherHandCard: true }, n: 2 } } }] })]);
    expect(keysOf(d2, d2.state({ PROBE: 1, BIG: 1, WALL: 1, TUNER: 1 }))).toEqual(['p:BIG', 'p:TUNER']);
  });
  it('listOrder sets the order zone picks list cards in (and so what first and cheapest ties take)', () => {
    const d = withOrder([eff({ choose: [{ as: 'c', pick: { first: { of: { otherHandCard: true } } } }] })], { WALL: 1, BIG: 2 });
    expect(keysOf(d, d.state({ PROBE: 1, BIG: 1, WALL: 1, TUNER: 1 }))).toEqual(['p:WALL']);
    const z = withOrder([eff({ choose: [{ as: 'c', pick: { fromZone: { zone: 'hand' } } }] })], { WALL: 0 });
    expect(keysOf(z, z.state({ PROBE: 1, BIG: 1, WALL: 1 }))).toEqual(['p:WALL', 'p:BIG', 'p:PROBE']);
    const c = withOrder([eff({ choose: [{ as: 'c', pick: { cheapest: { of: { otherHandCard: true } } } }] })], { WALL: 0 });
    expect(keysOf(c, c.state({ PROBE: 1, BIG: 1, WALL: 1 }))).toEqual(['p:WALL']);
  });
  it('fromZone with no group or filter takes any card; eachCopy gives one choice per copy', () => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { fromZone: { zone: 'hand', eachCopy: true } } }] })]);
    expect(keysOf(d, d.state({ PROBE: 1, BIG: 2 }))).toEqual(['p:BIG', 'p:BIG', 'p:PROBE']);
  });
  it('fromZone plus counts an earlier choice as already in the zone', () => {
    const d = probe([eff({
      choose: [{ as: 'a', pick: { fromZone: { zone: 'deck', group: 'spells' } } }, { as: 'b', pick: { fromZone: { zone: 'hand', plus: 'a' } } }],
      do: [{ move: { what: 'a', to: 'hand' } }, { placeOnTop: { what: 'b' } }],
    })]);
    const s = d.state({ PROBE: 1, BIG: 1 });
    expect(keysOf(d, s)).toEqual(['p:DRAWTWO:BIG', 'p:DRAWTWO:DRAWTWO', 'p:DRAWTWO:PROBE']);
    const n = d.run(s, 'p:DRAWTWO:DRAWTWO');
    expect(n.top).toEqual([d.deck.ix.DRAWTWO]);
    expect(d.count(n, 'hand', 'DRAWTWO')).toBe(0);
  });
  it('subsets offers the same cards from the same places once, joined by join', () => {
    const pick = { subsets: { min: 1, max: 2, join: ' + ', of: { union: [{ fromZone: { zone: 'hand', filter: { cardKind: ['spell', 'trap'] }, eachCopy: true } }, { fromField: { kind: 'st' } }] } } };
    const d = probe([eff({ choose: [{ as: 'c', pick }], text: 'Send {c}.' })]);
    const s = d.state({ PROBE: 1, WALL: 2 });
    s.st.push({ id: d.deck.ix.WALL, up: false, now: false }, { id: d.deck.ix.WALL, up: true, now: false });
    // Hand copies merge (one single, one pair); the two field Walls are different cards.
    const ks = keysOf(d, s);
    const n = (k: string) => ks.filter((x) => x === k || x.startsWith(k + '#')).length;
    expect(n('p:WALL')).toBe(3);                // hand, field 0, field 1
    expect(n('p:WALL+WALL')).toBe(1 + 2 + 1);   // hand+hand, hand+field 0, hand+field 1, field 0+field 1
    expect(d.lastText(d.run(s, 'p:WALL+WALL'))).toBe('Send Wall + Wall.');
  });
  it('oppRemoveAll destroys every matching opponent card, targetable or not', () => {
    const d = probe([eff({ do: [{ oppRemoveAll: { how: 'destroy', kind: 'st', destroyable: true } }] })]);
    const opp = { lp: 8000, mons: [OPP.mons[0]], st: [{ uid: 's1', kind: 'st' as const, name: 'A', noTarget: true }, { uid: 's2', kind: 'st' as const, name: 'B', noDestroy: true }, { uid: 's3', kind: 'st' as const, name: 'C' }] };
    const n = d.run(d.deck.state.newState({ ...toyCfg({ PROBE: 1 }), opp }, d.deck.ix), 'p');
    expect(n.opp!.st.map((x) => x.uid)).toEqual(['s2']);
    expect(n.opp!.mons.length).toBe(1);
    expect(n.removed).toBe(2);
  });
  it('named reads a card by its GY name in the GY; fieldName renames it on the field', () => {
    const cond = [{ has: { zone: 'gy', filter: { named: 'BIG' } } }];
    const d = probe([eff({ cond })], {}, { gyName: 'BIG' });
    const s = d.state({ PROBE: 1 });
    expect(d.mainKeys(s)).toEqual([]);
    gy('PROBE')(s, d);
    expect(d.mainKeys(s)).toEqual(['p']);
    const plain = probe([eff({ cond })]);
    const s2 = plain.state({ PROBE: 1 });
    gy('PROBE')(s2, plain);
    expect(plain.mainKeys(s2)).toEqual([]);
    const f = probe([eff({ do: [{ summon: { what: 'self' } }] })], {}, { fieldName: 'BIG' });
    expect(f.run(f.state({ PROBE: 1 }), 'p').mons[0].nm).toBe(f.deck.ix.BIG);
  });
  it('stepMarks are recorded on the step, not on the move', () => {
    const d = probe([eff({ tags: { deckAdd: true }, stepMarks: ['m'] })], { marks: ['m'] });
    const s = d.state({ PROBE: 1 });
    expect(d.moves(s)[0].tags).toEqual({ deckAdd: true });
    expect(d.run(s, 'p').log[0].tags).toEqual({ deckAdd: true, marks: 1 << d.deck.markBit.m });
  });
});

describe('group 4 words: summoned, wipeField, namesPresent inGy, uniqueName in the GY', () => {
  it('summoned fires when this card is Normal or Special Summoned, not for another card', () => {
    const d = probe([eff({ do: [{ summon: { what: 'self' } }] }), eff({ key: 't', from: 'field', trigger: { summoned: true }, text: 'T.' })]);
    expect(d.pendKeys(d.run(d.state({ PROBE: 1 }), 'p'))).toEqual(['t']);
    expect(d.pendKeys(d.summonForTest(d.state({ PROBE: 1 }), 'PROBE'))).toEqual(['t']);
    expect(d.summonForTest(d.state({ PROBE: 1, BIG: 1 }), 'BIG').pend).toEqual([]);
  });

  it('wipeField banishes every other card it can, then summons the choice with its Level raised by the count', () => {
    const d = probe([eff({
      from: 'field',
      choose: [{ as: 'mon', pick: { fromZone: { zone: 'deck', filter: { named: 'BIG' } } } }],
      do: [{ wipeField: { banish: true, spare: { named: 'SEEKER' }, thenSummon: 'mon' } }],
    })]);
    const opp = { lp: 8000, mons: [OPP.mons[0], { uid: 'm3', kind: 'mon' as const, name: 'Rock', noDestroy: true }], st: [{ uid: 's1', kind: 'st' as const, name: 'Lid', faceDown: true, noTarget: true }] };
    const s = d.deck.state.newState({ ...toyCfg({}), opp }, d.deck.ix);
    for (const id of ['PROBE', 'WALL', 'SEEKER', 'TUNER'] as CardId[]) onField(d, s, id);
    s.st.push({ id: d.deck.ix.DRAWTWO, up: false, now: false });
    const n = d.run(s, 'p:BIG');
    // Gone: Wall, Tuner, Draw Two (yours) and Foe, Lid (theirs) = 5; kept: Probe itself, Seeker (spared), Rock (cannot be destroyed).
    expect(n.mons.map((m) => d.deck.ids[m.id]).sort()).toEqual(['BIG', 'PROBE', 'SEEKER']);
    expect(n.st).toEqual([]);
    expect(n.opp!.mons.map((x) => x.uid)).toEqual(['m3']);
    expect(n.opp!.st).toEqual([]);
    expect(n.removed).toBe(2);
    expect(['WALL', 'TUNER', 'DRAWTWO'].map((id) => d.count(n, 'ban', id))).toEqual([1, 1, 1]);
    expect(n.mons.find((m) => m.id === d.deck.ix.BIG)!.lvl).toBe(6 + 5);
    expect(d.count(n, 'deck', 'BIG')).toBe(d.count(s, 'deck', 'BIG') - 1);
    // Without banish, your cards go to the GY; without thenSummon, nothing is summoned.
    const g = probe([eff({ from: 'field', do: [{ wipeField: {} }] })]);
    const s2 = g.state({});
    onField(g, s2, 'PROBE'); onField(g, s2, 'BIG');
    const n2 = g.run(s2, 'p');
    expect(n2.mons.map((m) => g.deck.ids[m.id])).toEqual(['PROBE']);
    expect(g.count(n2, 'gy', 'BIG')).toBe(1);
  });

  it('namesPresent inGy: only the listed names count in the GY', () => {
    const cond = (k: Record<string, number>) => [{ namesPresent: { names: ['BIG', 'WALL'], inGy: ['BIG'], ...k } }];
    expect(offered(cond({}), gy('WALL'))).toBe(false);
    expect(offered(cond({}), gy('BIG'))).toBe(true);
    expect(offered(cond({ atLeast: 2 }), (s, d) => { gy('BIG')(s, d); gy('WALL')(s, d); })).toBe(false);
    expect(offered(cond({ atLeast: 2 }), (s, d) => { gy('BIG')(s, d); s.mons.push({ id: d.deck.ix.SEEKER, nm: d.deck.ix.WALL, emz: false, noEff: false, uses: 0, lvl: 4, marks: 0, uid: s.uid++ }); })).toBe(true);
    expect(() => probe([eff({ cond: [{ namesPresent: { names: ['BIG'], inGy: ['WALL'] } }] })])).toThrow(DeckCompileError);
  });

  it("a deck's listOrder map orders a shared file's cards in the compiled picks", () => {
    const shared = { vocab: 1, cards: [{ id: 'SHARED', passcodes: [9000097], short: 'Shared', listOrder: 1 }] };
    const raw = { ...fileWith([eff({ choose: [{ as: 'c', pick: { otherHandCard: true } }] })]), uses: ['s'], listOrder: { SHARED: 99, BIG: 50 } };
    const v = validateDeckFile(raw, { s: shared });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    const d = driver(v.file, [...FACTS, { ...PROBE_FACT, passcode: 9000097, name: 'Toy Shared' }]);
    expect(d.mainKeys(d.state({ PROBE: 1, BIG: 1, SHARED: 1 })).filter((k) => k.startsWith('p:'))).toEqual(['p:BIG', 'p:SHARED']);
  });

  it('uniqueName reads a card in the GY by its GY name', () => {
    const e = eff({ from: 'gy', choose: [{ as: 'a', pick: { fromZone: { zone: 'gy', filter: { named: 'BIG' } } } }, { as: 'b', pick: { fromZone: { zone: 'gy', filter: { uniqueName: true } } } }] });
    const d = probe([e], {}, { gyName: 'BIG' });
    const s = d.state({});
    gy('BIG')(s, d); gy('PROBE')(s, d); gy('WALL')(s, d);
    // Probe is named Big in the GY: it is Big's second copy by name, so only Wall can join a Big.
    expect(d.mainKeys(s).filter((k) => k.startsWith('p:BIG:'))).toEqual(['p:BIG:WALL']);
  });
});

describe('group 5 words: immediate triggers, leftField faceUp, gainLp, fromField distinct, wipeField noTriggers', () => {
  const sendSt = eff({ from: 'hand', choose: [{ as: 'c', pick: { fromField: { kind: 'st' } } }], do: [{ move: { what: 'c', to: 'gy' } }], text: 'Send {c}.' });
  const withWall = (d: ReturnType<typeof probe>, up: boolean, hand: Record<CardId, number> = { PROBE: 1 }) => { const s = d.state(hand); s.st.push({ id: d.deck.ix.WALL, up, now: false }); return s; };
  /** The probe file with Wall given `effects`. */
  const wallWith = (effects: EffectDef[], probeEffects: EffectDef[], extra: Partial<DeckFile> = {}) => {
    const f = fileWith(probeEffects, extra);
    f.cards = f.cards.map((c) => (c.id === 'WALL' ? { ...c, effects } : c));
    return driver(f, FACTS);
  };

  it('an immediate trigger runs inside the step that set it off, adds its text and queues nothing', () => {
    const o = probe([
      eff({ choose: [{ as: 't', pick: { oppCard: { kind: 'mon' } } }], do: [{ oppRemove: { what: 't', how: 'destroy' } }], text: 'Destroy {t}.' }),
      eff({ key: 'i', from: 'hand', trigger: { oppMonsterToGy: true }, immediate: true, limit: 'oncePerTurn', cond: [{ lpAbove: 100 }], do: [{ burn: 300 }, { gainLp: 300 }], text: 'Probe drains 300.' }),
    ]);
    const n = o.run(withOpp(o, { PROBE: 1 }), 'p:om1');
    expect(n.pend).toEqual([]);
    expect(o.lastText(n)).toBe('Destroy Foe. Probe drains 300.');
    expect([n.lp, n.burn, n.opp!.lp]).toEqual([8300, 300, 7700]);
    // Once per turn: the second destruction does not drain.
    n.opp!.mons.push({ uid: 'm9', kind: 'mon', name: 'Again', ui: 9 });
    const n2 = o.run(n, 'p:om9');
    expect(o.lastText(n2)).toBe('Destroy Again.');
    expect(n2.lp).toBe(8300);
    // Its conditions are checked when the event happens.
    const s3 = withOpp(o, { PROBE: 1 });
    s3.lp = 100;
    expect(o.lastText(o.run(s3, 'p:om1'))).toBe('Destroy Foe.');
  });

  it('leftField faceUp fires only for a card that was face-up (an immediate trigger with no text adds none)', () => {
    const w = eff({ key: 'w', from: 'gy', trigger: { leftField: { to: 'gy', faceUp: true } }, immediate: true, do: [{ setFlag: 'f' }], text: '' });
    const d = wallWith([w], [sendSt], { flags: ['f'] });
    const up = d.run(withWall(d, true), 'p:WALL');
    expect(up.flags).toBe(1);
    expect(up.pend).toEqual([]);
    expect(d.lastText(up)).toBe('Send Wall.');
    expect(d.run(withWall(d, false), 'p:WALL').flags).toBe(0);
  });

  it('immediate needs a trigger and takes no choices', () => {
    const err = (e: Partial<EffectDef>) => { try { compileDeck(fileWith([eff(e)]), FACTS); } catch (x) { return (x as DeckCompileError).errors[0].field; } return null; };
    expect(err({ immediate: true })).toBe('effects[0].immediate');
    const imm = { immediate: true, trigger: { oppMonsterToGy: true } };
    expect(err({ ...imm, choose: [{ as: 'c', pick: { otherHandCard: true } }] })).toBe('effects[0].choose');
    // Fields only a move reads are refused, not silently ignored.
    expect(err({ ...imm, activates: 'spell' })).toBe('effects[0].activates');
    expect(err({ ...imm, ledger: { effect: 1 } })).toBe('effects[0].ledger');
    expect(err({ ...imm, tags: { spell: true } })).toBe('effects[0].tags');
    expect(err(imm)).toBeNull();
  });

  it('moving an Extra Deck card to the Deck puts it in the Extra Deck, and the ledger says extra', () => {
    const d = probe([eff({ from: 'hand', choose: [{ as: 'c', pick: { union: [{ fromField: { kind: 'mon' } }, { fromZone: { zone: 'gy', group: 'sync' } }] } }], do: [{ move: { what: 'c', to: 'deck' } }] })], { groups: { ...TOY_FILE.groups, sync: ['SYNC'] } });
    const s = d.state({ PROBE: 1 });
    onField(d, s, 'SYNC');
    gy('SYNC')(s, d);
    const extra0 = d.count(s, 'extra', 'SYNC');
    // Two moves keyed p:SYNC: the one on the field (first), the one in the GY.
    const ms = d.moves(s).filter((x) => x.k === 'p:SYNC');
    expect(ms).toHaveLength(2);
    for (const [m, from] of [[ms[0], 'field'], [ms[1], 'gy']] as const) {
      const n = m.run(s, false);
      expect(d.count(n, 'extra', 'SYNC')).toBe(extra0 + 1);
      expect(d.count(n, 'deck', 'SYNC')).toBe(d.count(s, 'deck', 'SYNC'));
      expect(n.log[0].seq).toContainEqual(['m', d.deck.ix.SYNC, from, 'extra']);
    }
  });

  it('wipeField noTriggers writes the zone it really puts the card in to the ledger', () => {
    const d = probe([eff({ from: 'field', do: [{ wipeField: { noTriggers: true } }] })]);
    const s = d.state({});
    onField(d, s, 'PROBE'); onField(d, s, 'SYNC');
    const n = d.run(s, 'p');
    expect(d.count(n, 'gy', 'SYNC')).toBe(1);
    expect(n.log[0].seq).toContainEqual(['m', d.deck.ix.SYNC, 'field', 'gy']);
  });

  it('gainLp gains Life Points', () => {
    const d = probe([eff({ do: [{ gainLp: 1500 }] })]);
    expect(d.run(d.state({ PROBE: 1 }), 'p').lp).toBe(9500);
  });

  it('fromField distinct offers each card id once (the first)', () => {
    const keys = (distinct: boolean) => {
      const d = probe([eff({ choose: [{ as: 'c', pick: { fromField: { kind: 'mon', distinct } } }] })]);
      const s = d.state({ PROBE: 1 });
      onField(d, s, 'BIG'); onField(d, s, 'WALL'); onField(d, s, 'BIG');
      return d.mainKeys(s).filter((k) => k.startsWith('p:'));
    };
    expect(keys(false)).toEqual(['p:BIG', 'p:WALL', 'p:BIG']);
    expect(keys(true)).toEqual(['p:BIG', 'p:WALL']);
  });

  it('wipeField noTriggers: your cards leave without setting off triggers', () => {
    const wipe = (noTriggers: boolean) => {
      const d = wallWith([eff({ key: 'l', from: 'ban', trigger: { leftField: true }, text: 'L.' })], [eff({ from: 'field', do: [{ wipeField: { banish: true, noTriggers } }] })]);
      const s = withWall(d, true, {});
      onField(d, s, 'PROBE');
      return { d, n: d.run(s, 'p') };
    };
    const loud = wipe(false), quiet = wipe(true);
    expect(loud.d.pendKeys(loud.n)).toEqual(['l']);
    expect(quiet.n.pend).toEqual([]);
    expect(quiet.n.st).toEqual([]);
    expect(quiet.d.count(quiet.n, 'ban', 'WALL')).toBe(1);
    expect(quiet.n.log[0].seq).toContainEqual(['m', quiet.d.deck.ix.WALL, 'field', 'banished']);
  });
});

describe('group 6 words: all, level, materialAttribute, uses, burn atkOf, text holes, Fusion words, queueFirst', () => {
  const pickKeys = (filter: Word, card: Partial<CardDef> = {}, setup: (s: State, d: ReturnType<typeof probe>) => void = () => {}) => {
    const d = probe([eff({ choose: [{ as: 'c', pick: { fromField: { kind: 'mon', filter } } }] })], {}, card);
    const s = d.state({ PROBE: 1 });
    setup(s, d);
    return d.mainKeys(s);
  };

  it('all is true when every nested condition is', () => {
    expect(offered([{ all: [{ lpAbove: 0 }, { has: { zone: 'hand' } }] }])).toBe(true);
    expect(offered([{ all: [{ lpAbove: 8000 }, { has: { zone: 'hand' } }] }])).toBe(false);
  });

  it('level reads a monster on the field by its current Level, and a field filter reads it there', () => {
    const put = (s: State, d: ReturnType<typeof probe>) => { onField(d, s, 'BIG'); s.mons[0].lvl = 4; };
    expect(pickKeys({ level: { atLeast: 5 } }, {}, put)).toEqual([]);
    expect(pickKeys({ level: { atLeast: 4, atMost: 4 } }, {}, put)).toEqual(['p:BIG']);
  });

  it('materialAttribute: a monster whose card counts as any Attribute as material matches each; attribute does not', () => {
    const put = (s: State, d: ReturnType<typeof probe>) => { onField(d, s, 'PROBE'); };
    expect(pickKeys({ materialAttribute: ['LIGHT'] }, { materialAttribute: 'any' }, put)).toEqual(['p:PROBE']);
    expect(pickKeys({ attribute: ['LIGHT'] }, { materialAttribute: 'any' }, put)).toEqual([]);
    expect(pickKeys({ materialAttribute: ['LIGHT'] }, {}, put)).toEqual([]);
    expect(pickKeys({ materialAttribute: ['DARK'] }, {}, put)).toEqual(['p:PROBE']);
  });

  it('usesLeft / spendUse: a counted effect is offered while uses are left, and spends one even when negated', () => {
    const d = probe([eff({ from: 'field', cond: [{ usesLeft: true }], cost: [{ spendUse: { what: 'self' } }] })]);
    const s = d.state({});
    onField(d, s, 'PROBE');
    expect(d.mainKeys(s)).toEqual([]);
    s.mons[0].uses = 1;
    const n = d.run(s, 'p', true);
    expect(n.mons[0].uses).toBe(0);
    expect(d.mainKeys(n)).toEqual([]);
  });

  it("burn atkOf burns the chosen opponent card's ATK; {as.atk} prints it and {as@zone?text} tests where a choice came from", () => {
    const o = probe([eff({ choose: [{ as: 't', pick: { oppCard: { kind: 'mon' } } }], do: [{ burn: { atkOf: 't' } }, { oppRemove: { what: 't', how: 'destroy' } }], text: 'Destroy {t}, burn {t.atk}.' })]);
    const n = o.run(withOpp(o, { PROBE: 1 }), 'p:om1');
    expect(o.lastText(n)).toBe('Destroy Foe, burn 2000.');
    expect([n.burn, n.opp!.lp]).toEqual([2000, 6000]);
    const z = probe([eff({ choose: [{ as: 'c', pick: { union: [{ fromZone: { zone: 'hand', filter: { named: 'BIG' } } }, { fromZone: { zone: 'gy', filter: { named: 'BIG' } } }] } }], text: 'On {c}{c@gy? in GY|!}.' })]);
    const s = z.state({ PROBE: 1, BIG: 1 });
    gy('BIG')(s, z);
    expect(z.moves(s).map((m) => z.lastText(m.run(s, false)))).toEqual(['On Big!.', 'On Big in GY.']);
    expect(() => probe([eff({ choose: [{ as: 'c', pick: { otherHandCard: true } }], text: '{c@moon?x}' })])).toThrow(/unknown zone/);
  });

  const FUSE: Partial<DeckFile> = { extraDeck: [{ card: 'SYNC', method: 'fusion', slots: [{ named: 'BIG' }, { race: ['Spellcaster'] }], uses: { frame: ['Normal'] } }] };
  const fuser = (to?: 'gy' | 'deck', either = false) => probe([eff({
    choose: [{ as: 'mats', pick: { fusionMaterials: { either, oppPrefix: 'their ' } } }, { as: 'fus', pick: { fusionMonster: { of: 'mats' } } }],
    do: [{ fusionSummon: { what: 'fus', mats: 'mats', ...(to ? { to } : {}) } }], text: '{mats} into {fus}.',
  })], FUSE);

  it('fusionMaterials / fusionMonster offer each material set and what it makes; fusionSummon sends them and gives uses', () => {
    const d = fuser();
    const s = d.state({ PROBE: 1 });
    onField(d, s, 'BIG'); onField(d, s, 'SEEKER'); onField(d, s, 'WALL');
    expect(d.mainKeys(s)).toEqual(['p:BIG+SEEKER:SYNC']);
    const n = d.run(s, 'p:BIG+SEEKER:SYNC');
    expect(d.lastText(n)).toBe('Big + Seeker into Sync.');
    expect(n.mons.map((m) => [d.deck.ids[m.id], m.uses])).toEqual([['WALL', 0], ['SYNC', 1]]);
    expect([d.count(n, 'gy', 'BIG'), d.count(n, 'gy', 'SEEKER'), d.count(n, 'extra', 'SYNC')]).toEqual([1, 1, 0]);
    // to: deck puts your materials back in the Deck.
    const k = fuser('deck');
    const s2 = k.state({ PROBE: 1 });
    onField(k, s2, 'BIG'); onField(k, s2, 'SEEKER');
    const n2 = k.run(s2, 'p:BIG+SEEKER:SYNC');
    expect([k.count(n2, 'deck', 'BIG') - k.count(s2, 'deck', 'BIG'), k.count(n2, 'gy', 'BIG')]).toEqual([1, 0]);
    // No rule met: nothing.
    const s3 = d.state({ PROBE: 1 });
    onField(d, s3, 'BIG'); onField(d, s3, 'WALL');
    expect(d.mainKeys(s3)).toEqual([]);
  });

  it("fusionMaterials with either takes the opponent's face-up monsters, named with oppPrefix; the opponent's goes to their GY", () => {
    const d = fuser('gy', true);
    const s = d.deck.state.newState({ ...toyCfg({ PROBE: 1 }), opp: { lp: 8000, mons: [{ uid: 'm1', kind: 'mon', name: 'Mage', race: 'Spellcaster', attr: 'DARK' }], st: [] } }, d.deck.ix);
    onField(d, s, 'BIG');
    expect(d.mainKeys(s)).toEqual(['p:BIG+om1:SYNC']);
    const n = d.run(s, 'p:BIG+om1:SYNC');
    expect(d.lastText(n)).toBe('Big + their Mage into Sync.');
    expect([n.opp!.mons.length, n.removed]).toEqual([0, 1]);
    expect(fuser('gy', false).mainKeys(s)).toEqual([]);
  });

  it("a Fusion rule's sameAttr treats a material counting as any Attribute as the same as the other", () => {
    const f = fileWith([], { extraDeck: [{ card: 'SYNC', method: 'fusion', slots: [{ cardKind: ['monster'] }, { cardKind: ['monster'] }], relations: ['sameAttr'] }] }, { materialAttribute: 'any' });
    const d = driver(f, FACTS);
    const s = d.state({});
    onField(d, s, 'TUNER'); onField(d, s, 'SEEKER');
    expect(fusionOptions(s, fieldPool(s, d.deck.props, d.deck.UNK), d.deck.extra)).toEqual([]);
    onField(d, s, 'PROBE');
    expect(fusionOptions(s, fieldPool(s, d.deck.props, d.deck.UNK), d.deck.extra).map((o) => o.mats.map((m) => d.deck.ids[m.id]))).toEqual([['TUNER', 'PROBE'], ['SEEKER', 'PROBE']]);
  });

  it('queueFirst puts a trigger at the front of the pending list; it needs a trigger', () => {
    const d = probe([
      eff({ key: 'back', from: 'field', trigger: { summoned: true } }),
      eff({ key: 'front', from: 'field', trigger: { summoned: true }, queueFirst: true }),
    ]);
    const s = d.state({ PROBE: 1 });
    s.pend = [{ e: d.deck.effects.findIndex((e) => e.key === 'back') }];
    const n = d.summonForTest(s, 'PROBE');
    expect(n.pend.map((p) => d.deck.effects[p.e].key)).toEqual(['front', 'back', 'back']);
    expect(() => compileDeck(fileWith([eff({ queueFirst: true })]), FACTS)).toThrow(/queueFirst/);
  });
});
