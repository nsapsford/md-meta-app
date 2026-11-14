import type { Pool } from '@neondatabase/serverless';
import { queryAll, run } from '../utils/dbHelpers.js';
import { RANK_NAMES, type RankStatRow } from './untappedParse.js';

/** Below this many games at a rank, a win rate is too noisy to rank decks on (±~3.5% at 1σ). */
export const MIN_RELIABLE_GAMES = 200;

export interface RankMetaEntry {
  deck: string;
  tier: number | null;
  rank: string;
  /** Player-games with this archetype at this rank (the sample size). */
  games: number;
  games_first: number;
  games_second: number;
  /** Share of all player-games at this rank, 0–1. */
  play_rate: number;
  /** wins / games as reported, 0–1. Includes mirror matches (always 50%). */
  win_rate_raw: number;
  /** Mirror-match-corrected win rate, 0–1. Use this for ranking. */
  win_rate: number;
  /** Raw going-first / going-second win rates (not mirror-corrected), 0–1. */
  win_rate_first: number | null;
  win_rate_second: number | null;
  low_sample: boolean;
}

/**
 * Remove the mirror-match drag from a raw win rate. A mirror game adds one win
 * and one loss to the same archetype, so raw = share·0.5 + (1 − share)·wr, i.e.
 * wr = (raw − 0.5·share) / (1 − share). Assumes the opposing field has the same
 * archetype distribution as the rank as a whole. Inputs and output are 0–1.
 */
export function mirrorAdjustedWinRate(rawWinRate: number, share: number): number {
  if (!(share > 0)) return rawWinRate;
  if (share >= 1) return 0.5;
  const adjusted = (rawWinRate - 0.5 * share) / (1 - share);
  return Math.max(0, Math.min(1, adjusted));
}

/** Derive per-deck win/play rates for one rank from the stored rows of that rank. */
export function buildRankMeta(
  rows: Array<RankStatRow & { tier?: number | null }>,
  rankId: number,
  minReliableGames = MIN_RELIABLE_GAMES
): RankMetaEntry[] {
  const atRank = rows.filter((r) => r.rankId === rankId);
  const totalGames = atRank.reduce((s, r) => s + r.gamesFirst + r.gamesSecond, 0);
  if (totalGames === 0) return [];

  return atRank
    .map((r) => {
      const games = r.gamesFirst + r.gamesSecond;
      const share = games / totalGames;
      const raw = (r.winsFirst + r.winsSecond) / games;
      return {
        deck: r.archetype,
        tier: r.tier ?? null,
        rank: RANK_NAMES[rankId],
        games,
        games_first: r.gamesFirst,
        games_second: r.gamesSecond,
        play_rate: share,
        win_rate_raw: raw,
        win_rate: mirrorAdjustedWinRate(raw, share),
        win_rate_first: r.gamesFirst > 0 ? r.winsFirst / r.gamesFirst : null,
        win_rate_second: r.gamesSecond > 0 ? r.winsSecond / r.gamesSecond : null,
        low_sample: games < minReliableGames,
      };
    })
    .sort((a, b) => b.play_rate - a.play_rate);
}

export interface RankMetaResult {
  rank: string;
  rank_id: number;
  /** Unix seconds of the newest stored row, or null when nothing is stored. */
  updated_at: number | null;
  /** Total player-games at this rank across all archetypes. */
  total_games: number;
  decks: RankMetaEntry[];
}

export async function getRankMeta(pool: Pool, rankId: number): Promise<RankMetaResult> {
  const rows = await queryAll<{
    archetype: string; rank_id: number; rank: string;
    games_first: number; games_second: number; wins_first: number; wins_second: number;
    updated_at: number | null; tier: number | null;
  }>(pool,
    `SELECT s.archetype, s.rank_id, s.rank, s.games_first, s.games_second,
            s.wins_first, s.wins_second, s.updated_at, d.tier
       FROM archetype_rank_stats s
       LEFT JOIN deck_types d ON LOWER(d.name) = LOWER(s.archetype)
      WHERE s.rank_id = $1`,
    [rankId]
  );

  const decks = buildRankMeta(
    rows.map((r) => ({
      archetype: r.archetype,
      rankId: Number(r.rank_id),
      rank: r.rank,
      gamesFirst: Number(r.games_first),
      gamesSecond: Number(r.games_second),
      winsFirst: Number(r.wins_first),
      winsSecond: Number(r.wins_second),
      tier: r.tier,
    })),
    rankId
  );

  return {
    rank: RANK_NAMES[rankId],
    rank_id: rankId,
    updated_at: rows.length ? Math.max(...rows.map((r) => Number(r.updated_at ?? 0))) : null,
    total_games: decks.reduce((s, d) => s + d.games, 0),
    decks,
  };
}

/**
 * Replace the stored per-rank stats with `rows`: upsert each, then drop rows the
 * source no longer returns (an archetype that left the meta period). Does
 * nothing destructive when `rows` is empty (e.g. a failed/empty fetch).
 */
export async function storeRankStats(pool: Pool, rows: RankStatRow[]): Promise<void> {
  if (rows.length === 0) return;
  const startedAt = Math.floor(Date.now() / 1000);
  for (const r of rows) {
    await run(pool,
      `INSERT INTO archetype_rank_stats
         (archetype, rank_id, rank, games_first, games_second, wins_first, wins_second, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (archetype, rank_id) DO UPDATE SET
         rank = EXCLUDED.rank,
         games_first = EXCLUDED.games_first, games_second = EXCLUDED.games_second,
         wins_first = EXCLUDED.wins_first, wins_second = EXCLUDED.wins_second,
         updated_at = EXCLUDED.updated_at`,
      [r.archetype, r.rankId, r.rank, r.gamesFirst, r.gamesSecond, r.winsFirst, r.winsSecond, startedAt]
    );
  }
  await run(pool, 'DELETE FROM archetype_rank_stats WHERE updated_at < $1', [startedAt]);
}
