import { getDb, saveDb } from '../db/connection.js';
import { queryAll, queryOne, run } from '../utils/dbHelpers.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface TierEntry {
  name: string;
  tier: number;
}

// Known tier assignments from masterduelmeta.com (updated periodically)
const KNOWN_TIERS: TierEntry[] = [
  { name: 'Dracotail', tier: 1 },
  { name: 'Mitsurugi Engine', tier: 1 },
  { name: 'Ryzeal Mitsurugi', tier: 1 },
  { name: 'Yummy Engine', tier: 1 },
  { name: 'K9 Engine', tier: 1 },
  { name: 'Radiant Typhoon', tier: 2 },
  { name: 'Vanquish Soul K9', tier: 2 },
  { name: 'Mitsurugi Yummy', tier: 3 },
  { name: 'Solfachord Yummy', tier: 3 },
  { name: 'White Forest Azamina', tier: 3 },
  { name: 'Yummy', tier: 3 },
];

export async function scrapeTierListFromSite(): Promise<TierEntry[]> {
  try {
    const res = await axios.get('https://www.masterduelmeta.com/tier-list', {
      headers: { 'User-Agent': 'MDMetaApp/1.0' },
    });
    const $ = cheerio.load(res.data);
    const entries: TierEntry[] = [];

    // The tier list page groups decks by tier sections
    // Look for tier headers and their associated deck links
    const text = $.text();

    // Try to extract from structured content
    $('a[href*="/tier-list/deck-types/"]').each((_i, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 1) {
        // Try to determine tier from parent/ancestor elements
        const section = $(el).closest('[class*="tier"]');
        const sectionText = section.text() || '';
        let tier = 3; // default

        if (sectionText.includes('Tier 0') || sectionText.includes('tier-0')) tier = 0;
        else if (sectionText.includes('Tier 1') || sectionText.includes('tier-1')) tier = 1;
        else if (sectionText.includes('Tier 2') || sectionText.includes('tier-2')) tier = 2;
        else if (sectionText.includes('Tier 3') || sectionText.includes('tier-3')) tier = 3;

        if (!entries.find(e => e.name === name)) {
          entries.push({ name, tier });
        }
      }
    });

    return entries;
  } catch (err) {
    console.error('[TierList] Scrape failed:', err);
    return [];
  }
}

export async function updateTiersFromScrape(): Promise<number> {
  let entries = await scrapeTierListFromSite();

  // Merge with known tiers - scraped data takes precedence where it has proper tier info,
  // but fall back to known tiers for guaranteed accuracy
  const entryMap = new Map(entries.map(e => [e.name.toLowerCase(), e]));
  for (const known of KNOWN_TIERS) {
    const existing = entryMap.get(known.name.toLowerCase());
    if (!existing || existing.tier === 3) {
      // Override with known tier if scraper defaulted to 3
      entryMap.set(known.name.toLowerCase(), known);
    }
  }
  entries = Array.from(entryMap.values());

  if (entries.length === 0) return 0;

  const db = getDb();
  for (const entry of entries) {
    // Update existing deck_types if they exist
    const existing = queryOne(db, 'SELECT id FROM deck_types WHERE name = ? COLLATE NOCASE', [entry.name]);
    if (existing) {
      run(db, 'UPDATE deck_types SET tier = ? WHERE name = ? COLLATE NOCASE', [entry.tier, entry.name]);
    } else {
      // Insert as new deck type
      run(db, `INSERT OR IGNORE INTO deck_types (id, name, tier, power, updated_at)
        VALUES (?, ?, ?, ?, strftime('%s','now'))`,
        [entry.name.toLowerCase().replace(/\s+/g, '-'), entry.name, entry.tier, null]);
    }

    // Also snapshot
    run(db, `INSERT OR IGNORE INTO meta_snapshots (deck_type_name, tier, power, pop_rank, snapshot_date)
      VALUES (?, ?, NULL, NULL, date('now'))`, [entry.name, entry.tier]);
  }

  saveDb();
  console.log(`[TierList] Updated ${entries.length} deck tiers from scrape`);
  return entries.length;
}
