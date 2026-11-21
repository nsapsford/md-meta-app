// Opening the Finder for a saved deck list: which deck file fits it, loading that file, checking it,
// and the list in deck-file card ids. Nothing here knows a card.

import type { DeckList } from '../deck/match';
import { matchDeckFile } from '../deck/match';
import { loadDeck, type LoadedDeck } from '../deck/registry';
import { validateDeckFile, type DeckFile, type DeckFileError } from '../deck/schema';
import { buildCatalog, type Catalog } from './cards';
import { resolveList, type ResolvedList } from './finderState';

export interface OpenDeck { fileId: string; loaded: LoadedDeck; file: DeckFile; list: ResolvedList; catalog: Catalog }
export type OpenResult = { kind: 'unknown' } | { kind: 'broken'; errors: DeckFileError[] } | ({ kind: 'ok' } & OpenDeck);

export async function openDeck(list: DeckList, load: (id: string) => Promise<LoadedDeck> = loadDeck): Promise<OpenResult> {
  const m = matchDeckFile(list);
  if (!m) return { kind: 'unknown' };
  const loaded = await load(m.fileId);
  const r = validateDeckFile(loaded.file, loaded.shared);
  if (!r.ok) return { kind: 'broken', errors: r.errors };
  return { kind: 'ok', fileId: m.fileId, loaded, file: r.file, list: resolveList(list, r.file), catalog: buildCatalog(r.file, loaded.facts, loaded.traps) };
}

/** A deck-file error as the page shows it: `card · field · message`. */
export const errorLine = (e: DeckFileError) => [e.card, e.field, e.message].filter(Boolean).join(' · ');

/** The unknown Main Deck cards of the list, by name where `name` knows them, else by passcode. */
export function unknownNames(list: DeckList, resolved: ResolvedList, name?: (passcode: number) => string | undefined): string[] {
  const main = new Set(list.main.filter((r) => r.count > 0).map((r) => r.passcode));
  return resolved.unknown.filter((p) => main.has(p)).map((p) => name?.(p) ?? String(p));
}
