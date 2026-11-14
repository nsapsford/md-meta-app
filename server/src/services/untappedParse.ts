// Pure parsing of untapped.gg's `archetypes_by_rank_v3` response. No I/O, so it
// can be unit-tested against a small fixture of the raw payload.
//
// Shape of one archetype entry (verified against the live endpoint):
//
//   { "ALL": [gf, gs, wf, ws], "2": [...], "3": [...], ..., "7": [...], "tier": 2 }
//
// Every value is [games_first, games_second, wins_first, wins_second], counted
// per *player* (a game appears once for each side's archetype).
//
// The numeric keys "2".."7" are RANK BUCKETS (Bronze … Master), NOT opponent
// archetype ids — the endpoint is "archetypes by rank". Their ids merely
// collide with ids in the archetype manifest (e.g. "5" is both Platinum and the
// Bystial archetype), which previously made them look like opponents. The
// mapping below is taken from untapped.gg's own client bundle. Rookie (1) is not
// returned by the endpoint.

export type GameCounts = [number, number, number, number]; // [games_first, games_second, wins_first, wins_second]

export interface ArchetypeStats {
  ALL: GameCounts;
  tier: number | null;
  [key: string]: unknown;
}

export interface ManifestEntry {
  arch_name: string;
  type: number;
  type_name: string;
}

/** rank_id 0 is our own id for the "ALL" aggregate; 1–7 are untapped.gg's rank ids. */
export const ALL_RANKS_ID = 0;

export const RANK_NAMES: Readonly<Record<number, string>> = {
  [ALL_RANKS_ID]: 'all',
  1: 'rookie',
  2: 'bronze',
  3: 'silver',
  4: 'gold',
  5: 'platinum',
  6: 'diamond',
  7: 'master',
};

export function rankIdFromName(name: string): number | null {
  const lower = name.toLowerCase();
  for (const [id, n] of Object.entries(RANK_NAMES)) {
    if (n === lower) return Number(id);
  }
  return null;
}

export interface RankStatRow {
  archetype: string;
  rankId: number;
  rank: string;
  gamesFirst: number;
  gamesSecond: number;
  winsFirst: number;
  winsSecond: number;
}

function asCounts(v: unknown): GameCounts | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  if (!v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
  return v as GameCounts;
}

/**
 * Flatten the response into one row per (archetype, rank). Keys that are not a
 * known rank bucket (`tier`, anything new) are ignored — they are never
 * interpreted as opponents.
 */
export function parseRankStats(
  statsData: Record<string, ArchetypeStats>,
  manifestData: Record<string, ManifestEntry>
): RankStatRow[] {
  const rows: RankStatRow[] = [];

  for (const [archId, arch] of Object.entries(statsData)) {
    const archetype = manifestData[archId]?.arch_name;
    if (!archetype) continue;

    for (const [key, value] of Object.entries(arch)) {
      const rankId = key === 'ALL' ? ALL_RANKS_ID : /^\d+$/.test(key) ? Number(key) : null;
      if (rankId == null || RANK_NAMES[rankId] === undefined) continue;

      const counts = asCounts(value);
      if (!counts) continue;
      const [gamesFirst, gamesSecond, winsFirst, winsSecond] = counts;
      if (gamesFirst + gamesSecond === 0) continue;

      rows.push({ archetype, rankId, rank: RANK_NAMES[rankId], gamesFirst, gamesSecond, winsFirst, winsSecond });
    }
  }

  return rows;
}
