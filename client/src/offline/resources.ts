import { getTierList, getBanList } from '../api/meta';
import { getArchetypes } from '../api/cards';
import { getSavedDecks } from '../api/deckIO';
import type { TierList, BanListData } from '../types/meta';
import type { SavedDeck } from '../api/deckIO';

// A server dataset that can be mirrored into the local IndexedDB cache.
// `ttlMs` is how long a cached copy is considered fresh; the background sync
// engine re-fetches anything older than that.
export interface SyncResource<T> {
  readonly key: string;
  readonly label: string;
  readonly ttlMs: number;
  readonly fetch: () => Promise<T>;
}

function defineResource<T>(resource: SyncResource<T>): SyncResource<T> {
  return resource;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const tierListResource = defineResource<TierList>({
  key: 'tier-list',
  label: 'Tier List',
  ttlMs: HOUR,
  fetch: getTierList,
});

export const archetypesResource = defineResource<string[]>({
  key: 'card-archetypes',
  label: 'Card Database Index',
  ttlMs: 24 * HOUR,
  fetch: getArchetypes,
});

export const savedDecksResource = defineResource<SavedDeck[]>({
  key: 'saved-decks',
  label: 'My Decks',
  ttlMs: 15 * MINUTE,
  fetch: getSavedDecks,
});

export const banListResource = defineResource<BanListData>({
  key: 'ban-list',
  label: 'Ban List',
  ttlMs: 24 * HOUR,
  fetch: getBanList,
});

// Everything the background sync engine keeps warm. The element type is
// intentionally widened — consumers that need the payload type use the
// individual exports above with useOfflineQuery<T>.
export const syncResources: ReadonlyArray<SyncResource<unknown>> = [
  tierListResource,
  archetypesResource,
  savedDecksResource,
  banListResource,
];
