// Pure helpers for editing a saved deck's counted rows (My Decks → deck detail).
import type { DeckRow, YdkeDeck } from './ydke';

export type Section = keyof YdkeDeck;

export const SECTION_MAX: Record<Section, number> = { main: 60, extra: 15, side: 15 };
export const COPY_LIMIT = 3;

export function isExtraDeckType(type: string | null | undefined): boolean {
  // Matches "Synchro Tuner Monster" and "Pendulum Effect Fusion Monster" too; no Main Deck type uses these words.
  return /\b(Fusion|Synchro|XYZ|Link)\b/i.test(type ?? '');
}

export const sectionTotal = (rows: DeckRow[]): number => rows.reduce((s, r) => s + r.count, 0);

/** Copies of a passcode across every section — the 3-copy limit is deck-wide. */
export const copiesOf = (deck: YdkeDeck, passcode: number): number =>
  (['main', 'extra', 'side'] as const).reduce(
    (s, k) => s + (deck[k].find((r) => r.passcode === passcode)?.count ?? 0),
    0,
  );

/**
 * Change a card's count in one section by `delta`. Adding is refused (deck returned unchanged)
 * past the 3-copy limit or the section's size cap; a row that reaches 0 is removed.
 */
export function changeCount(deck: YdkeDeck, section: Section, passcode: number, delta: number): YdkeDeck {
  const rows = deck[section];
  const current = rows.find((r) => r.passcode === passcode)?.count ?? 0;
  if (delta > 0 && (copiesOf(deck, passcode) + delta > COPY_LIMIT || sectionTotal(rows) + delta > SECTION_MAX[section])) {
    return deck;
  }
  const next = Math.max(0, current + delta);
  const updated =
    current === 0
      ? next > 0 ? [...rows, { passcode, count: next }] : rows
      : next === 0
        ? rows.filter((r) => r.passcode !== passcode)
        : rows.map((r) => (r.passcode === passcode ? { ...r, count: next } : r));
  return { ...deck, [section]: updated };
}

/** Why a card can't be added right now, or null if it can. */
export function addBlockedReason(deck: YdkeDeck, section: Section, passcode: number): string | null {
  if (copiesOf(deck, passcode) >= COPY_LIMIT) return `Already ${COPY_LIMIT} copies in the deck.`;
  if (sectionTotal(deck[section]) >= SECTION_MAX[section]) return `The ${section} deck is full (${SECTION_MAX[section]}).`;
  return null;
}

/** Expand counted rows into one passcode per copy (for YDKE / .ydk export). */
export const flattenRows = (rows: DeckRow[]): number[] => rows.flatMap((r) => Array<number>(r.count).fill(r.passcode));
