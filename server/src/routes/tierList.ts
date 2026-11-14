import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll } from '../utils/dbHelpers.js';
import { syncDeckTypes, computeDeckTypeCards } from '../services/syncService.js';
import { config } from '../config.js';
import { UNTAPPED_RANKS } from '../services/untappedService.js';
import {
  ALL_RANKS, LADDER_RANKS, computeMeta, computeMetaAdjusted, type RankRow, type MetaEntry,
} from '../services/metaTierService.js';
import { deckKey, isEngineAggregate, slugId } from '../services/deckNames.js';

// In-memory process cache keyed by selection ("ladder", "all", "7", ...) — no DB round-trip
const cache = new Map<string, { at: number; data: Record<string, any[]> }>();
const MEM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_KEY = 'ladder';

export function invalidateTierListCache() {
  cache.clear();
}

export async function warmTierListCache(): Promise<void> {
  const hit = cache.get(DEFAULT_KEY);
  if (hit && (Date.now() - hit.at) < MEM_CACHE_TTL_MS) return;
  const { default: axios } = await import('axios');
  await axios.get(`http://localhost:${config.port}/api/tier-list`, { timeout: 30000 });
  console.log('[Warmup] tier-list cache built');
}

type Selection =
  | { key: string; kind: 'ranks'; ranks: number[] }
  | { key: string; kind: 'all' };

/** ?rank= absent -> Diamond + Master; 2..7 -> that rank; "all" -> every rank, Untapped-adjusted. */
function parseSelection(raw: unknown): Selection | null {
  if (raw == null || raw === '') return { key: DEFAULT_KEY, kind: 'ranks', ranks: LADDER_RANKS };
  if (raw === 'all') return { key: 'all', kind: 'all' };
  const n = Number(raw);
  if (Number.isInteger(n) && UNTAPPED_RANKS[n]) return { key: String(n), kind: 'ranks', ranks: [n] };
  return null;
}

interface DeckRow {
  id: string;
  name: string;
  tier: number | null;
  power: number | null;
  power_trend: number | null;
  pop_rank: number | null;
  thumbnail_image: string | null;
  computed_cards_json: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function cardsOf(d: DeckRow | undefined): Array<{ name: string; image: string | null }> {
  if (!d?.computed_cards_json) return [];
  try {
    return (JSON.parse(d.computed_cards_json) as Array<{ name: string; image: string | null }>).slice(0, 3);
  } catch {
    return [];
  }
}

function buildEntry(e: MetaEntry, name: string, mdm: DeckRow | undefined) {
  const cards = cardsOf(mdm);
  return {
    id: mdm?.id ?? slugId(name),
    name,
    tier: e.tier,
    // Tournament data (Master Duel Meta), when this deck has a row there
    power: mdm?.power ?? null,
    power_trend: mdm?.power_trend ?? null,
    pop_rank: mdm?.pop_rank ?? null,
    // Ladder data (Untapped), for the selected ranks
    win_rate: round1(e.winRate),
    play_rate: round1(e.share),
    edge: round1(e.edge),
    edge_floor: round1(e.floor),
    games: e.games,
    thumbnail_image: mdm?.thumbnail_image || (cards.length > 0 ? cards[0].image : null),
    cards,
  };
}

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const sel = parseSelection(req.query.rank);
    if (!sel) return res.status(400).json({ error: 'rank must be 2 (Bronze) to 7 (Master), or "all"' });

    const hit = cache.get(sel.key);
    if (hit && (Date.now() - hit.at) < MEM_CACHE_TTL_MS) return res.json(hit.data);

    const pool = getPool();

    const loadDecks = () => queryAll<DeckRow>(pool,
      `SELECT id, name, tier, power, power_trend, pop_rank, thumbnail_image, computed_cards_json
       FROM deck_types
       ORDER BY tier ASC NULLS LAST, power DESC NULLS LAST`);

    let deckTypes = await loadDecks();
    if (deckTypes.length === 0) {
      await syncDeckTypes();
      await computeDeckTypeCards();
      deckTypes = await loadDecks();
    }

    const rankRows = await queryAll<{ name: string; rank: number; games: number; wins: number }>(pool,
      `SELECT COALESCE(display_name, deck_name) AS name, rank, games, wins FROM deck_rank_stats`);

    const grouped: Record<string, any[]> = { '0': [], '1': [], '2': [], '3': [], rogue: [], tournament_only: [] };

    if (rankRows.length === 0) {
      // No ladder data yet (fresh database, or Untapped down since the first sync):
      // fall back to Master Duel Meta's tournament tiers so the page is not empty.
      for (const d of deckTypes) {
        const key = d.tier != null ? String(d.tier) : 'rogue';
        (grouped[key] ??= []).push({
          id: d.id, name: d.name, tier: d.tier, power: d.power, power_trend: d.power_trend,
          pop_rank: d.pop_rank, win_rate: null, play_rate: null,
          thumbnail_image: d.thumbnail_image || cardsOf(d)[0]?.image || null,
          cards: cardsOf(d),
        });
      }
      cache.set(sel.key, { at: Date.now(), data: grouped });
      return res.json(grouped);
    }

    const rows: RankRow[] = rankRows.map((r) => ({ deck: r.name, rank: r.rank, games: r.games, wins: r.wins }));
    const meta = sel.kind === 'all' ? computeMetaAdjusted(rows, ALL_RANKS[0], ALL_RANKS[ALL_RANKS.length - 1])
      : computeMeta(rows, sel.ranks);

    // MDM row for each ladder deck: an exact name match beats a renamed one; engine
    // aggregates ("Elfnote Engine") are not decks and never match.
    const mdmByKey = new Map<string, { row: DeckRow; exact: boolean }>();
    for (const d of deckTypes) {
      if (isEngineAggregate(d.name)) continue;
      const k = deckKey(d.name);
      const exact = d.name.trim().toLowerCase() === k;
      const cur = mdmByKey.get(k);
      if (!cur || (exact && !cur.exact) || (exact === cur.exact && (d.power ?? 0) > (cur.row.power ?? 0))) {
        mdmByKey.set(k, { row: d, exact });
      }
    }

    const ladderKeys = new Set(rankRows.map((r) => deckKey(r.name)));
    for (const e of meta.entries) {
      const mdm = mdmByKey.get(deckKey(e.deck))?.row;
      const key = e.tier != null ? String(e.tier) : 'rogue';
      grouped[key].push(buildEntry(e, e.deck, mdm));
    }

    // Decks that win tournaments but have no ladder data at all (e.g. a deck too new or too
    // niche for Untapped's tracker): shown apart so they are not mistaken for ladder meta.
    for (const d of deckTypes) {
      if (isEngineAggregate(d.name) || (d.power ?? 0) < 2 || ladderKeys.has(deckKey(d.name))) continue;
      const cards = cardsOf(d);
      grouped.tournament_only.push({
        id: d.id, name: d.name, tier: null, power: d.power, power_trend: d.power_trend,
        pop_rank: d.pop_rank, win_rate: null, play_rate: null,
        thumbnail_image: d.thumbnail_image || cards[0]?.image || null, cards,
      });
    }

    // Tiers 1-2 are ordered by how sure we are the deck is better than average; the rest by presence.
    for (const t of ['1', '2']) grouped[t].sort((a, b) => b.edge_floor - a.edge_floor);
    for (const t of ['3', 'rogue']) grouped[t].sort((a, b) => b.play_rate - a.play_rate);
    grouped.tournament_only.sort((a, b) => (b.power ?? 0) - (a.power ?? 0));

    cache.set(sel.key, { at: Date.now(), data: grouped });
    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
