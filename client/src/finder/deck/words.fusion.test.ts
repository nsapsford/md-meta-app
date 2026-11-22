// The words added for Fusion-centred decks (Task 28), each compiled and run on the toy deck with a
// made-up PROBE card, as words.test.ts does for the seed words.
import { describe, it, expect } from 'vitest';
import { compileDeck } from './compile';
import { validateDeckFile, type CardDef, type DeckFile, type EffectDef } from './schema';
import type { Word } from './vocabulary';
import { TOY_FACTS, TOY_FILE, toyCfg } from '../engine/__toy__/toyDeck';
import { driver } from '../engine/__toy__/driver';
import type { CardId, State } from '../engine/types';
import { createMoves } from '../engine/moves';
import { createScore } from '../engine/score';
import { END_PHASE_HEADING, splitItems } from '../engine/items';

const PROBE_FACT = { passcode: 9000099, name: 'Toy Probe', type: 'Effect Monster', race: 'Fiend', attr: 'DARK', level: 3, link: null, atk: 1200, def: 0, text: '' };
const FACTS = [...TOY_FACTS, PROBE_FACT];
const eff = (e: Partial<EffectDef>): EffectDef => ({ key: 'p', phase: 'main', from: 'hand', do: [], tags: {}, text: 'Probe.', ...e });

function fileWith(effects: EffectDef[], extra: Partial<DeckFile> = {}, card: Partial<CardDef> = {}): DeckFile {
  const f: DeckFile = { ...TOY_FILE, ...extra, cards: [...TOY_FILE.cards, { id: 'PROBE', passcodes: [9000099], short: 'Probe', effects, ...card }] };
  const v = validateDeckFile(f, {});
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return v.file;
}
const probe = (effects: EffectDef[], extra: Partial<DeckFile> = {}, card: Partial<CardDef> = {}) => driver(fileWith(effects, extra, card), FACTS);
type D = ReturnType<typeof probe>;
const onField = (d: D, s: State, id: CardId, more: { nm?: CardId; uses?: number } = {}) => {
  s.mons.push({ id: d.deck.ix[id], nm: d.deck.ix[more.nm ?? id], emz: false, noEff: false, uses: more.uses ?? 0, lvl: d.deck.props[d.deck.ix[id]].lv ?? 4, marks: 0, uid: s.uid++ });
};
const OPP = { lp: 8000, mons: [{ uid: 'm1', kind: 'mon' as const, name: 'Foe', atk: 2000, def: 500, race: 'Dragon', attr: 'DARK' }, { uid: 'm2', kind: 'mon' as const, name: 'Shy', atk: 100, intr: 'negFieldMon' }], st: [] };
const withOpp = (d: D, hand: Record<CardId, number>) => d.deck.state.newState({ ...toyCfg(hand), opp: OPP }, d.deck.ix);

function offered(cond: Word[], prep: (s: State, d: D) => void = () => {}, extra: Partial<DeckFile> = {}): boolean {
  const d = probe([eff({ cond })], extra);
  const s = d.state({ PROBE: 1 });
  prep(s, d);
  return d.mainKeys(s).includes('p');
}

describe('Fusion-deck conditions', () => {
  it('inZone reads where the card is', () => {
    expect(offered([{ has: { zone: 'hand', filter: { inZone: ['hand'] } } }])).toBe(true);
    expect(offered([{ has: { zone: 'deck', filter: { inZone: ['hand', 'gy'] } } }])).toBe(false);
    expect(offered([{ control: { kind: 'mon', filter: { inZone: ['field'] } } }], (s, d) => onField(d, s, 'BIG'))).toBe(true);
  });
  it("inGroup reads a monster's name on the field and a card's GY name", () => {
    const g = { groups: { spells: ['DRAWTWO'], bigs: ['BIG'] } };
    expect(offered([{ has: { zone: 'deck', filter: { inGroup: 'spells' } } }], () => {}, g)).toBe(true);
    expect(offered([{ control: { kind: 'mon', filter: { inGroup: 'bigs' } } }], (s, d) => onField(d, s, 'SEEKER', { nm: 'BIG' }), g)).toBe(true);
    expect(offered([{ control: { kind: 'mon', filter: { inGroup: 'bigs' } } }], (s, d) => onField(d, s, 'BIG', { nm: 'SEEKER' }), g)).toBe(false);
  });
  it('oppHasMoreMonsters compares the monster counts', () => {
    const d = probe([eff({ cond: [{ oppHasMoreMonsters: true }] })]);
    const s = withOpp(d, { PROBE: 1 });
    expect(d.mainKeys(s)).toEqual(['p']);
    onField(d, s, 'BIG'); onField(d, s, 'BIG');
    expect(d.mainKeys(s)).toEqual([]);
    expect(d.mainKeys(d.state({ PROBE: 1 }))).toEqual([]);
  });
  it('atk and def read printed stats, and an opponent monster as their field gives it', () => {
    expect(offered([{ has: { zone: 'deck', filter: { atk: { atLeast: 2400 } } } }])).toBe(true);
    expect(offered([{ has: { zone: 'deck', filter: { atk: { atLeast: 2500 } } } }])).toBe(false);
    expect(offered([{ has: { zone: 'deck', filter: { def: { atLeast: 2000, atMost: 2000 } } } }])).toBe(true);
    const d = probe([eff({ choose: [{ as: 'o', pick: { oppCard: { kind: 'mon' } } }], cond: [{ chosen: { as: 'o', filter: { atk: { atLeast: 1500 } } } }], text: '{o}' })]);
    expect(d.mainKeys(withOpp(d, { PROBE: 1 }))).toEqual(['p:om1']);
  });
  it("sameRaceAs compares with the chosen card's Type", () => {
    const d = probe([eff({
      choose: [{ as: 'c', pick: { fromZone: { zone: 'deck', cards: ['BIG', 'SEEKER'] } } }, { as: 'x', pick: { fromZone: { zone: 'extra', filter: { sameRaceAs: 'c' } } } }],
      text: '{c} {x}',
    })]);
    expect(d.mainKeys(d.state({ PROBE: 1 }))).toEqual(['p:BIG:SYNC']);
  });
  it('usesLeft takes a number of uses', () => {
    const d = probe([eff({ key: 'a', from: 'field', cond: [{ usesLeft: 2 }] }), eff({ key: 'b', from: 'field', cond: [{ usesLeft: true }] })]);
    const s = d.state({});
    onField(d, s, 'PROBE', { uses: 1 });
    expect(d.mainKeys(s)).toEqual(['b']);
    s.mons[0] = { ...s.mons[0], uses: 2 };
    expect(d.mainKeys(s)).toEqual(['a', 'b']);
  });
});

const RULE = (more?: Word, relations?: ('differentAttr')[]): Partial<DeckFile> => ({ extraDeck: [{ card: 'SYNC', method: 'fusion', slots: [{ named: 'BIG' }, { race: ['Spellcaster'] }], ...(more ? { more } : {}), ...(relations ? { relations } : {}) }] });
const fuse = (pick: Word, extra: Partial<DeckFile> = RULE(), to?: 'gy' | 'deck' | 'ban', more: Partial<EffectDef> = {}) => probe([eff({
  choose: [{ as: 'mats', pick: { fusionMaterials: pick } }, { as: 'fus', pick: { fusionMonster: { of: 'mats' } } }],
  do: [{ fusionSummon: { what: 'fus', mats: 'mats', ...(to ? { to } : {}) } }], text: '{mats} into {fus}.', ...more,
})], extra);

describe('fusionMaterials with a pool, and fusionSummon from several places', () => {
  it('offers each different set from the hand, Deck and field once, named with where it is', () => {
    const d = fuse({ pool: ['hand', 'deck'] });
    const s = d.state({ PROBE: 1, SEEKER: 1 });
    expect(d.mainKeys(s)).toEqual(['p:h.SEEKER+d.BIG:SYNC', 'p:d.BIG+d.SEEKER:SYNC', 'p:d.BIG+d.TUNER:SYNC']);
    const n = d.run(s, 'p:h.SEEKER+d.BIG:SYNC');
    expect(d.lastText(n)).toBe('Seeker (hand) + Big (Deck) into Sync.');
    expect([d.count(n, 'gy', 'BIG'), d.count(n, 'gy', 'SEEKER'), d.count(n, 'hand', 'SEEKER'), d.count(n, 'deck', 'BIG')]).toEqual([1, 1, 0, 2]);
    // The ledger lists the first material's zone on the summon (materialsFrom) and moves the other.
    const seq = n.log[n.log.length - 1].seq!.filter((t) => (t as unknown[])[0] !== 'a');
    expect(seq).toEqual([['m', d.deck.ix.BIG, 'deck', 'gy'], ['s', d.deck.ix.SYNC, 'fusion', 'extra', [d.deck.ix.SEEKER], { materialsFrom: 'hand' }]]);
  });
  it('lists field materials on the summon and banishes with to: ban', () => {
    const d = fuse({ pool: ['field', 'gy'] }, RULE(), 'ban');
    const s = d.state({ PROBE: 1 });
    onField(d, s, 'SEEKER');
    s.gy[d.deck.ix.BIG] = 1;
    expect(d.mainKeys(s)).toEqual(['p:SEEKER+g.BIG:SYNC']);
    const n = d.run(s, 'p:SEEKER+g.BIG:SYNC');
    expect([d.count(n, 'ban', 'BIG'), d.count(n, 'ban', 'SEEKER'), n.mons.map((m) => d.deck.ids[m.id])]).toEqual([1, 1, ['SYNC']]);
    expect(n.log[n.log.length - 1].seq!.filter((t) => (t as unknown[])[0] !== 'a')).toEqual([['m', d.deck.ix.BIG, 'gy', 'banished'], ['s', d.deck.ix.SYNC, 'fusion', 'extra', [d.deck.ix.SEEKER], { materialsTo: 'banished' }]]);
  });
  it('of, count and withSelf narrow the sets', () => {
    expect(fuse({ pool: ['hand', 'deck'], of: { named: 'WALL' } }).mainKeys(fuse({ pool: ['hand'] }).state({ PROBE: 1 }))).toEqual([]);
    expect(fuse({ pool: ['deck'], count: 3 }).mainKeys(fuse({ pool: ['deck'] }).state({ PROBE: 1 }))).toEqual([]);
    const self = probe([eff({
      choose: [{ as: 'mats', pick: { fusionMaterials: { pool: ['self', 'deck'], withSelf: true } } }, { as: 'fus', pick: { fusionMonster: { of: 'mats' } } }],
      do: [{ fusionSummon: { what: 'fus', mats: 'mats' } }], text: '{mats}',
    })], { extraDeck: [{ card: 'SYNC', method: 'fusion', slots: [{ named: 'BIG' }, { race: ['Fiend', 'Spellcaster'] }] }] });
    expect(self.mainKeys(self.state({ PROBE: 1 }))).toEqual(['p:h.PROBE+d.BIG:SYNC']);
  });
  it("a rule's more takes any number of further materials (up to max); differentAttr wants different Attributes", () => {
    const d = fuse({ pool: ['deck'], max: 3 }, RULE({ race: ['Spellcaster'] }));
    expect(d.mainKeys(d.state({ PROBE: 1 }))).toEqual(['p:d.BIG+d.SEEKER:SYNC', 'p:d.BIG+d.TUNER:SYNC', 'p:d.BIG+d.SEEKER+d.SEEKER:SYNC', 'p:d.BIG+d.SEEKER+d.TUNER:SYNC', 'p:d.BIG+d.TUNER+d.TUNER:SYNC']);
    const a = fuse({ pool: ['deck'], max: 3 }, RULE({ race: ['Spellcaster'] }, ['differentAttr']));
    // Big and Seeker are both DARK: only Big + Tuner (LIGHT).
    expect(a.mainKeys(a.state({ PROBE: 1 }))).toEqual(['p:d.BIG+d.TUNER:SYNC']);
  });
  it('notSelf leaves this card out of the materials (a cost sends it)', () => {
    const rule: Partial<DeckFile> = { extraDeck: [{ card: 'SYNC', method: 'fusion', slots: [{ named: 'BIG' }, { race: ['Fiend', 'Spellcaster'] }] }] };
    const mk = (notSelf: boolean) => fuse({ pool: ['hand'], ...(notSelf ? { notSelf } : {}) }, rule);
    expect(mk(false).mainKeys(mk(false).state({ PROBE: 1, BIG: 1 }))).toEqual(['p:h.BIG+h.PROBE:SYNC']);
    expect(mk(true).mainKeys(mk(true).state({ PROBE: 1, BIG: 1 }))).toEqual([]);
    expect(mk(true).mainKeys(mk(true).state({ PROBE: 2, BIG: 1 }))).toEqual(['p:h.BIG+h.PROBE:SYNC']);
  });
  it('a summon with two or more materials to the GY sets off monstersToGyTogether', () => {
    const d = probe([
      eff({ choose: [{ as: 'm', pick: { subsets: { of: { fromField: { kind: 'mon' } }, min: 2, max: 2 } } }], do: [{ summon: { what: 'self', mats: 'm' } }], text: 's' }),
      eff({ key: 'two', from: 'gy', trigger: { monstersToGyTogether: 2 }, text: 't' }),
    ]);
    const s = d.state({ PROBE: 1 });
    s.gy[d.deck.ix.PROBE] = 1;
    onField(d, s, 'BIG'); onField(d, s, 'SEEKER');
    expect(d.run(s, 'p:BIG+SEEKER').pend.map((p) => d.deck.effects[p.e].key)).toEqual(['two']);
  });
  it('the materials set off usedAsMaterial; two to the GY together set off monstersToGyTogether', () => {
    const d = probe([
      eff({ from: 'field', choose: [{ as: 'mats', pick: { fusionMaterials: { pool: ['field'] } } }, { as: 'fus', pick: { fusionMonster: { of: 'mats' } } }], do: [{ fusionSummon: { what: 'fus', mats: 'mats' } }], text: 'f' }),
      eff({ key: 'mat', from: 'gy', trigger: { usedAsMaterial: true }, text: 'm' }),
      eff({ key: 'two', from: 'gy', trigger: { monstersToGyTogether: true }, text: 't' }),
    ], { extraDeck: [{ card: 'SYNC', method: 'fusion', slots: [{ named: 'BIG' }, { named: 'PROBE' }] }] });
    const s = d.state({});
    onField(d, s, 'BIG'); onField(d, s, 'PROBE');
    const n = d.run(s, 'p:BIG+PROBE:SYNC');
    expect(n.pend.map((p) => d.deck.effects[p.e].key)).toEqual(['mat', 'two']);
    // Discarded, not material: neither.
    const k = probe([eff({ key: 'dis', choose: [{ as: 'c', pick: { otherHandCard: true } }], cost: [{ discard: { what: 'c' } }], text: 'd' }), eff({ key: 'mat', from: 'gy', trigger: { usedAsMaterial: { method: 'fusion' } }, text: 'm' }), eff({ key: 'zz', from: 'hand', text: 'x' })], {}, {});
    const s2 = k.state({ PROBE: 2, BIG: 1 });
    expect(k.run(s2, 'dis:PROBE').pend).toEqual([]);
  });
});

describe('summon locks, follow-ups, removal words and End Phase values', () => {
  it('a summon lock keeps out the Fusions and Synchro Summons it forbids while its flag is set', () => {
    const lock: Partial<DeckFile> = { ...RULE(), flags: ['onlyFusion'], summonLocks: [{ flag: 'onlyFusion', allow: { frame: ['Fusion'] } }] };
    const d = fuse({ pool: ['deck'] }, lock);
    const s = d.state({ PROBE: 1 });
    expect(d.mainKeys(s).length).toBe(2);
    s.flags = 1;
    expect(d.mainKeys(s)).toEqual([]);
    // Synchro Summons too: Tuner + Seeker (Levels 4 + 4) make the Level 8 Sync only without the lock.
    const t = driver(fileWith([], { flags: ['onlyFusion'], summonLocks: [{ flag: 'onlyFusion', allow: { frame: ['Fusion'] } }] }), FACTS);
    const st = t.state({});
    onField(t, st, 'TUNER'); onField(t, st, 'SEEKER');
    const keys = (x: State) => createMoves(t.deck).gen(x).map((m) => m.k).filter((k) => k.startsWith('syn:'));
    expect(keys(st)).toEqual(['syn:SYNC:SEEKER+TUNER']);
    st.flags = 1;
    expect(keys(st)).toEqual([]);
  });
  it('an all lock stops an effect that Special Summons from anywhere', () => {
    const d = probe([eff({ do: [{ summon: { what: 'self' } }] })], { flags: ['noSS'], summonLocks: [{ flag: 'noSS', all: true }] });
    const s = d.state({ PROBE: 1 });
    expect(d.mainKeys(s)).toEqual(['p']);
    s.flags = 1;
    expect(d.mainKeys(s)).toEqual([]);
  });
  it('a followUp is no move of its own; queued, it resolves next and can be declined', () => {
    const d = probe([eff({ do: [{ draw: 1 }, { queue: 'then' }] }), eff({ key: 'then', followUp: true, from: 'gy', do: [{ draw: 1 }], text: 'Then.' })]);
    const s = d.state({ PROBE: 1 });
    s.gy[d.deck.ix.PROBE] = 1;
    expect(d.mainKeys(s)).toEqual(['p']);
    const n = d.run(s, 'p');
    expect(n.pend.map((p) => d.deck.effects[p.e].key)).toEqual(['then']);
    expect(d.pendKeys(n)).toEqual(['then']);
    expect(createMoves(d.deck).gen(n).map((m) => m.k)).toEqual(['dec:then', 'then']);
  });
  it("oppNegate stops their card interrupting; destroy and returnToHand take yours or theirs", () => {
    const neg = probe([eff({ choose: [{ as: 'o', pick: { oppCard: { kind: 'mon' } } }], do: [{ oppNegate: { what: 'o' } }], text: '{o}' })]);
    const s = withOpp(neg, { PROBE: 1 });
    const n = neg.run(s, 'p:om2');
    expect([n.opp!.mons.find((m) => m.uid === 'm2')!.intr, n.opp!.mons.length, s.opp!.mons[1].intr]).toEqual([null, 2, 'negFieldMon']);
    const des = probe([eff({ choose: [{ as: 'c', pick: { union: [{ fromField: { kind: 'mon' } }, { oppCard: { kind: 'mon' } }] } }], do: [{ destroy: { what: 'c' } }], text: '{c}' })]);
    const s2 = withOpp(des, { PROBE: 1 });
    onField(des, s2, 'SEEKER');
    expect(des.mainKeys(s2)).toEqual(['p:SEEKER', 'p:om1', 'p:om2']);
    const a = des.run(s2, 'p:SEEKER'), b = des.run(s2, 'p:om1');
    expect([a.mons.length, des.count(a, 'gy', 'SEEKER'), b.opp!.mons.length, b.removed]).toEqual([0, 1, 1, 1]);
    const ret = probe([eff({ choose: [{ as: 'c', pick: { union: [{ fromZone: { zone: 'gy' } }, { fromField: { kind: 'mon' } }, { oppCard: { kind: 'mon' } }] } }], do: [{ returnToHand: { what: 'c' } }], text: '{c}' })]);
    const s3 = withOpp(ret, { PROBE: 1 });
    s3.gy[ret.deck.ix.BIG] = 1;
    onField(ret, s3, 'SYNC');
    const g = ret.run(s3, 'p:BIG'), x = ret.run(s3, 'p:SYNC'), o = ret.run(s3, 'p:om1');
    expect([ret.count(g, 'hand', 'BIG'), ret.count(x, 'extra', 'SYNC') - ret.count(s3, 'extra', 'SYNC'), ret.count(x, 'hand', 'SYNC'), o.opp!.mons.length, o.removed]).toEqual([1, 1, 0, 1, 1]);
  });
  it('End Phase board values are scored and listed last under the heading', () => {
    const f = fileWith([], {
      boardValue: [...TOY_FILE.boardValue, { id: 'late', when: 'endPhase', on: { has: { zone: 'gy', card: 'BIG' } }, base: [{ value: 0.5, label: 'Big: search in the End Phase' }] }],
    });
    const deck = compileDeck(f, FACTS);
    const sc = createScore(deck);
    const s = deck.state.newState(toyCfg({}), deck.ix);
    const base = sc.evaluate(s, true);
    s.gy[deck.ix.BIG] = 1;
    s.mons.push({ id: deck.ix.SYNC, nm: deck.ix.SYNC, emz: false, noEff: false, uses: 0, lvl: 8, marks: 0, uid: s.uid++ });
    const e = sc.evaluate(s, true);
    expect(e.items).toEqual([['Sync on the field', 1], [END_PHASE_HEADING, 0], ['Big: search in the End Phase', 0.5]]);
    expect(splitItems(e.items!)).toEqual({ turn: [['Sync on the field', 1]], end: [['Big: search in the End Phase', 0.5]] });
    expect(base.items).toEqual([]);
    expect(e.summary).toBeDefined();
  });
});
