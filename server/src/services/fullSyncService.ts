import {
  syncCards, syncArchetypes, syncDeckTypes, syncTopDecks,
  syncTournaments, syncUntapped, syncCardNegateEffectiveness, computeDeckTypeCards,
} from './syncService.js';
import { updateTiersFromScrape } from './tierListService.js';
import { recordSync, SyncSource } from './syncStatusService.js';
import { clearCache } from './cacheService.js';
import { invalidateInteractionProfiles } from './cardInteractionService.js';
import { invalidateTierListCache, warmTierListCache } from '../routes/tierList.js';
import { invalidateFeaturedCache, warmFeaturedCache } from '../routes/decks.js';

export interface FullSyncResult {
  cards: number | null;
  deckTypes: number | null;
  topDecks: number | null;
  tournaments: number | null;
  untappedArchetypes: number | null;
  cardNegateEffectiveness: number | null;
  computedDeckTypeCards: number | null;
  /** Per-stage failures, so a partial run still reports what broke. */
  errors: { stage: string; message: string }[];
}

const msg = (err: unknown) => String((err as any)?.message || err);

/**
 * Full sync of every upstream source plus the derived data built on top of it.
 *
 * Stage order is load-bearing:
 *  - syncDeckTypes nulls tier/power, so updateTiersFromScrape has to follow it.
 *  - computeDeckTypeCards reads cards + deck_types + top_decks.
 *  - syncCardNegateEffectiveness reads deck_types.win_rate, which only syncUntapped fills.
 *  - Caches are invalidated at the very end: doing it up front lets a request
 *    arriving mid-sync re-warm them with pre-sync data.
 *
 * Each stage is isolated so one failing source doesn't cost us the others, and
 * every source calls recordSync either way — the client derives its "new data
 * available" fingerprint from those timestamps.
 */
export async function runFullSync(): Promise<FullSyncResult> {
  const result: FullSyncResult = {
    cards: null, deckTypes: null, topDecks: null, tournaments: null,
    untappedArchetypes: null, cardNegateEffectiveness: null,
    computedDeckTypeCards: null, errors: [],
  };

  const stage = async (name: string, fn: () => Promise<void>, source?: SyncSource) => {
    try {
      await fn();
      if (source) await recordSync(source, 'success');
    } catch (err) {
      result.errors.push({ stage: name, message: msg(err) });
      console.error(`[FullSync] ${name} failed:`, err);
      if (source) await recordSync(source, 'failed', msg(err));
    }
  };

  console.log('[FullSync] Starting full sync of all sources...');

  // ── Raw sources ──

  await stage('ygoprodeck', async () => {
    // The upstream card dump is cached in api_cache for 24h; without clearing it
    // a scheduled sync just re-reads the same blob and writes nothing new.
    await clearCache('ygopd');
    result.cards = await syncCards();
    await syncArchetypes();
  }, 'ygoprodeck');

  await stage('mdm_deck_types', async () => {
    await clearCache('mdm');
    result.deckTypes = await syncDeckTypes();
    result.topDecks = await syncTopDecks();
    await updateTiersFromScrape();
  }, 'mdm_deck_types');

  await stage('mdm_tournaments', async () => {
    result.tournaments = await syncTournaments();
  }, 'mdm_tournaments');

  await stage('untapped', async () => {
    await clearCache('untapped');
    result.untappedArchetypes = await syncUntapped();
  }, 'untapped');

  // ── Derived data, built from the sources above ──

  await stage('computeDeckTypeCards', async () => {
    result.computedDeckTypeCards = await computeDeckTypeCards();
  });

  await stage('cardNegateEffectiveness', async () => {
    result.cardNegateEffectiveness = await syncCardNegateEffectiveness();
  });

  await stage('interactionProfiles', async () => {
    // Not matched by the 'mdm'/'untapped' clears above — different key prefix.
    await clearCache('interaction:');
    invalidateInteractionProfiles();
  });

  // ── Serve the new data ──

  await stage('cacheRefresh', async () => {
    invalidateTierListCache();
    invalidateFeaturedCache();
    await warmTierListCache();
    await warmFeaturedCache();
  });

  console.log(
    result.errors.length === 0
      ? '[FullSync] Complete'
      : `[FullSync] Complete with ${result.errors.length} failed stage(s): ${result.errors.map((e) => e.stage).join(', ')}`
  );

  return result;
}
