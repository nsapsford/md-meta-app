import { describe, it, expect } from 'vitest';
import { compileDeck, DeckCompileError } from './compile';
import { validateDeckFile, type DeckFile } from './schema';
import { TOY_FACTS, TOY_FILE } from '../engine/__toy__/toyDeck';
import { driver } from '../engine/__toy__/driver';
import { createMoves } from '../engine/moves';

const D = driver();
const { mainKeys, pendKeys, run, summonForTest, count, handSize, lastText } = D;
const toyState = D.state;

const reversed = (f: DeckFile): DeckFile => ({
  ...f,
  cards: [...f.cards].reverse().map((c) => (c.effects ? { ...c, effects: [...c.effects].reverse() } : c)),
});

describe('compileDeck (toy deck)', () => {
  it('compiles a file the validator accepts', () => {
    expect(validateDeckFile(TOY_FILE, {}).ok).toBe(true);
  });

  it('offers moves in (order, key) order', () => { expect(mainKeys(toyState({ SEEKER: 1, DRAWTWO: 1, BIG: 1 }))).toEqual(['drawtwo:BIG', 'drawtwo:SEEKER']); });

  it('queues a trigger when its card is Normal Summoned', () => {
    const s = summonForTest(toyState({ SEEKER: 1 }), 'SEEKER');
    expect(s.pend).toHaveLength(1); expect(pendKeys(s)).toEqual(['seeker-search:DRAWTWO']);
  });

  it('pays the cost but skips the effect when negated', () => {
    const s = run(toyState({ DRAWTWO: 1, BIG: 1 }), 'drawtwo:BIG', true);
    expect(count(s, 'gy', 'BIG')).toBe(1); expect(count(s, 'gy', 'DRAWTWO')).toBe(1); expect(handSize(s)).toBe(0);
  });

  it('draws two when not negated', () => { expect(handSize(run(toyState({ DRAWTWO: 1, BIG: 1 }), 'drawtwo:BIG'))).toBe(2); });

  it('honours once per turn', () => { expect(mainKeys(run(toyState({ DRAWTWO: 2, BIG: 2 }), 'drawtwo:BIG'))).toEqual([]); });

  it('honours a condition', () => { expect(mainKeys(toyState({ TUNER: 1 }))).toEqual([]); });

  it('gives the same moves when cards and effects are listed in reverse', () => {
    const R = driver(reversed(TOY_FILE));
    expect(R.deck.ids).toEqual(D.deck.ids);
    const hands: Record<string, number>[] = [{ SEEKER: 1, DRAWTWO: 1, BIG: 1 }, { TUNER: 1, DRAWTWO: 2, WALL: 1 }, { BIG: 2, DRAWTWO: 1, SEEKER: 1, TUNER: 1 }];
    for (const h of hands) expect(R.mainKeys(R.state(h))).toEqual(mainKeys(toyState(h)));
    const withTuner = summonForTest(toyState({ SEEKER: 1, TUNER: 1 }), 'SEEKER');
    expect(R.pendKeys(withTuner)).toEqual(pendKeys(withTuner));
  });

  it('gives the same Extra Deck moves when extraDeck rules are listed in reverse; order sorts first', () => {
    const rules: DeckFile['extraDeck'] = [
      { card: 'WALL', method: 'link', rating: 2, min: 2, max: 2 },
      { card: 'SYNC', method: 'synchro', level: 8, min: 2, max: 2, tuners: 'atMostOne' },
      { card: 'BIG', method: 'link', rating: 2, min: 2, max: 2 },
    ];
    const keysFor = (extraDeck: DeckFile['extraDeck']) => {
      const deck = compileDeck({ ...TOY_FILE, extraDeck }, TOY_FACTS);
      const s = deck.state.newState({ mode: 'first', hand: {}, deck: {}, extra: { SYNC: 1, BIG: 1, WALL: 1 } }, deck.ix);
      for (const id of ['SEEKER', 'TUNER']) s.mons.push({ id: deck.ix[id], nm: deck.ix[id], emz: false, noEff: false, uses: 0, lvl: 4, marks: 0, uid: s.uid++ });
      return createMoves(deck).gen(s).map((m) => m.k);
    };
    const want = ['syn:SYNC:SEEKER+TUNER', 'link:BIG:SEEKER+TUNER', 'link:WALL:SEEKER+TUNER'];
    expect(keysFor(rules)).toEqual(want);
    expect(keysFor([...rules!].reverse())).toEqual(want);
    expect(keysFor(rules!.map((r) => (r.card === 'WALL' ? { ...r, order: -1 } : r)))).toEqual(['syn:SYNC:SEEKER+TUNER', 'link:WALL:SEEKER+TUNER', 'link:BIG:SEEKER+TUNER']);
  });

  it('fills step text from the template', () => { expect(lastText(run(summonForTest(toyState({ SEEKER: 1 }), 'SEEKER'), 'seeker-search:DRAWTWO'))).toBe('Seeker: add Draw Two.'); });

  it('refuses a card with no facts', () => { expect(() => compileDeck(TOY_FILE, TOY_FACTS.slice(1))).toThrow(/no card facts for/); });

  it('reports every card with no facts as a DeckCompileError', () => {
    try { compileDeck(TOY_FILE, TOY_FACTS.slice(2)); throw new Error('expected a throw'); } catch (e) {
      expect(e).toBeInstanceOf(DeckCompileError);
      expect((e as DeckCompileError).errors.map((x) => x.card)).toEqual(['SEEKER', 'TUNER']);
      expect((e as DeckCompileError).errors[0]).toEqual({ card: 'SEEKER', field: 'passcodes', message: 'no card facts for SEEKER (passcodes 9000001)' });
    }
  });
});

describe('compiled deck tables', () => {
  const { deck } = D;

  it('numbers cards by sorted id, then UNK', () => {
    expect(deck.ids).toEqual(['BIG', 'DRAWTWO', 'SEEKER', 'SYNC', 'TUNER', 'WALL', 'UNK']);
    expect(deck.ix.SEEKER).toBe(2);
    expect(deck.UNK).toBe(6);
  });

  it('reads card properties from the facts as the reference does', () => {
    const p = (id: string) => deck.props[deck.ix[id]];
    expect(p('TUNER')).toMatchObject({ kind: 'M', sub: 'Effect', tuner: true, lv: 4, race: 'Spellcaster', attr: 'LIGHT', atk: 1000, ext: false, st: null, short: 'Tuner' });
    expect(p('BIG')).toMatchObject({ kind: 'M', sub: 'Normal', tuner: false, lv: 6, atk: 2400, def: 2000 });
    expect(p('DRAWTWO')).toMatchObject({ kind: 'S', st: 'Normal', race: null, lv: null, atk: 0, short: 'Draw Two' });
    expect(p('WALL')).toMatchObject({ kind: 'T', st: 'Continuous' });
    expect(p('SYNC')).toMatchObject({ kind: 'M', sub: 'Synchro', ext: true, lv: 8 });
    expect(deck.props[deck.UNK]).toMatchObject({ id: 'UNK', kind: '?', sub: '?', ext: false, discardValue: 0 });
    expect(p('BIG')).toMatchObject({ discardValue: 3, heldValue: 0, normalSummon: true, immuneToRemoval: false });
  });

  it('gives once-per-turn limits their own slots', () => {
    expect(deck.nOpt).toBe(2);
    expect(deck.nFlags).toBe(0);
  });

  it('names each once-per-turn slot by its limit (sorted)', () => {
    expect(deck.limitNames).toEqual(['drawtwo', 'tuner-ss']);
  });

  it('compiles the Extra Deck rule to data', () => {
    expect(deck.extra).toEqual([{ card: deck.ix.SYNC, method: 'synchro', level: 8, min: 2, max: 2, tuners: 'exactlyOne', mats: null, then: 0, thenIf: null }]);
  });

  it('Sets end-of-turn cards in order without touching the state', () => {
    const s = toyState({ WALL: 2, BIG: 1 });
    const { n, sets } = deck.finalize(s);
    expect(sets).toEqual([deck.ix.WALL, deck.ix.WALL]);
    expect(n.st.map((x) => [x.id, x.up, x.endSet])).toEqual([[deck.ix.WALL, false, true], [deck.ix.WALL, false, true]]);
    expect(n.hand[deck.ix.WALL]).toBe(0);
    expect(s.hand[deck.ix.WALL]).toBe(2);
    expect(s.st).toHaveLength(0);
  });

  it('returns the state itself when nothing is to be Set', () => {
    const s = toyState({ BIG: 1 });
    const { n, sets } = deck.finalize(s);
    expect(sets).toEqual([]);
    expect(n.hand).toBe(s.hand);
  });

  it('scores the board from its entries, with labels only when asked', () => {
    const { n } = deck.finalize(toyState({ WALL: 1 }));
    expect(deck.boardValue(n, false)).toEqual({ sum: 0.5, items: null });
    expect(deck.boardValue(n, true)).toEqual({ sum: 0.5, items: [['Wall: negate', 0.5]] });
    const two = deck.finalize(toyState({ WALL: 2 })).n;
    expect(deck.boardValue(two, true)).toEqual({ sum: 1, items: [['Wall: negate', 0.5], ['Wall: negate', 0.5]] });
  });

  it('lets board-value entries use any condition (banished cards, once-per-turn limits)', () => {
    const f: DeckFile = {
      ...TOY_FILE,
      boardValue: [{
        id: 'probe', when: 'oppTurn', on: { control: { card: 'WALL', kind: 'st' } },
        base: [{ if: [{ has: { zone: 'ban', card: 'BIG' } }], value: 0.3, label: 'Wall with Big banished' }, { value: 0.1, label: 'Wall' }],
        adds: [{ if: [{ notUsed: 'drawtwo' }], value: 0.2, label: 'Draw Two unused' }],
      }],
    };
    expect(validateDeckFile(f, {}).ok).toBe(true);
    const P = driver(f);
    const s = P.state({ WALL: 1 });
    const v = P.deck.boardValue(P.deck.finalize(s).n, true);
    expect(v.sum).toBeCloseTo(0.3);
    expect(v.items![0][0]).toBe('Wall, Draw Two unused');
    P.deck.state.W(s, 'ban')[P.deck.ix.BIG] = 1;
    P.deck.state.setOpt(s, 0);   // drawtwo's slot: limits are numbered by sorted name
    const r = P.deck.boardValue(P.deck.finalize(s).n, true);
    expect(r.items).toEqual([['Wall with Big banished', 0.3]]);
  });

  it('hasBoardValue: only cards named inside `control` words count', () => {
    const f: DeckFile = {
      ...TOY_FILE,
      groups: { ...TOY_FILE.groups, tuners: ['TUNER'] },
      boardValue: [
        // A Spell/Trap entry that also checks the Deck for BIG: BIG keeps its default value.
        { id: 'wall', when: 'oppTurn', on: { any: [{ control: { card: 'WALL', kind: 'st' } }, { has: { zone: 'deck', card: 'BIG' } }] }, base: [{ value: 0.5, label: 'Wall' }] },
        { id: 'tuners', when: 'oppTurn', on: { control: { group: 'tuners', kind: 'mon' } }, base: [{ value: 0.3, label: 'Tuner' }] },
      ],
    };
    expect(validateDeckFile(f, {}).ok).toBe(true);
    const d = compileDeck(f, TOY_FACTS);
    const named = d.ids.filter((_, i) => d.hasBoardValue[i]);
    expect(named).toEqual(['TUNER', 'WALL']);
  });
});
