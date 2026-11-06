// Builds the grounding a line generator works from: the whole saved deck
// (main AND Extra Deck), full card text and stats, plus the hand traps that
// are actually common in current top lists.
import type { Pool } from '@neondatabase/serverless';
import { queryAll, queryOne } from '../../utils/dbHelpers.js';
import { HAND_TRAPS } from '../cardInteractionService.js';
import type { DeckCard, DeckContext } from './types.js';

export interface CardRow {
  id: number;
  name: string;
  type: string | null;
  description: string | null;
  level: number | null;
  link_val: number | null;
  attribute: string | null;
  race: string | null;
  ban_status_md?: string | null;
}

type DeckRows = Array<{ passcode: number; count: number }>;

/** Pure: deck rows + card rows -> DeckContext. Unknown passcodes are reported, not dropped silently. */
export function buildDeckContext(
  deck: { name: string; archetype: string | null; main: DeckRows; extra: DeckRows },
  cards: CardRow[],
  metaInterruptions: string[],
): { ctx: DeckContext; missing: number[] } {
  const byId = new Map(cards.map((c) => [Number(c.id), c]));
  const missing: number[] = [];
  const toCards = (rows: DeckRows, zone: 'main' | 'extra'): DeckCard[] => {
    const merged = new Map<number, number>();
    for (const r of rows) merged.set(Number(r.passcode), (merged.get(Number(r.passcode)) ?? 0) + Number(r.count));
    const out: DeckCard[] = [];
    for (const [passcode, copies] of merged) {
      const c = byId.get(passcode);
      if (!c) { missing.push(passcode); continue; }
      out.push({
        passcode,
        name: c.name,
        type: c.type ?? '',
        text: c.description ?? '',
        level: c.level ?? null,
        linkRating: c.link_val ?? null,
        attribute: c.attribute ?? null,
        race: c.race ?? null,
        copies,
        zone,
        banStatus: c.ban_status_md ?? null,
      });
    }
    return out.sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));
  };
  return {
    ctx: {
      deckName: deck.name,
      archetype: deck.archetype,
      main: toCards(deck.main, 'main'),
      extra: toCards(deck.extra, 'extra'),
      metaInterruptions,
    },
    missing,
  };
}

const DEFAULT_INTERRUPTIONS = [
  'Ash Blossom & Joyous Spring', 'Infinite Impermanence', 'Nibiru, the Primal Being', 'Effect Veiler',
  'Droll & Lock Bird', 'Ghost Ogre & Snow Rabbit',
];

/** Most-played hand traps across recent top lists; falls back to the usual staples. */
export async function loadMetaInterruptions(pool: Pool, limit = 6): Promise<string[]> {
  const rows = await queryAll<{ main_deck_json: string | null }>(pool,
    'SELECT main_deck_json FROM top_decks ORDER BY created_at DESC LIMIT 200');
  const counts = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    if (!r.main_deck_json) continue;
    let main: Array<{ cardName?: string }>;
    try { main = JSON.parse(r.main_deck_json); } catch { continue; }
    const seen = new Set<string>();
    for (const c of main) {
      const name = c.cardName;
      if (!name) continue;
      const key = name.toLowerCase();
      if (!HAND_TRAPS.has(key) || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, { name, n: (counts.get(key)?.n ?? 0) + 1 });
    }
  }
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.name);
  return (ranked.length >= 3 ? ranked : DEFAULT_INTERRUPTIONS).slice(0, limit);
}

export async function loadDeckContext(pool: Pool, deckId: number): Promise<{ ctx: DeckContext; missing: number[] }> {
  const deck = await queryOne(pool, 'SELECT * FROM user_decks WHERE id = $1', [deckId]);
  if (!deck) throw new Error(`Deck ${deckId} not found`);
  const main: DeckRows = JSON.parse(deck.main_json);
  const extra: DeckRows = deck.extra_json ? JSON.parse(deck.extra_json) : [];
  const ids = [...new Set([...main, ...extra].map((r) => Number(r.passcode)))];
  const cards = ids.length
    ? await queryAll<CardRow>(pool,
      `SELECT id, name, type, description, level, link_val, attribute, race, ban_status_md FROM cards WHERE id = ANY($1::int[])`, [ids])
    : [];
  const meta = await loadMetaInterruptions(pool);
  return buildDeckContext({ name: deck.name, archetype: deck.archetype, main, extra }, cards, meta);
}
