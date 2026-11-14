import type { Pool } from '@neondatabase/serverless';
import { getRankMeta, type RankMetaEntry } from './rankMeta.js';
import { getInteractionProfiles, computeInteractionDelta } from './cardInteractionService.js';
import { rankIdFromName } from './untappedParse.js';

export interface DeckInteractionSummary {
  strategy_class: string;
  hand_traps: number;
  floodgates: number;
  board_breakers: number;
  engines: { name: string; card_count: number }[];
  vs_top3_rationale: string;
}

export interface LadderEvResult {
  deck: string;
  tier: number | null;
  rank: string;
  /** Expected win rate on the ladder at `rank`: mirror-corrected, 0–1. */
  ev: number;
  /** As reported by untapped.gg (includes mirror matches), 0–1. */
  win_rate_raw: number;
  win_rate_first: number | null;
  win_rate_second: number | null;
  /** Player-games behind these numbers. */
  games: number;
  /** Share of all games at this rank, 0–1. */
  play_rate: number;
  /** Too few games for the win rate to be trusted; sorted below reliable decks. */
  low_sample: boolean;
  interaction?: DeckInteractionSummary; // populated only when reinforce=true
}

/**
 * Ladder EV — how well each tier 1–3 archetype is actually doing at a given rank
 * (default Master), measured from untapped.gg's per-rank game counts.
 *
 * This is a measured whole-field win rate, not a matchup-weighted estimate:
 * untapped.gg publishes no archetype-vs-archetype data, so none is inferred.
 * Decks with a trustworthy sample are ranked by mirror-corrected win rate;
 * low-sample decks follow, ranked the same way.
 */
export async function computeLadderEv(
  pool: Pool,
  rank: string = 'master',
  reinforce: boolean = false
): Promise<LadderEvResult[]> {
  const rankId = rankIdFromName(rank);
  if (rankId == null) throw new Error(`Unknown rank "${rank}"`);

  const meta = await getRankMeta(pool, rankId);
  const queue = meta.decks.slice(0, 3); // already sorted by play rate
  const profiles = reinforce ? await getInteractionProfiles(pool) : null;

  const interactionFor = (e: RankMetaEntry): DeckInteractionSummary | undefined => {
    const p = profiles?.[e.deck.toLowerCase()];
    if (!p) return undefined;
    let bestRationale = '', bestAbs = -1;
    for (const t of queue) {
      if (t.deck === e.deck) continue;
      const { delta, rationale } = computeInteractionDelta(p, profiles![t.deck.toLowerCase()]);
      if (rationale && Math.abs(delta) > bestAbs) { bestAbs = Math.abs(delta); bestRationale = rationale; }
    }
    return {
      strategy_class: p.strategyClass,
      hand_traps: p.handTraps,
      floodgates: p.floodgates,
      board_breakers: p.boardBreakers,
      engines: p.engines.map((x) => ({ name: x.name, card_count: x.cardCount })),
      vs_top3_rationale: bestRationale,
    };
  };

  return meta.decks
    .filter((e) => e.tier != null && e.tier <= 3)
    .map((e): LadderEvResult => ({
      deck: e.deck,
      tier: e.tier,
      rank: e.rank,
      ev: e.win_rate,
      win_rate_raw: e.win_rate_raw,
      win_rate_first: e.win_rate_first,
      win_rate_second: e.win_rate_second,
      games: e.games,
      play_rate: e.play_rate,
      low_sample: e.low_sample,
      interaction: interactionFor(e),
    }))
    .sort((a, b) => Number(a.low_sample) - Number(b.low_sample) || b.ev - a.ev);
}
