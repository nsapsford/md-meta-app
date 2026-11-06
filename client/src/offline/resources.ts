import { tierListQuery, archetypesQuery, savedDecksQuery, banListQuery } from '../queries/options';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Datasets the background sync engine keeps warm in the query cache (and so,
// through the persister, on disk) even while no page is showing them.
// `ttlMs` is how old the cached copy may get before a background refetch.
export interface SyncResource {
  readonly label: string;
  readonly ttlMs: number;
  // Widened on purpose: the engine only prefetches, it never reads the data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly options: () => any;
}

export const syncResources: ReadonlyArray<SyncResource> = [
  { label: 'Tier List', ttlMs: HOUR, options: tierListQuery },
  { label: 'Card Database Index', ttlMs: 24 * HOUR, options: archetypesQuery },
  { label: 'My Decks', ttlMs: 15 * MINUTE, options: savedDecksQuery },
  { label: 'Ban List', ttlMs: 24 * HOUR, options: banListQuery },
];
