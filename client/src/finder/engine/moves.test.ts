import { describe, it, expect } from 'vitest';
import { compileDeck, type CompiledDeck } from '../deck/compile';
import type { DeckFile } from '../deck/schema';
import { createMoves } from './moves';
import { DRAW_BIT, ledObjs } from './record';
import type { Cfg, OppCard, State } from './types';
import { TOY_FACTS, TOY_FILE, toyCfg } from './__toy__/toyDeck';

function setup(file: DeckFile = TOY_FILE, wrap?: (d: CompiledDeck) => CompiledDeck) {
  const compiled = compileDeck(file, TOY_FACTS);
  const deck = wrap ? wrap(compiled) : compiled;
  const mv = createMoves(deck, deck.state);
  const so = deck.state;
  const state = (hand: Record<string, number>, extra: Partial<Cfg> = {}): State => so.newState({ ...toyCfg(hand), ...extra }, deck.ix);
  const keys = (s: State) => mv.gen(s).map((m) => m.k);
  const run = (s: State, key: string, neg = false) => {
    const m = mv.gen(s).find((x) => x.k === key);
    if (!m) throw new Error(`no move ${key}; offered: ${keys(s).join(', ')}`);
    return mv.exec(s, m, neg);
  };
  return { deck, mv, so, state, keys, run };
}

const opp = (intr: string, faceDown = false): Cfg['opp'] => ({
  lp: 8000, mons: [], st: [{ uid: 'f1', kind: 'st', name: 'Floodgate', intr, faceDown } as OppCard],
});

describe('move generation', () => {
  it('offers Normal Summon, then the deck moves', () => {
    const t = setup();
    expect(t.keys(t.state({ SEEKER: 1, DRAWTWO: 1, BIG: 1 }))).toEqual(['ns:SEEKER', 'drawtwo:BIG', 'drawtwo:SEEKER']);
  });

  it('offers no Normal Summon after one', () => {
    const t = setup();
    let s = t.run(t.state({ SEEKER: 1, TUNER: 1 }), 'ns:SEEKER');
    s = t.run(s, 'dec:seeker-search');
    expect(s.ns).toBe(true);
    expect(t.keys(s).filter((k) => k.startsWith('ns:') || k.startsWith('tri:'))).toEqual([]);
  });

  it('Tribute Summons a Level 5-6 monster by tributing one monster', () => {
    const t = setup();
    expect(t.keys(t.state({ BIG: 1 }))).toEqual([]);
    let s = t.run(t.state({ SEEKER: 1 }), 'ns:SEEKER');
    s = t.run(s, 'dec:seeker-search');
    s = t.so.clone(s);
    s.ns = false;
    t.so.W(s, 'hand')[t.deck.ix.BIG]++;
    expect(t.keys(s)).toContain('tri:BIG:SEEKER');
    const n = t.run(s, 'tri:BIG:SEEKER');
    expect(n.mons.map((m) => t.deck.ids[m.id])).toEqual(['BIG']);
    expect(n.gy[t.deck.ix.SEEKER]).toBe(1);
    expect(n.ns).toBe(true);
    const rec = n.log[n.log.length - 1];
    expect(rec.text).toBe('Tribute Seeker to Tribute Summon Big.');
    expect(ledObjs(rec, t.deck.ids, t.deck.UNK)).toEqual([['s', { card: 'BIG', method: 'tribute', from: 'hand', materials: ['SEEKER'] }]]);
  });

  it('offers no Normal Summon for a card with hints.normalSummon false', () => {
    const file: DeckFile = { ...TOY_FILE, cards: TOY_FILE.cards.map((c) => (c.id === 'SEEKER' ? { ...c, hints: { normalSummon: false } } : c)) };
    const t = setup(file);
    expect(t.keys(t.state({ SEEKER: 1, TUNER: 1 })).filter((k) => k.startsWith('ns:'))).toEqual(['ns:TUNER']);
  });

  it('after a Normal Summon only the pending trigger and its decline are offered', () => {
    const t = setup();
    const s0 = t.state({ SEEKER: 1, DRAWTWO: 1, BIG: 1 });
    const s = t.run(s0, 'ns:SEEKER');
    expect(s.log.map((r) => r.text)).toEqual(['Normal Summon Seeker.']);
    expect(ledObjs(s.log[0], t.deck.ids, t.deck.UNK)).toEqual([['s', { card: 'SEEKER', method: 'normal' }]]);
    expect(t.keys(s)).toEqual(['dec:seeker-search', 'seeker-search:DRAWTWO']);
    const d = t.run(s, 'dec:seeker-search');
    expect(d.log.length).toBe(1);
    expect(d.pend).toEqual([]);
    expect(d.path).toEqual(['ns:SEEKER', 'dec:seeker-search']);
  });

  it('floodSpell drops moves whose effect activates as a Spell', () => {
    const t = setup();
    const hand = { SEEKER: 1, DRAWTWO: 1, BIG: 1 };
    expect(t.keys(t.state(hand, { opp: opp('floodSpell') }))).toEqual(['ns:SEEKER']);
    expect(t.keys(t.state(hand, { opp: opp('floodSpell', true) }))).toEqual(['ns:SEEKER', 'drawtwo:BIG', 'drawtwo:SEEKER']);
  });

  it('floodMon drops moves tagged fieldMon', () => {
    const t = setup();
    const s = t.run(t.state({ SEEKER: 1, DRAWTWO: 1 }, { opp: opp('floodMon') }), 'ns:SEEKER');
    expect(t.keys(s)).toEqual(['dec:seeker-search']);
  });

  it('a mandatory trigger offers its decline only when it has no move left', () => {
    const file: DeckFile = { ...TOY_FILE, cards: TOY_FILE.cards.map((c) => (c.id === 'SEEKER' ? { ...c, effects: c.effects!.map((e) => ({ ...e, mandatory: true })) } : c)) };
    const t = setup(file);
    const s = t.run(t.state({ SEEKER: 1, DRAWTWO: 1 }), 'ns:SEEKER');
    expect(t.keys(s)).toEqual(['seeker-search:DRAWTWO']);
    const none = t.run(t.state({ SEEKER: 1, DRAWTWO: 3 }), 'ns:SEEKER');   // no Spell left in the Deck
    expect(t.keys(none)).toEqual(['dec:seeker-search']);
    const flood = t.run(t.state({ SEEKER: 1, DRAWTWO: 1 }, { opp: opp('floodMon') }), 'ns:SEEKER');   // its moves are dropped
    expect(t.keys(flood)).toEqual(['dec:seeker-search']);
  });

  it('floodExtra drops moves that summon from the Extra Deck', () => {
    const file: DeckFile = {
      ...TOY_FILE,
      groups: { ...TOY_FILE.groups, extras: ['SYNC'] },
      cards: TOY_FILE.cards.map((c) => (c.id === 'BIG' ? {
        ...c,
        effects: [{
          key: 'big-call', phase: 'main', from: 'hand',
          choose: [{ as: 'card', pick: { fromZone: { zone: 'extra', group: 'extras' } } }],
          do: [{ summon: { what: 'card' } }],
          tags: {}, text: 'Big: summon {card}.',
        }],
      } : c)),
    };
    const t = setup(file);
    expect(t.keys(t.state({ BIG: 1 }))).toEqual(['big-call:SYNC']);
    expect(t.keys(t.state({ BIG: 1 }, { opp: opp('floodExtra') }))).toEqual([]);
    expect(t.keys(t.state({ BIG: 1 }, { opp: opp('floodSpell') }))).toEqual(['big-call:SYNC']);
  });

  it('numbers repeated keys #1, #2', () => {
    const t = setup(TOY_FILE, (d) => ({ ...d, genMain: (s, push) => { d.genMain(s, push); d.genMain(s, push); d.genMain(s, push); } }));
    expect(t.keys(t.state({ DRAWTWO: 1, BIG: 1 }))).toEqual(['drawtwo:BIG', 'drawtwo:BIG#1', 'drawtwo:BIG#2']);
  });

  it('exec records the key on the path, ~ when negated', () => {
    const t = setup();
    const s = t.state({ DRAWTWO: 1, BIG: 1 });
    const n = t.run(s, 'drawtwo:BIG', true);
    expect(n.path).toEqual(['~drawtwo:BIG']);
    expect(s.path).toEqual([]);
    expect(n.log[0].text).toBe('Draw Two (discard Big): negated.');
  });

  it('a second monster raises summons to 2 and the step records it', () => {
    const t = setup();
    let s = t.run(t.state({ SEEKER: 1, TUNER: 1 }), 'ns:SEEKER');
    expect(s.summons).toBe(1);
    expect(s.log[0].summonsAfter).toBe(1);
    s = t.run(s, 'dec:seeker-search');
    s = t.run(s, 'tuner-ss');
    expect(s.summons).toBe(2);
    expect(s.log[s.log.length - 1].summonsAfter).toBe(2);
  });

  it('counts live draw effects by mechanism bit', () => {
    expect(DRAW_BIT).toEqual({ drawDeckExtraSummon: 1, drawHandSummon: 2, drawSpecialSummon: 4 });
    const t = setup();
    let s = t.run(t.state({ SEEKER: 1, TUNER: 1 }, { drawFx: DRAW_BIT.drawSpecialSummon }), 'ns:SEEKER');
    expect(s.log[0].draws).toBe(0);   // a Normal Summon is not a Special Summon
    expect(s.oppDraws).toBe(0);
    s = t.run(s, 'dec:seeker-search');
    s = t.run(s, 'tuner-ss');
    expect(s.log[s.log.length - 1].draws).toBe(1);
    expect(s.oppDraws).toBe(1);
  });

  it('counts a draw for a summon from the hand with drawHandSummon', () => {
    const t = setup();
    const s = t.run(t.state({ SEEKER: 1 }, { drawFx: DRAW_BIT.drawHandSummon | DRAW_BIT.drawDeckExtraSummon }), 'ns:SEEKER');
    expect(s.log[0].draws).toBe(1);
    expect(s.oppDraws).toBe(1);
  });

  it('exposes the deck helpers', () => {
    const t = setup();
    expect(t.mv.place).toBe(t.deck.ops.place);
    expect(t.mv.monToGy).toBe(t.deck.ops.monToGy);
    expect(t.mv.stToGy).toBe(t.deck.ops.stToGy);
    expect(t.mv.oppTargets).toBe(t.deck.ops.oppTargets);
    expect(t.mv.oppRemove).toBe(t.deck.ops.oppRemove);
  });
});

describe('ledObjs', () => {
  it('turns ledger tuples into objects with card ids', () => {
    const t = setup();
    const s = t.state({ DRAWTWO: 1, BIG: 1 });
    const n = t.run(s, 'drawtwo:BIG');
    expect(ledObjs(n.log[0], t.deck.ids, t.deck.UNK)).toEqual([
      ['a', { card: 'DRAWTWO', effect: 1, from: 'hand' }],
      ['m', { card: 'BIG', from: 'hand', to: 'gy' }],
      ['m', { card: '?', from: 'deck', to: 'hand' }],
      ['m', { card: '?', from: 'deck', to: 'hand' }],
    ]);
  });
});
