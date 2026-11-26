// Synchron: each effect of the deck file on the smallest state where it applies, checked against the
// card's text (what moved where, what was summoned, which once-per-turn is spent), and absent when
// its condition fails. There is no reference engine for this deck.
import { describe, expect, it } from 'vitest';
import syFile from './synchron.json';
import syFacts from './synchron.cards.json';
import staples from './staples.json';
import staplesFacts from './staples.cards.json';
import { validateDeckFile, type CardFacts, type DeckFile } from '../schema';
import { driver } from '../../engine/__toy__/driver';
import { createMoves } from '../../engine/moves';
import { FATE_BANISH, FATE_TOKEN, type CardId, type Cfg, type OppCard, type State } from '../../engine/types';

const v = validateDeckFile(syFile, { staples });
if (!v.ok) throw new Error(JSON.stringify(v.errors, null, 1));
const FILE: DeckFile = v.file;
const FACTS = [...(syFacts as CardFacts[]), ...(staplesFacts as CardFacts[])];
const d = driver(FILE, FACTS);
const ix = d.deck.ix;
const moves = createMoves(d.deck);

/** The list: the Main Deck and Extra Deck by card id. */
const MAIN: Record<CardId, number> = {
  DROLL: 2, JET: 1, PSI: 1, SCRAP: 1, JARM: 1, MAXX: 1, ASYN: 1, FSW: 1, ASW: 3, JUNK: 1, SDSYN: 1, ASH: 3, SJS: 1, TRAIL: 1,
  FUWA: 3, MEIST: 3, ASENT: 1, FYD: 3, ETELE: 3, FELLOW: 2, AZONE: 1, ROTA: 1, JSIG: 1, SEMER: 3,
};
const EXTRA: Record<CardId, number> = { KUD: 1, SCRAPW: 1, TGHL: 1, JSPD: 1, MALONG: 1, BRD: 1, SD: 1, ACCEL: 1, VOID: 1, MAJ: 1, BAR: 1, DIS: 1, CLERIC: 1, CRIM: 1, QUETZ: 1 };

interface Setup { deck?: Record<CardId, number>; opp?: OppCard[]; gy?: CardId[]; ban?: CardId[]; field?: CardId[] }
/** A going-first (or, with `opp`, going-second) state: the hand, the rest of the list, cards put in the GY, banished and on the field. */
function st(hand: Record<CardId, number>, o: Setup = {}): State {
  const deck = { ...(o.deck ?? MAIN) };
  const placed = [...(o.gy ?? []), ...(o.ban ?? []), ...(o.field ?? [])];
  for (const [id, k] of Object.entries(hand)) if (deck[id]) deck[id] = Math.max(0, deck[id] - k);
  for (const id of placed) if (deck[id]) deck[id]--;
  for (const id of Object.keys(deck)) if (!deck[id]) delete deck[id];
  const extra = { ...EXTRA };
  for (const id of placed) if (extra[id]) extra[id]--;
  const cfg: Cfg = { mode: o.opp ? 'second' : 'first', hand, deck, extra, ...(o.opp ? { opp: { lp: 8000, mons: o.opp.filter((x) => x.kind === 'mon'), st: o.opp.filter((x) => x.kind === 'st') } } : {}) };
  const s = d.deck.state.newState(cfg, ix);
  for (const id of o.gy ?? []) s.gy[ix[id]]++;
  for (const id of o.ban ?? []) s.ban[ix[id]]++;
  for (const id of o.field ?? []) field(s, id);
  return s;
}
/** Put a monster on the field with no triggers. */
function field(s: State, id: CardId, lvl?: number): void {
  const i = ix[id];
  s.mons.push({ id: i, nm: i, emz: false, noEff: false, uses: 0, lvl: lvl ?? d.deck.props[i].lv ?? 0, marks: 0, uid: s.uid++ });
}
const keys = (s: State) => moves.gen(s).map((m) => m.k);
const has = (s: State, prefix: string) => keys(s).some((k) => k === prefix || k.startsWith(prefix + ':'));
const run = (s: State, k: string) => { const m = moves.gen(s).find((x) => x.k === k); if (!m) throw new Error(`no move ${k}; offered: ${keys(s).join(', ')}`); return moves.exec(s, m, false); };
const pend = (s: State) => s.pend.map((p) => d.deck.effects[p.e].key);
const onField = (s: State) => s.mons.map((m) => d.deck.ids[m.id]);
const n = (s: State, z: 'hand' | 'deck' | 'extra' | 'gy' | 'ban', id: CardId) => s[z][ix[id]];
const used = (s: State, limit: string) => d.deck.state.getOpt(s, d.deck.limitNames.indexOf(limit));
const flag = (s: State, f: string) => ((s.flags >>> [...FILE.flags!].sort().indexOf(f)) & 1) === 1;
const lvl = (s: State, id: CardId) => s.mons.find((m) => m.id === ix[id])!.lvl;
/** Clear the trigger on top: decline it, or (a mandatory one with moves) make its first move. */
const next = (x: State) => { const ms = moves.gen(x); return moves.exec(x, ms.find((m) => m.k.startsWith('dec:')) ?? ms[0], false); };
/** Clear pending triggers until `keep` is on top. */
function resolve(s: State, keep: string): State {
  let x = s;
  while (x.pend.length) {
    if (pend(x)[0] === keep) return x;
    x = next(x);
  }
  throw new Error(`${keep} was not pending`);
}
/** Clear every pending trigger. */
function settle(s: State): State {
  let x = s;
  while (x.pend.length) x = next(x);
  return x;
}
const FOE: OppCard = { uid: 'm1', kind: 'mon', name: 'Foe', atk: 2000, def: 1000, race: 'Dragon', attr: 'DARK' };
const FOE_EXT: OppCard = { uid: 'm2', kind: 'mon', name: 'Big Foe', atk: 3000, race: 'Fiend', attr: 'DARK', ext: true };
const RUG: OppCard = { uid: 's2', kind: 'st', name: 'Rug' };

describe('the Synchron deck file', () => {
  it('validates, compiles and every card has facts; the Token is declared', () => {
    expect(d.deck.ids.length).toBe(FILE.cards.length + 2);   // + the Stardust Token + UNK
    for (const c of FILE.cards) expect(FACTS.some((f) => f.passcode === c.passcodes[0]), c.id).toBe(true);
    const tok = d.deck.props[ix.SDTOK];
    expect([tok.token, tok.lv, tok.race, tok.attr]).toEqual([true, 1, 'Dragon', 'LIGHT']);
  });
  it('the list is 40 Main Deck and 15 Extra Deck cards', () => {
    expect(Object.values(MAIN).reduce((a, b) => a + b, 0)).toBe(40);
    expect(Object.values(EXTRA).reduce((a, b) => a + b, 0)).toBe(15);
  });
});

describe('Jet Synchron', () => {
  it('sent to the GY as Synchro Material: add a "Junk" monster', () => {
    const s = st({}, { field: ['JET', 'MEIST'] });
    const x = run(s, 'syn:JSPD:JET+MEIST');
    expect(pend(x)).toContain('jet1');
    const y = run(resolve(x, 'jet1'), 'jet1:JARM');
    expect(n(y, 'hand', 'JARM')).toBe(1);
    expect(used(y, 'jet')).toBe(true);
  });
  it('in the GY: send a card from hand, Special Summon it, banished when it leaves', () => {
    const s = st({ ASH: 1 }, { gy: ['JET'] });
    const x = run(s, 'jet2:ASH');
    expect(onField(x)).toEqual(['JET']);
    expect(x.mons[0].fate).toBe(FATE_BANISH);
    expect(n(x, 'gy', 'ASH')).toBe(1);
    expect(used(x, 'jet')).toBe(true);
    expect(has(st({}, { gy: ['JET'] }), 'jet2')).toBe(false);   // nothing to send
  });
  it('one Jet effect per turn: revived Jet as material gives no search', () => {
    const s = run(st({ ASH: 1 }, { gy: ['JET'], field: ['MEIST'] }), 'jet2:ASH');
    const x = run(s, 'syn:JSPD:JET+MEIST');
    expect(n(x, 'ban', 'JET')).toBe(1);
    expect(pend(x)).not.toContain('jet1');
  });
});

describe('Psi-Reflector and Emergency Teleport', () => {
  it('Emergency Teleport Special Summons Psi-Reflector from the Deck; Psi adds an Assault Mode card', () => {
    const x = run(st({ ETELE: 1 }), 'etele:PSI');
    expect(onField(x)).toEqual(['PSI']);
    expect(pend(x)).toEqual(['psi1']);
    const y = run(x, 'psi1:AZONE');
    expect(n(y, 'hand', 'AZONE')).toBe(1);
    expect(has(st({ ETELE: 1 }, { deck: { ASH: 1 } }), 'etele')).toBe(false);
  });
});

describe('Scrap Synchron', () => {
  it('from the hand, it is Synchro Material for Junk Speeder and Scrap Warrior only, once per turn', () => {
    const s = st({ SCRAP: 1 }, { field: ['ASW'] });
    expect(keys(s).filter((k) => k.startsWith('syn:'))).toEqual(['syn:SCRAPW:ASW+h.SCRAP']);
    const s2 = st({ SCRAP: 1 }, { field: ['MEIST'] });
    expect(keys(s2).filter((k) => k.startsWith('syn:'))).toEqual(['syn:JSPD:MEIST+h.SCRAP']);   // not T.G. Hyper Librarian
    const x = run(s2, 'syn:JSPD:MEIST+h.SCRAP');
    expect([n(x, 'hand', 'SCRAP'), n(x, 'gy', 'SCRAP')]).toEqual([0, 1]);
    expect(used(x, 'scrapHand')).toBe(true);
  });
});

describe('Junk Armor', () => {
  it('added to the hand (not drawn): Special Summon it', () => {
    const x = run(st({ ROTA: 1 }), 'rota:JARM');
    expect(pend(x)).toEqual(['jarm1']);
    expect(onField(run(x, 'jarm1'))).toEqual(['JARM']);
  });
  it('Tribute it: Special Summon a "Junk" or "Synchron" monster from the Deck, not Junk Armor; a Tribute sets off Stardust Trail', () => {
    const s = st({ TRAIL: 1 }, { field: ['JARM'] });
    const opts = keys(s).filter((k) => k.startsWith('jarm2:'));
    expect(opts.sort()).toEqual(['jarm2:ASYN', 'jarm2:JET', 'jarm2:JUNK', 'jarm2:MEIST', 'jarm2:SCRAP', 'jarm2:SDSYN', 'jarm2:SJS']);
    const x = run(s, 'jarm2:SDSYN');
    expect(n(x, 'gy', 'JARM')).toBe(1);
    expect(pend(x)).toEqual(['sdsyn2', 'trail1-hand']);
  });
});

describe('Assault Synchron', () => {
  it('Special Summon it from hand, take 700 damage', () => {
    const x = run(st({ ASYN: 1 }), 'asyn1');
    expect([onField(x), x.lp, flag(x, 'synchroOnly')]).toEqual([['ASYN'], 7300, true]);
  });
  it('in the GY: when a Dragon Synchro is Tributed, banish it and Special Summon that monster', () => {
    const s = st({}, { gy: ['ASYN', 'SD'], field: ['ACCEL'] });
    s.extra[ix.SD] = 1;   // a Stardust Dragon in the GY and one in the Extra Deck
    const x = run(s, 'accel2:SD');
    expect(onField(x)).toEqual(['SD']);
    expect(pend(x)).toEqual(['asyn2']);
    expect(keys(x).filter((k) => k.startsWith('asyn2'))).toEqual(['asyn2:ACCEL']);   // the Tributed monster, not Stardust Dragon
    const y = run(x, 'asyn2:ACCEL');
    expect([onField(y), n(y, 'ban', 'ASYN')]).toEqual([['SD', 'ACCEL'], 1]);
  });
  it('a Tributed monster that is not a Dragon Synchro does not set it off', () => {
    const x = run(st({}, { gy: ['ASYN'], field: ['JARM'] }), 'jarm2:JUNK');
    expect(pend(x)).not.toContain('asyn2');
  });
});

describe('Full-Speed Warrior and Assault Sonic Warrior', () => {
  it('Full-Speed Warrior: add Junk Synchron or a Spell/Trap that mentions Junk Warrior', () => {
    const x = run(st({ FSW: 1 }), 'ns:FSW');
    expect(keys(x).filter((k) => k.startsWith('fsw:')).sort()).toEqual(['fsw:FELLOW', 'fsw:JSIG', 'fsw:JUNK']);
  });
  it('Assault Sonic Warrior: Special Summon from hand only while you control a card that mentions Junk Warrior or Assault Mode', () => {
    expect(has(st({ ASW: 1 }), 'asw1')).toBe(false);
    expect(has(st({ ASW: 1 }, { field: ['JUNK'] }), 'asw1')).toBe(false);
    expect(has(st({ ASW: 1 }, { field: ['FSW'] }), 'asw1')).toBe(true);
    const x = run(st({ ASW: 1 }, { field: ['PSI'] }), 'asw1');
    expect(keys(x).filter((k) => k.startsWith('asw2:')).sort()).toEqual(['asw2:ASYN', 'asw2:JET', 'asw2:JUNK', 'asw2:SCRAP', 'asw2:SDSYN', 'asw2:SJS']);
  });
});

describe('Junk Synchron', () => {
  it('Normal Summoned: Special Summon a Level 2 or lower monster from the GY, effects negated', () => {
    const x = run(st({ JUNK: 1 }, { gy: ['ASW', 'MEIST'] }), 'ns:JUNK');
    expect(keys(x).filter((k) => k.startsWith('junk:'))).toEqual(['junk:ASW']);
    const y = run(x, 'junk:ASW');
    expect(y.mons.map((m) => [d.deck.ids[m.id], m.noEff])).toEqual([['JUNK', false], ['ASW', true]]);
    expect(pend(y)).toEqual([]);   // its effects are negated: no search
  });
  it('not when Special Summoned', () => {
    const x = run(st({ JARM: 1 }, { field: ['JARM'], gy: ['ASW'] }), 'jarm2:JUNK');
    expect(pend(x)).not.toContain('junk');
  });
});

describe('Stardust Synchron', () => {
  it('from hand: Tribute a monster, Special Summon it (banished when it leaves); add a Spell/Trap that mentions Stardust Dragon', () => {
    const x = run(st({ SDSYN: 1 }, { field: ['ASENT'] }), 'sdsyn1-hand:ASENT');
    expect(onField(x)).toEqual(['SDSYN']);
    expect(x.mons[0].fate).toBe(FATE_BANISH);
    expect(flag(x, 'synchroOnly')).toBe(true);
    expect(keys(x).filter((k) => k.startsWith('sdsyn2:')).sort()).toEqual(['sdsyn2:FELLOW', 'sdsyn2:JSIG']);
  });
  it('from the GY too, once per turn for both', () => {
    const x = run(st({}, { gy: ['SDSYN'], field: ['ASENT'] }), 'sdsyn1-gy:ASENT');
    expect(onField(x)).toEqual(['SDSYN']);
    expect(used(x, 'sdsyn1')).toBe(true);
    expect(has(st({ SDSYN: 1 }), 'sdsyn1-hand')).toBe(false);   // nothing to Tribute
  });
});

describe('Starjunk Synchron', () => {
  it('from hand: Special Summon it and a Level 2 or lower monster from the GY (effects negated)', () => {
    const x = run(st({ SJS: 1 }, { gy: ['ASW'] }), 'sjs1:ASW');
    expect(x.mons.map((m) => [d.deck.ids[m.id], m.noEff])).toEqual([['SJS', false], ['ASW', true]]);
    expect(has(st({ SJS: 1 }, { gy: ['MEIST'] }), 'sjs1')).toBe(false);
  });
});

describe('Stardust Trail', () => {
  it('a monster you control is Tributed: Special Summon it from hand or GY, banished when it leaves', () => {
    const x = run(st({ TRAIL: 1 }, { field: ['ASENT'] }), 'asent1:PSI');
    expect(pend(x)).toContain('trail1-hand');
    const y = run(resolve(x, 'trail1-hand'), 'trail1-hand');
    expect(y.mons.find((m) => m.id === ix.TRAIL)?.fate).toBe(FATE_BANISH);
  });
  it('Synchro Material for a Warrior, Synchron or Stardust Synchro: a Stardust Token, even from banishment', () => {
    const s = st({}, { field: ['SDSYN', 'TRAIL'] });
    s.mons[1] = { ...s.mons[1], fate: FATE_BANISH };
    const x = run(s, 'syn:SD:SDSYN+TRAIL');
    expect(n(x, 'ban', 'TRAIL')).toBe(1);
    expect(pend(x)).toContain('trail2');
    const y = run(resolve(x, 'trail2'), 'trail2');
    expect(y.mons.map((m) => [d.deck.ids[m.id], m.fate ?? 0])).toEqual([['SD', 0], ['SDTOK', FATE_TOKEN]]);
  });
  it('not for another Synchro Monster', () => {
    const x = run(st({}, { field: ['SDSYN', 'TRAIL'] }), 'syn:CLERIC:SDSYN+TRAIL');
    expect(pend(x)).not.toContain('trail2');
  });
});

describe('Junk Meister', () => {
  it('reveal a Warrior or Stardust Synchro: Special Summon it; add a "Junk" card except Junk Meister', () => {
    const x = run(st({ MEIST: 1 }), 'meist1');
    expect(flag(x, 'synchroOnly')).toBe(true);
    expect(keys(x).filter((k) => k.startsWith('meist2:')).sort()).toEqual(['meist2:JARM', 'meist2:JSIG', 'meist2:JUNK']);
    expect(has(st({ MEIST: 1 }, { deck: {} }), 'meist1')).toBe(true);
    const noReveal = st({ MEIST: 1 });
    noReveal.extra[ix.SCRAPW] = 0; noReveal.extra[ix.SD] = 0; noReveal.extra[ix.ACCEL] = 0;
    expect(has(noReveal, 'meist1')).toBe(false);
  });
  it('a "Junk" monster you control: its Level becomes 1 or 2 lower', () => {
    const s = st({}, { field: ['MEIST', 'JUNK'] });
    expect(lvl(run(s, 'meist3-two:MEIST'), 'MEIST')).toBe(2);
    expect(lvl(run(s, 'meist3-one:JUNK'), 'JUNK')).toBe(2);
    expect(keys(st({}, { field: ['MEIST', 'ASW'] })).filter((k) => k.startsWith('meist3'))).toEqual(['meist3-one:MEIST', 'meist3-two:MEIST']);
  });
});

describe('Assault Sentinel', () => {
  it('Tribute it: Special Summon a monster that lists Assault Mode Activate from hand or Deck', () => {
    const s = st({ ASW: 1 }, { field: ['ASENT'] });
    // Assault Sonic Warrior from the hand and from the Deck (the same key, numbered), Psi-Reflector from the Deck.
    expect(keys(s).filter((k) => k.startsWith('asent1:')).map((k) => k.replace(/#\d+$/, '')).sort()).toEqual(['asent1:ASW', 'asent1:ASW', 'asent1:PSI']);
    const x = run(s, 'asent1:PSI');
    expect([onField(x), n(x, 'gy', 'ASENT')]).toEqual([['PSI'], 1]);
  });
});

describe('Synchro Fellowship', () => {
  it('add Junk Synchron and a monster that mentions Junk Warrior or Stardust Dragon, then discard 1', () => {
    const s = st({ FELLOW: 1, ASH: 1 });
    expect(keys(s).filter((k) => k.startsWith('fellow-db:')).sort()).toEqual(['fellow-db:JUNK:ASW', 'fellow-db:JUNK:FSW', 'fellow-db:JUNK:SCRAP', 'fellow-db:JUNK:SDSYN', 'fellow-db:JUNK:SJS']);
    const x = run(s, 'fellow:JUNK:SJS:ASH');
    expect([n(x, 'hand', 'JUNK'), n(x, 'hand', 'SJS'), n(x, 'gy', 'ASH'), n(x, 'gy', 'FELLOW')]).toEqual([1, 1, 1, 1]);
    const y = run(s, 'fellow-db:JUNK:ASW');
    expect([n(y, 'hand', 'JUNK'), n(y, 'gy', 'ASW')]).toEqual([1, 1]);
    expect(has(y, 'fellow')).toBe(false);   // one activation per turn
  });
  it('in the GY: banish it, a Synchro Monster\'s Level becomes 1 lower, and an additional Normal Summon of a "Synchron" monster', () => {
    const s = st({ JUNK: 1 }, { gy: ['FELLOW', 'ASW'], field: ['DIS'] });
    s.ns = true;
    const x = run(s, 'fellow2:DIS');
    expect([lvl(x, 'DIS'), n(x, 'ban', 'FELLOW'), flag(x, 'fellowNs')]).toEqual([9, 1, true]);
    const y = run(x, 'fellow-ns:JUNK');
    expect(onField(y)).toEqual(['DIS', 'JUNK']);
    expect(pend(y)).toEqual(['junk']);   // a Normal Summon: Junk Synchron's effect starts
    expect(has(y, 'fellow-ns')).toBe(false);
  });
});

describe('Duel Evolution - Assault Zone and Reinforcement of the Army', () => {
  it('Assault Zone: add a monster that mentions Assault Mode Activate from the Deck or GY; it stays', () => {
    const x = run(st({ AZONE: 1 }, { gy: ['PSI'] }), 'azone:PSI');
    expect([n(x, 'hand', 'PSI'), x.st.map((c) => d.deck.ids[c.id])]).toEqual([1, ['AZONE']]);
  });
  it('Reinforcement: a Level 4 or lower Warrior', () => {
    expect(keys(st({ ROTA: 1 })).filter((k) => k.startsWith('rota:')).sort()).toEqual(['rota:ASW', 'rota:FSW', 'rota:JARM', 'rota:JUNK', 'rota:MEIST', 'rota:SJS']);
  });
});

describe('Junk Signal', () => {
  it('Tribute a monster: Special Summon a monster that is or mentions Junk Warrior or Stardust Dragon, from hand, Deck or GY, not the Tributed one', () => {
    const s = st({ JSIG: 1 }, { field: ['ASW'], gy: ['SD'] });
    const opts = keys(s).filter((k) => k.startsWith('jsig:'));
    expect(opts).toContain('jsig:ASW:SD');
    expect(opts).toContain('jsig:ASW:FSW');
    expect(opts.filter((k) => k.endsWith(':ASW'))).toEqual([]);   // except the Tributed monster
    const x = run(s, 'jsig:ASW:SD');
    expect([onField(x), n(x, 'gy', 'ASW'), n(x, 'gy', 'JSIG')]).toEqual([['SD'], 1, 1]);
  });
});

describe('Synchro Emergency', () => {
  it('from hand only while only the opponent controls a monster: a monster from hand (negated), then a "Synchron" from the Deck if they have an Extra Deck monster', () => {
    expect(has(st({ SEMER: 1, FYD: 1 }), 'semer')).toBe(false);
    const plain = st({ SEMER: 1, FYD: 1 }, { opp: [FOE] });
    expect(keys(plain).filter((k) => k.startsWith('semer'))).toEqual(['semer:FYD:-']);
    const s = st({ SEMER: 1, FYD: 1 }, { opp: [FOE_EXT] });
    const x = run(s, 'semer:FYD:JUNK');
    expect(x.mons.map((m) => [d.deck.ids[m.id], m.noEff])).toEqual([['FYD', true], ['JUNK', false]]);
    const mine = st({ SEMER: 1, FYD: 1 }, { opp: [FOE_EXT], field: ['ASW'] });
    expect(has(mine, 'semer')).toBe(false);
  });
});

describe('Extra Deck rules', () => {
  const syn = (s: State) => keys(s).filter((k) => k.startsWith('syn:')).sort();
  it('Scrap Warrior needs Scrap Synchron (or Starjunk Synchron, its substitute) as the Tuner', () => {
    expect(syn(st({}, { field: ['SCRAP', 'ASW'] }))).toEqual(['syn:SCRAPW:ASW+SCRAP']);
    expect(syn(st({}, { field: ['JET', 'ASW'] }))).toEqual([]);
  });
  it('Junk Speeder needs a "Synchron" Tuner; T.G. Hyper Librarian any Tuner', () => {
    expect(syn(st({}, { field: ['JUNK', 'ASW'] }))).toEqual(['syn:JSPD:ASW+JUNK', 'syn:TGHL:ASW+JUNK']);
    expect(syn(st({}, { field: ['PSI', 'MEIST'] }))).toEqual(['syn:TGHL:MEIST+PSI']);   // Psi-Reflector is no "Synchron"
  });
  it('Void Ogre Dragon needs a DARK Tuner; Bystial Dis Pater Dragon non-Tuners', () => {
    expect(syn(st({}, { field: ['SDSYN', 'MEIST'] }))).toEqual(['syn:ACCEL:MEIST+SDSYN', 'syn:CLERIC:MEIST+SDSYN', 'syn:SD:MEIST+SDSYN']);   // LIGHT Tuner
    expect(syn(st({}, { field: ['JUNK', 'TGHL'] }))).toEqual(['syn:ACCEL:JUNK+TGHL', 'syn:CLERIC:JUNK+TGHL', 'syn:SD:JUNK+TGHL', 'syn:VOID:JUNK+TGHL']);   // a DARK Tuner
    expect(syn(st({}, { field: ['JUNK', 'BRD'] }))).toEqual(['syn:BAR:BRD+JUNK', 'syn:DIS:BRD+JUNK']);
    expect(syn(st({}, { field: ['ASYN', 'CLERIC'] }))).toEqual(['syn:BAR:ASYN+CLERIC']);   // Cleric is a Spellcaster
  });
  it('Kudabbi (no "Fabled" Tuner) and Majestic Star Dragon (no Majestic Dragon) have no rule', () => {
    expect(FILE.extraDeck!.some((r) => r.card === 'KUD' || r.card === 'MAJ')).toBe(false);
  });
});

describe('Extra Deck effects', () => {
  it('Scrap Warrior Synchro Summoned: add, or send to the GY, Junk Synchron or a card that mentions Junk Warrior', () => {
    const x = run(st({}, { field: ['SCRAP', 'ASW'] }), 'syn:SCRAPW:ASW+SCRAP');
    expect(pend(x).sort()).toEqual(['scrapw-add', 'scrapw-gy']);
    const y = run(resolve(x, 'scrapw-add'), 'scrapw-add:FELLOW');
    expect(n(y, 'hand', 'FELLOW')).toBe(1);
    const z = run(resolve(x, 'scrapw-gy'), 'scrapw-gy:FELLOW');
    expect(n(z, 'gy', 'FELLOW')).toBe(1);
    expect(keys(z).filter((k) => k.startsWith('scrapw-add'))).toEqual([]);   // one effect: add or send
  });
  it('T.G. Hyper Librarian: draw 1 when another monster is Synchro Summoned', () => {
    const x = run(st({}, { field: ['TGHL', 'JUNK', 'MEIST'] }), 'syn:BRD:JUNK+MEIST');
    expect(pend(x)).toEqual(['tghl']);
    const y = run(resolve(x, 'tghl'), 'tghl');
    expect(y.hand.reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('Junk Speeder: a "Synchron" Tuner of each Level from the Deck, as many as possible', () => {
    const x = run(st({}, { field: ['JUNK', 'ASW'] }), 'syn:JSPD:ASW+JUNK');
    const opts = keys(x).filter((k) => k.startsWith('jspd:'));
    // Levels 1 (Jet or Scrap), 2 (Assault), 3 (Starjunk), 4 (Stardust): four, one of each.
    expect(opts.every((k) => k.split(':')[1].split('+').length === 4)).toBe(true);
    expect(opts.length).toBe(2);
    const y = run(x, opts[0]);
    expect(y.mons.length).toBe(5);
    expect(flag(y, 'synchroOnly')).toBe(true);
  });
  it('Golden Cloud Beast - Malong: its Level 1 higher or lower when Special Summoned; sent to the GY: bounce a face-up card of theirs', () => {
    const x = run(st({}, { field: ['ASYN', 'MEIST'], opp: [FOE, RUG] }), 'syn:MALONG:ASYN+MEIST');
    expect(pend(x).sort()).toEqual(['malong-down', 'malong-up']);
    expect(lvl(run(resolve(x, 'malong-up'), 'malong-up'), 'MALONG')).toBe(7);
    const s = st({}, { field: ['MALONG', 'ASW'], opp: [FOE, RUG] });
    const y = run(s, 'syn:SD:ASW+MALONG');
    expect(pend(y)).toContain('malong2');
    const z = run(resolve(y, 'malong2'), 'malong2:om1');
    expect(z.opp!.mons.length).toBe(0);
  });
  it('Black Rose Dragon: destroy all other cards on the field when Synchro Summoned (only with something of theirs to destroy)', () => {
    const x = run(st({}, { field: ['JUNK', 'MEIST'], opp: [FOE, RUG] }), 'syn:BRD:JUNK+MEIST');
    expect(pend(x)).toEqual(['brd']);
    const y = run(x, 'brd');
    expect([onField(y), y.opp!.mons.length, y.opp!.st.length]).toEqual([['BRD'], 0, 0]);
    expect(pend(run(st({}, { field: ['JUNK', 'MEIST'] }), 'syn:BRD:JUNK+MEIST'))).toEqual([]);
  });
  it('Accel Synchro Stardust Dragon: revive a Level 2 or lower Tuner; Tribute it for Stardust Dragon, treated as a Synchro Summon', () => {
    const x = run(st({}, { field: ['SDSYN', 'MEIST'], gy: ['JET'] }), 'syn:ACCEL:MEIST+SDSYN');
    expect(pend(x)).toContain('accel1');
    const y = settle(run(resolve(x, 'accel1'), 'accel1:JET'));
    expect(onField(y)).toEqual(['ACCEL', 'JET']);
    const z = run(st({}, { field: ['ACCEL', 'TGHL'] }), 'accel2:SD');
    expect([onField(z), n(z, 'gy', 'ACCEL'), n(z, 'extra', 'SD')]).toEqual([['TGHL', 'SD'], 1, 0]);
    expect(pend(z)).toEqual(['tghl']);   // a Synchro Summon: Librarian draws
  });
  it('Baronne de Fleur: destroy a card on the field', () => {
    const x = run(st({}, { field: ['BAR'], opp: [FOE] }), 'bar1:om1');
    expect(x.opp!.mons.length).toBe(0);
    expect(has(st({}, { field: ['BAR'] }), 'bar1')).toBe(false);
  });
  it('Bystial Dis Pater: Special Summon a banished LIGHT or DARK monster', () => {
    const s = st({}, { field: ['DIS'], ban: ['SDSYN', 'JET'] });
    expect(keys(s).filter((k) => k.startsWith('dis1:'))).toEqual(['dis1:SDSYN']);   // Jet is FIRE
  });
  it('Nightwinged Cleric: discard 1, add or Special Summon a monster that mentions Assault Mode Activate', () => {
    const s = st({ ASH: 1 }, { field: ['CLERIC'] });
    expect(onField(run(s, 'cleric-ss:ASH:ASENT'))).toEqual(['CLERIC', 'ASENT']);
    const x = run(s, 'cleric-add:ASH:PSI');
    expect([n(x, 'hand', 'PSI'), n(x, 'gy', 'ASH'), has(x, 'cleric-ss')]).toEqual([1, 1, false]);
  });
  it('Crimson Dragon Quetzalcoatl: Special Summon as many Dragon Synchros from the GY as possible; no more Special Summons', () => {
    const x = run(st({}, { field: ['FYD', 'TGHL'], gy: ['SD', 'BRD'] }), 'syn:QUETZ:FYD+TGHL');
    const opts = keys(x).filter((k) => k.startsWith('quetz:'));
    expect(opts.map((k) => k.split(':')[1].split('+').sort().join('+'))).toEqual(['BRD+SD']);
    const y = run(x, opts[0]);
    expect([onField(y), flag(y, 'noSummons')]).toEqual([['QUETZ', 'BRD', 'SD'], true]);
    expect(has(st({ ASYN: 1 }), 'asyn1')).toBe(true);
    const locked = d.deck.state.clone(y); locked.hand[ix.ASYN] = 1;
    expect(has(locked, 'asyn1')).toBe(false);
  });
});

describe('board value', () => {
  const items = (s: State) => d.deck.boardValue(d.deck.finalize(s).n, true).items!.map(([l]) => l);
  it('values the end boards it should', () => {
    expect(items(st({}, { field: ['BAR'] }))).toEqual(['Baronne de Fleur: negate and destroy']);
    expect(items(st({}, { field: ['QUETZ', 'SD'] }))).toEqual(['Quetzalcoatl: return a Dragon Synchro to negate a monster effect', 'Stardust Dragon: negate a destroying effect, then comes back']);
    expect(items(st({}, { field: ['QUETZ'] }))).toEqual(['Quetzalcoatl (no other Dragon Synchro to return)']);
    expect(items(st({}, { field: ['VOID'] }))).toEqual(['Void Ogre Dragon: negate a Spell/Trap (no cards in hand)']);
    expect(items(st({ ASH: 1 }, { field: ['VOID'] }))).toContain('Void Ogre Dragon (needs an empty hand to negate)');
  });
  it('Sets Junk Signal at the end of the turn', () => {
    const { sets } = d.deck.finalize(st({ JSIG: 1 }, { field: ['SD'] }));
    expect(sets).toEqual([ix.JSIG]);
  });
});
