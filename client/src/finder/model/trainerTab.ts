// The Line Trainer's tabs, which one a link opens, and where the Finder's list comes from.

import type { DeckList } from '../deck/match';
import type { RememberedList } from './storage';

export type TrainerTab = 'drill' | 'lines' | 'coverage' | 'finder';

/** `?tab=finder` opens the Finder; anything else opens the drill. */
export function initialTab(search: string): TrainerTab {
  return new URLSearchParams(search).get('tab') === 'finder' ? 'finder' : 'drill';
}

/** Where the saved-decks request stands: no answer yet, failed with nothing to show, or answered. */
export type DecksStatus = 'pending' | 'error' | 'ok';

/** The saved-decks request's state, from the query's data and error flag (data wins: a failed refetch still has the decks). */
export const decksStatus = (q: { data?: unknown; isError: boolean }): DecksStatus => (q.data ? 'ok' : q.isError ? 'error' : 'pending');

/**
 * What the deck picker shows while no saved deck is open. `remembered`: a list for the stored deck
 * is on this device. With the server asleep the Finder still works from that list, so a failed
 * request opens it, and a slow one offers it; a failed request never claims there are no decks.
 */
export function deckPicker(status: DecksStatus, remembered: boolean): { show: 'loading' | 'cantReach' | 'decks'; offerFinder: boolean; openFinder: boolean } {
  if (status === 'ok') return { show: 'decks', offerFinder: false, openFinder: false };
  if (status === 'pending') return { show: 'loading', offerFinder: remembered, openFinder: false };
  return { show: 'cantReach', offerFinder: remembered, openFinder: remembered };
}

const rows =(r: DeckList['main']) => r.map((e) => ({ passcode: Number(e.passcode), count: e.count }));

/** The saved deck when it is loaded, else the list remembered on this device, else null. */
export function finderSource(
  deck: { name: string; main_json: DeckList['main']; extra_json: DeckList['extra'] } | null,
  recalled: RememberedList | null,
): { list: DeckList; name: string; fromDevice: boolean } | null {
  if (deck) return { list: { main: rows(deck.main_json), extra: rows(deck.extra_json) }, name: deck.name, fromDevice: false };
  if (recalled) return { list: recalled.list, name: recalled.name, fromDevice: true };
  return null;
}
