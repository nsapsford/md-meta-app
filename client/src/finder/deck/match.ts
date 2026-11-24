// Which deck file fits a saved deck list: the one that knows the most of its different Main Deck
// cards, if it knows at least half of them and at least one of the file's own cards (a list of
// shared staples alone is no deck the file knows). Cards are told apart by passcode; copies count once.
// Nothing here knows a card.

import { DECK_MANIFEST, type ManifestRow } from './manifest';

export type DeckList = { main: { passcode: number; count: number }[]; extra: { passcode: number; count: number }[] };
export interface DeckMatch { fileId: string; known: number; total: number; unknown: number[] }

export function matchDeckFile(list: DeckList, manifest: readonly ManifestRow[] = DECK_MANIFEST): DeckMatch | null {
  const codes: number[] = [];
  for (const e of list.main) if (e.count > 0 && !codes.includes(e.passcode)) codes.push(e.passcode);
  if (!codes.length) return null;
  let best: DeckMatch | null = null;
  for (const row of manifest) {
    const known = new Set(row.main);
    const unknown = codes.filter((p) => !known.has(p));
    const m: DeckMatch = { fileId: row.id, known: codes.length - unknown.length, total: codes.length, unknown };
    if (m.known * 2 < m.total) continue;
    if (row.own && !codes.some((p) => row.own!.includes(p))) continue;
    if (!best || m.known > best.known || (m.known === best.known && m.fileId < best.fileId)) best = m;
  }
  return best;
}
