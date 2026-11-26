import { describe, it, expect } from 'vitest';
import { addBlockedReason, changeCount, copiesOf, flattenRows, isExtraDeckType, sectionTotal } from './deckEdit';
import type { YdkeDeck } from './ydke';

const deck = (): YdkeDeck => ({
  main: [{ passcode: 1, count: 2 }, { passcode: 2, count: 1 }],
  extra: [{ passcode: 9, count: 1 }],
  side: [{ passcode: 1, count: 1 }],
});

describe('changeCount', () => {
  it('increments, decrements and removes at zero', () => {
    expect(changeCount(deck(), 'main', 2, 1).main).toContainEqual({ passcode: 2, count: 2 });
    expect(changeCount(deck(), 'main', 2, -1).main.find((r) => r.passcode === 2)).toBeUndefined();
  });

  it('appends a new card', () => {
    expect(changeCount(deck(), 'main', 5, 1).main[2]).toEqual({ passcode: 5, count: 1 });
  });

  it('enforces the 3-copy limit across sections', () => {
    const d = deck(); // passcode 1: 2 main + 1 side = 3
    expect(changeCount(d, 'main', 1, 1)).toBe(d);
    expect(addBlockedReason(d, 'main', 1)).toMatch(/3 copies/);
  });

  it('enforces section size caps', () => {
    const full: YdkeDeck = { main: [], extra: Array.from({ length: 15 }, (_, i) => ({ passcode: 100 + i, count: 1 })), side: [] };
    expect(changeCount(full, 'extra', 999, 1)).toBe(full);
    expect(addBlockedReason(full, 'extra', 999)).toMatch(/full/);
  });

  it('does not mutate the input', () => {
    const d = deck();
    changeCount(d, 'main', 1, -1);
    expect(d.main[0].count).toBe(2);
  });
});

describe('helpers', () => {
  it('counts copies and totals', () => {
    expect(copiesOf(deck(), 1)).toBe(3);
    expect(sectionTotal(deck().main)).toBe(3);
    expect(flattenRows(deck().main)).toEqual([1, 1, 2]);
  });

  it('detects Extra Deck monster types', () => {
    expect(isExtraDeckType('Synchro Tuner Monster')).toBe(true);
    expect(isExtraDeckType('Synchro Monster')).toBe(true);
    expect(isExtraDeckType('Tuner Monster')).toBe(false);
    expect(isExtraDeckType('Effect Monster')).toBe(false);
    expect(isExtraDeckType('Spell Card')).toBe(false);
    expect(isExtraDeckType('Link Monster')).toBe(true);
    expect(isExtraDeckType(null)).toBe(false);
  });
});
