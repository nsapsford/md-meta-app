import { describe, expect, it } from 'vitest';
import type { RememberedList } from './storage';
import { finderSource, initialTab } from './trainerTab';

const deck = { name: 'Saved', main_json: [{ passcode: 1, count: 3 }], extra_json: [{ passcode: 2, count: 1 }] };
const recalled: RememberedList = { name: 'On device', list: { main: [{ passcode: 5, count: 2 }], extra: [] }, savedAt: 1 };

describe('initialTab', () => {
  it('opens the Finder for ?tab=finder', () => {
    expect(initialTab('?tab=finder')).toBe('finder');
  });
  it('opens the drill otherwise', () => {
    expect(initialTab('')).toBe('drill');
    expect(initialTab('?tab=zzz')).toBe('drill');
  });
});

describe('finderSource', () => {
  it('prefers the saved deck', () => {
    expect(finderSource(deck, recalled)).toEqual({
      list: { main: [{ passcode: 1, count: 3 }], extra: [{ passcode: 2, count: 1 }] }, name: 'Saved', fromDevice: false,
    });
  });
  it('uses the list remembered on this device when the deck is not loaded', () => {
    expect(finderSource(null, recalled)).toEqual({ list: recalled.list, name: 'On device', fromDevice: true });
  });
  it('is null with neither', () => {
    expect(finderSource(null, null)).toBeNull();
  });
});
