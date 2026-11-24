import { describe, expect, it } from 'vitest';
import type { RememberedList } from './storage';
import { deckPicker, decksStatus, finderSource, initialTab } from './trainerTab';

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

describe('decksStatus', () => {
  it('is ok with data (even after a failed refetch), error with only a failure, else pending', () => {
    expect(decksStatus({ data: [], isError: false })).toBe('ok');
    expect(decksStatus({ data: [], isError: true })).toBe('ok');
    expect(decksStatus({ data: undefined, isError: true })).toBe('error');
    expect(decksStatus({ data: undefined, isError: false })).toBe('pending');
  });
});

describe('deckPicker', () => {
  it('pending: loading, offering the Finder only when a list is remembered', () => {
    expect(deckPicker('pending', true)).toEqual({ show: 'loading', offerFinder: true, openFinder: false });
    expect(deckPicker('pending', false)).toEqual({ show: 'loading', offerFinder: false, openFinder: false });
  });
  it("errored: can't reach (never 'no decks'), opening the Finder when a list is remembered", () => {
    expect(deckPicker('error', true)).toEqual({ show: 'cantReach', offerFinder: true, openFinder: true });
    expect(deckPicker('error', false)).toEqual({ show: 'cantReach', offerFinder: false, openFinder: false });
  });
  it('ok: the decks, remembered or not', () => {
    expect(deckPicker('ok', true)).toEqual({ show: 'decks', offerFinder: false, openFinder: false });
    expect(deckPicker('ok', false)).toEqual({ show: 'decks', offerFinder: false, openFinder: false });
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
