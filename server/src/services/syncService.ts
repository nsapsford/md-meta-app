import axios from 'axios';
import { getDb, saveDb } from '../db/connection.js';
import { run, queryAll } from '../utils/dbHelpers.js';
import * as ygopd from './ygoprodeckService.js';
import * as mdm from './mdmService.js';
import * as untapped from './untappedService.js';
import { getValidAccessToken, invalidateToken } from './untappedAuthService.js';

export async function syncCards(): Promise<number> {
  const db = getDb();
  const cards = await ygopd.getAllCards();

  for (const c of cards) {
    const img = c.card_images?.[0];
    const banMd = c.banlist_info?.ban_masterduel || null;
    const mdRarity = c.misc_info?.[0]?.md_rarity || null;
    run(db, `INSERT OR REPLACE INTO cards (id, name, type, frame_type, description, atk, def, level, race, attribute, archetype, link_val, link_markers, scale, image_url, image_small_url, image_cropped_url, ban_status_md, md_rarity, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
      [c.id, c.name, c.type, c.frameType, c.desc,
       c.atk ?? null, c.def ?? null, c.level ?? null,
       c.race, c.attribute ?? null, c.archetype ?? null,
       c.linkval ?? null, c.linkmarkers ? JSON.stringify(c.linkmarkers) : null,
       c.scale ?? null,
       img?.image_url ?? null, img?.image_url_small ?? null, img?.image_url_cropped ?? null,
       banMd, mdRarity]);
  }

  saveDb();
  console.log(`[Sync] Synced ${cards.length} cards`);
  return cards.length;
}

export async function syncArchetypes(): Promise<number> {
  const db = getDb();
  const archetypes = await ygopd.getArchetypes();
  for (const name of archetypes) {
    run(db, 'INSERT OR IGNORE INTO archetypes (name) VALUES (?)', [name]);
  }
  saveDb();
  return archetypes.length;
}

export async function syncDeckTypes(): Promise<number> {
  const db = getDb();
  const deckTypes = await mdm.getDeckTypes();

  const toStr = (v: any) => v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const toNum = (v: any) => v == null ? null : typeof v === 'number' ? v : Number(v) || null;

  // Reset tier/power for all decks — the loop below will restore values for active decks.
  // This ensures stale decks from old metas don't pollute the tier list.
  run(db, `UPDATE deck_types SET tier = NULL, power = NULL, power_trend = NULL`);

  for (const d of deckTypes) {
    // Normalize field names — MDM API uses tournamentPower, avgUrPrice, thumbnailImage, parsedOverview
    const power = toNum(d.tournamentPower ?? d.power);
    const powerTrend = toNum(d.tournamentPowerTrend ?? d.powerTrend);
    const thumbnailImage = toStr(d.thumbnailImage ?? d.image);
    const overview = toStr(d.parsedOverview ?? d.overview);
    const avgUrPrice = toNum(d.avgUrPrice ?? d.avgURPrice);
    const avgSrPrice = toNum(d.avgSrPrice ?? d.avgSRPrice);
    // Use deckBreakdown or tournamentStats (prefer tournamentStats as it has real data)
    const breakdown = d.tournamentStats ?? d.deckBreakdown ?? null;

    // Always derive tier from power — MDM's tier field can be inconsistent
    const tier = deriveTier(power);

    // Use INSERT OR IGNORE + UPDATE to preserve untapped.gg win_rate/play_rate data
    run(db, `INSERT OR IGNORE INTO deck_types (id, name) VALUES (?, ?)`, [d._id, d.name]);
    run(db, `UPDATE deck_types SET
        name = ?, tier = ?, power = ?, power_trend = ?, pop_rank = ?,
        master_pop_rank = ?, overview = ?, thumbnail_image = ?, avg_ur_price = ?,
        avg_sr_price = ?, breakdown_json = ?, updated_at = strftime('%s','now')
      WHERE id = ?`,
      [d.name, tier, power, powerTrend,
       d.popRank ?? null, d.masterPopRank ?? null, overview,
       thumbnailImage, avgUrPrice, avgSrPrice,
       breakdown ? JSON.stringify(breakdown) : null, d._id]);

    if (power != null && power > 0) {
      run(db, `INSERT OR REPLACE INTO meta_snapshots (deck_type_name, tier, power, pop_rank, snapshot_date)
        VALUES (?, ?, ?, ?, date('now'))`,
        [d.name, tier, power, d.masterPopRank ?? null]);
    }
  }

  // Remove duplicate deck_types: for each name, keep the MDM entry (has power/tier)
  // and delete slug-based duplicates created by old scraper or untapped sync
  const dupes = queryAll(db,
    `SELECT name FROM deck_types GROUP BY LOWER(name) HAVING COUNT(*) > 1`
  );
  for (const d of dupes) {
    // Keep the entry with highest power, or the one with a non-slug ID (MDM IDs are hex ObjectIds)
    const entries = queryAll(db,
      `SELECT id, power FROM deck_types WHERE LOWER(name) = LOWER(?) ORDER BY power DESC NULLS LAST`,
      [d.name]
    );
    if (entries.length > 1) {
      // Keep the first (best) entry, delete the rest
      const keepId = entries[0].id;
      for (const e of entries.slice(1)) {
        run(db, `DELETE FROM deck_types WHERE id = ?`, [e.id]);
      }
    }
  }

  // Scrape MDM website for authoritative power values (includes engine aggregations)
  try {
    const scraped = await mdm.scrapeTierList();
    const scrapedMap = new Map(scraped.map(s => [s.name.toLowerCase(), s]));

    // Update existing decks with scraped power values (more current than API)
    for (const s of scraped) {
      const existing = queryAll(db, `SELECT id FROM deck_types WHERE LOWER(name) = LOWER(?)`, [s.name]);
      const tier = deriveTier(s.power);

      if (existing.length > 0) {
        // Update power/tier to match website
        run(db, `UPDATE deck_types SET power = ?, tier = ?, updated_at = strftime('%s','now') WHERE LOWER(name) = LOWER(?)`,
          [s.power, tier, s.name]);
      } else {
        // Engine deck not in API — create a new entry
        const id = `scraped-${s.name.toLowerCase().replace(/\s+/g, '-')}`;
        run(db, `INSERT OR IGNORE INTO deck_types (id, name) VALUES (?, ?)`, [id, s.name]);
        run(db, `UPDATE deck_types SET tier = ?, power = ?, updated_at = strftime('%s','now') WHERE id = ?`,
          [tier, s.power, id]);
      }

      // Snapshot for meta trends
      if (s.power > 0) {
        run(db, `INSERT OR REPLACE INTO meta_snapshots (deck_type_name, tier, power, pop_rank, snapshot_date)
          VALUES (?, ?, ?, NULL, date('now'))`,
          [s.name, tier, s.power]);
      }
    }

    console.log(`[Sync] Applied ${scraped.length} scraped power values from MDM website`);
  } catch (err: any) {
    console.warn(`[Sync] MDM scrape failed (non-fatal): ${err.message}`);
  }

  // Clean up stale snapshots:
  // - null/zero power entries
  // - decks no longer in the active tiered meta (must have tier assigned)
  run(db, `DELETE FROM meta_snapshots WHERE power IS NULL OR power <= 0`);
  run(db, `DELETE FROM meta_snapshots WHERE deck_type_name NOT IN (
    SELECT name FROM deck_types WHERE tier IS NOT NULL
  )`);

  saveDb();
  console.log(`[Sync] Synced ${deckTypes.length} deck types`);
  return deckTypes.length;
}

export async function syncTopDecks(): Promise<number> {
  const db = getDb();
  const decks = await mdm.getTopDecks();

  for (const d of decks as any[]) {
    try {
      const toStr = (v: any) => v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const toNum = (v: any) => v == null ? null : typeof v === 'number' ? v : Number(v) || null;

      const deckTypeName = typeof d.deckType === 'object' ? d.deckType?.name : d.deckType;
      const authorName = typeof d.author === 'object' ? d.author?.username : d.author;

      // MDM API uses main/extra/side with {card: {name, rarity}, amount} format
      // Normalize to {cardName, amount, rarity}
      const normalizeDeck = (arr: any[]) => arr?.map((entry: any) => ({
        cardName: entry.card?.name || entry.cardName || 'Unknown',
        amount: entry.amount || 1,
        rarity: entry.card?.rarity || entry.rarity || null,
      }));

      const mainDeck = d.main || d.mainDeck;
      const extraDeck = d.extra || d.extraDeck;
      const sideDeck = d.side || d.sideDeck;

      run(db, `INSERT OR REPLACE INTO top_decks (id, deck_type_name, author, main_deck_json, extra_deck_json, side_deck_json, tournament_name, tournament_placement, ranked_type, created_at, gems_price, ur_price, sr_price, url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
        [toStr(d._id), toStr(deckTypeName), toStr(authorName),
         mainDeck ? JSON.stringify(normalizeDeck(mainDeck)) : null,
         extraDeck ? JSON.stringify(normalizeDeck(extraDeck)) : null,
         sideDeck ? JSON.stringify(normalizeDeck(sideDeck)) : null,
         toStr(d.tournamentName), toStr(d.tournamentPlacement),
         toStr(d.rankedType), toStr(d.created || d.createdAt),
         toNum(d.gemsPrice), toNum(d.urPrice), toNum(d.srPrice),
         toStr(d.url)]);
    } catch (e) {
      // Skip individual decks that fail
    }
  }

  saveDb();
  console.log(`[Sync] Synced ${decks.length} top decks`);
  return decks.length;
}

export async function syncTournaments(): Promise<number> {
  const db = getDb();
  const tournaments = await mdm.getTournaments();

  for (const t of tournaments) {
    try {
      const toStr = (v: any) => v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const rawBanner = t.bannerImage ?? null;
      const bannerImage = typeof rawBanner === 'string' && rawBanner.startsWith('/')
        ? `https://www.masterduelmeta.com${rawBanner}`
        : rawBanner;

      run(db, `INSERT OR REPLACE INTO tournaments (id, name, short_name, banner_image, next_date, placements_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
        [toStr(t._id), toStr(t.name), toStr(t.shortName),
         bannerImage, toStr(t.nextDate),
         t.placements ? JSON.stringify(t.placements) : null]);
    } catch (e) {
      // Skip individual tournaments that fail
    }
  }

  saveDb();
  return tournaments.length;
}

export async function syncUntapped(): Promise<number> {
  const db = getDb();
  const [archetypes, matchupPairings] = await Promise.all([
    untapped.scrapeTierList(),
    untapped.getMatchupPairings(),
  ]);

  let updated = 0;
  for (const a of archetypes) {
    if (a.winRate === null && a.playRate === null) continue;
    run(db,
      `UPDATE deck_types SET
         win_rate = COALESCE(?, win_rate),
         play_rate = COALESCE(?, play_rate),
         sample_size = COALESCE(?, sample_size),
         untapped_tier = COALESCE(?, untapped_tier),
         updated_at = strftime('%s','now')
       WHERE LOWER(name) = LOWER(?)`,
      [a.winRate, a.playRate, a.sampleSize, a.tier, a.name]
    );
    updated++;
  }

  // Store per-matchup win rates in matchup_sources and legacy matchups table
  let matchupsStored = 0;
  for (const p of matchupPairings) {
    run(db,
      `INSERT OR REPLACE INTO matchup_sources (deck_a, deck_b, source, win_rate, sample_size, updated_at)
       VALUES (LOWER(?), LOWER(?), 'untapped', ?, ?, strftime('%s','now'))`,
      [p.deckA, p.deckB, p.winRate, p.sampleSize]
    );
    // Also populate legacy matchups table (win_rate_a stored as 0-100 percentage)
    run(db,
      `INSERT OR REPLACE INTO matchups (deck_a, deck_b, win_rate_a, sample_size, updated_at)
       VALUES (LOWER(?), LOWER(?), ?, ?, strftime('%s','now'))`,
      [p.deckA, p.deckB, Math.round(p.winRate * 1000) / 10, p.sampleSize]
    );
    matchupsStored++;
  }

  saveDb();
  console.log(`[Sync] Updated ${updated} deck types and ${matchupsStored} matchup pairings with untapped.gg data`);
  return archetypes.length;
}

interface RealNegateEntry {
  cardId: number;
  negatedWinRate: number;
  notNegatedWinRate: number;
  negateEffectiveness: number;
  sampleSize: number;
}

/**
 * Attempts to fetch real per-card negate data from the Untapped.gg companion API.
 * Requires the Untapped Companion app to be installed and authenticated.
 * Returns null if unavailable (caller falls back to local computation).
 */
async function fetchRealNegateData(): Promise<RealNegateEntry[] | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  try {
    console.log('[Sync] Fetching real negate data from untapped.gg card_impact_analysis...');
    const res = await axios.get(
      'https://api.ygom.untapped.gg/api/v1/analytics/query/card_impact_analysis',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const raw = res.data?.data ?? res.data;

    if (!raw || (Array.isArray(raw) && raw.length === 0) || (typeof raw === 'object' && Object.keys(raw).length === 0)) {
      console.warn('[Sync] card_impact_analysis returned empty data — feature flag may not be enabled for this account');
      return null;
    }

    const entries: RealNegateEntry[] = [];
    // Response is keyed by card ID (numeric string), e.g. { "3401": { playedAnd... }, ... }
    for (const [idStr, item] of Object.entries(raw) as [string, any][]) {
      const cardId = parseInt(idStr, 10);
      if (!cardId) continue;

      const negatedWins = item.playedAndNegatedWins ?? 0;
      const negatedTotal = item.playedAndNegatedTotal ?? 0;
      const notNegatedWins = item.playedAndNotNegatedWins ?? 0;
      const notNegatedTotal = item.playedAndNotNegatedTotal ?? 0;

      if (negatedTotal === 0 || notNegatedTotal === 0) continue;

      const negatedWinRate = Math.round((negatedWins / negatedTotal) * 1000) / 10;
      const notNegatedWinRate = Math.round((notNegatedWins / notNegatedTotal) * 1000) / 10;
      const negateEffectiveness = Math.round((notNegatedWinRate - negatedWinRate) * 10) / 10;
      const sampleSize = negatedTotal + notNegatedTotal;

      entries.push({ cardId, negatedWinRate, notNegatedWinRate, negateEffectiveness, sampleSize });
    }

    console.log(`[Sync] Fetched real negate data for ${entries.length} cards from untapped.gg`);
    return entries.length > 0 ? entries : null;
  } catch (err: any) {
    if (err.response?.status === 401) {
      console.warn('[Sync] 401 from card_impact_analysis — invalidating token, will retry with refresh next run');
      invalidateToken();
    } else if (err.response?.status === 403) {
      console.warn('[Sync] 403 from card_impact_analysis — feature flag uc.ygom-card-impact-stats may not be enabled on this account');
    } else {
      console.warn('[Sync] card_impact_analysis request failed:', err.message);
    }
    return null;
  }
}

/**
 * Syncs card negate effectiveness. Tries the Untapped.gg companion API first
 * (real per-card negate tracking data). Falls back to local computation from
 * archetype win rates if the companion is unavailable or the feature flag is off.
 */
export async function syncCardNegateEffectiveness(): Promise<number> {
  const db = getDb();

  // Attempt to use real per-card data from the Untapped Companion API
  const realData = await fetchRealNegateData();
  if (realData) {
    let updated = 0;
    for (const entry of realData) {
      const stmt = db.prepare(
        `UPDATE cards SET
          negate_effectiveness = ?,
          negated_win_rate = ?,
          not_negated_win_rate = ?,
          negate_sample_size = ?
        WHERE id = ?`
      );
      stmt.run([entry.negateEffectiveness, entry.negatedWinRate, entry.notNegatedWinRate, entry.sampleSize, entry.cardId]);
      stmt.free();
      updated++;
    }
    if (updated > 0) saveDb();
    console.log(`[Sync] Updated ${updated} cards with real negate data from untapped.gg`);
    return updated;
  }

  console.log('[Sync] Falling back to local negate computation from archetype win rates');

  // Get all deck types with untapped win rate data
  const deckTypes = queryAll(db,
    `SELECT name, win_rate, sample_size FROM deck_types WHERE win_rate IS NOT NULL AND sample_size IS NOT NULL AND sample_size > 0`
  ) as Array<{ name: string; win_rate: number; sample_size: number }>;

  if (deckTypes.length === 0) {
    console.log('[Sync] No deck type win rate data available — skipping card negate computation');
    return 0;
  }

  // Build a map of archetype name -> { winRate, sampleSize }
  const archMap = new Map<string, { winRate: number; sampleSize: number }>();
  let totalWeightedWr = 0;
  let totalSamples = 0;
  for (const dt of deckTypes) {
    archMap.set(dt.name.toLowerCase(), { winRate: dt.win_rate, sampleSize: dt.sample_size });
    totalWeightedWr += dt.win_rate * dt.sample_size;
    totalSamples += dt.sample_size;
  }
  const overallAvgWr = totalSamples > 0 ? totalWeightedWr / totalSamples : 50;

  // Get all top decks with their card lists
  const topDecks = queryAll(db,
    `SELECT deck_type_name, main_deck_json, extra_deck_json FROM top_decks WHERE main_deck_json IS NOT NULL`
  ) as Array<{ deck_type_name: string; main_deck_json: string; extra_deck_json: string | null }>;

  // For each card, accumulate weighted win rate data across archetypes
  const cardStats = new Map<string, { weightedWr: number; totalSamples: number; archetypes: Set<string> }>();

  // Helper: find best matching archetype for a deck type name
  // e.g. "Vanquish Soul K9" should match "Vanquish Soul"
  const resolveArch = (deckTypeName: string): { winRate: number; sampleSize: number } | undefined => {
    const lower = deckTypeName.toLowerCase();
    // Exact match first
    const exact = archMap.get(lower);
    if (exact) return exact;
    // Try finding a deck_type whose name is contained in the deck_type_name
    let bestMatch: { winRate: number; sampleSize: number } | undefined;
    let bestLen = 0;
    for (const [name, data] of archMap) {
      if (lower.includes(name) && name.length > bestLen) {
        bestMatch = data;
        bestLen = name.length;
      }
    }
    return bestMatch;
  };

  for (const deck of topDecks) {
    const archName = deck.deck_type_name?.toLowerCase();
    if (!archName) continue;
    const archData = resolveArch(deck.deck_type_name);
    if (!archData) continue;

    // Parse card lists from main + extra deck
    const cardNames = new Set<string>();
    for (const json of [deck.main_deck_json, deck.extra_deck_json]) {
      if (!json) continue;
      try {
        const cards = JSON.parse(json) as Array<{ cardName: string; amount: number }>;
        for (const c of cards) {
          if (c.cardName) cardNames.add(c.cardName.toLowerCase());
        }
      } catch { /* skip malformed json */ }
    }

    for (const cardName of cardNames) {
      let stats = cardStats.get(cardName);
      if (!stats) {
        stats = { weightedWr: 0, totalSamples: 0, archetypes: new Set() };
        cardStats.set(cardName, stats);
      }
      // Only count each archetype once per card (not per deck)
      if (!stats.archetypes.has(archName)) {
        stats.archetypes.add(archName);
        stats.weightedWr += archData.winRate * archData.sampleSize;
        stats.totalSamples += archData.sampleSize;
      }
    }
  }

  // Update cards with computed negate effectiveness
  let updated = 0;
  for (const [cardName, stats] of cardStats) {
    if (stats.totalSamples < 100) continue; // skip very low sample sizes

    const cardAvgWr = stats.weightedWr / stats.totalSamples;
    const impact = Math.round((cardAvgWr - overallAvgWr) * 10) / 10;

    // not_negated_win_rate: win rate of decks using this card
    const notNegatedWr = Math.round(cardAvgWr * 10) / 10;
    // negated_win_rate: estimate as overall average (what happens when the card is neutralized)
    const negatedWr = Math.round(overallAvgWr * 10) / 10;

    const stmt = db.prepare(
      `UPDATE cards SET
        negate_effectiveness = ?,
        negated_win_rate = ?,
        not_negated_win_rate = ?,
        negate_sample_size = ?
      WHERE LOWER(name) = LOWER(?)`
    );
    stmt.run([impact, negatedWr, notNegatedWr, stats.totalSamples, cardName]);
    stmt.free();
    updated++;
  }

  if (updated > 0) saveDb();
  console.log(`[Sync] Computed negate effectiveness for ${updated} cards (overall avg WR: ${overallAvgWr.toFixed(1)}%)`);
  return updated;
}

function deriveTier(power?: number | null): number | null {
  if (power == null || power <= 0) return null;
  if (power >= 12) return 1;   // Tier 1: power >= 12 (matches MDM definition)
  if (power >= 7) return 2;    // Tier 2: 7–12 (matches MDM definition)
  if (power >= 3) return 3;    // Tier 3: 3–7 (matches MDM definition)
  return null;                 // rogue: < 3
}
