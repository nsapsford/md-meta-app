// Extra Deck summons from the deck file's `extraDeck` rules. Synchro and Link Summons are moves
// the engine offers itself (moves.ts calls genSynchro / genLinks at the end of gen); a Fusion is
// performed by an effect, which asks `fusionOptions` what it can make from a pool of materials.
// Port of the reference's genSynchro / mkSynchro / genLinks and its either-field Fusion pair
// loop, with each rule's data (Level, rating, material counts, Tuners, material
// conditions, relations, bottom arrows) in place of its card checks. Xyz is not built.

import type { CardProps, Choice, CompiledDeck, CompiledExtraRule, CondFn, HandSynchro, Place } from '../deck/compile';
import type { StateOps } from './state';
import { step, done, L } from './record';
import { FATE_BANISH, FATE_TOKEN, MOVE_EXTRA, type EnginePush, type Move, type OppCard, type State, type Tags } from './types';

/** A possible material: one of your monsters (`idx` in `s.mons`) or a face-up opponent's monster (`uid`). */
export interface MatView { side: 'me' | 'opp'; idx?: number; uid?: OppCard['uid']; id: number; nm: number; race: string; attr: string; sub: string; ext: boolean;
  /** One of your materials that is not on the field: the zone it is in (a Fusion from the hand, Deck or GY). */
  zone?: 'hand' | 'deck' | 'gy' }

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

/** Do two of your monsters have the same card index? */
function sameIds(s: State): boolean {
  const ms = s.mons;
  for (let a = 1; a < ms.length; a++) for (let b = 0; b < a; b++) if (ms[a].id === ms[b].id) return true;
  return false;
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

/**
 * A possible Synchro Material: one of your monsters with a Level (`i`, its index in `s.mons`), or a
 * card in your hand that can be material from there (`i` -1, `hand` its rule).
 */
interface Cand { i: number; id: number; lvl: number; tuner: boolean; hand: HandSynchro | null }

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
  const synRepeat = new Set(synchros.map((r) => r.card)).size !== synchros.length;
  const linkRepeat = new Set(links.map((r) => r.card)).size !== links.length;

  const fieldChoice = (s: State, i: number): Choice => matChoice(s.mons[i].id, { zone: 'mon', at: i, uid: s.mons[i].uid });
  const HAND: Place = Object.freeze({ zone: 'hand', at: -1, uid: null }) as Place;
  const candChoice = (s: State, c: Cand): Choice => (c.hand ? matChoice(c.id, HAND) : fieldChoice(s, c.i));
  // The materials' card ids, sorted as strings (as Array.prototype.sort does) and joined by '+'.
  const byName = ids.map((_x, i) => i).sort((a, b) => (ids[a] < ids[b] ? -1 : ids[a] > ids[b] ? 1 : 0));
  const rank = new Int32Array(ids.length);
  byName.forEach((i, k) => { rank[i] = k; });
  const sig = (s: State, pick: number[]): string => sigOf(pick.map((i) => s.mons[i].id), null);
  /** Sorted material ids joined by '+'; a material from the hand (`hand[k]`) is written `h.<id>`. */
  const sigOf = (cs: number[], hand: boolean[] | null): string => {
    const ord = cs.map((_x, k) => k);
    for (let a = 1; a < ord.length; a++) { const x = ord[a]; let b = a - 1; while (b >= 0 && rank[cs[ord[b]]] > rank[cs[x]]) { ord[b + 1] = ord[b]; b--; } ord[b + 1] = x; }
    const nm = (k: number) => (hand && hand[k] ? 'h.' : '') + ids[cs[k]];
    let out = nm(ord[0]);
    for (let a = 1; a < ord.length; a++) out += '+' + nm(ord[a]);
    return out;
  };

  const heads = new Map<SynchroRule | LinkRule, string>();
  /**
   * The summon: materials to the GY (one ledger entry naming them), then the monster from the Extra
   * Deck. `pick`: field indices, ascending; `hand`: materials from the hand (written to the ledger as
   * put on the field first, so the summon's entry can list them with the others). A material that is
   * banished when it leaves the field is listed, then moved from the GY to banishment; a Token is listed
   * (the ledger checker skips Tokens) and ceases to exist.
   */
  function summonRun(r: SynchroRule | LinkRule, pick: number[], emz: boolean, hand: HandSynchro[] = []): Move['run'] {
    const method = r.method;
    let head = heads.get(r);
    if (head === undefined) { head = `${method === 'synchro' ? 'Synchro' : 'Link'} Summon ${props[r.card].short} with `; heads.set(r, head); }
    const hd = head;
    // Materials leave from the highest index down (indices stay valid); `pick` is ascending.
    const down = pick.slice().reverse();
    return (s0) => {
      const n = so.clone(s0);
      const names = pick.map((i) => props[s0.mons[i].id].short).concat(hand.map((h) => props[h.card].short + ' (hand)'));
      step(n, hd + names.join(' + ') + '.', INHERENT);
      // `thenIf`: the rule's `then` is queued only when a material (read where it was) matches it.
      const thenOk = !r.thenIf || pick.some((i) => r.thenIf!(s0, { self: s0.mons[i].id, at: { zone: 'mon', at: i, uid: s0.mons[i].uid }, chosen: [] }))
        || hand.some((h) => r.thenIf!(s0, { self: h.card, at: HAND, chosen: [] }));
      const mats: number[] = [], toGy: number[] = [], banished: number[] = [];
      for (const h of hand) L.mv(n, h.card, 'hand', 'field');
      deck.asMaterial(method, () => {
        for (let j = 0; j < down.length; j++) {
          const m = ops.monToGy(n, down[j], false);
          mats.push(m.id);
          if (m.fate === FATE_BANISH) banished.push(m.id); else if (m.fate !== FATE_TOKEN) toGy.push(m.id);
        }
        for (const h of hand) {
          so.setOpt(n, h.limit);
          so.W(n, 'hand')[h.card]--; so.W(n, 'gy')[h.card]++;
          mats.push(h.card); toGy.push(h.card);
          deck.onLeaveField(n, h.card, 'mon', true, 'gy');
        }
      }, r.card);
      if (toGy.length >= 2) deck.onBatchToGy(n, toGy);
      L.sum(n, r.card, method, 'extra', mats);
      for (const id of banished) L.mv(n, id, 'gy', 'banished');
      so.W(n, 'extra')[r.card]--;
      const m = ops.place(n, r.card, { special: true, emz, from: 'extra', how: method });
      if (r.then && thenOk) deck.queueAfterSummon(n, r.then, m);
      return done(n);
    };
  }

  /** Do the materials meet the rule's `tunerIs` (each Tuner) and `nonTunerIs` (each other material)? */
  function tunersFit(s: State, r: SynchroRule, pick: Cand[], mats: Choice[]): boolean {
    for (let j = 0; j < pick.length; j++) {
      const f = pick[j].tuner ? r.tunerIs : r.nonTunerIs;
      if (f && !f(s, { self: mats[j].id, at: mats[j], chosen: mats.filter((_x, k) => k !== j) })) return false;
    }
    return true;
  }

  function genSynchro(s: State, push: EnginePush): void {
    if (!synchros.length) return;
    // Monsters with a Level (not Links), by their current Level; then cards that can be material from the hand.
    const cand: Cand[] = [];
    for (let i = 0; i < s.mons.length; i++) { const p = props[s.mons[i].id]; if (p.lv && s.mons[i].lvl) cand.push({ i, id: s.mons[i].id, lvl: s.mons[i].lvl, tuner: p.tuner, hand: null }); }
    if (!cand.length) return;
    for (const h of deck.handSynchro) {
      const p = props[h.card];
      if (s.hand[h.card] && p.lv && !so.getOpt(s, h.limit)) cand.push({ i: -1, id: h.card, lvl: p.lv, tuner: p.tuner, hand: h });
    }
    if (cand.length < 2) return;
    // Two picks share a key only when the field holds two copies of a card (or two rules make one card).
    const dup = synRepeat || sameIds(s);
    const seen = new Set<string>();
    eachSubset(cand.length, Math.max(2, synLo), synHi, (sub) => {
      const pick = sub.map((j) => cand[j]);
      let sum = 0, tuners = 0, fromHand = 0;
      for (const c of pick) { sum += c.lvl; if (c.tuner) tuners++; if (c.hand) fromHand++; }
      if (fromHand === pick.length) return;
      let mats: Choice[] | null = null, sg: string | null = null;
      for (const r of synchros) {
        if (!s.extra[r.card] || !deck.extraAllowed(s, r.card) || pick.length < r.min || pick.length > r.max || sum !== r.level) continue;
        if (r.tuners === 'exactlyOne' ? tuners !== 1 : tuners > 1) continue;
        if (fromHand && pick.some((c) => c.hand && !c.hand.for[r.card])) continue;
        // Unlike the reference (which marks the signature seen before any rule check), a key is marked
        // seen only once its rule's checks pass: when two copies of a card differ in current Level or
        // in what `mats` reads (its name on the field), a later copy can still make the move.
        const k = 'syn:' + ids[r.card] + ':' + (sg ??= fromHand ? sigOf(pick.map((c) => c.id), pick.map((c) => !!c.hand)) : sigOf(pick.map((c) => c.id), null));
        if (dup && seen.has(k)) continue;
        if (r.mats && !allSatisfy(s, r.mats, mats ??= pick.map((c) => candChoice(s, c)))) continue;
        if ((r.tunerIs || r.nonTunerIs) && !tunersFit(s, r, pick, mats ??= pick.map((c) => candChoice(s, c)))) continue;
        if (dup) seen.add(k);
        const onField = pick.filter((c) => !c.hand).map((c) => c.i);
        push(k, INHERENT, summonRun(r, onField, false, pick.filter((c) => c.hand).map((c) => c.hand!)), false, MOVE_EXTRA);
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
    // Two picks share a key only when the field holds two copies of a card (or two rules make one card).
    const dup = linkRepeat || sameIds(s);
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
        if (!s.extra[r.card] || !deck.extraAllowed(s, r.card) || pick.length < r.min || pick.length > r.max) continue;
        if (!(pick.length === r.rating || (pick.length <= r.rating && hi >= r.rating && anyLink))) continue;
        // Marked seen only after the zone and rule checks pass, unlike the reference: when two copies
        // of a card differ in zone (one in the Extra Monster Zone) or in what `mats` reads, a later
        // copy can still make the move the first could not.
        const k = 'link:' + ids[r.card] + ':' + (sg ??= sig(s, pick));
        if (dup && seen.has(k)) continue;
        if (r.mats && !allSatisfy(s, r.mats, mats ??= pick.map((i) => fieldChoice(s, i)))) continue;
        if (dup) seen.add(k);
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
      case 'differentRace':
        for (let a = 0; a < mats.length; a++) {
          if (!known(mats[a].race)) return false;
          for (let b = 0; b < a; b++) if (mats[b].race === mats[a].race) return false;
        }
        break;
      case 'differentAttr':
        for (let a = 0; a < mats.length; a++) {
          if (!known(mats[a].attr)) return false;
          for (let b = 0; b < a; b++) if (mats[a].attr !== '*' && mats[b].attr === mats[a].attr) return false;
        }
        break;
      case 'differentNames':
        for (let a = 1; a < mats.length; a++) for (let b = 0; b < a; b++) if (mats[b].nm === mats[a].nm) return false;
        break;
    }
  }
  return true;
}

/** The materials as chosen cards (each slot condition sees one as its card, the others as its chosen cards). */
function matChoices(s: State, mats: MatView[]): Choice[] {
  return mats.map((v) => matChoice(v.id, v.zone
    ? { zone: v.zone, at: -1, uid: null }
    : v.side === 'me'
      ? { zone: 'mon', at: v.idx!, uid: s.mons[v.idx!].uid }
      : { zone: 'opp', at: -1, uid: v.uid! }));
}

/**
 * Can the materials (`ch`, from matChoices) fill the rule's slots, one each (in any order)? A
 * slot's condition is tested on a material only when the search reaches that pair, at most once.
 */
function fillsSlots(s: State, slots: CondFn[], ch: Choice[], more: CondFn | null = null): boolean {
  const M = ch.length;
  const ok = new Int8Array(slots.length * M);   // 0 untested, 1 holds, -1 fails
  const others: (Choice[] | undefined)[] = [];   // the other materials, per material (built when first needed)
  const test = (j: number, m: number): boolean => {
    const at = j * M + m;
    if (!ok[at]) ok[at] = slots[j](s, { self: ch[m].id, at: ch[m], chosen: others[m] ??= ch.filter((_x, k) => k !== m) }) ? 1 : -1;
    return ok[at] === 1;
  };
  let used = 0;   // bit m: material m fills an earlier slot
  // A rule's `more` ("1+" materials): every material no slot took must match it.
  const rest = (): boolean => {
    for (let m = 0; m < M; m++) {
      if (used & (1 << m)) continue;
      if (!more!(s, { self: ch[m].id, at: ch[m], chosen: others[m] ??= ch.filter((_x, k) => k !== m) })) return false;
    }
    return true;
  };
  const fill = (j: number): boolean => {
    if (j === slots.length) return M === slots.length || (more !== null && rest());
    for (let m = 0; m < M; m++) {
      if ((used & (1 << m)) || !test(j, m)) continue;
      used |= 1 << m;
      if (fill(j + 1)) return true;
      used &= ~(1 << m);
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

export interface PoolFusionOpts {
  /** Exactly this many materials ("using 2 monsters"). */
  count?: number;
  /** At most this many materials for a rule with `more` (its "1+" materials). */
  max: number;
  /** A pool index that every set must include ("including this card"). */
  mustInclude?: number;
  /** Which Fusion Monsters may be made (the effect's `of`, summon locks). */
  allow(card: number): boolean;
}

/** A material's place, for telling sets apart: copies of a card in one zone are the same material. */
const matSig = (v: MatView): string => (v.zone ? v.zone + v.id : v.side === 'me' ? 'm' + v.idx : 'o' + String(v.uid));

/**
 * The Fusion Summons a pool of materials from several places allows (a Fusion "using monsters from
 * your hand, Deck or field"): each different set of materials (the same cards from the same places
 * once) with the Fusion Monsters it makes, in the compiled rules' (order, card id) order. Only the
 * pool members that can fill one of a rule's slots (or its `more`) on their own are combined for
 * that rule; each set is then checked whole, as `fusionOptions` does.
 */
export function poolFusionOptions(s: State, pool: MatView[], rules: readonly CompiledExtraRule[], o: PoolFusionOpts): { mats: MatView[]; cards: number[] }[] {
  const by = new Map<string, { mats: MatView[]; cards: number[] }>();
  const ch = matChoices(s, pool);
  for (const r of rules) {
    if (r.method !== 'fusion' || !(s.extra[r.card] > 0) || !o.allow(r.card)) continue;
    let lo = r.slots.length, hi = r.more ? Math.max(lo, o.max) : lo;
    if (o.count !== undefined) { if (o.count < lo || o.count > hi) continue; lo = hi = o.count; }
    const cand: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      const run = { self: ch[i].id, at: ch[i], chosen: [] as Choice[] };
      if (r.slots.some((f) => f(s, run)) || (r.more !== null && r.more(s, run))) cand.push(i);
    }
    if (o.mustInclude !== undefined && !cand.includes(o.mustInclude)) continue;
    for (let k = lo; k <= hi && k <= cand.length; k++) {
      eachCombination(cand.length, k, (pick) => {
        const idx = pick.map((j) => cand[j]);
        if (o.mustInclude !== undefined && !idx.includes(o.mustInclude)) return;
        const mats = idx.map((i) => pool[i]);
        const sig = mats.map(matSig).sort().join('+');
        const have = by.get(sig);
        if (have?.cards.includes(r.card)) return;
        if (!related(r.relations, mats) || !fillsSlots(s, r.slots, idx.map((i) => ch[i]), r.more)) return;
        if (have) have.cards.push(r.card); else by.set(sig, { mats, cards: [r.card] });
      });
    }
  }
  return [...by.values()];
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
