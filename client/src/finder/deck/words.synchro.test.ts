// The Synchro, Tribute, Level, Token and extra Normal Summon words, on the toy deck with a made-up
// PROBE card (Level 3 DARK Fiend) and a made-up Token. Nothing here is a real card.
import { describe, it, expect } from 'vitest';
import { validateDeckFile, type CardDef, type DeckFile, type EffectDef, type ExtraRule } from './schema';
import { TOY_FACTS, TOY_FILE } from '../engine/__toy__/toyDeck';
import { driver } from '../engine/__toy__/driver';
import { createMoves } from '../engine/moves';
import { ledObjs, step } from '../engine/record';
import { FATE_BANISH, FATE_TOKEN, type CardId, type State } from '../engine/types';

const PROBE_FACT = { passcode: 9000099, name: 'Toy Probe', type: 'Effect Monster', race: 'Fiend', attr: 'DARK', level: 3, link: null, atk: 1200, def: 0, text: '' };
const FACTS = [...TOY_FACTS, PROBE_FACT];
const TOKEN = { id: 'TOK', name: 'Toy Token', short: 'Token', race: 'Dragon', attr: 'LIGHT', level: 1, atk: 0, def: 0 };

const eff = (e: Partial<EffectDef>): EffectDef => ({ key: 'p', phase: 'main', from: 'hand', do: [], tags: {}, text: 'Probe.', ...e });
const syn7: ExtraRule = { card: 'SYNC', method: 'synchro', level: 7, min: 2, max: 3, tuners: 'exactlyOne' };

/** The toy deck with PROBE (and its effects or fields), cards' effects replaced, and file fields. */
function setup(o: { probe?: EffectDef[]; probeCard?: Partial<CardDef>; effectsOf?: Record<CardId, EffectDef[]>; file?: Partial<DeckFile> } = {}) {
  const cards = TOY_FILE.cards.map((c) => (o.effectsOf?.[c.id] ? { ...c, effects: [...(c.effects ?? []), ...o.effectsOf[c.id]] } : c));
  const f: DeckFile = { ...TOY_FILE, tokens: [TOKEN], ...o.file, cards: [...cards, { id: 'PROBE', passcodes: [9000099], short: 'Probe', effects: o.probe ?? [], ...o.probeCard }] };
  const v = validateDeckFile(f, {});
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  const d = driver(f, FACTS);
  const mv = createMoves(d.deck);
  const ix = d.deck.ix;
  const put = (s: State, id: CardId, lvl?: number) => { const i = ix[id]; s.mons.push({ id: i, nm: i, emz: false, noEff: false, uses: 0, lvl: lvl ?? d.deck.props[i].lv ?? 0, marks: 0, uid: s.uid++ }); };
  const keys = (s: State, prefix = '') => mv.gen(s).map((m) => m.k).filter((k) => k.startsWith(prefix));
  const run = (s: State, key: string) => {
    const m = mv.gen(s).find((x) => x.k === key);
    if (!m) throw new Error(`no move ${key}; offered: ${mv.gen(s).map((x) => x.k).join(', ')}`);
    return mv.exec(s, m, false);
  };
  const ledger = (s: State) => ledObjs(s.log[s.log.length - 1], d.deck.ids, d.deck.UNK);
  const pendKeys = (s: State) => s.pend.map((p) => d.deck.effects[p.e].key);
  return { d, ix, put, keys, run, ledger, pendKeys };
}

describe('Synchro rules: tunerIs and nonTunerIs', () => {
  it('tunerIs is what the Tuner must be', () => {
    const light = setup({ file: { extraDeck: [{ ...syn7, level: 8, tunerIs: { attribute: ['LIGHT'] } }] } });
    const s = light.d.state({}); light.put(s, 'TUNER'); light.put(s, 'SEEKER');
    expect(light.keys(s, 'syn:')).toEqual(['syn:SYNC:SEEKER+TUNER']);
    const dark = setup({ file: { extraDeck: [{ ...syn7, level: 8, tunerIs: { attribute: ['DARK'] } }] } });
    const s2 = dark.d.state({}); dark.put(s2, 'TUNER'); dark.put(s2, 'SEEKER');
    expect(dark.keys(s2, 'syn:')).toEqual([]);   // the Tuner is LIGHT
  });
  it('nonTunerIs is what every other material must be', () => {
    const t = setup({ file: { extraDeck: [{ ...syn7, level: 8, nonTunerIs: { race: ['Dragon'] } }] } });
    const s = t.d.state({}); t.put(s, 'TUNER'); t.put(s, 'SEEKER');
    expect(t.keys(s, 'syn:')).toEqual([]);   // Seeker is a Spellcaster
    const s2 = t.d.state({}); t.put(s2, 'TUNER'); t.put(s2, 'BIG', 4);
    expect(t.keys(s2, 'syn:')).toEqual(['syn:SYNC:BIG+TUNER']);
  });
});

describe('synchroFromHand', () => {
  const hand = (forGroup = 'syncs') => setup({ probeCard: { synchroFromHand: { for: forGroup, limit: 'probeHand' } }, file: { extraDeck: [syn7], groups: { spells: ['DRAWTWO'], syncs: ['SYNC'], none: ['BIG'] } } });
  it('a card in hand is material for the group\'s Synchro Monsters, beside a monster on the field', () => {
    const t = hand();
    const s = t.d.state({ PROBE: 1 }); t.put(s, 'TUNER');
    expect(t.keys(s, 'syn:')).toEqual(['syn:SYNC:h.PROBE+TUNER']);
    const n = t.run(s, 'syn:SYNC:h.PROBE+TUNER');
    expect(n.hand[t.ix.PROBE]).toBe(0);
    expect(n.gy[t.ix.PROBE]).toBe(1);
    expect(n.mons.map((m) => t.d.deck.ids[m.id])).toEqual(['SYNC']);
    expect(n.log[n.log.length - 1].text).toBe('Synchro Summon Sync with Tuner + Probe (hand).');
    // The ledger puts it on the field first, so the summon lists it with the others.
    expect(t.ledger(n)).toEqual([['m', { card: 'PROBE', from: 'hand', to: 'field' }], ['s', { card: 'SYNC', method: 'synchro', from: 'extra', materials: ['TUNER', 'PROBE'] }]]);
  });
  it('once per turn, only for the group, and never with no monster on the field', () => {
    const t = hand();
    const s = t.d.state({ PROBE: 1 }); t.put(s, 'TUNER');
    t.d.deck.state.setOpt(s, t.d.deck.limitNames.indexOf('probeHand'));
    expect(t.keys(s, 'syn:')).toEqual([]);
    const other = hand('none');
    const s2 = other.d.state({ PROBE: 1 }); other.put(s2, 'TUNER');
    expect(other.keys(s2, 'syn:')).toEqual([]);
    const s3 = t.d.state({ PROBE: 2 });
    expect(t.keys(s3, 'syn:')).toEqual([]);
  });
});

describe('usedAsMaterial for a Synchro Summon', () => {
  const draw = (trigger: Record<string, unknown>) => setup({ probe: [eff({ key: 'p-mat', from: ['gy', 'ban'], trigger: { usedAsMaterial: trigger }, do: [{ draw: 1 }], text: 'Probe: draw 1.' })], file: { extraDeck: [syn7], groups: { spells: ['DRAWTWO'], syncs: ['SYNC'], other: ['BIG'] } } });
  it('starts when the card is sent to the GY as Synchro Material', () => {
    const t = draw({ method: 'synchro' });
    const s = t.d.state({}); t.put(s, 'TUNER'); t.put(s, 'PROBE');
    expect(t.pendKeys(t.run(s, 'syn:SYNC:PROBE+TUNER'))).toEqual(['p-mat']);
    const fusion = draw({});
    const s2 = fusion.d.state({}); fusion.put(s2, 'TUNER'); fusion.put(s2, 'PROBE');
    expect(fusion.pendKeys(fusion.run(s2, 'syn:SYNC:PROBE+TUNER'))).toEqual([]);
  });
  it('`for` names the monster summoned', () => {
    const t = draw({ method: 'synchro', for: 'other' });
    const s = t.d.state({}); t.put(s, 'TUNER'); t.put(s, 'PROBE');
    expect(t.pendKeys(t.run(s, 'syn:SYNC:PROBE+TUNER'))).toEqual([]);
    const ok = draw({ method: 'synchro', for: 'syncs' });
    const s2 = ok.d.state({}); ok.put(s2, 'TUNER'); ok.put(s2, 'PROBE');
    expect(ok.pendKeys(ok.run(s2, 'syn:SYNC:PROBE+TUNER'))).toEqual(['p-mat']);
  });
});

describe('summon with banishOnLeave', () => {
  const t = setup({ probe: [eff({ key: 'p-ss', from: 'hand', do: [{ summon: { what: 'self', banishOnLeave: true } }], text: 'Probe: Special Summon it.' })], file: { extraDeck: [syn7] } });
  it('is banished when it leaves the field as material, and the ledger says so after the summon', () => {
    const s0 = t.d.state({ PROBE: 1 }); t.put(s0, 'TUNER');
    const s = t.run(s0, 'p-ss');
    expect(s.mons.find((m) => m.id === t.ix.PROBE)?.fate).toBe(FATE_BANISH);
    const n = t.run(s, 'syn:SYNC:PROBE+TUNER');
    expect(n.gy[t.ix.PROBE]).toBe(0);
    expect(n.ban[t.ix.PROBE]).toBe(1);
    expect(n.gy[t.ix.TUNER]).toBe(1);
    expect(t.ledger(n)).toEqual([['s', { card: 'SYNC', method: 'synchro', from: 'extra', materials: ['PROBE', 'TUNER'] }], ['m', { card: 'PROBE', from: 'gy', to: 'banished' }]]);
  });
});

describe('summonedBy and summon method', () => {
  const watch = setup({
    probe: [
      eff({ key: 'p-watch', from: 'field', trigger: { summonedBy: { method: 'synchro', notSelf: true } }, do: [{ draw: 1 }], text: 'Probe: draw 1.' }),
      eff({ key: 'p-call', from: 'field', choose: [{ as: 'm', pick: { fromZone: { zone: 'extra', cards: ['SYNC'] } } }], do: [{ summon: { what: 'm', method: 'synchro' } }], text: 'Probe: summon {m}.' }),
    ],
  });
  it('starts on a Synchro Summon, and on a summon treated as one', () => {
    const s = watch.d.state({}); watch.put(s, 'PROBE'); watch.put(s, 'TUNER'); watch.put(s, 'SEEKER');
    expect(watch.pendKeys(watch.run(s, 'syn:SYNC:SEEKER+TUNER'))).toEqual(['p-watch']);
    const s2 = watch.d.state({}); watch.put(s2, 'PROBE');
    expect(watch.pendKeys(watch.run(s2, 'p-call:SYNC'))).toEqual(['p-watch']);
  });
  it('a plain Special Summon is not one', () => {
    const s = watch.d.state({ TUNER: 1 }); watch.put(s, 'PROBE');
    expect(watch.pendKeys(watch.run(s, 'tuner-ss'))).toEqual([]);
  });
});

describe('changeLevel', () => {
  const t = setup({ probe: [eff({ key: 'p-lv', from: 'field', choose: [{ as: 't', pick: { fromField: { kind: 'mon' } } }], do: [{ changeLevel: { what: 't', by: -2 } }], text: 'Probe: {t} Level -2.' }), eff({ key: 'p-up', from: 'field', do: [{ changeLevel: { what: 'self', by: 5 } }], text: 'Probe: Level +5.' })] });
  it('raises or lowers the current Level, never below 1', () => {
    const s = t.d.state({}); t.put(s, 'PROBE'); t.put(s, 'SEEKER');
    expect(t.run(s, 'p-lv:SEEKER').mons[1].lvl).toBe(2);
    expect(t.run(s, 'p-lv:PROBE').mons[0].lvl).toBe(1);
    expect(t.run(s, 'p-up').mons[0].lvl).toBe(8);
  });
});

describe('normalSummon', () => {
  const t = setup({ probe: [eff({ key: 'p-ns', from: 'hand', choose: [{ as: 'c', pick: { fromZone: { zone: 'hand', cards: ['SEEKER'] } } }], do: [{ normalSummon: { what: 'c' } }], text: 'Probe: Normal Summon {c}.' })] });
  it('Normal Summons from the hand without using the Normal Summon, and its Normal Summon trigger starts', () => {
    const n = t.run(t.d.state({ PROBE: 1, SEEKER: 1 }), 'p-ns:SEEKER');
    expect(n.mons.map((m) => t.d.deck.ids[m.id])).toEqual(['SEEKER']);
    expect(n.ns).toBe(false);
    expect(n.hand[t.ix.SEEKER]).toBe(0);
    expect(t.pendKeys(n)).toEqual(['seeker-search']);
    expect(t.ledger(n).filter((x) => x[0] === 's')).toEqual([['s', { card: 'SEEKER', method: 'normal' }]]);
  });
});

describe('createToken and tribute', () => {
  const t = setup({
    probe: [
      eff({ key: 'p-tok', from: 'field', do: [{ createToken: { card: 'TOK' } }], text: 'Probe: a Token.' }),
      eff({ key: 'p-trib', from: 'field', choose: [{ as: 't', pick: { fromField: { kind: 'mon', filter: { not: { named: 'PROBE' } } } } }], cost: [{ tribute: { what: 't' } }], do: [], text: 'Probe: Tribute {t}.' }),
    ],
    effectsOf: { BIG: [eff({ key: 'big-back', from: ['hand'], trigger: { tributed: { group: 'tributes' } }, do: [{ summon: { what: 'self' } }], text: 'Big: Special Summon it.' })] },
    file: { extraDeck: [{ ...syn7, level: 4 }], groups: { spells: ['DRAWTWO'], tributes: ['SEEKER', 'TOK'] } },
  });
  it('a Token goes on the field with no ledger entry, and is gone when it leaves', () => {
    const s0 = t.d.state({}); t.put(s0, 'PROBE'); t.put(s0, 'TUNER', 3);
    const s = t.run(s0, 'p-tok');
    expect(s.mons.map((m) => [t.d.deck.ids[m.id], m.fate ?? 0])).toEqual([['PROBE', 0], ['TUNER', 0], ['TOK', FATE_TOKEN]]);
    expect(t.ledger(s).filter((x) => x[0] !== 'a')).toEqual([]);
    const n = t.run(s, 'syn:SYNC:TOK+TUNER');
    expect(n.gy[t.ix.TOK]).toBe(0);
    expect(n.mons.map((m) => t.d.deck.ids[m.id])).toEqual(['PROBE', 'SYNC']);
  });
  it('tribute sends a monster to the GY as a Tribute, which tributed sees', () => {
    const s = t.d.state({ BIG: 1 }); t.put(s, 'PROBE'); t.put(s, 'SEEKER');
    const n = t.run(s, 'p-trib:SEEKER');
    expect(n.gy[t.ix.SEEKER]).toBe(1);
    expect(t.pendKeys(n)).toEqual(['big-back']);
    const s2 = t.d.state({ BIG: 1 }); t.put(s2, 'PROBE'); t.put(s2, 'TUNER');
    expect(t.pendKeys(t.run(s2, 'p-trib:TUNER'))).toEqual([]);   // not of the group
  });
  it('a Tribute Summon\'s Tribute is a Tribute too', () => {
    const s = t.d.state({ BIG: 2 }); t.put(s, 'SEEKER');
    expect(t.pendKeys(t.run(s, 'tri:BIG:SEEKER'))).toEqual(['big-back']);
  });
  it('a Token Tributed is gone, and still a Tribute', () => {
    const s0 = t.d.state({ BIG: 1 }); t.put(s0, 'PROBE');
    const n = t.run(t.run(s0, 'p-tok'), 'p-trib:TOK');
    expect(n.mons.map((m) => t.d.deck.ids[m.id])).toEqual(['PROBE']);
    expect(n.gy[t.ix.TOK]).toBe(0);
    expect(t.pendKeys(n)).toEqual(['big-back']);
  });
  it('createToken needs a declared Token', () => {
    expect(() => setup({ probe: [eff({ do: [{ createToken: { card: 'BIG' } }] })] })).toThrow(/not a Token/);
  });
});

describe('addedToHand', () => {
  const t = setup({
    probe: [eff({ key: 'p-arm', from: 'hand', trigger: { addedToHand: true }, do: [{ summon: { what: 'self' } }], text: 'Probe: Special Summon it.' })],
    file: { groups: { spells: ['DRAWTWO', 'PROBE'] } },
  });
  it('starts when the card is added from the Deck, not when it is drawn', () => {
    const s = t.d.state({ SEEKER: 1 });
    s.deck[t.ix.PROBE] = 1;
    const n = t.run(t.run(s, 'ns:SEEKER'), 'seeker-search:PROBE');
    expect(t.pendKeys(n)).toEqual(['p-arm']);
    const s2 = t.d.state({});
    s2.top = [t.ix.PROBE];
    const n2 = t.d.deck.state.clone(s2);
    step(n2, 'Draw.');
    t.d.deck.ops.draw(n2, 1);
    expect(n2.hand[t.ix.PROBE]).toBe(1);
    expect(t.pendKeys(n2)).toEqual([]);
  });
});

describe('subsets: differentLevels, zonesFree, largest', () => {
  const pick = (args: Record<string, unknown>) => setup({ probe: [eff({ key: 'p-set', choose: [{ as: 'c', pick: { subsets: { of: { fromZone: { zone: 'deck', group: 'mons' } }, min: 1, max: 3, ...args } } }], do: [], text: 'Probe: {c}.' })], file: { groups: { spells: ['DRAWTWO'], mons: ['SEEKER', 'TUNER', 'BIG'] } } });
  const sets = (t: ReturnType<typeof pick>, s: State) => t.keys(s, 'p-set').map((k) => k.slice('p-set:'.length).split('+').sort().join('+')).sort();
  it('differentLevels leaves out two members of one Level; largest keeps only the biggest sets', () => {
    const t = pick({ differentLevels: true });
    expect(sets(t, t.d.state({ PROBE: 1 }))).toEqual(['BIG', 'SEEKER', 'BIG+SEEKER', 'TUNER', 'BIG+TUNER'].sort());
    const l = pick({ differentLevels: true, largest: true });
    expect(sets(l, l.d.state({ PROBE: 1 }))).toEqual(['BIG+SEEKER', 'BIG+TUNER'].sort());
  });
  it('zonesFree caps the size at the free Main Monster Zones', () => {
    const t = pick({ zonesFree: true, largest: true });
    const s = t.d.state({ PROBE: 1 });
    for (let i = 0; i < 4; i++) t.put(s, 'BIG');
    expect(sets(t, s)).toEqual(['BIG', 'SEEKER', 'TUNER'].sort());
  });
});

describe('opp: ext', () => {
  it('oppHasTarget can ask for an Extra Deck monster', () => {
    const t = setup({ probe: [eff({ cond: [{ oppHasTarget: { kind: 'mon', ext: true } }] })] });
    const opp = (ext: boolean) => t.d.deck.state.newState({ mode: 'second', hand: { PROBE: 1 }, deck: {}, extra: {}, opp: { lp: 8000, mons: [{ uid: 'm1', kind: 'mon', name: 'Foe', ext }], st: [] } }, t.ix);
    expect(t.keys(opp(true), 'p')).toEqual(['p']);
    expect(t.keys(opp(false), 'p')).toEqual([]);
  });
});
