// Branded Dracotail: each effect of the deck file on the smallest state where it applies, checked
// against the card's text (what moved where, what was summoned, which once-per-turn is spent), and
// absent when its condition fails. There is no reference engine for this deck (spec check 4).
import { describe, expect, it } from 'vitest';
import bdFile from './branded-dracotail.json';
import bdFacts from './branded-dracotail.cards.json';
import staples from './staples.json';
import staplesFacts from './staples.cards.json';
import { validateDeckFile, type CardFacts, type DeckFile } from '../schema';
import { matchDeckFile, type DeckList } from '../match';
import { driver } from '../../engine/__toy__/driver';
import { createMoves } from '../../engine/moves';
import { createScore } from '../../engine/score';
import { END_PHASE_HEADING } from '../../engine/items';
import type { CardId, Cfg, OppCard, State } from '../../engine/types';

const v = validateDeckFile(bdFile, { staples });
if (!v.ok) throw new Error(JSON.stringify(v.errors, null, 1));
const FILE: DeckFile = v.file;
const FACTS = [...(bdFacts as CardFacts[]), ...(staplesFacts as CardFacts[])];
const d = driver(FILE, FACTS);
const ix = d.deck.ix;
const moves = createMoves(d.deck);

/** Appendix A: the Main Deck and Extra Deck by card id. */
const MAIN: Record<CardId, number> = {
  DROLL: 2, MAXX: 1, GHOST: 1, ASH: 3, MULULU: 2, ALBAZ: 1, ECCL: 2, CART: 2, FUWA: 3, PURU: 3, LUKIAS: 1, WHITE: 2, FAIMENA: 3, URGULA: 1,
  ALBION: 3, TTT: 1, BFUS: 1, KETU: 2, RAHU: 1, SPOLY: 2, HIGHSP: 1, FV: 2, FLAME: 1,
};
const EXTRA: Record<CardId, number> = { TITAN: 1, ALBRAND: 1, MIRROR: 1, LENATUS: 1, GRAN: 1, RIND: 1, KHAOS: 1, ARTH: 2, SECRET: 1, DOGMA: 1, MIXOU: 1, AEON: 1, EDD: 1, VERTE: 1 };

interface Setup { deck?: Record<CardId, number>; extra?: Record<CardId, number>; opp?: OppCard[]; gy?: CardId[]; field?: CardId[] }
/** A going-first (or, with `opp`, going-second) state: the hand, the rest of the Main Deck, cards put in the GY and on the field. */
function st(hand: Record<CardId, number>, o: Setup = {}): State {
  const deck = { ...(o.deck ?? MAIN) };
  for (const [id, k] of Object.entries(hand)) if (deck[id]) deck[id] = Math.max(0, deck[id] - k);
  for (const id of [...(o.gy ?? []), ...(o.field ?? [])]) if (deck[id]) deck[id]--;
  for (const id of Object.keys(deck)) if (!deck[id]) delete deck[id];
  const extra = { ...(o.extra ?? EXTRA) };
  for (const id of [...(o.gy ?? []), ...(o.field ?? [])]) if (extra[id]) extra[id]--;
  const cfg: Cfg = { mode: o.opp ? 'second' : 'first', hand, deck, extra, ...(o.opp ? { opp: { lp: 8000, mons: o.opp.filter((x) => x.kind === 'mon'), st: o.opp.filter((x) => x.kind === 'st') } } : {}) };
  const s = d.deck.state.newState(cfg, ix);
  for (const id of o.gy ?? []) s.gy[ix[id]]++;
  for (const id of o.field ?? []) field(s, id);
  return s;
}
/** Put a monster on the field with no triggers (its name there as the file gives it). */
function field(s: State, id: CardId, uses = 0): void {
  const i = ix[id], fn = FILE.cards.find((c) => c.id === id)!.fieldName;
  s.mons.push({ id: i, nm: typeof fn === 'string' ? ix[fn] : i, emz: false, noEff: false, uses, lvl: d.deck.props[i].lv ?? 0, marks: 0, uid: s.uid++ });
}
const keys = (s: State) => moves.gen(s).map((m) => m.k);
const has = (s: State, prefix: string) => keys(s).some((k) => k === prefix || k.startsWith(prefix + ':'));
const run = (s: State, k: string) => { const m = moves.gen(s).find((x) => x.k === k); if (!m) throw new Error(`no move ${k}; offered: ${keys(s).join(", ")}`); return moves.exec(s, m, false); };
const pend = (s: State) => s.pend.map((p) => d.deck.effects[p.e].key);
const onField = (s: State) => s.mons.map((m) => d.deck.ids[m.id]);
const n = (s: State, z: 'hand' | 'deck' | 'extra' | 'gy' | 'ban', id: CardId) => s[z][ix[id]];
const used = (s: State, limit: string) => d.deck.state.getOpt(s, d.deck.limitNames.indexOf(limit));
const flag = (s: State, f: string) => ((s.flags >>> [...FILE.flags!].sort().indexOf(f)) & 1) === 1;
/** Resolve pending triggers by declining every one but `keep` (run by key). */
function resolve(s: State, keep: string): State {
  let x = s;
  while (x.pend.length) {
    const top = pend(x)[0];
    if (top === keep) return x;
    x = moves.exec(x, moves.gen(x).find((m) => m.k === 'dec:' + top)!, false);
  }
  throw new Error(`${keep} was not pending`);
}
const FOE: OppCard = { uid: 'm1', kind: 'mon', name: 'Foe', atk: 2000, def: 1000, race: 'Dragon', attr: 'DARK' };
const FOE2: OppCard = { uid: 'm2', kind: 'mon', name: 'Foe Two', atk: 1000, race: 'Warrior', attr: 'EARTH' };
const LID: OppCard = { uid: 's1', kind: 'st', name: 'Lid', faceDown: true };
const RUG: OppCard = { uid: 's2', kind: 'st', name: 'Rug' };

describe('the Branded Dracotail deck file', () => {
  it('validates, compiles and every card has facts', () => {
    expect(d.deck.ids.length).toBe(FILE.cards.length + 1);
    for (const c of FILE.cards) expect(FACTS.some((f) => f.passcode === c.passcodes[0]), c.id).toBe(true);
  });
  it('matchDeckFile picks it for the Appendix A list with nothing unknown, by any artwork', () => {
    const main = Object.keys(MAIN).map((id) => FILE.cards.find((c) => c.id === id)!.passcodes);
    const list = (k: number): DeckList => ({ main: main.map((p) => ({ passcode: p[Math.min(k, p.length - 1)], count: 1 })), extra: [] });
    for (const k of [0, 1]) expect(matchDeckFile(list(k))).toEqual({ fileId: 'branded-dracotail', known: 23, total: 23, unknown: [] });
    expect(new Set(main.flat()).size).toBeGreaterThan(23);
  });
});

describe('Dracotail monsters', () => {
  it('Mululu: Fusion Summons a Dracotail Fusion from hand and field, and locks the Extra Deck to Fusions', () => {
    const s = st({ FAIMENA: 1 }, { field: ['MULULU'] });
    expect(keys(s)).toContain('mululu-fuse:MULULU+h.FAIMENA:ARTH');
    const x = run(s, 'mululu-fuse:MULULU+h.FAIMENA:ARTH');
    expect([onField(x), n(x, 'gy', 'MULULU'), n(x, 'gy', 'FAIMENA'), n(x, 'extra', 'ARTH')]).toEqual([['ARTH'], 1, 1, 1]);
    expect([used(x, 'mululu-fuse'), flag(x, 'lockFusion')]).toEqual([true, true]);
    // Field materials leave first: Mululu's trigger, then Faimena's, then Arthalion's (one material from the hand: one use).
    expect(pend(x)).toEqual(['mululu-set', 'faimena-set', 'arth-1']);
    // No monster in hand: Arthalion needs one from the hand.
    expect(has(st({}, { field: ['MULULU'] }), 'mululu-fuse')).toBe(false);
  });
  it('Mululu as material: Set a Dracotail Spell/Trap from the Deck, then negate a face-up monster they control', () => {
    const s = st({ FAIMENA: 1 }, { field: ['MULULU'], opp: [FOE] });
    const x = resolve(run(s, 'mululu-fuse:MULULU+h.FAIMENA:ARTH'), 'mululu-set');
    expect(keys(x)).toEqual(['dec:mululu-set', 'mululu-set:FLAME:om1', 'mululu-set:KETU:om1', 'mululu-set:RAHU:om1']);
    const y = run(x, 'mululu-set:FLAME:om1');
    expect([y.st.map((c) => [d.deck.ids[c.id], c.up]), y.opp!.mons[0].intr ?? null, y.opp!.mons.length, used(y, 'mululu-set')]).toEqual([[['FLAME', false]], null, 1, true]);
    // With no monster of theirs the negation is skipped; with no Spell/Trap Zone free, nothing.
    expect(keys(resolve(run(st({ FAIMENA: 1 }, { field: ['MULULU'] }), 'mululu-fuse:MULULU+h.FAIMENA:ARTH'), 'mululu-set'))).toContain('mululu-set:KETU:-');
    const full = run(st({ FAIMENA: 1 }, { field: ['MULULU'] }), 'mululu-fuse:MULULU+h.FAIMENA:ARTH');
    for (let i = 0; i < 5; i++) full.st.push({ id: ix.TTT, up: false, now: false });
    expect(full.pend.length).toBe(3);
    expect(keys(resolve(full, 'mululu-set'))).toEqual(['dec:mululu-set']);
  });
  it('Lukias: searches a Dracotail monster but not Lukias when summoned', () => {
    const x = d.summonForTest(st({ LUKIAS: 1 }), 'LUKIAS');
    expect(pend(x)).toEqual(['lukias-search']);
    expect(keys(x).filter((k) => k !== 'dec:lukias-search')).toEqual(expect.arrayContaining(['lukias-search:MULULU', 'lukias-search:FAIMENA', 'lukias-search:URGULA']));
    expect(keys(x)).not.toContain('lukias-search:LUKIAS');
    const y = run(x, 'lukias-search:MULULU');
    expect([n(y, 'hand', 'MULULU'), used(y, 'lukias-search')]).toEqual([1, true]);
    expect(keys(d.summonForTest(st({ LUKIAS: 1 }, { deck: { ALBAZ: 1 } }), 'LUKIAS'))).toEqual(['dec:lukias-search']);
  });
  it('Faimena: discards itself to Fusion Summon a Dragon or Spellcaster; Lukias and Mululu as material Set Dracotail cards', () => {
    const s = st({ FAIMENA: 1, LUKIAS: 1, MULULU: 1 });
    expect(keys(s)).toContain('faimena-fuse:h.LUKIAS+h.MULULU:ARTH');
    const x = run(s, 'faimena-fuse:h.LUKIAS+h.MULULU:ARTH');
    expect([onField(x), n(x, 'gy', 'FAIMENA'), n(x, 'gy', 'LUKIAS'), n(x, 'gy', 'MULULU'), n(x, 'hand', 'FAIMENA')]).toEqual([['ARTH'], 1, 1, 1, 0]);
    // Discarded as the cost, Faimena is no material: no trigger of its own. Two hand materials: two uses.
    expect(pend(x)).toEqual(['lukias-set', 'mululu-set', 'arth-1', 'arth-2']);
    const y = run(resolve(x, 'lukias-set'), 'lukias-set:RAHU');
    expect([y.st.map((c) => d.deck.ids[c.id]), used(y, 'lukias-set')]).toEqual([['RAHU'], true]);
    // Faimena alone in hand: it is the cost, never a material.
    expect(has(st({ FAIMENA: 1 }), 'faimena-fuse')).toBe(false);
  });
  it('Urgula as material: Set a Dracotail Spell/Trap, then you can destroy 1 Spell/Trap on the field (theirs or yours)', () => {
    const s = st({ URGULA: 1 }, { field: ['MULULU'], opp: [LID] });
    const x = resolve(run(s, 'mululu-fuse:MULULU+h.URGULA:ARTH'), 'urgula-set');
    const y = run(x, 'urgula-set:KETU');
    expect([y.st.map((c) => d.deck.ids[c.id]), pend(y)[0]]).toEqual([['KETU'], 'urgula-destroy']);
    expect(keys(y)).toEqual(['dec:urgula-destroy', 'urgula-destroy:os1', 'urgula-destroy:KETU']);
    const z = run(y, 'urgula-destroy:os1');
    expect([z.st.map((c) => d.deck.ids[c.id]), z.opp!.st.length, z.removed]).toEqual([['KETU'], 0, 1]);
    // Declining keeps their card.
    expect(moves.exec(y, moves.gen(y)[0], false).opp!.st.length).toBe(1);
  });
  it('Urgula in the GY: goes to the bottom of the Deck and adds a Spellcaster Dracotail from the GY', () => {
    const s = st({}, { gy: ['URGULA', 'LUKIAS', 'MULULU'] });
    expect(keys(s).filter((k) => k.startsWith('urgula-gy'))).toEqual(['urgula-gy:LUKIAS']);
    const x = run(s, 'urgula-gy:LUKIAS');
    expect([n(x, 'gy', 'URGULA'), n(x, 'deck', 'URGULA') - n(s, 'deck', 'URGULA'), n(x, 'hand', 'LUKIAS')]).toEqual([0, 1, 1]);
    expect(has(st({}, { gy: ['URGULA', 'MULULU'] }), 'urgula-gy')).toBe(false);
  });
});

describe('Fallen of Albaz and friends', () => {
  it('Albaz: when summoned, discards 1 to Fusion Summon with itself and their monster only', () => {
    const x = d.summonForTest(st({ ALBAZ: 1, TTT: 1, ECCL: 1 }, { opp: [FOE] }), 'ALBAZ');
    expect(pend(x)).toEqual(['albaz-fuse']);
    expect(keys(x)).toEqual(['dec:albaz-fuse', 'albaz-fuse:TTT:ALBAZ+om1:KHAOS', 'albaz-fuse:TTT:ALBAZ+om1:LENATUS']);
    const y = run(x, 'albaz-fuse:TTT:ALBAZ+om1:KHAOS');
    expect([onField(y), y.opp!.mons.length, n(y, 'gy', 'ALBAZ'), n(y, 'gy', 'TTT'), y.mons[0].uses]).toEqual([['KHAOS'], 0, 1, 1, 2]);
    // Going first, their field is empty: no Fusion (your other monsters cannot be material).
    const z = st({ ALBAZ: 1, TTT: 1 }, { field: ['ECCL'] });
    expect(keys(d.summonForTest(z, 'ALBAZ'))).toEqual(['dec:albaz-fuse']);
  });
  it('Incredible Ecclesia: Special Summons itself when they control more monsters', () => {
    const s = st({ ECCL: 1 }, { opp: [FOE] });
    expect(keys(s)).toContain('eccl-proc');
    expect([onField(run(s, 'eccl-proc')), used(run(s, 'eccl-proc'), 'eccl-proc')]).toEqual([['ECCL'], true]);
    expect(has(st({ ECCL: 1 }), 'eccl-proc')).toBe(false);
  });
  it('Incredible Ecclesia: Tributes itself to Special Summon Albaz (or a card always treated as it) from hand or Deck', () => {
    const s = st({}, { field: ['ECCL'] });
    expect(keys(s).filter((k) => k.startsWith('eccl-tribute'))).toEqual(['eccl-tribute:ALBAZ', 'eccl-tribute:WHITE']);
    const x = run(s, 'eccl-tribute:ALBAZ');
    expect([onField(x), n(x, 'gy', 'ECCL'), pend(x)]).toEqual([['ALBAZ'], 1, ['albaz-fuse']]);
    expect(has(st({}, { field: ['ECCL'], deck: { MULULU: 1 } }), 'eccl-tribute')).toBe(false);
  });
  it('Blazing Cartesia: Special Summons itself while Albaz is on the field or in the GY (by its name there)', () => {
    expect(has(st({ CART: 1 }, { gy: ['ALBAZ'] }), 'cart-ss')).toBe(true);
    expect(has(st({ CART: 1 }, { field: ['ALBION'] }), 'cart-ss')).toBe(true);
    expect(has(st({ CART: 1 }), 'cart-ss')).toBe(false);
    const x = run(st({ CART: 1 }, { gy: ['ALBAZ'] }), 'cart-ss');
    expect([onField(x), used(x, 'cart-ss')]).toEqual([['CART'], true]);
  });
  it('Blazing Cartesia: Fusion Summons a Level 8 or higher Fusion from hand and field', () => {
    const s = st({ ALBAZ: 1 }, { field: ['CART'] });
    const fus = keys(s).filter((k) => k.startsWith('cart-fuse'));
    expect(fus).toEqual(expect.arrayContaining(['cart-fuse:CART+h.ALBAZ:ALBRAND', 'cart-fuse:CART+h.ALBAZ:GRAN', 'cart-fuse:CART+h.ALBAZ:SECRET', 'cart-fuse:CART+h.ALBAZ:MIXOU']));
    expect(fus.some((k) => k.endsWith(':TITAN'))).toBe(false);
    const x = run(s, 'cart-fuse:CART+h.ALBAZ:ALBRAND');
    expect([onField(x), n(x, 'gy', 'CART'), n(x, 'gy', 'ALBAZ'), pend(x), flag(x, 'fusionToGy')]).toEqual([['ALBRAND'], 1, 1, ['albrand-fuse'], false]);
    expect(has(st({}, { field: ['CART'] }), 'cart-fuse')).toBe(false);
  });
  it('Fallen of the White Dragon: sends an Albaz Fusion from the Extra Deck to Special Summon itself; then the Extra Deck is Level 8 Fusion or Synchro only', () => {
    const s = st({ WHITE: 1 });
    expect(keys(s)).toContain('white-ss:TITAN');
    const x = run(s, 'white-ss:TITAN');
    expect([onField(x), d.deck.ids[x.mons[0].nm], n(x, 'gy', 'TITAN'), flag(x, 'lockL8'), flag(x, 'fusionToGy'), pend(x)]).toEqual([['WHITE'], 'ALBAZ', 1, true, true, ['white-ecclesia']]);
    expect(has(st({ WHITE: 1 }, { extra: { ARTH: 2 } }), 'white-ss')).toBe(false);
    // The lock: a Link Summon is no longer offered.
    const t = st({}, { field: ['ALBAZ', 'ECCL'] });
    expect(moves.gen(t).some((m) => m.k.startsWith('link:VERTE'))).toBe(true);
    t.flags |= 1 << [...FILE.flags!].sort().indexOf('lockL8');
    expect(moves.gen(t).some((m) => m.k.startsWith('link:VERTE'))).toBe(false);
    expect(moves.gen(t).some((m) => m.k.startsWith('syn:EDD'))).toBe(true);
  });
  it('Fallen of the White Dragon: when summoned, Special Summons Ecclesia from hand, Deck or GY', () => {
    const x = run(st({ WHITE: 1 }), 'white-ss:TITAN');
    const y = run(x, 'white-ecclesia:ECCL');
    expect([onField(y), n(y, 'deck', 'ECCL'), used(y, 'white-ecclesia')]).toEqual([['WHITE', 'ECCL'], 1, true]);
    expect(keys(run(st({ WHITE: 1 }, { deck: { MULULU: 1 } }), 'white-ss:TITAN'))).toEqual(['dec:white-ecclesia']);
  });
  it('Albion the Shrouded Dragon: sends Albaz or a Branded card from hand to Special Summon itself from hand or GY', () => {
    const s = st({ ALBION: 1, ALBAZ: 1 });
    const x = run(s, 'albion-ss:ALBAZ');
    expect([onField(x), d.deck.ids[x.mons[0].nm], n(x, 'gy', 'ALBAZ'), used(x, 'albion')]).toEqual([['ALBION'], 'ALBAZ', 1, true]);
    const g = run(st({ BFUS: 1 }, { gy: ['ALBION'] }), 'albion-ss:BFUS');
    expect([onField(g), n(g, 'gy', 'BFUS'), n(g, 'gy', 'ALBION')]).toEqual([['ALBION'], 1, 0]);
    expect(has(st({ ALBION: 1, MULULU: 1 }), 'albion-ss')).toBe(false);
  });
  it('Albion the Shrouded Dragon: sends one from the Deck to go to the bottom of the Deck (from hand: draw 1)', () => {
    const s = st({ ALBION: 1 });
    const x = run(s, 'albion-cycle:ALBAZ');
    expect([n(x, 'hand', 'ALBION'), n(x, 'gy', 'ALBAZ'), d.handSize(x), n(x, 'deck', 'ALBION') - n(s, 'deck', 'ALBION')]).toEqual([0, 1, 1, 1]);
    const g = run(st({}, { gy: ['ALBION'] }), 'albion-recycle:WHITE');
    expect([n(g, 'gy', 'ALBION'), n(g, 'gy', 'WHITE'), d.handSize(g)]).toEqual([0, 1, 0]);
    expect(has(st({ ALBION: 1 }, { deck: { MULULU: 1 } }), 'albion-cycle')).toBe(false);
  });
});

describe('Spells', () => {
  it('Branded Fusion: Fusion Summons an Albaz Fusion with exactly 2 from hand, Deck or field; Fusion Monsters only after', () => {
    const s = st({ BFUS: 1 });
    const k = keys(s).find((x) => x.startsWith('bfus:') && x.includes('d.ALBAZ') && x.includes('d.ECCL') && x.endsWith(':ALBRAND'))!;
    expect(k).toBeDefined();
    const x = run(s, k);
    expect([onField(x), n(x, 'gy', 'ALBAZ'), n(x, 'gy', 'ECCL'), n(x, 'gy', 'BFUS'), flag(x, 'lockFusion'), used(x, 'bfus')]).toEqual([['ALBRAND'], 1, 1, 1, true, true]);
    expect(keys(s).filter((x) => x.startsWith('bfus:')).every((x) => x.split(':')[1].split('+').length === 2)).toBe(true);
    expect(has(st({ BFUS: 1 }, { deck: { MULULU: 3 } }), 'bfus')).toBe(false);
  });
  it('Ketu Dracotail: adds a Dracotail monster; then, if they control a monster, a Dragon or Spellcaster Fusion', () => {
    const s = st({ KETU: 1, FAIMENA: 1 }, { opp: [FOE] });
    const x = run(s, 'ketu:MULULU');
    expect([n(x, 'hand', 'MULULU'), n(x, 'gy', 'KETU'), pend(x)]).toEqual([1, 1, ['ketu-fuse']]);
    expect(keys(x)).toContain('ketu-fuse:h.FAIMENA+h.MULULU:ARTH');
    const y = run(x, 'ketu-fuse:h.FAIMENA+h.MULULU:ARTH');
    expect(onField(y)).toEqual(['ARTH']);
    // Going first (no monster of theirs): only declining the Fusion.
    expect(keys(run(st({ KETU: 1, FAIMENA: 1 }), 'ketu:MULULU'))).toEqual(['dec:ketu-fuse']);
    expect(has(st({ KETU: 1 }, { deck: { ALBAZ: 1 } }), 'ketu')).toBe(false);
  });
  it('Rahu Dracotail: Fusion Summons a Dracotail Fusion with hand, Deck or field materials, then Fusions only', () => {
    const s = st({ RAHU: 1, FAIMENA: 1 });
    expect(keys(s)).toContain('rahu:h.FAIMENA+d.MULULU:ARTH');
    const x = run(s, 'rahu:h.FAIMENA+d.MULULU:ARTH');
    expect([onField(x), n(x, 'deck', 'MULULU'), flag(x, 'lockFusion')]).toEqual([['ARTH'], n(s, 'deck', 'MULULU') - 1, true]);
    expect(has(st({ RAHU: 1 }), 'rahu')).toBe(false);
  });
  it('Branded in High Spirits: reveals a monster, sends a Level 8 Fusion of its Type with 2500 ATK or DEF, discards it and adds an Albaz card', () => {
    const s = st({ HIGHSP: 1, ALBAZ: 1 });
    const ks = keys(s).filter((k) => k.startsWith('highsp:ALBAZ:'));
    expect(new Set(ks.map((k) => k.split(':')[2]))).toEqual(new Set(['TITAN', 'ALBRAND', 'LENATUS', 'KHAOS', 'ARTH']));
    const x = run(s, 'highsp:ALBAZ:TITAN:CART');
    expect([n(x, 'gy', 'TITAN'), n(x, 'gy', 'ALBAZ'), n(x, 'hand', 'CART'), n(x, 'gy', 'HIGHSP'), used(x, 'highsp'), flag(x, 'fusionToGy')]).toEqual([1, 1, 1, 1, true, true]);
    expect(has(st({ HIGHSP: 1, PURU: 1 }), 'highsp')).toBe(false);
  });
  it('The Fallen & The Virtuous: sends an Albaz monster from the Extra Deck, then destroys a face-up card', () => {
    const s = st({ FV: 1 }, { field: ['ALBAZ'], opp: [FOE] });
    expect(keys(s)).toEqual(expect.arrayContaining(['fv-destroy:TITAN:om1', 'fv-destroy:TITAN:ALBAZ']));
    const x = run(s, 'fv-destroy:TITAN:om1');
    expect([n(x, 'gy', 'TITAN'), x.opp!.mons.length, onField(x), used(x, 'fv')]).toEqual([1, 0, ['ALBAZ'], true]);
    expect(has(st({ FV: 1 }), 'fv-destroy')).toBe(false);
  });
  it('The Fallen & The Virtuous: with an Ecclesia on the field or in the GY, Special Summons a monster from the GY', () => {
    const s = st({ FV: 1 }, { gy: ['ECCL', 'ALBAZ'] });
    const x = run(s, 'fv-revive:ALBAZ');
    expect([onField(x), n(x, 'gy', 'ALBAZ'), pend(x)]).toEqual([['ALBAZ'], 0, ['albaz-fuse']]);
    expect(has(st({ FV: 1 }, { gy: ['ALBAZ'] }), 'fv-revive')).toBe(false);
  });
});

describe('Extra Deck monsters', () => {
  it('Albion the Branded Dragon: when Fusion Summoned, banishes materials from hand, field and GY for a Level 8 or lower Fusion', () => {
    const x = run(st({ ALBAZ: 1 }, { field: ['CART'] }), 'cart-fuse:CART+h.ALBAZ:ALBRAND');
    expect(keys(x)).toContain('albrand-fuse:ALBRAND+g.ALBAZ:MIRROR');
    expect(keys(x).some((k) => k.endsWith(':ALBRAND'))).toBe(false);
    const y = run(x, 'albrand-fuse:ALBRAND+g.ALBAZ:MIRROR');
    expect([onField(y), n(y, 'ban', 'ALBRAND'), n(y, 'ban', 'ALBAZ'), n(y, 'gy', 'ALBAZ'), used(y, 'albrand-fuse')]).toEqual([['MIRROR'], 1, 1, 0, true]);
  });
  it('Mirrorjade: sends an Albaz Fusion from the Extra Deck to banish a monster', () => {
    const s = st({}, { field: ['MIRROR'], opp: [FOE] });
    const x = run(s, 'mirror-banish:TITAN:om1');
    expect([n(x, 'gy', 'TITAN'), x.opp!.mons.length, used(x, 'mirror-banish')]).toEqual([1, 0, true]);
    expect(has(st({}, { field: ['MIRROR'] }), 'mirror-banish')).toBe(false);
  });
  it('Alba-Lenatus: Special Summoned by sending Albaz and a Dragon from the field to the GY', () => {
    const s = st({}, { field: ['ALBAZ', 'WHITE'] });
    expect(keys(s)).toContain('lenatus-contact:ALBAZ+WHITE');
    const x = run(s, 'lenatus-contact:ALBAZ+WHITE');
    expect([onField(x), n(x, 'gy', 'ALBAZ'), n(x, 'gy', 'WHITE'), n(x, 'extra', 'LENATUS')]).toEqual([['LENATUS'], 1, 1, 0]);
    expect(has(st({}, { field: ['ALBAZ', 'ECCL'] }), 'lenatus-contact')).toBe(false);
  });
  it('Granguignol: when Fusion Summoned, sends a Level 6 or higher LIGHT or DARK monster from Deck or Extra Deck', () => {
    const x = run(st({ CART: 1 }, { field: ['ALBAZ'] }), 'cart-ss');
    const y = run(x, 'cart-fuse:ALBAZ+CART:GRAN');
    expect(pend(y)).toEqual(['gran-send']);
    expect(keys(y)).toEqual(expect.arrayContaining(['gran-send:ALBION', 'gran-send:TITAN']));
    const z = run(y, 'gran-send:ALBION');
    expect([n(z, 'gy', 'ALBION'), used(z, 'gran-send')]).toEqual([1, true]);
  });
  it('Khaos Starsource: destroys up to the number of LIGHT and DARK materials', () => {
    const x = run(d.summonForTest(st({ ALBAZ: 1, TTT: 1 }, { opp: [FOE, RUG] }), 'ALBAZ'), 'albaz-fuse:TTT:ALBAZ+om1:KHAOS');
    // Albaz (DARK) and their DARK Dragon: two uses, but only one of their cards is left.
    expect(pend(x)).toEqual(['khaos-1', 'khaos-2']);
    const y = run(x, 'khaos-1:os2');
    expect([y.opp!.st.length, used(y, 'khaos')]).toEqual([0, true]);
    expect(keys(y)).toEqual(['dec:khaos-2']);
  });
  it('Arthalion: when Fusion Summoned, returns up to the number of hand materials to the hand; from the GY it comes back when 2 or more monsters go to the GY', () => {
    const x = run(st({ FAIMENA: 1 }, { field: ['MULULU'], opp: [FOE] }), 'mululu-fuse:MULULU+h.FAIMENA:ARTH');
    const y = resolve(x, 'arth-1');
    expect(keys(y)).toEqual(expect.arrayContaining(['arth-1:om1', 'arth-1:MULULU', 'arth-1:FAIMENA']));
    const z = run(y, 'arth-1:om1');
    expect([z.opp!.mons.length, z.removed, used(z, 'arth-bounce')]).toEqual([0, 1, true]);
    // In the GY: a Fusion with 2 field materials brings it back.
    const s2 = st({ FAIMENA: 1 }, { field: ['ALBAZ', 'MULULU'], gy: ['ARTH'] });
    const k = 'mululu-fuse:MULULU+h.FAIMENA:ARTH';
    expect(pend(run(s2, k))).toContain('arth-revive');
    const back = resolve(run(s2, k), 'arth-revive');
    const r = run(back, 'arth-revive');
    expect([onField(r).includes('ARTH'), n(r, 'gy', 'ARTH'), used(r, 'arth-revive')]).toEqual([true, 0, true]);
  });
  it('Secreterion Dragon: Special Summons a Dragon or Spellcaster from the GY and puts one of the other Type on the bottom of the Deck', () => {
    const s = st({}, { field: ['SECRET'], gy: ['ALBAZ', 'ECCL'] });
    expect(keys(s)).toEqual(['secret-revive:ALBAZ:ECCL', 'secret-revive:ECCL:ALBAZ'].sort((a, b) => keys(s).indexOf(a) - keys(s).indexOf(b)));
    const x = run(s, 'secret-revive:ALBAZ:ECCL');
    expect([onField(x), n(x, 'gy', 'ECCL'), n(x, 'deck', 'ECCL') - n(s, 'deck', 'ECCL')]).toEqual([['SECRET', 'ALBAZ'], 0, 1]);
    expect(has(st({}, { field: ['SECRET'], gy: ['ALBAZ', 'WHITE'] }), 'secret-revive')).toBe(false);
  });
  it('Hyperinvoked Aeon: when Fusion Summoned, banishes up to the number of materials', () => {
    const s = st({}, { opp: [FOE, FOE2] });
    s.extra[ix.AEON] = 1;
    s.mons.push({ id: ix.AEON, nm: ix.AEON, emz: false, noEff: false, uses: 2, lvl: 10, marks: 0, uid: s.uid++ });
    const x = d.deck.state.clone(s);
    d.deck.onPlace(x, x.mons[0], true, 'extra');
    expect(pend(x)).toEqual(['aeon-1', 'aeon-2']);
    const y = run(resolve(x, 'aeon-2'), 'aeon-2:om1+om2');
    expect([y.opp!.mons.length, used(y, 'aeon')]).toEqual([0, true]);
  });
  it('Ecclesia and the Dark Dragon: a Synchro of a Tuner and non-Tuners; banishes itself to Special Summon Albaz or a Level 4 or lower that mentions it', () => {
    const t = st({}, { field: ['ECCL', 'ALBAZ'] });
    expect(moves.gen(t).map((m) => m.k)).toContain('syn:EDD:ALBAZ+ECCL');
    const s = st({}, { field: ['EDD'] });
    expect(keys(s)).toEqual(expect.arrayContaining(['edd-ss:ALBAZ', 'edd-ss:CART', 'edd-ss:ECCL', 'edd-ss:WHITE']));
    const x = run(s, 'edd-ss:ALBAZ');
    expect([onField(x), n(x, 'ban', 'EDD'), used(x, 'edd-ss'), flag(x, 'eddAway')]).toEqual([['ALBAZ'], 1, true, true]);
    expect(has(st({}, { field: ['EDD'], deck: { MULULU: 1 } }), 'edd-ss')).toBe(false);
  });
  it('Predaplant Verte Anaconda: a Link-2 of 2 Effect Monsters; pays 2000 and sends Branded Fusion to use its effect, then no more Special Summons', () => {
    const t = st({}, { field: ['ALBAZ', 'ECCL'] });
    expect(moves.gen(t).map((m) => m.k)).toContain('link:VERTE:ALBAZ+ECCL');
    const s = st({}, { field: ['VERTE'] });
    const k = keys(s).find((q) => q.startsWith('verte-copy:BFUS:') && q.endsWith(':ALBRAND'))!;
    const x = run(s, k);
    expect([x.lp, n(x, 'gy', 'BFUS'), onField(x), flag(x, 'lockAll')]).toEqual([6000, 1, ['VERTE', 'ALBRAND'], true]);
    // After it, nothing more is Special Summoned: Albion the Branded Dragon's own Fusion is not offered.
    expect(keys(x)).toEqual(['dec:albrand-fuse']);
    expect(has(st({}, { field: ['VERTE'], deck: { MULULU: 3, BFUS: 1 } }), 'verte-copy')).toBe(false);
  });
  it('every Fusion Monster sets the "a Fusion Monster went to the GY this turn" flag when it is sent there', () => {
    const sent: Record<string, boolean> = {};
    for (const id of ['TITAN', 'ALBRAND', 'MIRROR', 'LENATUS', 'RIND', 'DOGMA']) sent[id] = flag(run(st({ WHITE: 1 }, { extra: { [id]: 1 } }), 'white-ss:' + id), 'fusionToGy');
    const gran = (s: State) => { field(s, 'GRAN'); d.deck.onPlace(s, s.mons[s.mons.length - 1], true, 'extra'); return s; };
    for (const id of ['KHAOS', 'SECRET', 'MIXOU', 'AEON']) sent[id] = flag(run(gran(st({}, { extra: { [id]: 1 } })), 'gran-send:' + id), 'fusionToGy');
    sent.ARTH = flag(run(st({ HIGHSP: 1, ALBAZ: 1 }), 'highsp:ALBAZ:ARTH:CART'), 'fusionToGy');
    sent.GRAN = flag(run(st({ FV: 1 }, { field: ['GRAN'] }), 'fv-destroy:TITAN:GRAN'), 'fusionToGy');
    expect(Object.keys(sent).sort()).toEqual(['ALBRAND', 'AEON', 'ARTH', 'DOGMA', 'GRAN', 'KHAOS', 'LENATUS', 'MIRROR', 'MIXOU', 'RIND', 'SECRET', 'TITAN'].sort());
    expect(Object.values(sent).every(Boolean)).toBe(true);
    // A Main Deck monster sent there does not set it.
    expect(flag(run(st({ ALBION: 1, ALBAZ: 1 }), 'albion-ss:ALBAZ'), 'fusionToGy')).toBe(false);
  });
});

describe('board value', () => {
  it('End Phase effects are scored and listed under the End Phase heading', () => {
    const sc = createScore(d.deck);
    const s = st({}, { gy: ['TITAN', 'ECCL', 'ECCL', 'EDD'] });
    s.flags |= 1 << [...FILE.flags!].sort().indexOf('fusionToGy');
    const e = sc.evaluate(s, true);
    // Two Ecclesia in the GY: only one returns (once per turn).
    expect(e.items).toEqual([[END_PHASE_HEADING, 0], ['Titaniklad: add or Special Summon Albaz from the Deck', 0.5], ['Ecclesia returns to the hand', 0.3]]);
    // Ecclesia and the Dark Dragon comes back only when its own effect banished it.
    const b = st({}, { gy: ['ALBAZ'] });
    b.ban[ix.EDD] = 1;
    expect(sc.evaluate(b, true).items).toEqual([]);
    b.flags |= 1 << [...FILE.flags!].sort().indexOf('eddAway');
    expect(sc.evaluate(b, true).items).toEqual([[END_PHASE_HEADING, 0], ['Ecclesia and the Dark Dragon returns to the field (its effect ready for their turn)', 0.5]]);
  });
  it('their-turn effects: Mirrorjade with an Albaz Fusion to send, The Fallen & The Virtuous Set', () => {
    const sc = createScore(d.deck);
    const s = st({ FV: 1 }, { field: ['MIRROR'] });
    const e = sc.evaluate(s, true);
    expect(e.items).toEqual([['Mirrorjade: banish a monster on their turn', 0.9], ['The Fallen & The Virtuous (Set): destroy a face-up card on their turn', 0.6]]);
    expect(e.sets.map((i) => d.deck.ids[i])).toEqual(['FV']);
  });
});

describe('fix round 1: rules the review found', () => {
  it('Alba-Lenatus cannot be used as Fusion Material', () => {
    const s = st({ ALBAZ: 1 }, { field: ['CART', 'LENATUS'] });
    expect(keys(s).filter((k) => k.startsWith('cart-fuse')).length).toBeGreaterThan(0);
    expect(keys(s).filter((k) => k.startsWith('cart-fuse') && k.includes('LENATUS'))).toEqual([]);
    expect(has(st({ BFUS: 1 }, { field: ['LENATUS'] }), 'bfus:LENATUS')).toBe(false);
  });
  it('Arthalion does not bring itself back when it is one of the materials that went to the GY', () => {
    const s = st({ ALBAZ: 1 }, { field: ['CART', 'ARTH'] });
    const x = run(s, 'cart-fuse:ARTH+h.ALBAZ:MIRROR');
    expect(pend(x)).not.toContain('arth-revive');
    // One monster to the GY (not 2): no revive either.
    const one = st({}, { field: ['ECCL'], gy: ['ARTH'] });
    expect(pend(run(one, 'eccl-tribute:ALBAZ'))).not.toContain('arth-revive');
  });
  it('a revived Arthalion that leaves the field is not counted as a Fusion sent to the GY (it is banished)', () => {
    const s2 = st({ FAIMENA: 1 }, { field: ['ALBAZ', 'MULULU'], gy: ['ARTH'] });
    const back = run(resolve(run(s2, 'mululu-fuse:MULULU+h.FAIMENA:ARTH'), 'arth-revive'), 'arth-revive');
    expect(flag(back, 'arthRevived')).toBe(true);
    const sc = createScore(d.deck);
    expect(sc.evaluate(back, true).items!.some(([t]) => t.startsWith('Arthalion in GY'))).toBe(false);
  });
  it('Arthalion returns up to 3 when 3 materials came from the hand', () => {
    const s = st({ FAIMENA: 1, MULULU: 1, LUKIAS: 1, URGULA: 1 }, { opp: [FOE, FOE2] });
    const k = keys(s).find((q) => q.startsWith('faimena-fuse:') && q.split(':')[1].split('+').length === 3 && q.endsWith(':ARTH'))!;
    expect(k).toBeDefined();
    const x = run(s, k);
    expect(pend(x).filter((p) => p.startsWith('arth-'))).toEqual(['arth-1', 'arth-2', 'arth-3']);
    const y = resolve(x, 'arth-3');
    const k3 = keys(y).find((q) => q.startsWith('arth-3:') && q.includes('om1') && q.includes('om2'))!;
    const z = run(y, k3);
    expect([z.opp!.mons.length, z.removed, used(z, 'arth-bounce')]).toEqual([0, 2, true]);
  });
  it('Arthalion arth-2 returns two cards', () => {
    const s = st({ FAIMENA: 1, MULULU: 1, LUKIAS: 1 }, { opp: [FOE] });
    const x = resolve(run(s, 'faimena-fuse:h.LUKIAS+h.MULULU:ARTH'), 'arth-2');
    const y = run(x, 'arth-2:om1+LUKIAS');
    expect([y.opp!.mons.length, n(y, 'hand', 'LUKIAS'), used(y, 'arth-bounce')]).toEqual([0, 1, true]);
  });
  it('Khaos Starsource khaos-2 destroys two; going first neither Khaos effect has a target', () => {
    const x = run(d.summonForTest(st({ ALBAZ: 1, TTT: 1 }, { opp: [FOE, RUG, LID] }), 'ALBAZ'), 'albaz-fuse:TTT:ALBAZ+om1:KHAOS');
    const y = run(resolve(x, 'khaos-2'), 'khaos-2:os2+os1');
    expect([y.opp!.st.length, y.removed, used(y, 'khaos')]).toEqual([0, 3, true]);
    const g = st({});
    field(g, 'KHAOS', 2);
    d.deck.onPlace(g, g.mons[0], true, 'extra');
    expect(pend(g)).toEqual(['khaos-1', 'khaos-2']);
    expect(keys(g)).toEqual(['dec:khaos-1']);
  });
  it('Hyperinvoked Aeon aeon-1 banishes one; going first it has no target', () => {
    const s = st({}, { opp: [FOE] });
    field(s, 'AEON', 2);
    d.deck.onPlace(s, s.mons[0], true, 'extra');
    const y = run(s, 'aeon-1:om1');
    expect([y.opp!.mons.length, used(y, 'aeon')]).toEqual([0, true]);
    const g = st({});
    field(g, 'AEON', 2);
    d.deck.onPlace(g, g.mons[0], true, 'extra');
    expect(keys(g)).toEqual(['dec:aeon-1']);
  });
  it('Granguignol has nothing to send without a Level 6 or higher LIGHT or DARK monster', () => {
    const g = st({}, { deck: { MULULU: 1 }, extra: { ARTH: 1 } });
    field(g, 'GRAN');
    d.deck.onPlace(g, g.mons[0], true, 'extra');
    expect(keys(g)).toEqual(['dec:gran-send']);
  });
  it('the material Sets do not start with every Spell/Trap Zone full', () => {
    for (const [hand, key, fk] of [[{ FAIMENA: 1, LUKIAS: 1, MULULU: 1 }, 'lukias-set', 'faimena-fuse:h.LUKIAS+h.MULULU:ARTH'], [{ FAIMENA: 1, URGULA: 1, MULULU: 1 }, 'urgula-set', 'faimena-fuse:h.MULULU+h.URGULA:ARTH']] as const) {
      const s = st(hand as Record<string, number>);
      for (let i = 0; i < 5; i++) s.st.push({ id: ix.TTT, up: false, now: false });
      expect(pend(run(s, fk))).not.toContain(key);
    }
    const f = st({ FAIMENA: 1 }, { field: ['MULULU'] });
    for (let i = 0; i < 5; i++) f.st.push({ id: ix.TTT, up: false, now: false });
    expect(pend(run(f, 'mululu-fuse:MULULU+h.FAIMENA:ARTH'))).toEqual(['arth-1']);
  });
});
