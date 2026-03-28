import { getDb, saveDb } from '../db/connection.js';
import { run, queryAll } from '../utils/dbHelpers.js';
import * as ygopd from './ygoprodeckService.js';
import * as mdm from './mdmService.js';
import * as untapped from './untappedService.js';

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
  const archetypes = await untapped.scrapeTierList();

  let updated = 0;
  for (const a of archetypes) {
    // Skip entries with no actual stat data
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

  saveDb();
  console.log(`[Sync] Updated ${updated} deck types with untapped.gg data (${archetypes.length} scraped)`);
  return archetypes.length;
}

export async function syncCardNegateEffectiveness(): Promise<number> {
  const db = getDb();
  const data = await untapped.scrapeCardNegateEffectiveness();

  let updated = 0;
  for (const { cardName, negateEffectiveness } of data) {
    const stmt = db.prepare(
      `UPDATE cards SET negate_effectiveness = ? WHERE LOWER(name) = LOWER(?)`
    );
    stmt.run([negateEffectiveness, cardName]);
    stmt.free();
    updated++;
  }

  if (data.length > 0) saveDb();
  console.log(`[Sync] Updated ${updated} cards with negate effectiveness data`);
  return updated;
}

function deriveTier(power?: number | null): number | null {
  if (power == null || power <= 0) return null;
  if (power >= 12) return 1;   // Tier 1: power >= 12 (matches MDM definition)
  if (power >= 7) return 2;    // Tier 2: 7–12 (matches MDM definition)
  if (power >= 3) return 3;    // Tier 3: 3–7 (matches MDM definition)
  return null;                 // rogue: < 3
}
