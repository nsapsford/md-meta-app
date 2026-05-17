import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection.js';
import { queryAll, queryOne } from '../utils/dbHelpers.js';
import { syncDeckTypes } from '../services/syncService.js';

// In-memory process cache — instant lookup, no DB round-trip
let memCache: Record<string, any[]> | null = null;
let memCacheAt = 0;
const MEM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cached archetype→cards map (large dataset, rarely changes)
let archetypeCardsCache: Map<string, Set<string>> | null = null;
let archetypeCardsCacheAt = 0;
const ARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function invalidateTierListCache() {
  memCache = null;
  archetypeCardsCache = null;
}

export async function warmTierListCache(): Promise<void> {
  if (memCache && (Date.now() - memCacheAt) < MEM_CACHE_TTL_MS) return;
  const { default: axios } = await import('axios');
  const port = process.env.PORT || 3000;
  await axios.get(`http://localhost:${port}/api/tier-list`, { timeout: 30000 });
  console.log('[Warmup] tier-list cache built');
}

// Manual overrides for MDM deck names → YGOProDeck archetype keys
const ARCHETYPE_OVERRIDES: Record<string, string[]> = {
  'vanquish soul k9': ['vanquish soul'],
  'solfachord yummy': ['solfachord'],
  'mitsurugi yummy': ['mitsurugi'],
  'crystron k9': ['crystron'],
  'white forest azamina': ['white forest', 'azamina'],
  'ryzeal mitsurugi': ['ryzeal', 'mitsurugi'],
  'dinos': ['dinomorphia', 'dinosaur'],
  'earth machine': ['machina', 'infinitrack'],
  'zombies': ['zombie'],
  'telefon combo': ['telefon'],
  // Engine aggregations from MDM website
  'mitsurugi engine': ['mitsurugi'],
  'yummy engine': ['yummy'],
  'k9 engine': ['k9'],
};

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Serve from in-memory cache — zero DB round-trips
    if (memCache && (Date.now() - memCacheAt) < MEM_CACHE_TTL_MS) {
      return res.json(memCache);
    }

    const pool = getPool();
    let deckTypes = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');

    if (deckTypes.length === 0) {
      await syncDeckTypes();
      deckTypes = await queryAll(pool, 'SELECT * FROM deck_types ORDER BY tier ASC, power DESC');
    }

    // --- BATCH 1: archetype→card mappings (process-cached for 30 min) ---
    if (!archetypeCardsCache || (Date.now() - archetypeCardsCacheAt) > ARCH_CACHE_TTL_MS) {
      const allArchCards = await queryAll(pool,
        `SELECT name, archetype FROM cards WHERE archetype IS NOT NULL AND archetype != ''`
      );
      archetypeCardsCache = new Map<string, Set<string>>();
      for (const c of allArchCards) {
        const key = (c.archetype as string).toLowerCase();
        if (!archetypeCardsCache.has(key)) archetypeCardsCache.set(key, new Set());
        archetypeCardsCache.get(key)!.add(c.name as string);
      }
      archetypeCardsCacheAt = Date.now();
    }
    const archetypeCards = archetypeCardsCache;

    // --- BATCH 2: load top 20 decks for ALL deck types in one query ---
    const allTopDecks = await queryAll(pool,
      `SELECT deck_type_name, main_deck_json FROM (
         SELECT deck_type_name, main_deck_json,
                ROW_NUMBER() OVER (PARTITION BY LOWER(deck_type_name) ORDER BY created_at DESC) AS rn
         FROM top_decks
         WHERE main_deck_json IS NOT NULL
       ) t WHERE rn <= 20`
    );
    // Group by deck name (lowercased)
    const topDecksByName = new Map<string, Array<{ main_deck_json: string }>>();
    for (const row of allTopDecks) {
      const k = (row.deck_type_name as string).toLowerCase();
      if (!topDecksByName.has(k)) topDecksByName.set(k, []);
      topDecksByName.get(k)!.push(row);
    }

    // --- PASS 1: compute top 3 card names per deck (CPU-only, no DB) ---
    const deckTopCardNames = new Map<string, string[]>(); // deck id → card names
    for (const d of deckTypes) {
      const deckNameLower = (d.name as string).toLowerCase();
      const deckArchetypeNames = new Set<string>();

      const overrideKeys = ARCHETYPE_OVERRIDES[deckNameLower];
      if (overrideKeys) {
        for (const ok of overrideKeys) {
          const cardSet = archetypeCards.get(ok);
          if (cardSet) for (const name of cardSet) deckArchetypeNames.add(name);
        }
      }
      if (deckArchetypeNames.size === 0) {
        for (const [archKey, cardSet] of archetypeCards) {
          if (deckNameLower.includes(archKey) || archKey.includes(deckNameLower)) {
            for (const name of cardSet) deckArchetypeNames.add(name);
          }
        }
      }

      const topDecks = topDecksByName.get(deckNameLower) ?? [];
      const freq = new Map<string, number>();
      for (const td of topDecks) {
        try {
          const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
          for (const c of cards) {
            if (c.cardName && c.cardName !== 'Unknown' && deckArchetypeNames.has(c.cardName)) {
              freq.set(c.cardName, (freq.get(c.cardName) || 0) + 1);
            }
          }
        } catch { /* skip */ }
      }
      // Fallback: use all cards if archetype match gave nothing
      if (freq.size === 0) {
        for (const td of topDecks) {
          try {
            const cards = JSON.parse(td.main_deck_json) as Array<{ cardName: string; amount: number }>;
            for (const c of cards) {
              if (c.cardName && c.cardName !== 'Unknown') {
                freq.set(c.cardName, (freq.get(c.cardName) || 0) + (c.amount || 1));
              }
            }
          } catch { /* skip */ }
        }
      }

      let topNames = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);

      // Fuzzy fallback if still empty
      if (topNames.length === 0 && deckArchetypeNames.size > 0) {
        topNames = [...deckArchetypeNames].slice(0, 3);
      }
      if (topNames.length === 0) {
        const deckWords = deckNameLower.split(/[\s\-]+/).filter((w: string) => w.length >= 3);
        let bestMatch: string | null = null, bestScore = 0;
        for (const [archKey] of archetypeCards) {
          const archWords = archKey.split(/[\s\-]+/);
          const score = deckWords.filter((w: string) => archWords.some((aw: string) => aw.includes(w) || w.includes(aw))).length;
          if (score > bestScore) { bestScore = score; bestMatch = archKey; }
        }
        if (bestMatch && bestScore > 0) {
          topNames = [...archetypeCards.get(bestMatch)!].slice(0, 3);
        }
      }

      deckTopCardNames.set(d.id as string, topNames);
    }

    // --- BATCH 3: load all card images in ONE query ---
    const allCardNamesNeeded = new Set<string>();
    for (const names of deckTopCardNames.values()) {
      for (const n of names) allCardNamesNeeded.add(n.toLowerCase());
    }
    const cardImageMap = new Map<string, { name: string; image: string | null }>();
    if (allCardNamesNeeded.size > 0) {
      const nameArr = [...allCardNamesNeeded];
      const placeholders = nameArr.map((_, i) => `$${i + 1}`).join(',');
      const cardRows = await queryAll(pool,
        `SELECT name, image_cropped_url, image_small_url FROM cards
         WHERE LOWER(name) IN (${placeholders})
           AND (image_cropped_url IS NOT NULL OR image_small_url IS NOT NULL)`,
        nameArr
      );
      for (const row of cardRows) {
        cardImageMap.set((row.name as string).toLowerCase(), {
          name: row.name as string,
          image: (row.image_cropped_url || row.image_small_url || null) as string | null,
        });
      }
    }

    // --- PASS 2: assemble response (CPU-only) ---
    const grouped: Record<string, any[]> = { '0': [], '1': [], '2': [], '3': [], rogue: [] };
    for (const d of deckTypes) {
      const key = d.tier != null ? String(d.tier) : 'rogue';
      if (!grouped[key]) grouped[key] = [];

      const topNames = deckTopCardNames.get(d.id as string) ?? [];
      const cards: Array<{ name: string; image: string | null }> = [];
      for (const n of topNames) {
        const info = cardImageMap.get(n.toLowerCase());
        if (info) cards.push(info);
        if (cards.length >= 3) break;
      }

      grouped[key].push({
        id: d.id,
        name: d.name,
        tier: d.tier,
        power: d.power,
        power_trend: d.power_trend,
        pop_rank: d.pop_rank,
        win_rate: d.win_rate,
        play_rate: d.play_rate,
        thumbnail_image: d.thumbnail_image || (cards.length > 0 ? cards[0].image : null),
        cards,
        // breakdown_json intentionally omitted — only needed in /decks/:name
      });
    }

    memCache = grouped;
    memCacheAt = Date.now();
    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
