// The Finder's setup and the deck list it was solved with, kept on the device per saved deck.
// Storage may be missing or full: every error is swallowed (as in the artifact).

import type { DeckList } from '../deck/match';
import type { FinderSnapshot } from './finderState';

export interface RememberedList { name: string; list: DeckList; savedAt: number }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const stateKey = (deckId: number) => `finder_state_${deckId}`;
export const listKey = (deckId: number) => `finder_list_${deckId}`;

function defaultStore(): Store | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

const isRows = (x: unknown) => Array.isArray(x) && x.every((r) => r && typeof r.passcode === 'number' && typeof r.count === 'number');

export function createFinderStorage(store: Store | null = defaultStore()) {
  const read = (key: string): unknown => {
    try { const t = store?.getItem(key); return t == null ? null : JSON.parse(t); } catch { return null; }
  };
  const write = (key: string, v: unknown) => { try { store?.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  return {
    /** The saved snapshot as stored (check it with restoreSnapshot), or null. */
    loadState(deckId: number): unknown { return read(stateKey(deckId)); },
    saveState(deckId: number, s: FinderSnapshot): void { write(stateKey(deckId), s); },
    remember(deckId: number, r: RememberedList): void { write(listKey(deckId), r); },
    recall(deckId: number): RememberedList | null {
      const r = read(listKey(deckId)) as RememberedList | null;
      if (!r || typeof r.name !== 'string' || typeof r.savedAt !== 'number' || !r.list || !isRows(r.list.main) || !isRows(r.list.extra)) return null;
      return r;
    },
    forget(deckId: number): void { try { store?.removeItem(stateKey(deckId)); store?.removeItem(listKey(deckId)); } catch { /* storage unavailable */ } },
  };
}
export type FinderStorage = ReturnType<typeof createFinderStorage>;
