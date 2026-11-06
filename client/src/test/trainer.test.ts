import { describe, it, expect } from 'vitest';
import type { ComboLine, DrillReview } from '../api/lines';
import {
  mulberry32, expandDeck, drawHand, assignSlots, isPlayable, bestLine, judgePick,
  missingSlots, startersNotInDeck, coverage, drillItems, dueItems,
} from '../utils/trainer';

const A = 1, B = 2, C = 3, D = 4, X = 9;

const line = (id: number, rank: number, starters: number[][], branches = 0): ComboLine => ({
  id, deck_id: 1, name: `L${id}`, rank, status: 'verified', source: 'manual', starters,
  steps: [{ id: `s${id}`, text: 'step', branches: Array.from({ length: branches }, (_, i) => ({ id: `b${id}${i}`, interruption: 'Ash', response: 'r' })) }],
  end_board: null, created_at: 0, updated_at: 0,
});

// 40 cards: 3 A, 3 B, 34 filler
const deck40 = expandDeck([{ passcode: A, count: 3 }, { passcode: B, count: 3 }, { passcode: X, count: 34 }]);

describe('drawHand', () => {
  it('draws distinct deck positions and is repeatable for a seed', () => {
    const deck = expandDeck([{ passcode: A, count: 1 }, { passcode: B, count: 1 }, { passcode: C, count: 1 }]);
    const h1 = drawHand(deck, 3, mulberry32(7));
    expect([...h1].sort()).toEqual([A, B, C]);
    expect(drawHand(deck40, 5, mulberry32(42))).toEqual(drawHand(deck40, 5, mulberry32(42)));
    expect(deck40).toHaveLength(40); // not mutated
  });

  it('caps the hand at the deck size', () => {
    expect(drawHand([A, B], 5, mulberry32(1))).toHaveLength(2);
  });
});

describe('assignSlots', () => {
  it('fills each slot with a distinct card', () => {
    expect(assignSlots([[A, B], [C]], [X, C, B])).toEqual([2, 1]);
  });

  it('needs two copies when two slots want the same card', () => {
    expect(assignSlots([[A], [A]], [A, X])).toBeNull();
    expect(assignSlots([[A], [A]], [A, A])).not.toBeNull();
  });

  it('reassigns an earlier slot to make room (needs real matching, not greedy)', () => {
    // Greedy would give slot 0 card A and then fail slot 1; matching gives slot 0 B.
    expect(assignSlots([[A, B], [A]], [A, B])).toEqual([1, 0]);
  });
});

describe('line choice', () => {
  const lines = [line(1, 2, [[A]]), line(2, 1, [[A], [B]]), line(3, 3, [[C]]), line(4, 0, [])];

  it('a line without starters is never playable', () => {
    expect(isPlayable(lines[3], [A, B, C, D, X])).toBe(false);
  });

  it('picks the best-ranked playable line', () => {
    expect(bestLine(lines, [A, B, X, X, X])?.id).toBe(2);
    expect(bestLine(lines, [A, X, X, X, X])?.id).toBe(1);
    expect(bestLine(lines, [D, X, X, X, X])).toBeNull();
  });

  it('judges picks', () => {
    const hand = [A, B, X, X, X];
    expect(judgePick(lines, hand, 2).verdict).toBe('best');
    expect(judgePick(lines, hand, 1).verdict).toBe('playable-worse');
    expect(judgePick(lines, hand, 3).verdict).toBe('not-playable');
    expect(judgePick(lines, hand, null)).toMatchObject({ verdict: 'missed-line', best: { id: 2 } });
    expect(judgePick(lines, [D, X, X, X, X], null).verdict).toBe('correct-none');
  });

  it('explains what is missing and flags starters cut from the deck', () => {
    expect(missingSlots(lines[1], [A, X])).toEqual([[B]]);
    expect(startersNotInDeck(line(5, 1, [[A, D]]), deck40)).toEqual([D]);
  });
});

describe('coverage', () => {
  // Exact hypergeometric values for a 40-card deck, 5-card hand:
  //   P(at least one of 3 copies) = 1 - C(37,5)/C(40,5)            = 0.33755
  //   P(at least one A and one B) = 1 - 2·C(37,5)/C(40,5) + C(34,5)/C(40,5) = 0.09798
  const one = line(1, 1, [[A]]);
  const both = line(2, 0, [[A], [B]]);

  it('matches the exact single-card odds', () => {
    const r = coverage([one], deck40, 5, 20000, 3);
    expect(r.any).toBeCloseTo(0.33755, 1);
    expect(Math.abs(r.any - 0.33755)).toBeLessThan(0.015);
  });

  it('matches the exact two-card odds and splits "best" by rank', () => {
    const r = coverage([one, both], deck40, 5, 20000, 5);
    const bothStats = r.perLine.find((p) => p.id === 2)!;
    const oneStats = r.perLine.find((p) => p.id === 1)!;
    expect(Math.abs(bothStats.playable - 0.09798)).toBeLessThan(0.015);
    // "both" outranks "one", so it is the best line whenever it is playable...
    expect(bothStats.best).toBeCloseTo(bothStats.playable, 10);
    // ...and "one" is best only in the remaining A hands.
    expect(oneStats.best).toBeCloseTo(oneStats.playable - bothStats.playable, 10);
    expect(r.any).toBeCloseTo(oneStats.playable, 10);
  });

  it('going second (6 cards) opens more often', () => {
    expect(coverage([one], deck40, 6, 20000, 9).any).toBeGreaterThan(coverage([one], deck40, 5, 20000, 9).any);
  });
});

describe('drill queue', () => {
  const lines = [line(1, 1, [[A]], 2), { ...line(2, 2, [[B]]), steps: [] }];

  it('makes one item per line with steps plus one per branch', () => {
    const items = drillItems(lines, []);
    expect(items.map((i) => i.key)).toEqual(['line:1', 'branch:1:b10', 'branch:1:b11']);
    expect(items.every((i) => i.isNew && i.dueAt === 0)).toBe(true);
    expect(items[1]).toMatchObject({ kind: 'branch', stepIndex: 0, branch: { id: 'b10' } });
  });

  it('returns only due items, most overdue first', () => {
    const reviews: DrillReview[] = [
      { item_key: 'line:1', ease: 2.5, interval_days: 1, reps: 1, lapses: 0, due_at: 500, last_grade: 'good', updated_at: 0 },
      { item_key: 'branch:1:b10', ease: 2.5, interval_days: 1, reps: 1, lapses: 0, due_at: 2000, last_grade: 'good', updated_at: 0 },
    ];
    const due = dueItems(drillItems(lines, reviews), 1000);
    expect(due.map((i) => i.key)).toEqual(['branch:1:b11', 'line:1']);
  });
});
