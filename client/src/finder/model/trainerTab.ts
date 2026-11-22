// The Line Trainer's tabs, which one a link opens, and where the Finder's list comes from.

import type { DeckList } from '../deck/match';
import type { RememberedList } from './storage';

export type TrainerTab = 'drill' | 'lines' | 'coverage' | 'finder';

/** `?tab=finder` opens the Finder; anything else opens the drill. */
export function initialTab(search: string): TrainerTab {
  return new URLSearchParams(search).get('tab') === 'finder' ? 'finder' : 'drill';
}

const rows = (r: DeckList['main']) => r.map((e) => ({ passcode: Number(e.passcode), count: e.count }));

/** The saved deck when it is loaded, else the list remembered on this device, else null. */
export function finderSource(
  deck: { name: string; main_json: DeckList['main']; extra_json: DeckList['extra'] } | null,
  recalled: RememberedList | null,
): { list: DeckList; name: string; fromDevice: boolean } | null {
  if (deck) return { list: { main: rows(deck.main_json), extra: rows(deck.extra_json) }, name: deck.name, fromDevice: false };
  if (recalled) return { list: recalled.list, name: recalled.name, fromDevice: true };
  return null;
}
