// Rule-based line checker. Plays a line's plan forward on a simple card
// ledger (hand / deck / extra / field / GY / banished) and reports what can't
// be true: cards that aren't in the deck, cards used from a zone they aren't
// in, more copies than you run, once-per-turn effects reused, a second Normal
// Summon, wrong Link/Xyz/Synchro materials, summon restrictions ignored, and
// end boards the plan never builds.
//
// It is not a rules engine: it doesn't know chains, timing or most effect
// conditions. Anything it can't judge confidently is a warning, not an error,
// so it never blocks a line that's actually fine. The real engine
// (ocgcore) can be added later as another LineVerifier.
import {
  ANY_CARD, UNKNOWN_CARD, ZONES,
  type CheckIssue, type DeckCard, type DeckContext, type GeneratedLine, type PlanActivation,
  type PlanSummon, type Zone,
} from './types.js';

const ATTRIBUTES = ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
const EXTRA_KINDS = ['Fusion', 'Synchro', 'Xyz', 'Link'];

export const normName = (s: string) =>
  s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const isMonster = (c: DeckCard) => /Monster/.test(c.type);
const isSpellTrap = (c: DeckCard) => /Spell|Trap/.test(c.type);
const isExtraType = (c: DeckCard) => /Fusion|Synchro|XYZ|Xyz|Link/.test(c.type);
const isLink = (c: DeckCard) => /Link/.test(c.type);
const isTuner = (c: DeckCard) => /Tuner/.test(c.type);
const stays = (c: DeckCard) => /Continuous|Field|Equip/.test(c.race ?? '');
const isWild = (name: string) => name === ANY_CARD || name === UNKNOWN_CARD;
const isToken = (name: string) => /\btoken\b/i.test(name);

/** First line of an Extra Deck monster's text is its material requirement. */
const materialLine = (c: DeckCard) => c.text.split('\n')[0] ?? '';

// ── Once-per-turn rules parsed from card text ──

export interface OptRules {
  eachEffectOnce: boolean;   // "You can only use each effect of X once per turn"
  oneEffectPerTurn: boolean; // "You can only use 1 of the following effects of X per turn"
  activateOnce: boolean;     // "You can only activate 1 X per turn"
}

export function optRules(c: DeckCard): OptRules {
  const t = c.text;
  return {
    eachEffectOnce: /You can only use (?:each|each of the following) effects? of "[^"]+" once per turn|You can only use (?:this|the previous) effect of "[^"]+" once per turn/i.test(t),
    oneEffectPerTurn: /You can only use 1 (?:of the following effects of "[^"]+"|"[^"]+" effect) per turn/i.test(t),
    activateOnce: /You can only activate 1 "[^"]+" per turn/i.test(t),
  };
}

// ── "except X monsters" style predicates ──

/** Does a monster match a phrase like "DARK Spellcaster", "LIGHT or DARK", "Fusion"? */
export function matchesPhrase(c: DeckCard, phrase: string): boolean | null {
  const alternatives = phrase.split(/\s+or\s+|,\s*/).map((a) => a.trim()).filter(Boolean);
  let understood = false;
  for (const alt of alternatives) {
    const words = alt.split(/\s+/).filter((w) => w !== 'monster' && w !== 'monsters');
    let all = true;
    for (const w of words) {
      if (ATTRIBUTES.includes(w)) { understood = true; if (c.attribute !== w) all = false; }
      else if (EXTRA_KINDS.some((k) => k.toLowerCase() === w.toLowerCase())) {
        understood = true; if (!new RegExp(w, 'i').test(c.type)) all = false;
      } else if (/^[A-Z][a-z-]+$/.test(w)) { understood = true; if (c.race !== w) all = false; }
      else return null; // a word we don't model: can't judge
    }
    if (all && words.length > 0) return true;
  }
  return understood ? false : null;
}

interface SummonLock { from: string; scope: 'all' | 'extra'; phrase: string }

/** "you cannot Special Summon monsters (from the Extra Deck), except X monsters" */
export function parseSummonLock(c: DeckCard): SummonLock | null {
  const m = /cannot Special Summon(?: any)?(?: monsters)?( from the Extra Deck)?,? except ([^.;()]+?) monsters?/i.exec(c.text);
  if (!m) return null;
  return { from: c.name, scope: m[1] ? 'extra' : 'all', phrase: m[2].trim() };
}

const locksSummonedEffects = (c: DeckCard) =>
  /(?:cannot|neither player can) activate (?:their|its) effects this turn|its effects are negated|their effects are negated/i.test(c.text);

// ── The ledger ──

class Ledger {
  zones: Record<Zone, Map<string, number>>;
  wildInHand = 0;

  constructor() {
    this.zones = Object.fromEntries(ZONES.map((z) => [z, new Map<string, number>()])) as Record<Zone, Map<string, number>>;
  }
  count(zone: Zone, key: string) { return this.zones[zone].get(key) ?? 0; }
  add(zone: Zone, key: string, n = 1) { this.zones[zone].set(key, this.count(zone, key) + n); }
  take(zone: Zone, key: string): boolean {
    const n = this.count(zone, key);
    if (n <= 0) return false;
    if (n === 1) this.zones[zone].delete(key); else this.zones[zone].set(key, n - 1);
    return true;
  }
  where(key: string): Zone[] { return ZONES.filter((z) => this.count(z, key) > 0); }
}

export function checkLineLedger(line: GeneratedLine, ctx: DeckContext): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const err = (step: number | null, message: string) => issues.push({ severity: 'error', step, source: 'ledger', message });
  const warn = (step: number | null, message: string) => issues.push({ severity: 'warning', step, source: 'ledger', message });

  const byName = new Map<string, DeckCard>();
  for (const c of [...ctx.main, ...ctx.extra]) byName.set(normName(c.name), c);
  const allNames = [...byName.values()].map((c) => c.name);
  const suggest = (name: string) => {
    const n = normName(name);
    const hits = allNames.filter((a) => normName(a).includes(n) || n.includes(normName(a))).slice(0, 2);
    return hits.length ? ` (did you mean ${hits.map((h) => `"${h}"`).join(' or ')}?)` : '';
  };
  const resolve = (name: string, step: number | null): DeckCard | null => {
    const c = byName.get(normName(name));
    if (!c) err(step, `"${name}" isn't in your deck${suggest(name)}.`);
    return c ?? null;
  };
  const extraNormalAllowed = [...byName.values()].some((c) => /additional Normal Summon/i.test(c.text));

  const L = new Ledger();
  for (const c of ctx.main) L.add('deck', c.name, c.copies);
  for (const c of ctx.extra) L.add('extra', c.name, c.copies);

  // Opening hand: the first card of each starter slot, plus any free cards.
  if (line.starters.length === 0) err(null, 'No starter cards: say which cards this line needs in hand.');
  for (const slot of line.starters) {
    if (slot.length === 0) { err(null, 'An empty starter slot.'); continue; }
    for (const name of slot) {
      const c = resolve(name, null);
      if (c && c.zone === 'extra') err(null, `"${c.name}" is an Extra Deck card, so it can't be a starter.`);
    }
    const first = byName.get(normName(slot[0]));
    if (first && first.zone === 'main') {
      if (!L.take('deck', first.name)) err(null, `The starters need more copies of "${first.name}" than you run.`);
      else L.add('hand', first.name);
    }
  }
  L.wildInHand = Math.max(0, line.freeCards ?? 0);
  const handSize = line.starters.length + L.wildInHand;
  if (handSize > 6) warn(null, `This line needs ${handSize} specific cards in hand; an opening hand has 5 (6 going second).`);

  let normalSummons = 0;
  const effectUses = new Map<string, number[]>(); // card -> effect indexes used
  const activations = new Map<string, number>();  // card -> activations count
  const locks: SummonLock[] = [];
  const effectLocked = new Set<string>();          // cards that can't activate effects this turn

  const moveCard = (step: number, name: string, from: Zone, to: Zone, why: string) => {
    if (isWild(name)) {
      if (from !== 'hand' && !(name === UNKNOWN_CARD && from === 'deck')) {
        err(step, `"${name}" stands for an unknown card in hand; it can't come from the ${from}.`);
        return;
      }
      if (from === 'hand') {
        if (L.wildInHand <= 0) { err(step, `${why}: no spare card in hand to use.`); return; }
        L.wildInHand--;
      }
      if (to === 'hand') L.wildInHand++;
      return;
    }
    const c = resolve(name, step);
    if (!c) return;
    if (!L.take(from, c.name)) {
      const at = L.where(c.name);
      err(step, `${why}: "${c.name}" isn't in your ${zoneLabel(from)}${at.length ? ` (it's in your ${at.map(zoneLabel).join(', ')})` : ' (no copies left)'}.`);
      return;
    }
    L.add(to, c.name);
  };

  const checkSummonRules = (step: number, s: PlanSummon, card: DeckCard) => {
    for (const lock of locks) {
      if (lock.scope === 'extra' && s.from !== 'extra' && !isExtraType(card)) continue;
      if (s.method === 'normal' || s.method === 'tribute') continue;
      const ok = matchesPhrase(card, lock.phrase);
      if (ok === false) err(step, `"${card.name}" breaks "${lock.from}"'s restriction (only ${lock.phrase} monsters can be Special Summoned).`);
      if (ok === null) warn(step, `Check "${card.name}" against "${lock.from}"'s summon restriction (${lock.phrase}).`);
    }
  };

  const checkMaterials = (step: number, s: PlanSummon, card: DeckCard, mats: DeckCard[]) => {
    const line0 = materialLine(card);
    const n = mats.length;
    const count = /^(\d+)(\+)?/.exec(line0);
    if (s.method === 'link') {
      const rating = card.linkRating ?? 0;
      const maxValue = mats.reduce((sum, m) => sum + (isLink(m) ? (m.linkRating ?? 1) : 1), 0);
      if (n > rating || maxValue < rating) err(step, `"${card.name}" is Link-${rating}, but these ${n} material(s) can't add up to ${rating}.`);
      if (count && !count[2] && n !== Number(count[1])) err(step, `"${card.name}" needs exactly ${count[1]} materials (${line0}).`);
      if (count && n < Number(count[1])) err(step, `"${card.name}" needs at least ${count[1]} materials (${line0}).`);
      if (/non-Link/i.test(line0) && mats.some(isLink)) err(step, `"${card.name}" can't use Link Monsters as material (${line0}).`);
      if (/Effect Monsters/i.test(line0)) {
        for (const m of mats) if (/Normal Monster/.test(m.type)) err(step, `"${m.name}" is a Normal Monster; "${card.name}" needs Effect Monsters.`);
      }
      if (/different names/i.test(line0) && new Set(mats.map((m) => m.name)).size !== n) err(step, `"${card.name}" needs materials with different names.`);
      const incl = /including an? ([A-Za-z ]+?) monster/i.exec(line0);
      if (incl) {
        const any = mats.map((m) => matchesPhrase(m, incl[1]));
        if (any.every((v) => v === false)) err(step, `"${card.name}" needs ${incl[0].replace(/^including /i, '')} among its materials.`);
      }
    } else if (s.method === 'xyz') {
      const xm = /^(\d+)(\+)? Level (\d+) monsters/i.exec(line0);
      if (xm) {
        const need = Number(xm[1]); const lvl = Number(xm[3]);
        if (n < need || (!xm[2] && n !== need)) err(step, `"${card.name}" needs ${xm[2] ? 'at least ' : ''}${need} materials (${line0}).`);
        for (const m of mats) {
          if (m.level == null) warn(step, `Can't check "${m.name}"'s Level for "${card.name}".`);
          else if (m.level !== lvl && !/treat(?:ed)? .*Level/i.test(m.text)) err(step, `"${m.name}" is Level ${m.level}; "${card.name}" needs Level ${lvl} monsters.`);
        }
      } else warn(step, `Couldn't read "${card.name}"'s Xyz materials (${line0}); check them by hand.`);
    } else if (s.method === 'synchro') {
      const tuners = mats.filter(isTuner);
      const canTreat = /treat 1 .* as a Tuner/i.test(card.text);
      if (tuners.length > 1) err(step, `"${card.name}" takes exactly 1 Tuner, not ${tuners.length}.`);
      if (tuners.length === 0 && !canTreat) err(step, `"${card.name}" needs a Tuner among its materials.`);
      if (mats.every((m) => m.level != null) && card.level != null) {
        const sum = mats.reduce((t, m) => t + (m.level ?? 0), 0);
        if (sum !== card.level) err(step, `Material Levels add up to ${sum}, but "${card.name}" is Level ${card.level}.`);
      } else warn(step, `Can't check all material Levels for "${card.name}".`);
      const nt = /non-Tuner ([A-Za-z ]+?) monsters/i.exec(line0);
      if (nt && !/^\s*$/.test(nt[1])) {
        const nonTuners = canTreat && tuners.length === 0 ? mats.slice(1) : mats.filter((m) => !isTuner(m));
        for (const m of nonTuners) {
          const ok = matchesPhrase(m, nt[1]);
          if (ok === false) err(step, `"${m.name}" isn't a valid non-Tuner for "${card.name}" (${line0}).`);
        }
      }
    } else if (s.method === 'fusion') {
      // Only components that are a single named card are hard requirements;
      // '"A" or 1 Dragon monster' has an unnamed alternative we can't judge.
      const named = line0.split(/\s\+\s/)
        .map((part) => part.trim())
        .filter((part) => /^"[^"]+"$/.test(part))
        .map((part) => part.slice(1, -1));
      for (const want of named) {
        const ok = mats.some((m) => normName(m.name) === normName(want)
          || new RegExp(`(?:name becomes|always treated as) "${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(m.text));
        if (!ok) warn(step, `"${card.name}" lists "${want}" as material; none of the listed materials obviously is one. Check it (some cards Fusion Summon with fewer materials).`);
      }
    } else if (s.method === 'ritual') {
      warn(step, `Ritual Summon of "${card.name}": check the Ritual Spell and Levels by hand.`);
    }
  };

  line.steps.forEach((stepDef, i) => {
    const step = i + 1;
    if (!stepDef.text || !stepDef.text.trim()) err(step, 'Step has no description.');

    const doActivation = (a: PlanActivation) => {
      const c = resolve(a.card, step);
      if (!c) return;
      if (effectLocked.has(c.name)) err(step, `"${c.name}" can't activate its effects this turn (it was summoned under a restriction that stops it).`);
      // Where is it activated from?
      let from: Zone | undefined = a.from;
      if (!from) {
        if (L.count('field', c.name) > 0) from = 'field';
        else if (L.count('hand', c.name) > 0) from = 'hand';
        else if (L.count('gy', c.name) > 0) from = 'gy';
      }
      if (!from) { err(step, `"${c.name}" is activated, but it isn't in your hand, field or GY at this point.`); return; }
      if (L.count(from, c.name) <= 0) { err(step, `"${c.name}" is activated from your ${zoneLabel(from)}, but it isn't there.`); return; }

      const rules = optRules(c);
      const used = effectUses.get(c.name) ?? [];
      const acts = activations.get(c.name) ?? 0;
      if (rules.activateOnce && isSpellTrap(c) && from === 'hand' && acts >= 1) err(step, `You can only activate 1 "${c.name}" per turn.`);
      if (rules.oneEffectPerTurn && used.length >= 1) err(step, `You can only use 1 of "${c.name}"'s effects per turn, and one was already used.`);
      if (rules.eachEffectOnce) {
        if (a.effect == null) warn(step, `"${c.name}" has once-per-turn effects; say which effect (effect number) this step uses.`);
        else if (used.includes(a.effect)) err(step, `"${c.name}" effect ${a.effect} is once per turn and was already used.`);
      }
      effectUses.set(c.name, a.effect != null ? [...used, a.effect] : [...used, -1]);
      activations.set(c.name, acts + 1);

      // A Spell/Trap activated from the hand goes to the field (Continuous/Field/Equip) or resolves to the GY.
      if (isSpellTrap(c) && from === 'hand') { L.take('hand', c.name); L.add(stays(c) ? 'field' : 'gy', c.name); }
      else if (isSpellTrap(c) && from === 'field' && !stays(c)) { L.take('field', c.name); L.add('gy', c.name); }

      const lock = parseSummonLock(c);
      if (lock) locks.push(lock);
      return c;
    };

    // Activations of cards already available run first; an activation of a
    // card this step summons (e.g. "Normal Summon X; its effect...") runs after the summon.
    const summonedHere = new Set((stepDef.summons ?? []).map((s) => normName(s.card)));
    const deferred: PlanActivation[] = [];
    const activatedCards: DeckCard[] = [];
    for (const a of stepDef.activations ?? []) {
      const c = byName.get(normName(a.card));
      const available = c && (L.count('field', c.name) > 0 || L.count('hand', c.name) > 0 || L.count('gy', c.name) > 0);
      if (summonedHere.has(normName(a.card)) && !(available && a.from)) deferred.push(a);
      else { const r = doActivation(a); if (r) activatedCards.push(r); }
    }

    for (const s of stepDef.summons ?? []) {
      const card = resolve(s.card, step);
      if (!card) continue;
      if (!isMonster(card)) { err(step, `"${card.name}" isn't a monster.`); continue; }
      const extraMethod = ['link', 'xyz', 'synchro', 'fusion'].includes(s.method);
      const from: Zone = s.from ?? (extraMethod || isExtraType(card) ? 'extra' : 'hand');
      if (extraMethod && !isExtraType(card)) err(step, `"${card.name}" isn't a ${s.method} monster.`);
      if (s.method === 'link' && !isLink(card)) err(step, `"${card.name}" isn't a Link Monster.`);
      if (s.method === 'normal' || s.method === 'tribute') {
        normalSummons++;
        if (normalSummons > 1) (extraNormalAllowed ? warn : err)(step, 'A second Normal Summon this turn. Is there an effect that grants an extra one?');
        if (from !== 'hand') err(step, `Normal Summons come from the hand, not the ${zoneLabel(from)}.`);
      }
      checkSummonRules(step, { ...s, from }, card);

      const mats: DeckCard[] = [];
      for (const m of s.materials ?? []) {
        if (isWild(m)) { err(step, 'Materials must be named cards on your field.'); continue; }
        if (isToken(m)) continue;
        const mc = resolve(m, step);
        if (!mc) continue;
        const matFrom: Zone = s.materialsFrom ?? 'field';
        if (!L.take(matFrom, mc.name)) { err(step, `Material "${mc.name}" isn't in your ${zoneLabel(matFrom)}.`); continue; }
        const matTo: Zone = s.materialsTo ?? 'gy';
        L.add(matTo === 'deck' && isExtraType(mc) ? 'extra' : matTo, mc.name); // Extra Deck monsters shuffle back to the Extra Deck
        mats.push(mc);
      }
      if (['link', 'xyz', 'synchro', 'fusion'].includes(s.method)) checkMaterials(step, s, card, mats);
      if (s.method === 'tribute' && mats.length === 0) warn(step, 'Tribute Summon with no Tributes listed.');

      if (!L.take(from, card.name)) {
        const at = L.where(card.name);
        err(step, `"${card.name}" is summoned from your ${zoneLabel(from)}, but it isn't there${at.length ? ` (it's in your ${at.map(zoneLabel).join(', ')})` : ' (no copies left)'}.`);
      } else L.add('field', card.name);

      for (const a of activatedCards) {
        if (locksSummonedEffects(a) && normName(a.name) !== normName(card.name)) effectLocked.add(card.name);
      }
    }

    for (const a of deferred) doActivation(a);

    for (const mv of stepDef.moves ?? []) {
      if (!ZONES.includes(mv.from) || !ZONES.includes(mv.to)) { err(step, `Unknown zone in a move of "${mv.card}".`); continue; }
      moveCard(step, mv.card, mv.from, mv.to, `Moving "${mv.card}" ${mv.from}→${mv.to}`);
    }
  });

  // End board must be what the plan actually leaves on the field.
  for (const name of line.endBoard) {
    if (isToken(name)) continue;
    const c = resolve(name, null);
    if (!c) continue;
    if (!L.take('field', c.name)) err(null, `End board lists "${c.name}", but the steps don't leave it on your field.`);
  }
  const monstersLeft = [...L.zones.field.entries()]
    .reduce((n, [name, k]) => n + (byName.get(normName(name)) && isMonster(byName.get(normName(name))!) ? k : 0), 0);
  const endMonsters = line.endBoard.filter((n) => { const c = byName.get(normName(n)); return c && isMonster(c); }).length;
  if (monstersLeft + endMonsters > 7) warn(null, `${monstersLeft + endMonsters} monsters on the field at once; check you have the zones.`);

  return issues;
}

function zoneLabel(z: Zone): string {
  return ({ hand: 'hand', deck: 'Deck', extra: 'Extra Deck', field: 'field', gy: 'GY', banished: 'banishment' } as const)[z];
}
