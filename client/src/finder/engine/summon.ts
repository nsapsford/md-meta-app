// Extra Deck summons from the deck file's `extraDeck` rules. Synchro and Link Summons are moves
// the engine offers itself (moves.ts calls genSynchro / genLinks at the end of gen); a Fusion is
// performed by an effect, which asks `fusionOptions` what it can make from a pool of materials.
// Port of the reference's genSynchro / mkSynchro / genLinks and its either-field Fusion pair
// loop, with each rule's data (Level, rating, material counts, Tuners, material
// conditions, relations, bottom arrows) in place of its card checks. Xyz is not built.

import type { CardProps, Choice, CompiledDeck, CompiledExtraRule, CondFn, Place } from '../deck/compile';
import type { StateOps } from './state';
import { step, done, L } from './record';
import { MOVE_EXTRA, type EnginePush, type Move, type OppCard, type State, type Tags } from './types';

/** A possible material: one of your monsters (`idx` in `s.mons`) or a face-up opponent's monster (`uid`). */
export interface MatView { side: 'me' | 'opp'; idx?: number; uid?: OppCard['uid']; id: number; nm: number; race: string; attr: string; sub: string; ext: boolean }

type SynchroRule = Extract<CompiledExtraRule, { method: 'synchro' }>;
type LinkRule = Extract<CompiledExtraRule, { method: 'link' }>;
type FusionRule = Extract<CompiledExtraRule, { method: 'fusion' }>;

const INHERENT: Tags = Object.freeze({ inherent: true });

/** A material as a chosen card: the card and where it is (key and name are not read). */
function matChoice(id: number, at: Place): Choice {
  return { id, zone: at.zone, at: at.at, uid: at.uid, key: '', name: '', many: null };
}

/**
 * Does every material satisfy `f`? Each is tested as the run's own card, with the other materials
 * as its chosen cards.
 */
function allSatisfy(s: State, f: CondFn | null, mats: Choice[]): boolean {
  if (!f) return true;
  for (let j = 0; j < mats.length; j++) {
    const c = mats[j];
    if (!f(s, { self: c.id, at: c, chosen: mats.filter((_x, k) => k !== j) })) return false;
  }
  return true;
}

/** Each subset of `n` items (by index) whose size is within lo..hi, in increasing bitmask order. */
function eachSubset(n: number, lo: number, hi: number, fn: (pick: number[]) => void): void {
  for (let mask = 1; mask < (1 << n); mask++) {
    let size = 0;
    for (let x = mask; x; x &= x - 1) size++;
    if (size < lo || size > hi) continue;
    const pick: number[] = [];
    for (let j = 0; j < n; j++) if (mask & (1 << j)) pick.push(j);
    fn(pick);
  }
}

export interface Summons {
  /** Synchro Summon moves (`syn:<card>:<sorted material ids joined by +>`). */
  genSynchro(s: State, push: EnginePush): void;
  /** Link Summon moves (`link:<card>:<sorted material ids joined by +>`). */
  genLinks(s: State, push: EnginePush): void;
}

export function createSummons(deck: CompiledDeck, so: StateOps = deck.state): Summons {
  const { props, ids, ops } = deck;
  const synchros = deck.extra.filter((r): r is SynchroRule => r.method === 'synchro');
  const links = deck.extra.filter((r): r is LinkRule => r.method === 'link');
  // Links whose arrows point down into the Main Monster Zones: with one in the Extra Monster Zone,
  // another Link can go to a Main Monster Zone.
  const bottomArrows = new Set(links.filter((r) => r.bottomArrows).map((r) => r.card));
  const range = (rs: { min: number; max: number }[]) => [Math.min(...rs.map((r) => r.min)), Math.max(...rs.map((r) => r.max))];
  const [synLo, synHi] = synchros.length ? range(synchros) : [0, 0];
  const [linkLo, linkHi] = links.length ? range(links) : [0, 0];

  const fieldChoice = (s: State, i: number): Choice => matChoice(s.mons[i].id, { zone: 'mon', at: i, uid: s.mons[i].uid });
  // The materials' card ids, sorted as strings (as Array.prototype.sort does) and joined by '+'.
  const byName = ids.map((_x, i) => i).sort((a, b) => (ids[a] < ids[b] ? -1 : ids[a] > ids[b] ? 1 : 0));
  const rank = new Int32Array(ids.length);
  byName.forEach((i, k) => { rank[i] = k; });
  const sig = (s: State, pick: number[]): string => {
    const cs = pick.map((i) => s.mons[i].id);
    for (let a = 1; a < cs.length; a++) { const x = cs[a]; let b = a - 1; while (b >= 0 && rank[cs[b]] > rank[x]) { cs[b + 1] = cs[b]; b--; } cs[b + 1] = x; }
    let out = ids[cs[0]];
    for (let a = 1; a < cs.length; a++) out += '+' + ids[cs[a]];
    return out;
  };

  /** The summon: materials to the GY (one ledger entry naming them), then the monster from the Extra Deck. */
  function summonRun(r: SynchroRule | LinkRule, pick: number[], emz: boolean): Move['run'] {
    const method = r.method;
    return (s0) => {
      const n = so.clone(s0);
      step(n, `${method === 'synchro' ? 'Synchro' : 'Link'} Summon ${props[r.card].short} with ${pick.map((i) => props[s0.mons[i].id].short).join(' + ')}.`, INHERENT);
      // `thenIf`: the rule's `then` is queued only when a material (read where it was) matches it.
      const thenOk = !r.thenIf || pick.some((i) => r.thenIf!(s0, { self: s0.mons[i].id, at: { zone: 'mon', at: i, uid: s0.mons[i].uid }, chosen: [] }));
      const mats: number[] = [];
      for (const i of pick.slice().sort((p, q) => q - p)) mats.push(ops.monToGy(n, i, false).id);
      L.sum(n, r.card, method, 'extra', mats);
      so.W(n, 'extra')[r.card]--;
      const m = ops.place(n, r.card, { special: true, emz, from: 'extra' });
      if (r.then && thenOk) deck.queueAfterSummon(n, r.then, m);
      return done(n);
    };
  }

  function genSynchro(s: State, push: EnginePush): void {
    if (!synchros.length) return;
    // Monsters with a Level (not Links), by their current Level.
    const ms: number[] = [];
    for (let i = 0; i < s.mons.length; i++) if (props[s.mons[i].id].lv && s.mons[i].lvl) ms.push(i);
    if (ms.length < 2) return;
    const seen = new Set<string>();
    eachSubset(ms.length, Math.max(2, synLo), synHi, (sub) => {
      const pick = sub.map((j) => ms[j]);
      let sum = 0, tuners = 0;
      for (const i of pick) { sum += s.mons[i].lvl; if (props[s.mons[i].id].tuner) tuners++; }
      let mats: Choice[] | null = null, sg: string | null = null;
      for (const r of synchros) {
        if (!s.extra[r.card] || pick.length < r.min || pick.length > r.max || sum !== r.level) continue;
        if (r.tuners === 'exactlyOne' ? tuners !== 1 : tuners > 1) continue;
        // Unlike the reference (which marks the signature seen before any rule check), a key is marked
        // seen only once its rule's checks pass: when two copies of a card differ in current Level or
        // in what `mats` reads (its name on the field), a later copy can still make the move.
        const k = 'syn:' + ids[r.card] + ':' + (sg ??= sig(s, pick));
        if (seen.has(k)) continue;
        mats ??= pick.map((i) => fieldChoice(s, i));
        if (!allSatisfy(s, r.mats, mats)) continue;
        seen.add(k);
        push(k, INHERENT, summonRun(r, pick, false), false, MOVE_EXTRA);
      }
    });
  }

  function genLinks(s: State, push: EnginePush): void {
    if (!links.length) return;
    const N = s.mons.length;
    if (N < 2) return;
    const emzAt = s.mons.findIndex((m) => m.emz);
    let main = 0;
    for (const m of s.mons) if (!m.emz) main++;
    const seen = new Set<string>();
    eachSubset(N, Math.max(2, linkLo), linkHi, (pick) => {
      // Each material counts 1, or its Link rating.
      let hi = 0, anyLink = false, mainUsed = 0;
      for (const i of pick) {
        const lr = props[s.mons[i].id].link;
        hi += lr || 1;
        if (lr) anyLink = true;
        if (!s.mons[i].emz) mainUsed++;
      }
      // A Link goes to the Extra Monster Zone, or to a Main Monster Zone the Link there points to.
      const emzFree = emzAt < 0 || pick.includes(emzAt);
      if (!emzFree && !(bottomArrows.has(s.mons[emzAt].id) && main - mainUsed < 5)) return;
      let mats: Choice[] | null = null, sg: string | null = null;
      for (const r of links) {
        if (!s.extra[r.card] || pick.length < r.min || pick.length > r.max) continue;
        if (!(pick.length === r.rating || (pick.length <= r.rating && hi >= r.rating && anyLink))) continue;
        // Marked seen only after the zone and rule checks pass, unlike the reference: when two copies
        // of a card differ in zone (one in the Extra Monster Zone) or in what `mats` reads, a later
        // copy can still make the move the first could not.
        const k = 'link:' + ids[r.card] + ':' + (sg ??= sig(s, pick));
        if (seen.has(k)) continue;
        mats ??= pick.map((i) => fieldChoice(s, i));
        if (!allSatisfy(s, r.mats, mats)) continue;
        seen.add(k);
        push(k, INHERENT, summonRun(r, pick, emzFree), false, MOVE_EXTRA);
      }
    });
  }

  return { genSynchro, genLinks };
}

/**
 * The materials an effect performing a Fusion can use from the field: your monsters, then the
 * opponent's face-up monsters (an opponent's monster has no card index: `id` is `UNK`, and `nm`
 * is negative, the same for monsters of the same name). One of your monsters that counts as any
 * Attribute as material (`CardProps.materialAnyAttr`) has `attr` '*'.
 */
export function fieldPool(s: State, props: readonly CardProps[], UNK: number): MatView[] {
  const pool: MatView[] = s.mons.map((m, i) => {
    const p = props[m.id];
    return { side: 'me', idx: i, id: m.id, nm: m.nm, race: p.race ?? '?', attr: p.materialAnyAttr ? '*' : p.attr ?? '?', sub: p.sub, ext: p.ext };
  });
  if (s.opp) {
    const names = s.opp.mons.map((x) => x.name || String(x.uid));
    s.opp.mons.forEach((x, j) => {
      if (x.faceDown) return;
      pool.push({ side: 'opp', uid: x.uid, id: UNK, nm: -1 - names.indexOf(names[j]), race: x.race || '?', attr: x.attr || '?', sub: 'Effect', ext: !!x.ext });
    });
  }
  return pool;
}

const known = (v: string) => v !== '?';

/**
 * Do the materials meet every relation of the rule? An unknown Type or Attribute ('?') meets none;
 * an Attribute '*' (any) is the same as every other.
 */
function related(rel: FusionRule['relations'], mats: MatView[]): boolean {
  for (const r of rel) {
    switch (r) {
      case 'sameRace': if (!mats.every((m) => known(m.race) && m.race === mats[0].race)) return false; break;
      case 'sameAttr': {
        if (!mats.every((m) => known(m.attr))) return false;
        const set = mats.find((m) => m.attr !== '*')?.attr;
        if (set !== undefined && !mats.every((m) => m.attr === '*' || m.attr === set)) return false;
        break;
      }
      case 'differentRace': if (!mats.every((m) => known(m.race)) || new Set(mats.map((m) => m.race)).size !== mats.length) return false; break;
      case 'differentNames': if (new Set(mats.map((m) => m.nm)).size !== mats.length) return false; break;
    }
  }
  return true;
}

/** The materials as chosen cards (each slot condition sees one as its card, the others as its chosen cards). */
function matChoices(s: State, mats: MatView[]): Choice[] {
  return mats.map((v) => matChoice(v.id, v.side === 'me'
    ? { zone: 'mon', at: v.idx!, uid: s.mons[v.idx!].uid }
    : { zone: 'opp', at: -1, uid: v.uid! }));
}

/**
 * Can the materials (`ch`, from matChoices) fill the rule's slots, one each (in any order)? A
 * slot's condition is tested on a material only when the search reaches that pair, at most once.
 */
function fillsSlots(s: State, slots: CondFn[], ch: Choice[]): boolean {
  const M = ch.length;
  const ok = new Int8Array(slots.length * M);   // 0 untested, 1 holds, -1 fails
  const test = (j: number, m: number): boolean => {
    const at = j * M + m;
    if (!ok[at]) ok[at] = slots[j](s, { self: ch[m].id, at: ch[m], chosen: ch.filter((_x, k) => k !== m) }) ? 1 : -1;
    return ok[at] === 1;
  };
  const used = new Array<boolean>(M).fill(false);
  const fill = (j: number): boolean => {
    if (j === slots.length) return true;
    for (let m = 0; m < M; m++) {
      if (used[m] || !test(j, m)) continue;
      used[m] = true;
      if (fill(j + 1)) return true;
      used[m] = false;
    }
    return false;
  };
  return fill(0);
}

/**
 * The Fusion Summons the pool allows: for each set of materials (one per slot, in pool order) and
 * each Fusion rule whose monster is in the Extra Deck, in the compiled rules' (order, card id) order, when the materials fill the
 * rule's slots and meet its relations.
 */
export function fusionOptions(s: State, pool: MatView[], rules: readonly CompiledExtraRule[]): { card: number; mats: MatView[] }[] {
  const out: { card: number; mats: MatView[] }[] = [];
  const fus = rules.filter((r): r is FusionRule => r.method === 'fusion' && s.extra[r.card] > 0);
  const sizes = [...new Set(fus.map((r) => r.slots.length))].sort((a, b) => a - b);
  for (const k of sizes) {
    eachCombination(pool.length, k, (pick) => {
      const mats = pick.map((i) => pool[i]);
      let ch: Choice[] | null = null;
      for (const r of fus) if (r.slots.length === k && related(r.relations, mats) && fillsSlots(s, r.slots, ch ??= matChoices(s, mats))) out.push({ card: r.card, mats });
    });
  }
  return out;
}

/** Each set of `k` of `n` items (by index), in lexicographic order (as the reference's nested pair loops). */
function eachCombination(n: number, k: number, fn: (pick: number[]) => void): void {
  const cur: number[] = [];
  const walk = (start: number): void => {
    if (cur.length === k) { fn(cur.slice()); return; }
    for (let i = start; i < n; i++) { cur.push(i); walk(i + 1); cur.pop(); }
  };
  walk(0);
}
