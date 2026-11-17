import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileDeck } from '../deck/compile';
import type { DeckFile } from '../deck/schema';
import { acts, type WordDef } from '../deck/vocabulary';
import { createMoves } from './moves';
import { createScore, type LineEval } from './score';
import { createSearch, topK, type SolveOpts, type SolveResult } from './search';
import type { CardId } from './types';
import { TOY_FACTS, TOY_FILE, toyCfg } from './__toy__/toyDeck';

function solveWith(file: DeckFile, hand: Record<CardId, number>, opts: SolveOpts = {}): SolveResult {
  const deck = compileDeck(file, TOY_FACTS);
  const search = createSearch(createMoves(deck), createScore(deck), deck.state);
  return search.solveBeam(deck.state.newState(toyCfg(hand), deck.ix), opts);
}
const solve = (hand: Record<CardId, number>, opts: SolveOpts = {}) => solveWith(TOY_FILE, hand, opts);

const TOY_IDS = [...TOY_FILE.cards.map((c) => c.id)].sort().concat('UNK');
const endBoard = (e: LineEval): CardId[] => e.final.mons.map((m) => TOY_IDS[m.id]).concat(e.final.st.map((x) => TOY_IDS[x.id]));

const REVERSED: DeckFile = {
  ...TOY_FILE,
  cards: [...TOY_FILE.cards].reverse().map((c) => (c.effects ? { ...c, effects: [...c.effects].reverse() } : c)),
};

// A second effect on BIG whose action always throws.
const BROKEN_FILE: DeckFile = {
  ...TOY_FILE,
  cards: TOY_FILE.cards.map((c) => (c.id !== 'BIG' ? c : {
    ...c,
    effects: [{ key: 'big-throw', phase: 'main', from: 'hand', do: [{ testThrow: true }], tags: { inherent: true }, text: 'Big: throw.' }],
  })),
};

const throwWord: WordDef = { doc: 'Test only: always throws.', args: { k: 'none' }, compile: () => () => { throw new Error('testThrow'); } };
beforeAll(() => { acts.set('testThrow', throwWord); });
afterAll(() => { acts.delete('testThrow'); });

describe('search', () => {
  it('topK returns the k best, earlier index first on ties', () => { expect(topK([5, 9, 9, 1, 7], 5, 3)).toEqual([1, 2, 4]); });

  it('finds the two-card Synchro line', () => {
    const r = solve({ SEEKER: 1, TUNER: 1 }, { width: 60, rounds: 1, timeMs: 3_600_000, strict: true });
    expect(endBoard(r.lines[0])).toContain('SYNC'); expect(r.errors).toBe(0);
    expect(r.lines[0].state!.path.slice(-1)[0]).toBe('syn:SYNC:SEEKER+TUNER');
    expect(r.lines[0].items).toContainEqual(['Sync on the field', 1]);
    expect(r.lines[0].items!.some(([l]) => l === 'Sync')).toBe(false);   // it has a board-value entry: no default value
  });

  it('battle: best damage through their monsters (attack position takes the difference, defense none)', () => {
    const deck = compileDeck(TOY_FILE, TOY_FACTS);
    const sc = createScore(deck);
    const mon = (id: string) => ({ id: deck.ix[id], nm: deck.ix[id], emz: false, noEff: false, uses: 0, lvl: 4, marks: 0, uid: 1 });
    const s = deck.state.newState({ ...toyCfg({}), mode: 'second', opp: { lp: 8000, mons: [{ uid: 'a', kind: 'mon', name: 'a', atk: 2000, pos: 'atk' }, { uid: 'd', kind: 'mon', name: 'd', def: 1200, pos: 'def' }], st: [] } }, deck.ix);
    s.mons = [mon('SYNC'), mon('SEEKER'), mon('TUNER')];
    // 3000 into the 2000 attacker (1000), 1500 over the 1200 defender (0), then 1000 direct: 2000.
    expect(sc.battle(deck.finalize(s).n)).toBe(2000);
    const e = sc.evaluate(s, false);
    expect(e.summary.lethal).toBe(false);
    expect(e.score).toBeCloseTo(300 * (1 - 6000 / 8000) + 12 * (1 + 0.1 + 1000 / 15000), 9);
  });

  it('is repeatable at a fixed width', () => {
    const opts = { width: 40, rounds: 1, timeMs: 3_600_000, strict: true };
    const a = solve({ SEEKER: 1, TUNER: 1, DRAWTWO: 1, WALL: 1 }, opts);
    const b = solve({ SEEKER: 1, TUNER: 1, DRAWTWO: 1, WALL: 1 }, opts);
    expect(a.lines[0].state!.path).toEqual(b.lines[0].state!.path);
    expect(a.lines[0].score).toBe(b.lines[0].score);
  });

  it('does not depend on the order of the deck file', () => {
    const opts = { width: 40, rounds: 1, timeMs: 3_600_000, strict: true };
    const hand = { SEEKER: 1, TUNER: 1, DRAWTWO: 1, WALL: 1 };
    const a = solve(hand, opts), b = solveWith(REVERSED, hand, opts);
    expect(b.lines[0].state!.path).toEqual(a.lines[0].state!.path);
    expect(b.lines[0].score).toBe(a.lines[0].score);
  });

  it('stops on the clock', () => {
    const t = Date.now();
    solve({ SEEKER: 1, TUNER: 1, BIG: 1, DRAWTWO: 1, WALL: 1 }, { timeMs: 200 });
    expect(Date.now() - t).toBeLessThan(450);
  });

  it('counts a move that throws and carries on, or throws when strict', () => {
    expect(solveWith(BROKEN_FILE, { BIG: 1, SEEKER: 1 }, { rounds: 1 }).errors).toBeGreaterThan(0);
    expect(() => solveWith(BROKEN_FILE, { BIG: 1, SEEKER: 1 }, { rounds: 1, strict: true })).toThrow();
  });

  it('returns the do-nothing line for an empty hand', () => {
    const r = solve({}, { rounds: 1 });
    expect(r.lines).toHaveLength(1); expect(r.lines[0].state!.log).toHaveLength(0);
  });

  it('returns the do-nothing line for a hand of blanks', () => {
    const r = solve({ UNK: 5 }, { rounds: 1 });
    expect(r.lines[0].state!.log).toHaveLength(0);
  });

  it('Sets end-of-turn cards and counts their value', () => {
    const r = solve({ WALL: 1 }, { rounds: 1 });
    expect(r.lines[0].sets).toHaveLength(1); expect(r.lines[0].items).toContainEqual(['Wall: negate', 0.5]);
  });

  it('values a monster with no board-value entry at min(0.2, ATK/15000) under its short name', () => {
    const deck = compileDeck(TOY_FILE, TOY_FACTS);
    const sc = createScore(deck);
    const moves = createMoves(deck);
    const s0 = deck.state.newState(toyCfg({ SEEKER: 1 }), deck.ix);
    const s = moves.exec(s0, moves.gen(s0).find((m) => m.k === 'ns:SEEKER')!, false);
    const e = sc.evaluate(s, true);
    expect(e.items).toContainEqual(['Seeker', 0.1]);
    expect(e.summary.value).toBeCloseTo(0.1, 12);
    expect(e.score).toBeCloseTo(0.1 * 100 - 1 * 1.5, 9);
  });

  it('policy without hooks is refused', () => {
    expect(() => solve({ SEEKER: 1 }, { rounds: 1, policy: [{ kind: 'x', src: 'hand', label: 'x' }] })).toThrow(/hooks/);
  });
});
