/**
 * Ladder meta tiers, computed from Untapped's per-rank win/play data instead of scraped
 * or hard-coded. "Meta" here means two measured things:
 *
 *  - presence: the deck's share of games in the chosen ranks
 *  - strength: its win rate minus the average tracker user's win rate in those same
 *    ranks (the "edge"), with a 95% confidence floor so small samples cannot rank.
 *
 * Win rates are raw (mirror matches are included), which pulls every deck slightly
 * toward 50% but does not change the ordering between decks of similar share.
 */

export interface RankRow {
  deck: string;
  rank: number; // Untapped rank bucket: 2 = Bronze ... 7 = Master
  games: number; // one entry per player per game
  wins: number;
}

export interface MetaEntry {
  deck: string;
  games: number;
  /** Shown win rate, in percent (raw, or Untapped-adjusted for the all-ranks view). */
  winRate: number;
  /** Share of all games in the selected ranks, in percent. */
  share: number;
  /** Win rate minus the pool average, in percentage points. */
  edge: number;
  /** Lower bound of the 95% interval on `edge`, in percentage points. */
  floor: number;
  tier: 1 | 2 | 3 | null;
}

export interface MetaResult {
  /** Average win rate of the pool, in percent. */
  baseline: number;
  totalGames: number;
  entries: MetaEntry[];
}

/** Ranks the "ladder" view uses by default: Diamond and Master. */
export const LADDER_RANKS = [6, 7];
export const ALL_RANKS = [2, 3, 4, 5, 6, 7];
/** Decks with fewer games than this in the selection are not listed at all. */
export const MIN_GAMES = 500;
/** Presence needed for a tier: 1 and 2 need real presence, 3 is "common but unproven". */
export const MIN_SHARE_T12 = 1.0;
export const MIN_SHARE_T3 = 1.5;
/** Edge floor (percentage points) for Tier 1. Tier 2 needs the floor above zero. */
export const TIER1_FLOOR = 1.5;

export function assignTier(share: number, floor: number): 1 | 2 | 3 | null {
  if (share >= MIN_SHARE_T12 && floor >= TIER1_FLOOR) return 1;
  if (share >= MIN_SHARE_T12 && floor > 0) return 2;
  if (share >= MIN_SHARE_T3) return 3;
  return null;
}

interface DeckAgg {
  deck: string;
  games: number; // games used for the win rate and its interval
  wins: number;
  shareGames: number; // games used for presence
}

/** Core: turn per-deck aggregates into entries. Exported for the all-ranks view and tests. */
export function entriesFromAggregates(aggs: DeckAgg[]): MetaResult {
  const totalGames = aggs.reduce((n, a) => n + a.games, 0);
  const totalShare = aggs.reduce((n, a) => n + a.shareGames, 0);
  const baseRate = totalGames > 0 ? aggs.reduce((n, a) => n + a.wins, 0) / totalGames : 0.5;

  const entries: MetaEntry[] = [];
  for (const a of aggs) {
    if (a.shareGames < MIN_GAMES || a.games <= 0) continue;
    const p = a.wins / a.games;
    const se = Math.sqrt((p * (1 - p)) / a.games);
    const share = totalShare > 0 ? (a.shareGames / totalShare) * 100 : 0;
    const edge = (p - baseRate) * 100;
    const floor = (p - 1.96 * se - baseRate) * 100;
    entries.push({
      deck: a.deck,
      games: a.shareGames,
      winRate: p * 100,
      share,
      edge,
      floor,
      tier: assignTier(share, floor),
    });
  }
  return { baseline: baseRate * 100, totalGames: totalShare, entries };
}

/** Raw win rates over the given ranks (default: Diamond + Master). */
export function computeMeta(rows: RankRow[], ranks: number[] = LADDER_RANKS): MetaResult {
  const want = new Set(ranks);
  const by = new Map<string, DeckAgg>();
  for (const r of rows) {
    if (!want.has(r.rank)) continue;
    const key = r.deck.toLowerCase();
    const a = by.get(key) ?? { deck: r.deck, games: 0, wins: 0, shareGames: 0 };
    a.games += r.games;
    a.wins += r.wins;
    a.shareGames += r.games;
    by.set(key, a);
  }
  return entriesFromAggregates([...by.values()]);
}

/**
 * Untapped's own "adjusted win rate" for a rank range, ported from their tier-list page.
 * It stops a deck that is mostly played in low ranks from looking better than it is: below
 * a deck's most-played rank, the rate is capped at the worst rate it has at or above it, and
 * a rank holding under 10% of its games counts as 40%.
 * Returns pseudo-counts so the same interval maths applies; checked against the site's
 * displayed numbers (see the test).
 */
export function adjustedCounts(
  perRank: Map<number, { games: number; wins: number }>,
  lo = 2,
  hi = 7
): { games: number; wins: number } {
  const get = (p: number) => perRank.get(p) ?? { games: 0, wins: 0 };
  let total = 0;
  for (let p = lo; p <= hi; p++) total += get(p).games;
  if (total === 0) return { games: 0, wins: 0 };

  // Rank with the most games (first one wins a tie, as in the site's loop)
  let main = lo;
  let mainGames = -1;
  for (let p = lo; p <= hi; p++) {
    if (get(p).games > mainGames) { main = p; mainGames = get(p).games; }
  }

  const rate = (p: number) => {
    const s = get(p);
    if (s.games === 0) return 0;
    return s.games / total < 0.1 ? 0.4 : s.wins / s.games;
  };

  const adj = new Map<number, { games: number; wins: number }>();
  let G = 0;
  let W = 0;
  for (let p = 2; p <= 7; p++) {
    const s = get(p);
    if (s.games === 0) continue;
    let k = p > main ? rate(p) : s.wins / s.games;
    if (p < main) for (let b = main; b <= hi; b++) k = Math.min(k, rate(b));
    const prev = adj.get(p - 1)?.games ?? 0;
    const games = Math.max(s.games, prev);
    adj.set(p, { games, wins: games * k });
  }
  for (let p = lo; p <= hi; p++) {
    const a = adj.get(p);
    if (a) { G += a.games; W += a.wins; }
  }
  return { games: G, wins: W };
}

/** All-ranks view using Untapped's adjusted win rates; presence still uses raw games. */
export function computeMetaAdjusted(rows: RankRow[], lo = 2, hi = 7): MetaResult {
  const by = new Map<string, { deck: string; ranks: Map<number, { games: number; wins: number }> }>();
  for (const r of rows) {
    const key = r.deck.toLowerCase();
    const e = by.get(key) ?? { deck: r.deck, ranks: new Map() };
    const cur = e.ranks.get(r.rank) ?? { games: 0, wins: 0 };
    cur.games += r.games;
    cur.wins += r.wins;
    e.ranks.set(r.rank, cur);
    by.set(key, e);
  }
  const aggs: DeckAgg[] = [];
  for (const e of by.values()) {
    let raw = 0;
    for (let p = lo; p <= hi; p++) raw += e.ranks.get(p)?.games ?? 0;
    const adj = adjustedCounts(e.ranks, lo, hi);
    aggs.push({ deck: e.deck, games: adj.games, wins: adj.wins, shareGames: raw });
  }
  return entriesFromAggregates(aggs);
}
