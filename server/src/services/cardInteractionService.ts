import type { Pool } from '@neondatabase/serverless';
import { queryAll } from '../utils/dbHelpers.js';
import { getCached, setCache } from './cacheService.js';
import { config } from '../config.js';

/**
 * Card-Interaction Reinforcement Layer.
 *
 * Builds a per-archetype "Interaction Profile" from the cards each deck actually
 * runs (top_decks composition joined to cards effect text), then derives a small,
 * bounded pairwise signal used to *reinforce* — never override — the statistical
 * matchup numbers. Profiles are deterministic (staple lists + structural rules,
 * no LLM) and cached for a sync cycle.
 */

// ── Types ──

export type StrategyClass = 'combo' | 'control' | 'aggro' | 'midrange';

export interface DeckEngine {
  name: string;        // the splashed archetype, e.g. "Snake-Eye"
  traits: string[];    // e.g. ['extender', 'disruption']
  cardCount: number;
}

export interface InteractionProfile {
  deck: string;
  handTraps: number;        // ~copies of hand-trap / disruption cards in the core list
  floodgates: number;       // ~copies of floodgate cards
  boardBreakers: number;    // ~copies of board-breaker / going-second cards
  negationWeight: number;   // 0..1, aggregated cards.negate_effectiveness over the core list
  engines: DeckEngine[];
  strategyClass: StrategyClass;
  coreCardCount: number;
}

export interface InteractionResult {
  delta: number;       // bounded [-MAX_DELTA, MAX_DELTA]; A's win-rate adjustment vs B
  rationale: string;   // human-readable explanation of the dominant term ('' if none)
}

export const MAX_DELTA = 0.05;

// ── Classification data (Master Duel staples, lowercased) ──

const HAND_TRAPS = new Set([
  'ash blossom & joyous spring', 'maxx "c"', 'nibiru, the primal being',
  'effect veiler', 'ghost ogre & snow rabbit', 'ghost belle & haunted mansion',
  'droll & lock bird', 'd.d. crow', 'infinite impermanence', 'skull meister',
  'psy-frame gamma', 'fantastical dragon phantazmay', 'dimension shifter',
  'artifact lancea', 'gnomaniac', 'mulcharmy fuwalos', 'mulcharmy purulia',
  'bystial magnamhut', 'retaliating "c"',
]);

const FLOODGATES = new Set([
  'skill drain', 'there can be only one', 'dimensional barrier',
  'anti-spell fragrance', 'macro cosmos', 'rivalry of warlords', 'gozen match',
  'summon limit', "vanity's emptiness", 'mistake', 'necrovalley',
  'dimensional fissure', 'imperial order', 'secret village of the spellcasters',
  'floodgate trap hole', 'ice dragon\'s prison',
]);

const BOARD_BREAKERS = new Set([
  'lightning storm', 'dark ruler no more', 'evenly matched', 'forbidden droplet',
  'raigeki', "harpie's feather duster", 'cosmic cyclone', 'triple tactics talent',
  'triple tactics thrust', 'dark hole', 'lava golem', 'super polymerization',
  'kaiju', 'gameciel, the sea turtle kaiju', 'thunder king, the lightningstrike kaiju',
  'evenly', 'feather duster',
]);

const HAND_TRAP_RE = /\(quick effect\)|you can discard this card|during your opponent's/i;
const FLOODGATE_RE = /cannot (be |special )?summon|neither player can|cannot activate|is unaffected|skip your/i;
const BOARD_BREAKER_RE = /destroy all|send all .* to the (gy|graveyard)|banish all|all (monsters|cards) (your opponent|on the field)/i;
const SPECIAL_SUMMON_RE = /special summon/i;

interface CardMeta {
  type: string | null;
  race: string | null;
  description: string | null;
  archetype: string | null;
  negate: number; // negate_effectiveness, 0 if null
}

type CardCategory = 'handTrap' | 'floodgate' | 'boardBreaker' | null;

function classifyCard(name: string, meta: CardMeta | undefined): CardCategory {
  const n = name.toLowerCase();
  if (HAND_TRAPS.has(n)) return 'handTrap';
  if (FLOODGATES.has(n)) return 'floodgate';
  if (BOARD_BREAKERS.has(n) || [...BOARD_BREAKERS].some((b) => n.includes(b))) return 'boardBreaker';

  if (!meta) return null;
  const desc = meta.description ?? '';
  const type = (meta.type ?? '').toLowerCase();
  const race = (meta.race ?? '').toLowerCase();
  const isSpellTrap = type.includes('spell') || type.includes('trap');

  // Floodgate: continuous spell/trap that locks the game
  if (isSpellTrap && race === 'continuous' && FLOODGATE_RE.test(desc)) return 'floodgate';
  // Board breaker: mass removal / going-second
  if (isSpellTrap && BOARD_BREAKER_RE.test(desc)) return 'boardBreaker';
  // Hand trap: monster that acts from hand on the opponent's turn
  if (type.includes('monster') && HAND_TRAP_RE.test(desc)) return 'handTrap';
  return null;
}

// ── Composition aggregation ──

interface CoreCard {
  name: string;
  typicalCopies: number;
  fraction: number; // share of the deck's lists containing it
  fromExtra: boolean;
}

const CORE_FRACTION = 0.33; // a card is "core" if it appears in >= 1/3 of recent lists
const ENGINE_MIN_CARDS = 3;
const RECENT_LISTS_PER_DECK = 30;

interface RawTopDeck { deck_type_name: string; main_deck_json: string | null; extra_deck_json: string | null }

/** Aggregate recent decklists per deck_type into core-card lists. */
function aggregateComposition(rows: RawTopDeck[]): Map<string, { core: CoreCard[]; lists: number }> {
  // deckType -> { lists, cardName -> { amountSum, listCount, fromExtra } }
  const byDeck = new Map<string, { lists: number; cards: Map<string, { amountSum: number; listCount: number; fromExtra: boolean }> }>();

  for (const row of rows) {
    const deck = row.deck_type_name;
    if (!deck) continue;
    let entry = byDeck.get(deck);
    if (!entry) { entry = { lists: 0, cards: new Map() }; byDeck.set(deck, entry); }
    entry.lists++;

    const parse = (json: string | null, fromExtra: boolean) => {
      if (!json) return;
      let arr: Array<{ cardName?: string; amount?: number }> = [];
      try { arr = JSON.parse(json); } catch { return; }
      const seen = new Set<string>();
      for (const c of arr) {
        const name = c.cardName;
        if (!name || name === 'Unknown') continue;
        const key = name.toLowerCase();
        const amount = c.amount || 1;
        const rec = entry!.cards.get(key) ?? { amountSum: 0, listCount: 0, fromExtra };
        rec.amountSum += amount;
        if (!seen.has(key)) { rec.listCount++; seen.add(key); }
        rec.fromExtra = rec.fromExtra || fromExtra;
        entry!.cards.set(key, rec);
      }
    };
    parse(row.main_deck_json, false);
    parse(row.extra_deck_json, true);
  }

  const result = new Map<string, { core: CoreCard[]; lists: number }>();
  for (const [deck, entry] of byDeck) {
    const core: CoreCard[] = [];
    for (const [name, rec] of entry.cards) {
      const fraction = rec.listCount / entry.lists;
      if (fraction < CORE_FRACTION) continue;
      core.push({
        name,
        typicalCopies: Math.max(1, Math.round(rec.amountSum / rec.listCount)),
        fraction,
        fromExtra: rec.fromExtra,
      });
    }
    result.set(deck, { core, lists: entry.lists });
  }
  return result;
}

// ── Profile construction ──

function buildProfile(
  deck: string,
  core: CoreCard[],
  cardMap: Map<string, CardMeta>,
  engineArchetypeCounts: Map<string, number>,
): InteractionProfile {
  let handTraps = 0, floodgates = 0, boardBreakers = 0;
  let negSum = 0, negCount = 0;
  let extraCount = 0, monsterCount = 0, ssMonsters = 0, trapCount = 0;

  // primary archetype = most common archetype among core cards
  const archCounts = new Map<string, number>();

  for (const c of core) {
    const meta = cardMap.get(c.name);
    const cat = classifyCard(c.name, meta);
    if (cat === 'handTrap') handTraps += c.typicalCopies;
    else if (cat === 'floodgate') floodgates += c.typicalCopies;
    else if (cat === 'boardBreaker') boardBreakers += c.typicalCopies;

    if (meta) {
      if (meta.negate > 0) { negSum += meta.negate * c.typicalCopies; negCount += c.typicalCopies; }
      const type = (meta.type ?? '').toLowerCase();
      if (type.includes('monster')) {
        monsterCount++;
        if (SPECIAL_SUMMON_RE.test(meta.description ?? '')) ssMonsters++;
      }
      if (type.includes('trap')) trapCount++;
      if (meta.archetype) archCounts.set(meta.archetype, (archCounts.get(meta.archetype) ?? 0) + 1);
    }
    if (c.fromExtra) extraCount++;
  }

  const negationWeight = negCount > 0 ? Math.min(1, negSum / negCount) : 0;

  // primary archetype
  let primary: string | null = null, primaryN = 0;
  for (const [a, n] of archCounts) if (n > primaryN) { primary = a; primaryN = n; }

  // engines = non-primary archetype clusters that recur across >= 2 deck_types
  const engines: DeckEngine[] = [];
  for (const [arch, n] of archCounts) {
    if (arch === primary || n < ENGINE_MIN_CARDS) continue;
    if ((engineArchetypeCounts.get(arch) ?? 0) < 2) continue;
    const traits: string[] = [];
    if (extraCount > 0) traits.push('extender');
    engines.push({ name: arch, traits, cardCount: n });
  }
  engines.sort((a, b) => b.cardCount - a.cardCount);

  // strategy class (coarse, explainable)
  const ssDensity = monsterCount > 0 ? ssMonsters / monsterCount : 0;
  let strategyClass: StrategyClass = 'midrange';
  if (floodgates >= 3 || (trapCount >= 8 && negationWeight >= 0.4)) strategyClass = 'control';
  else if (extraCount >= 10 && ssDensity >= 0.5) strategyClass = 'combo';
  else if (extraCount <= 3 && monsterCount >= 10 && ssDensity < 0.35) strategyClass = 'aggro';

  return {
    deck,
    handTraps, floodgates, boardBreakers,
    negationWeight,
    engines: engines.slice(0, 3),
    strategyClass,
    coreCardCount: core.length,
  };
}

// ── Public API ──

let memo: { at: number; data: Record<string, InteractionProfile> } | null = null;
const MEMO_MS = 5 * 60 * 1000;

/** Drops the in-process memo so the next call re-reads api_cache or recomputes. */
export function invalidateInteractionProfiles() {
  memo = null;
}

/** Per-deck Interaction Profiles, keyed by lowercased deck name. Cached. */
export async function getInteractionProfiles(pool: Pool): Promise<Record<string, InteractionProfile>> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.data;

  const cacheKey = 'interaction:profiles:v1';
  const cached = await getCached<Record<string, InteractionProfile>>(cacheKey);
  if (cached) { memo = { at: Date.now(), data: cached }; return cached; }

  const data = await computeInteractionProfiles(pool);
  await setCache(cacheKey, data, config.cache.tierListTtl);
  memo = { at: Date.now(), data };
  return data;
}

async function computeInteractionProfiles(pool: Pool): Promise<Record<string, InteractionProfile>> {
  // Recent lists per deck_type (window-limited, mirrors computeDeckTypeCards)
  const rows = await queryAll<RawTopDeck>(pool,
    `SELECT deck_type_name, main_deck_json, extra_deck_json FROM (
       SELECT deck_type_name, main_deck_json, extra_deck_json,
              ROW_NUMBER() OVER (PARTITION BY LOWER(deck_type_name) ORDER BY created_at DESC) AS rn
       FROM top_decks WHERE main_deck_json IS NOT NULL
     ) t WHERE rn <= $1`,
    [RECENT_LISTS_PER_DECK]
  );
  if (rows.length === 0) return {};

  const composition = aggregateComposition(rows);

  // Fetch only the cards that actually appear in the core lists
  const neededNames = new Set<string>();
  for (const { core } of composition.values()) for (const c of core) neededNames.add(c.name);
  const cardMap = new Map<string, CardMeta>();
  if (neededNames.size > 0) {
    const cardRows = await queryAll<{
      name: string; type: string | null; race: string | null;
      description: string | null; archetype: string | null; negate_effectiveness: number | null;
    }>(pool,
      `SELECT name, type, race, description, archetype, negate_effectiveness
       FROM cards WHERE LOWER(name) = ANY($1::text[])`,
      [[...neededNames]]
    );
    for (const r of cardRows) {
      cardMap.set(r.name.toLowerCase(), {
        type: r.type, race: r.race, description: r.description,
        archetype: r.archetype, negate: r.negate_effectiveness ?? 0,
      });
    }
  }

  // Count how many deck_types each archetype forms a cluster in (for engine detection)
  const engineArchetypeCounts = new Map<string, number>();
  for (const { core } of composition.values()) {
    const archInDeck = new Map<string, number>();
    for (const c of core) {
      const a = cardMap.get(c.name)?.archetype;
      if (a) archInDeck.set(a, (archInDeck.get(a) ?? 0) + 1);
    }
    for (const [a, n] of archInDeck) if (n >= ENGINE_MIN_CARDS) {
      engineArchetypeCounts.set(a, (engineArchetypeCounts.get(a) ?? 0) + 1);
    }
  }

  const profiles: Record<string, InteractionProfile> = {};
  for (const [deck, { core }] of composition) {
    profiles[deck.toLowerCase()] = buildProfile(deck, core, cardMap, engineArchetypeCounts);
  }
  return profiles;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Bounded pairwise interaction signal — A's win-rate adjustment vs B.
 * Returns delta in [-MAX_DELTA, MAX_DELTA] plus the dominant rationale.
 */
export function computeInteractionDelta(a: InteractionProfile | undefined, b: InteractionProfile | undefined): InteractionResult {
  if (!a || !b) return { delta: 0, rationale: '' };
  let delta = 0;
  const reasons: Array<{ w: number; text: string }> = [];
  const aDisruption = a.handTraps + a.floodgates;
  const bDisruption = b.handTraps + b.floodgates;

  if (b.strategyClass === 'combo' && aDisruption >= 6) {
    delta += 0.03; reasons.push({ w: 0.03, text: `${a.handTraps} hand traps + ${a.floodgates} floodgates disrupt ${b.deck}'s combo` });
  } else if (b.strategyClass === 'combo' && aDisruption >= 3) {
    delta += 0.015; reasons.push({ w: 0.015, text: `disruption suite pressures ${b.deck}'s combo` });
  }
  if (a.floodgates >= 2 && b.strategyClass === 'combo') {
    delta += 0.015; reasons.push({ w: 0.015, text: `${a.floodgates} floodgates choke ${b.deck}'s Special Summons` });
  }
  if (a.boardBreakers >= 2 && b.strategyClass === 'control') {
    delta += 0.02; reasons.push({ w: 0.02, text: `${a.boardBreakers} board breakers punch through ${b.deck}'s floodgates` });
  }
  if (a.strategyClass === 'combo' && bDisruption >= 6) {
    delta -= 0.03; reasons.push({ w: 0.03, text: `${b.deck}'s ${b.handTraps} hand traps + ${b.floodgates} floodgates hurt ${a.deck}'s combo` });
  }
  if (a.strategyClass === 'aggro' && b.strategyClass === 'control') {
    delta -= 0.015; reasons.push({ w: 0.015, text: `${b.deck} grinds out ${a.deck}'s aggression` });
  }
  if (a.strategyClass === 'control' && b.strategyClass === 'aggro') {
    delta += 0.015; reasons.push({ w: 0.015, text: `${a.deck} grinds out ${b.deck}'s aggression` });
  }
  if (a.negationWeight - b.negationWeight > 0.3) {
    delta += 0.01; reasons.push({ w: 0.01, text: `heavier interaction (negation) than ${b.deck}` });
  }

  delta = clamp(delta, -MAX_DELTA, MAX_DELTA);
  reasons.sort((x, y) => y.w - x.w);
  return { delta, rationale: reasons[0]?.text ?? '' };
}
