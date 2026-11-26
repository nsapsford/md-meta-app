// The deck file vocabulary: four registries of general words (conditions, picks, actions,
// triggers). A deck file is written only in these words; the validator (schema.ts) checks a
// file against each word's argument spec and the compiler (Task 5) turns each word into a
// closure by calling its `compile`. No card appears here: a word is named for what it does.
//
// Adding a word: one defineCond / definePick / defineAct / defineTrigger call below (doc,
// argument spec, compile), plus a row in docs/finder/vocabulary.md. Nothing else changes.

import { FATE_BANISH, FATE_TOKEN, type CardId, type FinalBoard, type Mon, type OppCardState, type State } from '../engine/types';
import type { EffectDef } from './schema';
import { L } from '../engine/record';
import { fieldPool, fusionOptions, poolFusionOptions, type MatView } from '../engine/summon';
import type { ActFn, CardProps, CardRef, Choice, CondFn, CountFn, PickFn, Place, Run, Runtime, TrigEvent, TriggerFn } from './compile';

export type Word = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// Argument specs

/** A name looked up in the file's symbol table. */
export type NameKind =
  | 'card'    // a card id defined in the file or a shared file it uses
  | 'group'   // a key of `groups`
  | 'flag'    // a name listed in `flags`
  | 'mark'    // a name listed in `marks`
  | 'tag'     // an interruption tag (TAG_NAMES in schema.ts)
  | 'effect'  // an effect key
  | 'limit'   // an effect key or a `limit: { shared }` name
  | 'choice'; // 'self' or a `choose[].as` name of the effect being checked

export type ArgSpec =
  | { k: 'name'; of: NameKind }
  | { k: 'zone'; zones?: readonly string[] }
  | { k: 'number'; int?: boolean; min?: number }
  | { k: 'string' }
  | { k: 'boolean' }
  | { k: 'none' }                                     // no arguments: the value is `true` or `{}`
  | { k: 'enum'; values: readonly string[] }
  | { k: 'cond' } | { k: 'pick' } | { k: 'act' } | { k: 'trigger' }   // a nested word
  | { k: 'list'; of: ArgSpec; min?: number }
  | { k: 'optional'; of: ArgSpec }                    // only meaningful as an object field
  | { k: 'object'; fields: Record<string, ArgSpec>; atMostOne?: readonly string[]; exactlyOne?: readonly string[] }
  | { k: 'record'; key?: NameKind; of: ArgSpec }      // an object with free keys (checked by `key`)
  | { k: 'oneOf'; of: readonly ArgSpec[] }            // the first alternative whose JSON type fits
  | { k: 'variant'; tag: string; cases: Record<string, Record<string, ArgSpec>> };

/** Zones a word can name. */
export const ZONES = ['hand', 'deck', 'extra', 'gy', 'ban', 'field'] as const;

/** Builders for argument specs. */
export const A = {
  card: { k: 'name', of: 'card' } as ArgSpec,
  group: { k: 'name', of: 'group' } as ArgSpec,
  flag: { k: 'name', of: 'flag' } as ArgSpec,
  mark: { k: 'name', of: 'mark' } as ArgSpec,
  effect: { k: 'name', of: 'effect' } as ArgSpec,
  limit: { k: 'name', of: 'limit' } as ArgSpec,
  choice: { k: 'name', of: 'choice' } as ArgSpec,
  cardList: { k: 'list', of: { k: 'name', of: 'card' } } as ArgSpec,
  zone: (zones?: readonly string[]): ArgSpec => ({ k: 'zone', zones }),
  number: { k: 'number' } as ArgSpec,
  int: (min?: number): ArgSpec => ({ k: 'number', int: true, min }),
  string: { k: 'string' } as ArgSpec,
  boolean: { k: 'boolean' } as ArgSpec,
  none: { k: 'none' } as ArgSpec,
  enum: (...values: string[]): ArgSpec => ({ k: 'enum', values }),
  cond: { k: 'cond' } as ArgSpec,
  pick: { k: 'pick' } as ArgSpec,
  act: { k: 'act' } as ArgSpec,
  trigger: { k: 'trigger' } as ArgSpec,
  condList: { k: 'list', of: { k: 'cond' } } as ArgSpec,
  actList: { k: 'list', of: { k: 'act' } } as ArgSpec,
  list: (of: ArgSpec, min?: number): ArgSpec => ({ k: 'list', of, min }),
  optional: (of: ArgSpec): ArgSpec => ({ k: 'optional', of }),
  object: (fields: Record<string, ArgSpec>, opts: { atMostOne?: string[]; exactlyOne?: string[] } = {}): ArgSpec => ({ k: 'object', fields, ...opts }),
  record: (of: ArgSpec, key?: NameKind): ArgSpec => ({ k: 'record', of, key }),
  oneOf: (...of: ArgSpec[]): ArgSpec => ({ k: 'oneOf', of }),
};

// ---------------------------------------------------------------------------------------------
// Compiling (compile.ts)

/**
 * A compiled word. Per registry (types in compile.ts):
 * - condition `CondFn (s, r) => boolean`; as a filter (`filter`, filter groups, Extra Deck
 *   `mats`) it is called once per candidate card with that card as `r.self`;
 * - pick `PickFn (s, r) => Choice[]`: the choices offered, each one becoming its own move;
 * - action `ActFn (n, r) => void`: changes `n`, a clone the move owns, inside an open step;
 * - trigger `TriggerFn (ev, self) => boolean` with `.on`, the kind of event it listens to.
 * `r` (a `Run`) holds the effect's own card, where it is, and the choices made so far.
 */
export type Compiled = (...args: any[]) => any;

/**
 * What a word's `compile` gets from the compiler (compile.ts). `Props` is the card table's
 * per-card properties.
 */
export interface CompileCtx<Props = CardProps> {
  /** Card id to card index, as the engine's zones use it. */
  ix: Readonly<Record<CardId, number>>;
  /** Card properties by card index. */
  props: readonly Props[];
  /** The card indices of a named group (a list group, or a filter group evaluated per card). */
  group(name: string): readonly number[];
  /** Bit of a deck-defined state flag (`flags`) and tag mark (`marks`). */
  flagBit(name: string): number;
  markBit(name: string): number;
  /** Where the word being compiled sits, for error messages; `card`/`key` are null outside an effect. */
  where: { card: CardId | null; key: string | null; field: string };
  /** The effect being compiled (validated), or null outside an effect (groups, protections, board value, end of turn). */
  effect: EffectDef | null;
  /**
   * The effect id of an effect key: the number stored in `State.pend[].e` when the effect is
   * queued. Ids start at 1 (0 is never an effect). Used by `queue` and `ExtraRule.then`.
   */
  effectId(key: string): number;
  /**
   * The once-per-turn slot of an effect key or a `limit: { shared }` name: an index into the
   * state's `opt` bit array. Effects sharing a limit share its slot. Used by `notUsed`.
   */
  limitId(name: string): number;
  /**
   * The slot of a `choose[].as` name: its index in the current effect's `choose` list. A compiled
   * closure receives the chosen cards as an array in that order and reads `chosen[slot]`.
   * `'self'` is not a slot (it is the effect's own card); a word tests for it before asking.
   * Fails (see `fail`) outside an effect or for an unbound name.
   */
  choiceSlot(name: string): number;
  /** Compile a nested word; `field` is its path relative to the current word (for errors). */
  cond(word: Word, field: string): Compiled;
  pick(word: Word, field: string): Compiled;
  act(word: Word, field: string): Compiled;
  trigger(word: Word, field: string): Compiled;
  /** Throw a compile error naming `where` (and `field` below it). */
  fail(message: string, field?: string): never;
  /** The compiled deck's runtime helpers (state ops, card moves, cached choices). */
  rt: Runtime;
}

export interface WordDef {
  /** One line: what the word means. Also the "meaning" column of docs/finder/vocabulary.md. */
  doc: string;
  /** What the word's value must look like. */
  args: ArgSpec;
  /** Build the word's closure once, from its (validated) arguments. */
  compile(args: any, ctx: CompileCtx<any>): Compiled;
  /** A condition that can also count the cards it matches (`CountFn`), for board-value `on`. */
  count?(args: any, ctx: CompileCtx<any>): Compiled;
}

export type Registry = Map<string, WordDef>;

export const conds: Registry = new Map();
export const picks: Registry = new Map();
export const acts: Registry = new Map();
export const triggers: Registry = new Map();

export const WORDS = { conds, picks, acts, triggers } as const;
export type WordKind = keyof typeof WORDS;

/** How each registry's words are called in messages and in the doc's "kind" column. */
export const KIND_LABEL: Record<WordKind, string> = { conds: 'condition', picks: 'pick', acts: 'action', triggers: 'trigger' };

const define = (reg: Registry, kind: WordKind) => (name: string, def: WordDef): void => {
  if (reg.has(name)) throw new Error(`${KIND_LABEL[kind]} "${name}" is already defined`);
  reg.set(name, def);
};
export const defineCond = define(conds, 'conds');
export const definePick = define(picks, 'picks');
export const defineAct = define(acts, 'acts');
export const defineTrigger = define(triggers, 'triggers');

// ---------------------------------------------------------------------------------------------
// Seed words. Shared shapes and compile helpers first.

/** Which cards: one card, a group, or a filter condition evaluated per card (at most one; none = any card). */
const WHICH = { card: A.optional(A.card), group: A.optional(A.group), filter: A.optional(A.cond) };
const WHICH_ONE = ['card', 'group', 'filter'];
const KIND = A.optional(A.enum('mon', 'st'));
const OPP = A.object({ kind: KIND, faceUp: A.optional(A.boolean), targetable: A.optional(A.boolean), destroyable: A.optional(A.boolean), ext: A.optional(A.boolean) });
const FREE = A.oneOf(A.none, A.int(1));

type Zone = 'hand' | 'deck' | 'extra' | 'gy' | 'ban' | 'field';
/** A card test; `at`: where the candidate is, when the caller walks the field (a filter then reads it there). */
type Match = (s: FinalBoard, r: Run, id: number, at?: Place) => boolean;
interface WhichArgs { card?: CardId; group?: string; filter?: Word }

/** Matches that read only the card index (not the state, run or place): callers may skip building a place. */
const ID_ONLY = new WeakSet<Match>();
const byId = (m: Match): Match => { ID_ONLY.add(m); return m; };
/** Card and group matches: the card indices they accept, ascending (a zone count then reads only those). */
const MEMBERS = new WeakMap<Match, Int32Array>();
const ANY: Match = byId(() => true);
/** Where a filter's candidate is while a word walks `zone` (the field's cards are not walked by index here). */
const inZone = (zone: Zone): Place['zone'] => (zone === 'field' ? 'none' : zone);

/**
 * A card test from `which` arguments (any card if none). A filter sees the candidate as `self`,
 * in `zone` when the caller walks one zone (so a name test there reads, say, the card's GY name),
 * or at the field place the caller gives (so it reads a monster's name and Level there).
 */
function matcher(a: WhichArgs, ctx: CompileCtx, zone: Place['zone'] = 'none'): Match {
  if (a.card !== undefined) {
    const c = ctx.ix[a.card];
    const m = byId((_s, _r, id) => id === c);
    MEMBERS.set(m, Int32Array.of(c));
    return m;
  }
  if (a.group !== undefined) {
    const mask = new Uint8Array(ctx.props.length);
    for (const i of ctx.group(a.group)) mask[i] = 1;
    const m = byId((_s, _r, id) => mask[id] === 1);
    const ms: number[] = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) ms.push(i);
    MEMBERS.set(m, Int32Array.from(ms));
    return m;
  }
  if (a.filter !== undefined) {
    const f = ctx.cond(a.filter, 'filter') as CondFn;
    // One scratch Run per filter: not re-entrant (a filter that, through its own words, ran this same filter again would see it overwritten).
    const base: Place = { zone, at: -1, uid: null };
    const sub: Run = { self: 0, at: base, chosen: [] };
    return (s, r, id, at) => { sub.self = id; sub.at = at ?? base; sub.chosen = r.chosen; return f(s, sub); };
  }
  return ANY;
}

/** The slot an action's `what` names: -1 for the effect's own card. */
const slotOf = (what: string, ctx: CompileCtx): number => (what === 'self' ? -1 : ctx.choiceSlot(what));

/** How many copies of a card the choices made so far already took from a zone. */
function taken(chosen: readonly (Choice | null)[], zone: string, id: number): number {
  let n = 0;
  for (const c of chosen) {
    if (!c) continue;
    if (c.many) { for (const x of c.many) if (x.zone === zone && x.id === id) n++; } else if (c.zone === zone && c.id === id) n++;
  }
  return n;
}
const takenAt = (chosen: readonly (Choice | null)[], zone: string, at: number) =>
  chosen.some((c) => c && (c.many ? c.many.some((x) => x.zone === zone && x.at === at) : c.zone === zone && c.at === at));

/**
 * Count matching cards in a zone (field: monsters and Spells/Traps). With `cap`, counting stops
 * once it is reached (a condition that needs one match asks for cap 1).
 */
function zoneCounter(zone: Zone, m: Match, n: number, cap = Infinity): CountFn {
  if (zone === 'field') return controlCounterOf(m, true, true, undefined, cap);
  const ms = MEMBERS.get(m);
  if (ms) {
    // Only the accepted cards, in the same (ascending) order: the same count, cap included.
    if (ms.length === 1) { const c = ms[0]; return (s) => s[zone][c]; }
    return (s) => { const z = s[zone]; let k = 0; for (let j = 0; j < ms.length && k < cap; j++) k += z[ms[j]]; return k; };
  }
  return (s, r) => { const z = s[zone]; let k = 0; for (let i = 0; i < n && k < cap; i++) if (z[i] && m(s, r, i)) k += z[i]; return k; };
}

/** Count your matching monsters (`mons`) and Spells/Traps (`sts`, face-up or face-down only if `up` is given), up to `cap`. */
function controlCounterOf(m: Match, mons: boolean, sts: boolean, up: boolean | undefined, cap = Infinity): CountFn {
  const ms = MEMBERS.get(m);
  if (ms) {
    // The same counting with the card test inlined (a table of the accepted cards).
    let top = 0;
    for (let j = 0; j < ms.length; j++) top = Math.max(top, ms[j] + 1);
    const ok = new Uint8Array(top);
    for (let j = 0; j < ms.length; j++) ok[ms[j]] = 1;
    return (s) => {
      let k = 0;
      if (mons) { const L = s.mons; for (let i = 0; i < L.length && k < cap; i++) if (ok[L[i].id] === 1) k++; }
      if (sts) { const L = s.st; for (let i = 0; i < L.length && k < cap; i++) { const x = L[i]; if ((up === undefined || x.up === up) && ok[x.id] === 1) k++; } }
      return k;
    };
  }
  if (ID_ONLY.has(m)) {
    return (s, r) => {
      let k = 0;
      if (mons) for (let i = 0; i < s.mons.length && k < cap; i++) if (m(s, r, s.mons[i].id)) k++;
      if (sts) for (let i = 0; i < s.st.length && k < cap; i++) { const x = s.st[i]; if ((up === undefined || x.up === up) && m(s, r, x.id)) k++; }
      return k;
    };
  }
  return (s, r) => {
    let k = 0;
    if (mons) for (let i = 0; i < s.mons.length && k < cap; i++) { const x = s.mons[i]; if (m(s, r, x.id, { zone: 'mon', at: i, uid: x.uid })) k++; }
    if (sts) for (let i = 0; i < s.st.length && k < cap; i++) { const x = s.st[i]; if ((up === undefined || x.up === up) && m(s, r, x.id, { zone: 'st', at: i, uid: null })) k++; }
    return k;
  };
}

interface ControlArgs extends WhichArgs { kind?: 'mon' | 'st'; faceUp?: boolean }
function controlCounter(a: ControlArgs, ctx: CompileCtx, cap = Infinity): CountFn {
  // Monsters on the field are face-up.
  return controlCounterOf(matcher(a, ctx), a.kind !== 'st' && a.faceUp !== false, a.kind !== 'mon', a.faceUp, cap);
}

interface OppArgs { kind?: 'mon' | 'st'; faceUp?: boolean; targetable?: boolean; destroyable?: boolean; ext?: boolean }
/**
 * An opponent's card test; each given field must match. `targetable` defaults to true (as the
 * reference's oppTargets); the other absent fields do not matter. `ext`: an Extra Deck monster
 * (their field's `ext`, what "Special Summoned from the Extra Deck" reads).
 */
function oppTest(a: OppArgs | true): (x: { faceDown?: boolean; noTarget?: boolean; noDestroy?: boolean; ext?: boolean }) => boolean {
  if (a === true) a = {};
  const tg = a.targetable ?? true, up = a.faceUp, ds = a.destroyable, ex = a.ext;
  return (x) => !x.noTarget === tg
    && (up === undefined || !x.faceDown === up)
    && (ds === undefined || !x.noDestroy === ds)
    && (ex === undefined || !!x.ext === ex);
}

const free = (a: true | Record<string, never> | number): number => (typeof a === 'number' ? a : 1);
const trig = (on: TrigEvent['t'], f: (ev: any, self: number) => boolean, binds = false): TriggerFn => Object.assign(f, binds ? { on, binds } : { on });

// Conditions
defineCond('has', {
  doc: 'A zone holds at least one card of the given card, group or filter (any card if none is given).',
  args: A.object({ zone: A.zone(), ...WHICH }, { atMostOne: WHICH_ONE }),
  compile: (a: WhichArgs & { zone: Zone }, ctx): CondFn => { const c = zoneCounter(a.zone, matcher(a, ctx, inZone(a.zone)), ctx.props.length, 1); return (s, r) => c(s, r) > 0; },
  count: (a: WhichArgs & { zone: Zone }, ctx): CountFn => zoneCounter(a.zone, matcher(a, ctx, inZone(a.zone)), ctx.props.length),
});
defineCond('count', {
  doc: 'The number of matching cards in a zone is within atLeast..atMost.',
  args: A.object({ zone: A.zone(), ...WHICH, atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }, { atMostOne: WHICH_ONE }),
  compile: (a: WhichArgs & { zone: Zone; atLeast?: number; atMost?: number }, ctx): CondFn => {
    const c = zoneCounter(a.zone, matcher(a, ctx, inZone(a.zone)), ctx.props.length);
    const lo = a.atLeast ?? 0, hi = a.atMost ?? Infinity;
    return (s, r) => { const k = c(s, r); return k >= lo && k <= hi; };
  },
});
defineCond('control', {
  doc: 'You control a matching card on the field (optionally only monsters or Spells/Traps, or only face-up).',
  args: A.object({ ...WHICH, kind: KIND, faceUp: A.optional(A.boolean) }, { atMostOne: WHICH_ONE }),
  compile: (a: ControlArgs, ctx): CondFn => { const c = controlCounter(a, ctx, 1); return (s, r) => c(s, r) > 0; },
  count: (a: ControlArgs, ctx): CountFn => controlCounter(a, ctx),
});
defineCond('monsterZoneFree', {
  doc: 'At least one (or the given number of) Main Monster Zones is free.', args: FREE,
  compile: (a, ctx): CondFn => { const n = free(a), mf = ctx.rt.ops.monFree; return (s) => mf(s) >= n; },
});
defineCond('stZoneFree', {
  doc: 'At least one (or the given number of) Spell/Trap Zones is free.', args: FREE,
  compile: (a): CondFn => { const n = free(a); return (s) => 5 - s.st.length >= n; },
});
defineCond('notUsed', {
  doc: 'The named once-per-turn effect or shared limit has not been used this turn.', args: A.limit,
  compile: (a: string, ctx): CondFn => { const slot = ctx.limitId(a), get = ctx.rt.state.getOpt; return (s) => !get(s, slot); },
});
defineCond('flag', {
  doc: 'The named deck-defined state flag is set.', args: A.flag,
  compile: (a: string, ctx): CondFn => { const bit = ctx.flagBit(a); return (s) => ((s.flags >>> bit) & 1) === 1; },
});
defineCond('addLockOff', {
  doc: 'You are not locked out of adding cards from the Deck to the hand.', args: A.none,
  compile: (): CondFn => (s) => !s.addLock,
});
defineCond('lpAbove', {
  doc: 'Your Life Points are above the given number.', args: A.int(0),
  compile: (a: number): CondFn => (s) => s.lp > a,
});
defineCond('oppHasTarget', {
  doc: 'The opponent has a card matching the description (kind, face-up, targetable, destroyable).', args: A.oneOf(A.none, OPP),
  compile: (a: OppArgs | true): CondFn => {
    const t = oppTest(a), kind = a === true ? undefined : a.kind;
    return (s) => !!s.opp && ((kind !== 'st' && s.opp.mons.some(t)) || (kind !== 'mon' && s.opp.st.some(t)));
  },
});
defineCond('spellActivatedThisTurn', {
  doc: 'You have activated a Spell card this turn.', args: A.none,
  compile: (): CondFn => (s) => s.spell,
});
defineCond('not', {
  doc: 'The nested condition is false.', args: A.cond,
  compile: (a: Word, ctx): CondFn => { const f = ctx.cond(a, '') as CondFn; return (s, r) => !f(s, r); },
});
defineCond('any', {
  doc: 'At least one of the nested conditions is true.', args: A.list(A.cond, 1),
  compile: (a: Word[], ctx): CondFn => {
    const fs = a.map((w, i) => ctx.cond(w, `[${i}]`) as CondFn);
    return (s, r) => { for (const f of fs) if (f(s, r)) return true; return false; };
  },
});

defineCond('all', {
  doc: 'Every one of the nested conditions is true.', args: A.list(A.cond, 1),
  compile: (a: Word[], ctx): CondFn => {
    const fs = a.map((w, i) => ctx.cond(w, `[${i}]`) as CondFn);
    return (s, r) => { for (const f of fs) if (!f(s, r)) return false; return true; };
  },
});

// Card properties of the run's own card (`self`): an effect's card, a filter's candidate, or a
// material of an Extra Deck rule. Where the run says the card is one of your monsters, its name on
// the field counts; where it is an opponent's monster (`at.zone: 'opp'`), that card's own fields
// count (an opponent's monster is never a Tuner and counts as an Effect Monster, as the reference
// treats it). Anywhere else, the printed card.

/** Your monster the run's card is, if the run places it on the field. */
function monOf(s: FinalBoard, r: Run): Mon | null {
  if (r.at.zone !== 'mon') return null;
  const m = s.mons[r.at.at];
  if (m && m.uid === r.at.uid) return m;
  return s.mons.find((x) => x.uid === r.at.uid) ?? null;
}
/** The opponent's card the run's card is, if the run places it there. */
function oppOf(s: FinalBoard, r: { at: Place }): OppCardState | null {
  if (r.at.zone !== 'opp' || !s.opp) return null;
  const u = r.at.uid;
  return s.opp.mons.find((x) => x.uid === u) ?? s.opp.st.find((x) => x.uid === u) ?? null;
}
/** A name to compare: your monster's name on the field, a card's GY name in the GY, an opponent card's name, else the card. */
function nameKey(s: FinalBoard, id: number, at: Place, props: readonly CardProps[]): number | string {
  if (at.zone === 'mon') { const m = monOf(s, { self: id, at, chosen: [] }); return m ? m.nm : id; }
  if (at.zone === 'gy') return props[id]?.gyName ?? id;
  if (at.zone === 'opp') { const o = oppOf(s, { at }); return 'o:' + (o ? o.name || String(o.uid) : String(at.uid)); }
  return id;
}
const FRAMES = ['Normal', 'Effect', 'Ritual', 'Fusion', 'Synchro', 'Xyz', 'Link'];

/** A condition on one property, read off an opponent's card or the card table. */
function propCond(ctx: CompileCtx, opp: (o: OppCardState) => boolean, mine: (p: CardProps) => boolean): CondFn {
  const props = ctx.props;
  return (s, r) => {
    if (r.at.zone === 'opp') { const o = oppOf(s, r); return !!o && opp(o); }
    const p = props[r.self];
    return !!p && mine(p);
  };
}

defineCond('tuner', {
  doc: 'This card is a Tuner monster.', args: A.none,
  compile: (_a, ctx): CondFn => propCond(ctx, () => false, (p) => p.kind === 'M' && p.tuner),
});
defineCond('attribute', {
  doc: "This card's Attribute is one of the given.", args: A.list(A.string, 1),
  compile: (a: string[], ctx): CondFn => { const set = new Set(a); return propCond(ctx, (o) => !!o.attr && set.has(o.attr), (p) => !!p.attr && set.has(p.attr)); },
});
defineCond('materialAttribute', {
  doc: "As material (or a cost by Attribute): this card's Attribute is one of the given; one of your monsters whose card has `materialAttribute: 'any'` counts as each.", args: A.list(A.string, 1),
  compile: (a: string[], ctx): CondFn => {
    const set = new Set(a), props = ctx.props;
    const plain = propCond(ctx, (o) => !!o.attr && set.has(o.attr), (p) => !!p.attr && set.has(p.attr));
    return (s, r) => (r.at.zone === 'mon' && props[r.self]?.materialAnyAttr) || plain(s, r);
  },
});
defineCond('level', {
  doc: "This card's Level (one of your monsters: its current Level) is within atLeast..atMost.",
  args: A.object({ atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }),
  compile: (a: { atLeast?: number; atMost?: number }, ctx): CondFn => {
    const lo = a.atLeast ?? 0, hi = a.atMost ?? Infinity, props = ctx.props;
    return (s, r) => {
      const m = monOf(s, r);
      const lv = m ? m.lvl : props[r.self]?.lv ?? null;
      return lv !== null && lv >= lo && lv <= hi;
    };
  },
});
defineCond('usesLeft', {
  doc: 'This monster has a use (or at least the given number of uses) of its counted effect left (uses come from its Fusion rule\'s `uses` when it was summoned).', args: A.oneOf(A.none, A.int(1)),
  compile: (a: true | Record<string, never> | number): CondFn => { const k = free(a); return (s, r) => (monOf(s, r)?.uses ?? 0) >= k; },
});
defineCond('inZone', {
  doc: 'This card is in one of the given zones (`field`: one of your monsters or Spells/Traps; a known card on top of the Deck is in the Deck).', args: A.list(A.zone(), 1),
  compile: (a: Zone[]): CondFn => {
    const set = new Set<string>(a);
    return (_s, r) => {
      const z = r.at.zone;
      return z === 'mon' || z === 'st' ? set.has('field') : z === 'top' ? set.has('deck') : set.has(z);
    };
  },
});
defineCond('inGroup', {
  doc: "This card's name (on your field: its name there; in the GY: its GY name) is one of the group's cards.", args: A.group,
  compile: (a: string, ctx): CondFn => {
    const mask = new Uint8Array(ctx.props.length), props = ctx.props;
    for (const i of ctx.group(a)) mask[i] = 1;
    return (s, r) => {
      if (r.at.zone === 'opp') return false;
      if (r.at.zone === 'gy') return mask[props[r.self].gyName] === 1;
      const m = monOf(s, r);
      return mask[m ? m.nm : r.self] === 1;
    };
  },
});
defineCond('oppHasMoreMonsters', {
  doc: 'The opponent controls more monsters than you do.', args: A.none,
  compile: (): CondFn => (s) => !!s.opp && s.opp.mons.length > s.mons.length,
});
const statCond = (stat: 'atk' | 'def') => (a: { atLeast?: number; atMost?: number }, ctx: CompileCtx): CondFn => {
  const lo = a.atLeast ?? 0, hi = a.atMost ?? Infinity;
  return propCond(ctx, (o) => { const v = o[stat]; return typeof v === 'number' && v >= lo && v <= hi; }, (p) => p.kind === 'M' && p[stat] >= lo && p[stat] <= hi);
};
defineCond('atk', {
  doc: "This monster's printed ATK (an opponent's monster: its ATK as their field gives it) is within atLeast..atMost.",
  args: A.object({ atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }), compile: statCond('atk'),
});
defineCond('def', {
  doc: "This monster's printed DEF (an opponent's monster: its DEF as their field gives it) is within atLeast..atMost.",
  args: A.object({ atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }), compile: statCond('def'),
});
defineCond('sameRaceAs', {
  doc: "This card's monster Type is the same as the chosen card's (an opponent's card: as their field gives it).", args: A.choice,
  compile: (a: string, ctx): CondFn => {
    if (a === 'self') ctx.fail('names a choice (a choose[].as name), not this card');
    const slot = ctx.choiceSlot(a), props = ctx.props;
    const raceAt = (s: FinalBoard, id: number, at: Place): string | null => (at.zone === 'opp' ? oppOf(s, { at })?.race ?? null : props[id]?.race ?? null);
    return (s, r) => {
      const c = r.chosen[slot];
      if (!c || c.many) return false;
      const mine = raceAt(s, r.self, r.at);
      return mine !== null && mine === raceAt(s, c.id, c);
    };
  },
});
defineCond('race', {
  doc: "This card's monster Type is one of the given.", args: A.list(A.string, 1),
  compile: (a: string[], ctx): CondFn => { const set = new Set(a); return propCond(ctx, (o) => !!o.race && set.has(o.race), (p) => !!p.race && set.has(p.race)); },
});
defineCond('frame', {
  doc: 'This card is a monster of one of the given kinds (Normal, Effect, Ritual, Fusion, Synchro, Xyz, Link).', args: A.list(A.enum(...FRAMES), 1),
  compile: (a: string[], ctx): CondFn => { const set = new Set(a); return propCond(ctx, () => set.has('Effect'), (p) => p.kind === 'M' && set.has(p.sub)); },
});
defineCond('extraDeckMonster', {
  doc: 'This card is a Fusion, Synchro, Xyz or Link monster.', args: A.none,
  compile: (_a, ctx): CondFn => propCond(ctx, (o) => !!o.ext, (p) => p.ext),
});
const KINDS: Record<string, CardProps['kind']> = { monster: 'M', spell: 'S', trap: 'T' };
defineCond('cardKind', {
  doc: "This card is a Monster, Spell or Trap card of one of the given kinds (an opponent's Spell/Trap counts as either).", args: A.list(A.enum('monster', 'spell', 'trap'), 1),
  compile: (a: string[], ctx): CondFn => {
    const set = new Set(a.map((k) => KINDS[k])), anySt = set.has('S') || set.has('T');
    return propCond(ctx, (o) => (o.kind === 'mon' ? set.has('M') : anySt), (p) => set.has(p.kind));
  },
});
defineCond('named', {
  doc: "This card's name is the given card (on your field: its name there; in the GY: its GY name).", args: A.card,
  compile: (a: CardId, ctx): CondFn => {
    const c = ctx.ix[a], props = ctx.props;
    return (s, r) => {
      if (r.at.zone === 'opp') return false;
      if (r.at.zone === 'gy') return props[r.self].gyName === c;
      const m = monOf(s, r);
      return (m ? m.nm : r.self) === c;
    };
  },
});
defineCond('uniqueName', {
  doc: 'No other chosen card (another material) has the same name as this card (names as `named` reads them: on the field, in the GY).', args: A.none,
  compile: (_a, ctx): CondFn => {
    const props = ctx.props;
    return (s, r) => {
      const k = nameKey(s, r.self, r.at, props);
      for (const c of r.chosen) {
        if (!c) continue;
        for (const x of c.many ?? [c]) if (nameKey(s, x.id, x, props) === k) return false;
      }
      return true;
    };
  },
});

// Choices made so far, the Deck's known top cards, names on the field and in the GY.
defineCond('chosen', {
  doc: 'The named choice was made (an optional one may be skipped), and if given came from the zone and matches the filter (which sees the chosen card as this card).',
  args: A.object({ as: A.choice, zone: A.optional(A.zone()), filter: A.optional(A.cond) }),
  compile: (a: { as: string; zone?: Zone; filter?: Word }, ctx): CondFn => {
    if (a.as === 'self') ctx.fail('names a choice (a choose[].as name), not this card', 'as');
    const slot = ctx.choiceSlot(a.as), z = a.zone;
    const f = a.filter === undefined ? null : (ctx.cond(a.filter, 'filter') as CondFn);
    const inZone = (c: Choice) => z === undefined || (z === 'field' ? c.zone === 'mon' || c.zone === 'st' : z === 'deck' ? c.zone === 'deck' || c.zone === 'top' : c.zone === z);
    // One scratch Run, as in `matcher`: not re-entrant.
    const sub: Run = { self: 0, at: { zone: 'none', at: -1, uid: null }, chosen: [] };
    return (s, r) => {
      const c = r.chosen[slot];
      if (!c) return false;
      for (const x of c.many ?? [c]) {
        if (!inZone(x)) return false;
        if (f) { sub.self = x.id; sub.at = x; sub.chosen = r.chosen; if (!f(s, sub)) return false; }
      }
      return true;
    };
  },
});
defineCond('knownTop', {
  doc: 'The number of known cards on top of the Deck is within atLeast..atMost.',
  args: A.object({ atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }),
  compile: (a: { atLeast?: number; atMost?: number }): CondFn => {
    const lo = a.atLeast ?? 0, hi = a.atMost ?? Infinity;
    return (s) => s.top.length >= lo && s.top.length <= hi;
  },
});
defineCond('namesPresent', {
  doc: 'The number of the given names that are on your field (a monster by its name there) or in your GY (a card by its GY name; only the names in `inGy`, if given) is within atLeast (default 1)..atMost.',
  args: A.object({ names: A.list(A.card, 1), inGy: A.optional(A.cardList), atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }),
  compile: (a: { names: CardId[]; inGy?: CardId[]; atLeast?: number; atMost?: number }, ctx): CondFn => {
    const want = [...new Set(a.names.map((id) => ctx.ix[id]))], props = ctx.props, n = props.length;
    const gyOk = new Set((a.inGy ?? a.names).map((id) => ctx.ix[id]));
    for (const id of a.inGy ?? []) if (!a.names.includes(id)) ctx.fail(`"${id}" is in inGy but not in names`, 'inGy');
    const lo = a.atLeast ?? 1, hi = a.atMost ?? Infinity;
    return (s) => {
      let k = 0;
      for (const w of want) {
        let here = s.mons.some((m) => m.nm === w);
        if (gyOk.has(w)) for (let i = 0; !here && i < n; i++) if (s.gy[i] && props[i].gyName === w) here = true;
        if (here) k++;
      }
      return k >= lo && k <= hi;
    };
  },
});

// Picks: what the player chooses from; each choice becomes a separate move.
function fieldPick(m: Match, kind: 'mon' | 'st' | undefined, faceUp: boolean | undefined, rt: Runtime, distinct = false): PickFn {
  return (s, r) => {
    const out: Choice[] = [];
    // distinct: a card whose id an earlier choice of this pick already has is left out.
    const dup = (id: number) => distinct && out.some((c) => c.id === id);
    if (kind !== 'st' && faceUp !== false) s.mons.forEach((x, i) => { if (m(s, r, x.id, { zone: 'mon', at: i, uid: x.uid }) && !takenAt(r.chosen, 'mon', i) && !dup(x.id)) out.push(rt.choiceOnField('mon', i, x.id, x.uid)); });
    if (kind !== 'mon') s.st.forEach((x, i) => { if ((faceUp === undefined || x.up === faceUp) && m(s, r, x.id, { zone: 'st', at: i, uid: null }) && !takenAt(r.chosen, 'st', i) && !dup(x.id)) out.push(rt.choiceOnField('st', i, x.id, null)); });
    return out;
  };
}

definePick('fromZone', {
  doc: 'Each distinct card (of a group or filter, if given) in a zone, in list order; `cards`: only the cards listed, in the order listed; `eachCopy`: once per copy; `plus`: counting the cards of an earlier choice as already there (an effect that moves them there first).',
  args: A.object({ zone: A.zone(), group: A.optional(A.group), filter: A.optional(A.cond), cards: A.optional(A.list(A.card, 1)), eachCopy: A.optional(A.boolean), plus: A.optional(A.choice) }, { atMostOne: ['group', 'filter', 'cards'] }),
  compile: (a: { zone: Zone; group?: string; filter?: Word; cards?: CardId[]; eachCopy?: boolean; plus?: string }, ctx): PickFn => {
    const m = a.cards ? ANY : matcher(a, ctx, inZone(a.zone));
    if (a.zone === 'field') {
      if (a.plus !== undefined || a.eachCopy || a.cards) ctx.fail('cards, plus and eachCopy are for a zone other than the field');
      return fieldPick(m, undefined, undefined, ctx.rt);
    }
    if (a.plus === 'self') ctx.fail('names a choice (a choose[].as name), not this card', 'plus');
    const z = a.zone, rt = ctx.rt, each = !!a.eachCopy;
    const order: readonly number[] = a.cards ? [...new Set(a.cards.map((c) => ctx.ix[c]))] : rt.order;
    const plus = a.plus === undefined ? -1 : ctx.choiceSlot(a.plus);
    const extra = (r: Run, id: number): number => {
      const c = plus < 0 ? null : r.chosen[plus];
      if (!c) return 0;
      let k = 0;
      for (const x of c.many ?? [c]) if (x.id === id) k++;
      return k;
    };
    return (s, r) => {
      const out: Choice[] = [], zz = s[z];
      for (const i of order) {
        const have = zz[i] + extra(r, i);
        if (!have) continue;
        const left = have - taken(r.chosen, z, i);
        if (left <= 0 || !m(s, r, i)) continue;
        for (let k = each ? left : 1; k > 0; k--) out.push(rt.choiceIn(z, i));
      }
      return out;
    };
  },
});
definePick('fromField', {
  doc: 'Each card you control on the field, optionally of a group or filter, kind, or face-up only; `distinct`: each card id once (the first on the field).',
  args: A.object({ group: A.optional(A.group), filter: A.optional(A.cond), kind: KIND, faceUp: A.optional(A.boolean), distinct: A.optional(A.boolean) }, { atMostOne: ['group', 'filter'] }),
  compile: (a: { group?: string; filter?: Word; kind?: 'mon' | 'st'; faceUp?: boolean; distinct?: boolean }, ctx): PickFn => fieldPick(matcher(a, ctx), a.kind, a.faceUp, ctx.rt, !!a.distinct),
});
definePick('otherHandCard', {
  doc: 'Each distinct card in hand other than this one (another copy of it counts), optionally of a group or filter.',
  args: A.oneOf(A.none, A.object({ group: A.optional(A.group), filter: A.optional(A.cond) }, { atMostOne: ['group', 'filter'] })),
  compile: (a: true | { group?: string; filter?: Word }, ctx): PickFn => {
    const m = a === true ? ANY : matcher(a, ctx);
    const rt = ctx.rt, order = rt.order;
    return (s, r) => {
      const out: Choice[] = [], h = s.hand;
      for (const i of order) {
        if (!h[i]) continue;
        const left = h[i] - (i === r.self && r.at.zone === 'hand' ? 1 : 0) - taken(r.chosen, 'hand', i);
        if (left > 0 && m(s, r, i)) out.push(rt.choiceIn('hand', i));
      }
      return out;
    };
  },
});
definePick('cheapest', {
  doc: 'Only the n (default 1) choices of the nested pick with the lowest discard value.',
  args: A.object({ of: A.pick, n: A.optional(A.int(1)) }),
  compile: (a: { of: Word; n?: number }, ctx): PickFn => {
    const of = ctx.pick(a.of, 'of') as PickFn, k = a.n ?? 1, props = ctx.props;
    return (s, r) => {
      const opts = of(s, r);
      if (opts.length <= k) return opts;
      // The k lowest by discard value (earlier first on ties), kept in the nested pick's order.
      const keep = opts.map((_c, i) => i).sort((x, y) => props[opts[x].id].discardValue - props[opts[y].id].discardValue || x - y).slice(0, k).sort((x, y) => x - y);
      return keep.map((i) => opts[i]);
    };
  },
});
definePick('first', {
  doc: 'Only the first n (default 1) choices of the nested pick (a zone pick lists cards in list order).',
  args: A.object({ of: A.pick, n: A.optional(A.int(1)) }),
  compile: (a: { of: Word; n?: number }, ctx): PickFn => {
    const of = ctx.pick(a.of, 'of') as PickFn, k = a.n ?? 1;
    return (s, r) => { const opts = of(s, r); return opts.length <= k ? opts : opts.slice(0, k); };
  },
});
definePick('subsets', {
  doc: 'Each set of min..max choices of the nested pick, the same cards from the same places once; its name joins the members with `join` (default " and "). `differentLevels`: no two members with the same printed Level; `zonesFree`: at most as many members as there are free Main Monster Zones; `largest`: only the largest sets ("as many as possible").',
  args: A.object({ of: A.pick, min: A.int(0), max: A.int(1), join: A.optional(A.string), differentLevels: A.optional(A.boolean), zonesFree: A.optional(A.boolean), largest: A.optional(A.boolean) }),
  compile: (a: { of: Word; min: number; max: number; join?: string; differentLevels?: boolean; zonesFree?: boolean; largest?: boolean }, ctx): PickFn => {
    const of = ctx.pick(a.of, 'of') as PickFn, sep = a.join ?? ' and ', props = ctx.props, monFree = ctx.rt.ops.monFree;
    if (a.min > a.max) ctx.fail(`min ${a.min} is above max ${a.max}`);
    const where = (c: Choice) => `${c.zone}|${c.at}|${String(c.uid)}|${c.id}`;
    const diffLv = !!a.differentLevels;
    return (s, r) => {
      const opts = of(s, r), out: Choice[] = [], cur: Choice[] = [], seen = new Set<string>();
      const max = a.zonesFree ? Math.min(a.max, monFree(s)) : a.max;
      const walk = (start: number): void => {
        if (cur.length >= a.min) {
          const sig = cur.map(where).sort().join('+');
          if (!seen.has(sig)) {
            seen.add(sig);
            const many = cur.slice();
            out.push({ id: -1, zone: many[0]?.zone ?? 'none', at: -1, uid: null, key: many.map((c) => c.key).join('+'), name: many.map((c) => c.name).join(sep), many });
          }
        }
        if (cur.length >= max) return;
        for (let i = start; i < opts.length; i++) {
          if (diffLv && cur.some((c) => props[c.id]?.lv === props[opts[i].id]?.lv)) continue;
          cur.push(opts[i]); walk(i + 1); cur.pop();
        }
      };
      walk(0);
      if (!a.largest || !out.length) return out;
      let top = 0;
      for (const c of out) top = Math.max(top, c.many!.length);
      return out.filter((c) => c.many!.length === top);
    };
  },
});
definePick('oppCard', {
  doc: "Each of the opponent's cards matching the description (kind, face-up, targetable, destroyable).",
  args: A.oneOf(A.none, OPP),
  compile: (a: OppArgs | true, ctx): PickFn => {
    const t = oppTest(a), kind = a === true ? undefined : a.kind, UNK = ctx.rt.UNK;
    return (s) => {
      const out: Choice[] = [];
      const o = s.opp;
      if (!o) return out;
      const add = (x: (typeof o.mons)[number], st: boolean) => {
        if (t(x)) out.push({ id: UNK, zone: 'opp', at: -1, uid: x.uid, key: 'o' + String(x.uid), name: x.name || (st ? 'Spell/Trap' : 'monster'), many: null });
      };
      if (kind !== 'st') for (const x of o.mons) add(x, false);
      if (kind !== 'mon') for (const x of o.st) add(x, true);
      return out;
    };
  },
});

const POOL_ZONES = ['self', 'field', 'hand', 'deck', 'gy', 'oppField'] as const;
type PoolZone = (typeof POOL_ZONES)[number];
const POOL_TAG: Record<'hand' | 'deck' | 'gy', { key: string; name: string }> = { hand: { key: 'h.', name: ' (hand)' }, deck: { key: 'd.', name: ' (Deck)' }, gy: { key: 'g.', name: ' (GY)' } };
/** At most this many copies of one card in a zone count as separate materials (no rule needs more). */
const POOL_COPIES = 3;

definePick('fusionMaterials', {
  doc: "Each set of your monsters (with `either`, also the opponent's face-up monsters) that can make a Fusion Monster in your Extra Deck by the deck's Fusion rules; its name joins the members with `join` (default \" + \"), an opponent's monster as `oppPrefix` + its name. With `pool`, the materials come from those places instead: `self` (this card, wherever it is), `field` (your monsters), `hand`, `deck`, `gy`, `oppField` (the opponent's face-up monsters); a material from the hand, Deck or GY is named with where it is. `of`: only Fusion Monsters matching this filter; `count`: exactly that many materials; `max` (default 3): the most materials for a rule with `more`; `withSelf`: every set includes this card; `notSelf`: this card is not a material (a cost sends it). Summon locks (`summonLocks`) leave out Fusion Monsters they forbid.",
  args: A.object({
    either: A.optional(A.boolean), join: A.optional(A.string), oppPrefix: A.optional(A.string),
    pool: A.optional(A.list(A.enum(...POOL_ZONES), 1)), of: A.optional(A.cond), count: A.optional(A.int(1)), max: A.optional(A.int(1)), withSelf: A.optional(A.boolean), notSelf: A.optional(A.boolean),
  }),
  compile: (a: { either?: boolean; join?: string; oppPrefix?: string; pool?: PoolZone[]; of?: Word; count?: number; max?: number; withSelf?: boolean; notSelf?: boolean }, ctx): PickFn => {
    const rt = ctx.rt, props = ctx.props, sep = a.join ?? ' + ', pre = a.oppPrefix ?? '', either = !!a.either;
    const of = a.of === undefined ? null : (ctx.cond(a.of, 'of') as CondFn);
    const inExtra: Place = { zone: 'extra', at: -1, uid: null };
    const ofRun: Run = { self: 0, at: inExtra, chosen: [] };
    const allow = (s: State, card: number) => rt.extraAllowed(s, card) && (!of || (ofRun.self = card, of(s, ofRun)));
    const oppChoice = (s: State, uid: NonNullable<MatView['uid']>): Choice => {
      const x = s.opp!.mons.find((y) => y.uid === uid)!;
      return { id: rt.UNK, zone: 'opp', at: -1, uid, key: 'o' + String(uid), name: pre + (x.name || 'monster'), many: null };
    };
    const setOf = (many: Choice[], fus: number[]): Choice => ({ id: -1, zone: many[0].zone, at: -1, uid: null, key: many.map((c) => c.key).join('+'), name: many.map((c) => c.name).join(sep), many, fusions: fus });

    if (a.pool === undefined) {
      if (a.count !== undefined || a.max !== undefined || a.withSelf || a.notSelf) ctx.fail('count, max, withSelf and notSelf need a pool');
      return (s) => {
        const pool = fieldPool(s, props, rt.UNK).filter((v) => (either || v.side === 'me') && !props[v.id].notFusionMat);
        const out: Choice[] = [];
        let last: unknown = null, fus: number[] = [];
        for (const o of fusionOptions(s, pool, rt.extraRules)) {
          if (!allow(s, o.card)) continue;
          if (o.mats !== last) {
            last = o.mats; fus = [];
            out.push(setOf(o.mats.map((v) => (v.side === 'me' ? rt.choiceOnField('mon', v.idx!, v.id, s.mons[v.idx!].uid) : oppChoice(s, v.uid!))), fus));
          }
          fus.push(o.card);
        }
        return out;
      };
    }
    if (a.either) ctx.fail('use oppField in the pool instead of either', 'either');
    const want = new Set<PoolZone>(a.pool), max = a.max ?? 3, notSelf = !!a.notSelf;
    if (notSelf && want.has('self')) ctx.fail('notSelf and self in the pool contradict', 'notSelf');
    if (a.withSelf && !want.has('self')) ctx.fail('withSelf needs self in the pool', 'withSelf');
    const view = (id: number, zone: 'hand' | 'deck' | 'gy'): MatView => {
      const p = props[id];
      return { side: 'me', zone, id, nm: zone === 'gy' ? p.gyName : id, race: p.race ?? '?', attr: p.attr ?? '?', sub: p.sub, ext: p.ext };
    };
    return (s, r) => {
      const field = fieldPool(s, props, rt.UNK).filter((v) => !props[v.id].notFusionMat);
      const pool: MatView[] = [];
      let selfAt: number | undefined;
      let selfZone: 'hand' | 'deck' | 'gy' | null = null;
      if (want.has('self')) {
        if (r.at.zone === 'mon') {
          const i = s.mons.findIndex((m) => m.uid === r.at.uid);
          const v = field.find((x) => x.side === 'me' && x.idx === i);
          if (v) { selfAt = pool.length; pool.push(v); }
        } else if ((r.at.zone === 'hand' || r.at.zone === 'deck' || r.at.zone === 'gy') && !props[r.self].notFusionMat) {
          selfZone = r.at.zone; selfAt = pool.length; pool.push(view(r.self, r.at.zone));
        }
        if (selfAt === undefined && a.withSelf) return [];
      }
      // `self` or `notSelf`: this card is not also offered from where it is.
      const skipSelf = selfAt !== undefined || notSelf;
      const selfMon = skipSelf && r.at.zone === 'mon' ? r.at.uid : null;
      if (want.has('field')) for (const v of field) if (v.side === 'me' && (selfMon === null || s.mons[v.idx!].uid !== selfMon)) pool.push(v);
      for (const z of ['hand', 'deck', 'gy'] as const) {
        if (!want.has(z)) continue;
        const zz = s[z];
        for (const i of rt.order) {
          let k = zz[i];
          if (!k || props[i].kind !== 'M' || props[i].notFusionMat) continue;
          if ((selfZone === z || (notSelf && r.at.zone === z)) && i === r.self) k--;
          for (let c = Math.min(k, POOL_COPIES); c > 0; c--) pool.push(view(i, z));
        }
      }
      if (want.has('oppField')) for (const v of field) if (v.side === 'opp') pool.push(v);
      const opts = poolFusionOptions(s, pool, rt.extraRules, { count: a.count, max, mustInclude: a.withSelf ? selfAt : undefined, allow: (card) => allow(s, card) });
      return opts.map((o) => setOf(o.mats.map((v): Choice => {
        if (v.zone) { const t = POOL_TAG[v.zone]; return { id: v.id, zone: v.zone, at: -1, uid: null, key: t.key + rt.ids[v.id], name: props[v.id].short + t.name, many: null }; }
        return v.side === 'me' ? rt.choiceOnField('mon', v.idx!, v.id, s.mons[v.idx!].uid) : oppChoice(s, v.uid!);
      }), o.cards));
    };
  },
});
definePick('fusionMonster', {
  doc: 'Each Fusion Monster (in the Extra Deck) the chosen materials (a `fusionMaterials` choice) can make.', args: A.object({ of: A.choice }),
  compile: (a: { of: string }, ctx): PickFn => {
    if (a.of === 'self') ctx.fail('names a choice (a choose[].as name), not this card', 'of');
    const slot = ctx.choiceSlot(a.of), rt = ctx.rt;
    return (_s, r) => (r.chosen[slot]?.fusions ?? []).map((id) => rt.choiceIn('extra', id));
  },
});

definePick('union', {
  doc: 'Each choice of each nested pick, in order.', args: A.list(A.pick, 1),
  compile: (a: Word[], ctx): PickFn => {
    const ps = a.map((w, i) => ctx.pick(w, `[${i}]`) as PickFn);
    if (ps.length === 1) return ps[0];
    return (s, r) => { const out: Choice[] = []; for (const p of ps) for (const c of p(s, r)) out.push(c); return out; };
  },
});
definePick('onlyIf', {
  doc: "The nested pick's choices while every condition holds (they may read earlier choices), else none.",
  args: A.object({ if: A.list(A.cond, 1), of: A.pick }),
  compile: (a: { if: Word[]; of: Word }, ctx): PickFn => {
    const conds = a.if.map((w, i) => ctx.cond(w, `if[${i}]`) as CondFn), of = ctx.pick(a.of, 'of') as PickFn;
    return (s, r) => { for (const c of conds) if (!c(s, r)) return []; return of(s, r); };
  },
});
definePick('triggerCard', {
  doc: "The card whose move set off this queued trigger (a `tributed` trigger's Tributed monster), if it is now in the zone; none for an effect that is not such a trigger.",
  args: A.object({ zone: A.zone(['hand', 'deck', 'extra', 'gy', 'ban']) }),
  compile: (a: { zone: Exclude<Zone, 'field'> }, ctx): PickFn => {
    const rt = ctx.rt, z = a.zone;
    return (s, r) => (r.ev !== undefined && s[z][r.ev] > taken(r.chosen, z, r.ev) ? [rt.choiceIn(z, r.ev)] : []);
  },
});
definePick('fromTop', {
  doc: 'Each distinct card (of a group or filter, if given) among the top n known cards of the Deck.',
  args: A.object({ n: A.int(1), group: A.optional(A.group), filter: A.optional(A.cond) }, { atMostOne: ['group', 'filter'] }),
  compile: (a: { n: number; group?: string; filter?: Word }, ctx): PickFn => {
    const m = matcher(a, ctx), rt = ctx.rt;
    return (s, r) => {
      const out: Choice[] = [], k = Math.min(a.n, s.top.length);
      for (let i = 0; i < k; i++) {
        const id = s.top[i];
        if (s.top.indexOf(id) !== i) continue;   // each card once
        let copies = 0;
        for (let j = 0; j < k; j++) if (s.top[j] === id) copies++;
        if (copies > taken(r.chosen, 'top', id) && m(s, r, id)) out.push(rt.choiceIn('top', id));
      }
      return out;
    };
  },
});

// Actions: what happens. `what` names 'self' or a chosen card (`choose[].as`).
/** The card as taken from the zone an action names (the field: wherever it is there). */
function fromZone(c: CardRef, z: Zone | undefined, s: State): CardRef {
  if (z === undefined) return c;
  if (z !== 'field') return { id: c.id, zone: z, at: -1, uid: null };
  if (c.zone === 'mon' || c.zone === 'st') return c;
  const i = s.mons.findIndex((m) => m.id === c.id);
  if (i >= 0) return { id: c.id, zone: 'mon', at: i, uid: s.mons[i].uid };
  return { id: c.id, zone: 'st', at: s.st.findIndex((x) => x.id === c.id), uid: null };
}

defineAct('move', {
  doc: 'Move a card from where it is (or from the given zone) to a zone.',
  args: A.object({ what: A.choice, to: A.zone(), from: A.optional(A.zone()) }),
  compile: (a: { what: string; to: Zone; from?: Zone }, ctx): ActFn => {
    if (a.to === 'field') ctx.fail('use summon or setFromDeck to put a card on the field', 'to');
    const slot = slotOf(a.what, ctx), rt = ctx.rt, to = a.to as Exclude<Zone, 'field'>;
    return (n, r) => rt.each(r, slot, (c) => rt.moveCard(n, fromZone(c, a.from, n), to));
  },
});
defineAct('summon', {
  doc: 'Special Summon a card (from where it is or the given zone), optionally with its effects negated or under another name. With `mats`, the chosen cards go to `matsTo` (default the GY) first as its materials (the ledger lists them on the summon). `banishOnLeave`: it is banished when it leaves the field; `method: synchro`: the summon is treated as a Synchro Summon (what `summonedBy` reads).',
  args: A.object({ what: A.choice, from: A.optional(A.zone()), noEff: A.optional(A.boolean), as: A.optional(A.card), mats: A.optional(A.choice), matsTo: A.optional(A.enum('gy', 'ban', 'deck')), banishOnLeave: A.optional(A.boolean), method: A.optional(A.enum('synchro')) }),
  compile: (a: { what: string; from?: Zone; noEff?: boolean; as?: CardId; mats?: string; matsTo?: 'gy' | 'ban' | 'deck'; banishOnLeave?: boolean; method?: 'synchro' }, ctx): ActFn => {
    if (a.from === 'field') ctx.fail('a monster is summoned from a zone, not from the field', 'from');
    if (a.matsTo !== undefined && a.mats === undefined) ctx.fail('needs `mats`', 'matsTo');
    if (a.mats === 'self') ctx.fail('names a choice (choose[].as), not this card', 'mats');
    const slot = slotOf(a.what, ctx), rt = ctx.rt, noEff = !!a.noEff, nm = a.as === undefined ? undefined : ctx.ix[a.as];
    const fate = a.banishOnLeave ? FATE_BANISH : 0, how = a.method;
    const mslot = a.mats === undefined ? -2 : ctx.choiceSlot(a.mats), matsTo = a.matsTo ?? 'gy';
    return (n, r) => {
      const ids: number[] = [];
      let fromGy = false;
      if (mslot >= 0) rt.each(r, mslot, (c) => { ids.push(c.id); if (c.zone === 'gy') fromGy = true; rt.moveCard(n, c, matsTo, true); });
      if (matsTo === 'gy' && ids.length >= 2) rt.batchToGy(n, ids);
      const extra = ids.length && (fromGy || matsTo !== 'gy') ? { ...(fromGy ? { materialsFrom: 'gy' } : {}), ...(matsTo !== 'gy' ? { materialsTo: matsTo === 'ban' ? 'banished' : 'deck' } : {}) } : null;
      rt.each(r, slot, (c) => {
        const lz = rt.takeOut(n, fromZone(c, a.from, n));
        L.sum(n, c.id, 'special', lz, ids.length ? ids : null, extra);
        rt.ops.place(n, c.id, { special: true, noEff, nm, from: lz, fate, how });
      });
    };
  },
});
defineAct('discard', {
  doc: 'Discard a card from the hand to the GY.', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => rt.moveCard(n, { id: c.id, zone: 'hand', at: -1, uid: null }, 'gy'));
  },
});
defineAct('discardCheapest', {
  doc: 'Discard the given number (default 1) of different cards from the hand with the lowest discard value (ties in list order).',
  args: FREE,
  compile: (a, ctx): ActFn => {
    const k = free(a), rt = ctx.rt, props = ctx.props;
    return (n) => {
      // Ties break by list order. The reference's pickFodder breaks them by the order the cards
      // entered the hand (its hand object's key order), which this state does not keep: equal-value
      // discards can differ from the reference's.
      const ids = rt.order.filter((i) => n.hand[i] > 0);
      const pick = ids.map((id, j) => ({ id, j })).sort((x, y) => props[x.id].discardValue - props[y.id].discardValue || x.j - y.j).slice(0, k);
      for (const { id } of pick) rt.moveCard(n, { id, zone: 'hand', at: -1, uid: null }, 'gy');
    };
  },
});
defineAct('draw', {
  doc: 'Draw the given number of cards.', args: A.int(1),
  compile: (a: number, ctx): ActFn => { const draw = ctx.rt.ops.draw; return (n) => { draw(n, a); }; },
});
defineAct('setFromDeck', {
  doc: 'Set a Spell/Trap from the Deck to your field.', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => {
      rt.ops.fromDeck(n, c.id);
      n.st.push({ id: c.id, up: false, now: true });
      L.mv(n, c.id, 'deck', 'field');
    });
  },
});
defineAct('faceUp', {
  doc: 'Turn a Set Spell/Trap face-up (as when it is activated).', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => {
      const i = rt.stIndex(n, c);
      if (i < 0) throw new Error(`card ${rt.ids[c.id]} is not a Spell/Trap on the field`);
      n.st[i] = { ...n.st[i], up: true };
    });
  },
});
defineAct('placeOnTop', {
  doc: 'Place a card on top of the Deck.', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => rt.moveCard(n, c, 'top'));
  },
});
defineAct('setOnField', {
  doc: 'Set a Spell/Trap from where it is (hand, Deck, GY or banishment) to your field.', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => {
      const from = rt.takeOut(n, c);
      n.st.push({ id: c.id, up: false, now: true });
      L.mv(n, c.id, from, 'field');
    });
  },
});
defineAct('payLp', {
  doc: 'Pay the given Life Points, or half of them.', args: A.oneOf(A.int(1), A.enum('half')),
  compile: (a: number | 'half'): ActFn => (a === 'half' ? (n) => { n.lp = Math.floor(n.lp / 2); } : (n) => { n.lp -= a; }),
});
defineAct('gainLp', {
  doc: 'Gain the given Life Points.', args: A.int(1),
  compile: (a: number): ActFn => (n) => { n.lp += a; },
});
defineAct('burn', {
  doc: "Inflict the given damage to the opponent, or (`atkOf`) damage equal to a chosen card's ATK (an opponent's card: its own; read it before the card leaves).",
  args: A.oneOf(A.int(1), A.object({ atkOf: A.choice })),
  compile: (a: number | { atkOf: string }, ctx): ActFn => {
    const OW = ctx.rt.state.OW, rt = ctx.rt, props = ctx.props;
    const hit = (n: State, v: number) => { n.burn += v; if (n.opp) OW(n).lp -= v; };
    if (typeof a === 'number') return (n) => hit(n, a);
    const slot = slotOf(a.atkOf, ctx);
    return (n, r) => rt.each(r, slot, (c) => {
      if (c.zone !== 'opp') { hit(n, props[c.id].atk || 0); return; }
      const o = n.opp?.mons.find((x) => x.uid === c.uid) ?? n.opp?.st.find((x) => x.uid === c.uid);
      hit(n, o?.atk || 0);
    });
  },
});
defineAct('spendUse', {
  doc: 'One of your monsters spends a use of its counted effect (see `usesLeft`).', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => {
      const i = rt.monIndex(n, c);
      if (i < 0) throw new Error(`card ${rt.ids[c.id]} is not a monster on the field`);
      n.mons[i] = { ...n.mons[i], uses: n.mons[i].uses - 1 };
    });
  },
});
defineAct('fusionSummon', {
  doc: "Fusion Summon the chosen Fusion Monster from the Extra Deck with the chosen materials: yours go to `to` (the GY by default, the Deck: shuffled in, or banished), highest field index first, then those from the hand, Deck or GY, then the opponent's are sent to the GY as material; it gets one use per material matching its Fusion rule's `uses`. The materials are material for a Fusion Summon (`usedAsMaterial`); two or more going to the GY together set off `monstersToGyTogether`.",
  args: A.object({ what: A.choice, mats: A.choice, to: A.optional(A.enum('gy', 'deck', 'ban')) }),
  compile: (a: { what: string; mats: string; to?: 'gy' | 'deck' | 'ban' }, ctx): ActFn => {
    if (a.what === 'self' || a.mats === 'self') ctx.fail('names choices (choose[].as names), not this card');
    const fslot = ctx.choiceSlot(a.what), mslot = ctx.choiceSlot(a.mats), rt = ctx.rt, props = ctx.props, to = a.to ?? 'gy';
    return (n, r) => {
      let card = -1;
      rt.each(r, fslot, (c) => { card = c.id; });
      const mats: CardRef[] = [];
      rt.each(r, mslot, (c) => { mats.push(c); });
      const rule = rt.extraRules.find((x) => x.method === 'fusion' && x.card === card);
      let uses = 0;
      if (rule && rule.method === 'fusion' && rule.uses) for (const c of mats) if (rule.uses(n, { self: c.id, at: c, chosen: [] })) uses++;
      const own: CardRef[] = [], rest: CardRef[] = [], field: CardRef[] = [], fieldAt: number[] = [];
      for (const c of mats) {
        if (c.zone === 'opp') continue;
        own.push(c);
        if (c.zone !== 'mon') { rest.push(c); continue; }
        // Field materials leave from the highest monster index down (insertion by index).
        const i = rt.monIndex(n, c);
        let p = field.length;
        while (p > 0 && fieldAt[p - 1] < i) p--;
        field.splice(p, 0, c); fieldAt.splice(p, 0, i);
      }
      const ids: number[] = [];
      let extra: Record<string, unknown> | null;
      rt.asMaterial('fusion', () => {
        if (!rest.length && to !== 'ban') {
          // Quiet: the summon's ledger entry lists the materials and where they went.
          for (const c of field) { ids.push(c.id); rt.moveCard(n, c, to, true); }
          extra = to === 'deck' ? { materialsTo: 'deck' } : null;
        } else {
          // The ledger names one place the listed materials come from: the field if any is there,
          // else the zone of the first; the others are written as moves of their own.
          const listed = field.length ? 'mon' : rest[0].zone;
          for (const c of [...field, ...rest]) {
            if (c.zone === listed) { ids.push(c.id); rt.moveCard(n, c, to, true); } else rt.moveCard(n, c, to);
          }
          const from = listed === 'mon' ? null : listed === 'hand' ? 'hand' : listed === 'deck' ? 'deck' : 'gy';
          extra = from || to !== 'gy' ? { ...(from ? { materialsFrom: from } : {}), ...(to !== 'gy' ? { materialsTo: to === 'ban' ? 'banished' : 'deck' } : {}) } : null;
        }
        if (to === 'deck' && own.some((c) => !props[c.id].ext)) rt.ops.shuffle(n);
        for (const c of mats) if (c.zone === 'opp' && c.uid !== null) rt.ops.oppRemove(n, c.uid, 'material');
      });
      const toGy = [...(to === 'gy' ? own.map((c) => c.id) : []), ...mats.filter((c) => c.zone === 'opp').map(() => rt.UNK)];
      if (toGy.length >= 2) rt.batchToGy(n, toGy);
      L.sum(n, card, 'fusion', 'extra', ids, extra!);
      rt.state.W(n, 'extra')[card]--;
      rt.ops.place(n, card, { special: true, from: 'extra', uses, how: 'fusion' });
    };
  },
});
defineAct('oppRemove', {
  doc: "Destroy or banish one of the opponent's cards.", args: A.object({ what: A.choice, how: A.enum('destroy', 'banish') }),
  compile: (a: { what: string; how: 'destroy' | 'banish' }, ctx): ActFn => {
    if (a.what === 'self') ctx.fail("names one of the opponent's cards (a choice), not this card", 'what');
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => { if (c.uid !== null) rt.ops.oppRemove(n, c.uid, a.how); });
  },
});
defineAct('oppRemoveAll', {
  doc: "Destroy or banish every one of the opponent's cards matching the description (it does not target: targetable does not apply).",
  args: A.object({ how: A.enum('destroy', 'banish'), kind: KIND, faceUp: A.optional(A.boolean), destroyable: A.optional(A.boolean) }),
  compile: (a: { how: 'destroy' | 'banish'; kind?: 'mon' | 'st'; faceUp?: boolean; destroyable?: boolean }, ctx): ActFn => {
    const rt = ctx.rt, up = a.faceUp, ds = a.destroyable;
    const t = (x: OppCardState) => (up === undefined || !x.faceDown === up) && (ds === undefined || !x.noDestroy === ds);
    return (n) => {
      if (!n.opp) return;
      const hit: OppCardState[] = [];
      if (a.kind !== 'st') for (const x of n.opp.mons) if (t(x)) hit.push(x);
      if (a.kind !== 'mon') for (const x of n.opp.st) if (t(x)) hit.push(x);
      for (const x of hit) rt.ops.oppRemove(n, x.uid, a.how);
    };
  },
});
defineAct('oppNegate', {
  doc: "Negate the effects of one of the opponent's cards: it no longer interrupts you (it stays on their field).", args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    if (a.what === 'self') ctx.fail("names one of the opponent's cards (a choice), not this card", 'what');
    const slot = slotOf(a.what, ctx), rt = ctx.rt, OW = ctx.rt.state.OW;
    return (n, r) => rt.each(r, slot, (c) => {
      if (c.zone !== 'opp' || !n.opp) return;
      const o = OW(n);
      for (const list of [o.mons, o.st]) {
        const i = list.findIndex((x) => x.uid === c.uid);
        if (i >= 0) list[i] = { ...list[i], intr: null };
      }
    });
  },
});
defineAct('destroy', {
  doc: "Destroy a chosen card: one of yours goes to the GY (setting off its triggers), one of the opponent's is destroyed.", args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => {
      if (c.zone === 'opp') { if (c.uid !== null) rt.ops.oppRemove(n, c.uid, 'destroy'); return; }
      rt.moveCard(n, c, 'gy');
    });
  },
});
defineAct('returnToHand', {
  doc: "Return a chosen card to the hand: one of yours from where it is (an Extra Deck monster goes to the Extra Deck), one of the opponent's leaves their field (as a banish: no GY).", args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt, props = ctx.props;
    return (n, r) => rt.each(r, slot, (c) => {
      if (c.zone === 'opp') { if (c.uid !== null) rt.ops.oppRemove(n, c.uid, 'banish'); return; }
      rt.moveCard(n, c, props[c.id].ext ? 'extra' : 'hand');
    });
  },
});
defineAct('wipeField', {
  doc: "Destroy as many other cards on the field as possible: yours except this card and those matching `spare` (a filter), and every one of the opponent's that can be destroyed; `banish`: banish them instead of sending them to the GY; `noTriggers`: your cards leave without setting off any trigger. Then Special Summon the `thenSummon` choice from where it is, its Level raised by the number destroyed.",
  args: A.object({ banish: A.optional(A.boolean), spare: A.optional(A.cond), thenSummon: A.optional(A.choice), noTriggers: A.optional(A.boolean) }),
  compile: (a: { banish?: boolean; spare?: Word; thenSummon?: string; noTriggers?: boolean }, ctx): ActFn => {
    if (a.thenSummon === 'self') ctx.fail('names a choice (a choose[].as name), not this card', 'thenSummon');
    const rt = ctx.rt, props = ctx.props, to = a.banish ? 'ban' : 'gy', how = a.banish ? 'banish' : 'destroy';
    const quiet = !!a.noTriggers;
    const leave = (n: State, c: CardRef) => { if (quiet) rt.removeQuietly(n, c.zone as 'mon' | 'st', c.at, to); else rt.moveCard(n, c, to); };
    const spare = a.spare === undefined ? null : (ctx.cond(a.spare, 'spare') as CondFn);
    const slot = a.thenSummon === undefined ? -2 : ctx.choiceSlot(a.thenSummon);
    // One scratch Run, as in `matcher`: not re-entrant.
    const sub: Run = { self: 0, at: { zone: 'none', at: -1, uid: null }, chosen: [] };
    const spared = (n: State, r: Run, id: number, at: Place) => {
      if (!spare) return false;
      sub.self = id; sub.at = at; sub.chosen = r.chosen;
      return spare(n, sub);
    };
    return (n, r) => {
      let count = 0;
      // Last to first, as the cards' indices shift while they leave.
      for (let i = n.mons.length - 1; i >= 0; i--) {
        const m = n.mons[i];
        const at: Place = { zone: 'mon', at: i, uid: m.uid };
        if (r.at.zone === 'mon' ? m.uid === r.at.uid : m.id === r.self) continue;
        if (spared(n, r, m.id, at)) continue;
        leave(n, { id: m.id, ...at }); count++;
      }
      for (let i = n.st.length - 1; i >= 0; i--) {
        const x = n.st[i];
        const at: Place = { zone: 'st', at: i, uid: null };
        if (r.at.zone === 'st' && i === r.at.at && x.id === r.self) continue;
        if (spared(n, r, x.id, at)) continue;
        leave(n, { id: x.id, ...at }); count++;
      }
      if (n.opp) {
        for (const x of n.opp.mons.slice()) if (!x.noDestroy) { rt.ops.oppRemove(n, x.uid, how); count++; }
        for (const x of n.opp.st.slice()) if (!x.noDestroy) { rt.ops.oppRemove(n, x.uid, how); count++; }
      }
      if (slot === -2) return;
      rt.each(r, slot, (c) => {
        const lz = rt.takeOut(n, c);
        L.sum(n, c.id, 'special', lz);
        rt.ops.place(n, c.id, { special: true, from: lz, lvl: (props[c.id].lv ?? 0) + count });
      });
    };
  },
});
defineAct('setFlag', {
  doc: 'Set the named deck-defined state flag.', args: A.flag,
  compile: (a: string, ctx): ActFn => { const bit = 1 << ctx.flagBit(a); return (n) => { n.flags |= bit; }; },
});
defineAct('queue', {
  doc: 'Queue the named effect as a pending trigger to resolve next.', args: A.effect,
  compile: (a: string, ctx): ActFn => { const e = ctx.effectId(a); return (n) => { n.pend.unshift({ e }); }; },
});
defineAct('noDirectAttacks', {
  doc: 'You cannot attack directly for the rest of the turn.', args: A.none,
  compile: (): ActFn => (n) => { n.noDirect = true; },
});
defineAct('changeLevel', {
  doc: "The chosen monster's Level changes by `by` (up if positive, down if negative; never below 1).", args: A.object({ what: A.choice, by: { k: 'number', int: true } }),
  compile: (a: { what: string; by: number }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => {
      const i = rt.monIndex(n, c);
      if (i < 0) throw new Error(`card ${rt.ids[c.id]} is not a monster on the field`);
      n.mons[i] = { ...n.mons[i], lvl: Math.max(1, n.mons[i].lvl + a.by) };
    });
  },
});
defineAct('normalSummon', {
  doc: "Normal Summon the chosen card from the hand: an additional Normal Summon (it neither needs nor uses the turn's Normal Summon).", args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => {
      rt.takeOut(n, { id: c.id, zone: 'hand', at: -1, uid: null });
      L.sum(n, c.id, 'normal');
      rt.ops.place(n, c.id, { special: false, from: 'hand' });
    });
  },
});
defineAct('createToken', {
  doc: 'Special Summon a Token the file declares (`tokens`) to your field. It ceases to exist when it leaves the field; the ledger does not list it.', args: A.object({ card: A.card }),
  compile: (a: { card: CardId }, ctx): ActFn => {
    const id = ctx.ix[a.card], rt = ctx.rt;
    if (!ctx.props[id]?.token) ctx.fail(`"${a.card}" is not a Token (declare it in tokens)`, 'card');
    return (n) => { rt.ops.place(n, id, { special: true, fate: FATE_TOKEN }); };
  },
});
defineAct('tribute', {
  doc: 'Tribute a monster you control: it goes to the GY (a monster banished when it leaves the field: banished; a Token: gone) as a Tribute, which `tributed` reads.', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.asMaterial('tribute', () => rt.each(r, slot, (c) => {
      const f = fromZone(c, 'field', n);
      if (f.zone !== 'mon') throw new Error(`card ${rt.ids[c.id]} is not a monster on the field`);
      rt.moveCard(n, f, 'gy');
    }));
  },
});

// Triggers: when an effect with `trigger` is queued.
interface PlaceEv { id: number; nm: number; special: boolean; from: string | null }
interface MoveEv { id: number; from: string; to: string; up: boolean }

defineTrigger('normalSummoned', {
  doc: 'This card is Normal or Tribute Summoned.', args: A.none,
  compile: (): TriggerFn => trig('place', (ev: PlaceEv, self) => ev.id === self && !ev.special),
});
defineTrigger('specialSummoned', {
  doc: 'This card is Special Summoned (optionally only from the given zone).', args: A.oneOf(A.none, A.object({ from: A.optional(A.zone()) })),
  compile: (a: true | { from?: Zone }, ctx): TriggerFn => {
    const f = a === true || a.from === undefined ? null : ctx.rt.lz(a.from);
    return trig('place', (ev: PlaceEv, self) => ev.id === self && ev.special && (f === null || ev.from === f));
  },
});
defineTrigger('summoned', {
  doc: 'This card is Normal, Tribute or Special Summoned.', args: A.none,
  compile: (): TriggerFn => trig('place', (ev: PlaceEv, self) => ev.id === self),
});
defineTrigger('summonedNamed', {
  doc: 'A monster whose name on the field is the given card is summoned (Normal or Special, or only Special).', args: A.object({ name: A.card, special: A.optional(A.boolean) }),
  compile: (a: { name: CardId; special?: boolean }, ctx): TriggerFn => {
    const nm = ctx.ix[a.name], sp = !!a.special;
    return trig('place', (ev: PlaceEv) => ev.nm === nm && (!sp || ev.special));
  },
});
defineTrigger('leftField', {
  doc: 'This card leaves the field (optionally only to the given zone, or only while face-up / face-down).', args: A.oneOf(A.none, A.object({ to: A.optional(A.zone()), faceUp: A.optional(A.boolean) })),
  compile: (a: true | { to?: Zone; faceUp?: boolean }, ctx): TriggerFn => {
    const t = a === true || a.to === undefined ? null : ctx.rt.lz(a.to);
    const up = a === true ? undefined : a.faceUp;
    return trig('move', (ev: MoveEv, self) => ev.id === self && ev.from === 'field' && (t === null || ev.to === t) && (up === undefined || ev.up === up));
  },
});
defineTrigger('sentToGy', {
  doc: 'This card is sent to the GY (optionally only from the given zone).', args: A.oneOf(A.none, A.object({ from: A.optional(A.zone()) })),
  compile: (a: true | { from?: Zone }, ctx): TriggerFn => {
    const f = a === true || a.from === undefined ? null : ctx.rt.lz(a.from);
    return trig('move', (ev: MoveEv, self) => ev.id === self && ev.to === 'gy' && (f === null || ev.from === f));
  },
});
defineTrigger('usedAsMaterial', {
  doc: 'This card is sent to the GY as material for a Summon of the given `method` (fusion, synchro or link; default fusion); `for`: only for a monster of the group; `anyZone`: wherever it went (banished too).',
  args: A.oneOf(A.none, A.object({ method: A.optional(A.enum('fusion', 'synchro', 'link')), for: A.optional(A.group), anyZone: A.optional(A.boolean) })),
  compile: (a: true | { method?: 'fusion' | 'synchro' | 'link'; for?: string; anyZone?: boolean }, ctx): TriggerFn => {
    const o = a === true ? {} : a;
    const method = o.method ?? 'fusion', any = !!o.anyZone;
    let mask: Uint8Array | null = null;
    if (o.for !== undefined) { mask = new Uint8Array(ctx.props.length); for (const i of ctx.group(o.for)) mask[i] = 1; }
    return trig('move', (ev: MoveEv & { mat: string | null; matFor: number }, self) => ev.id === self && (ev.to === 'gy' || (any && ev.to === 'banished')) && ev.mat === method
      && (mask === null || (ev.matFor >= 0 && mask[ev.matFor] === 1)));
  },
});
defineTrigger('tributed', {
  doc: 'A monster you control (of the group, if given: its printed card) is Tributed (by `tribute`, or for a Tribute Summon). The queued effect knows which (`triggerCard`).', args: A.oneOf(A.none, A.object({ group: A.optional(A.group) })),
  compile: (a: true | { group?: string }, ctx): TriggerFn => {
    const g = a === true ? undefined : a.group;
    let mask: Uint8Array | null = null;
    if (g !== undefined) { mask = new Uint8Array(ctx.props.length); for (const i of ctx.group(g)) mask[i] = 1; }
    return trig('move', (ev: MoveEv & { mat: string | null }) => ev.mat === 'tribute' && ev.from === 'field' && (mask === null || mask[ev.id] === 1), true);
  },
});
defineTrigger('summonedBy', {
  doc: 'A monster is Synchro, Fusion or Link Summoned (`method`; a summon treated as one counts); `notSelf`: not this card.', args: A.object({ method: A.enum('synchro', 'fusion', 'link'), notSelf: A.optional(A.boolean) }),
  compile: (a: { method: string; notSelf?: boolean }): TriggerFn => {
    const ns = !!a.notSelf;
    return trig('place', (ev: PlaceEv & { how: string | null }, self) => ev.how === a.method && (!ns || ev.id !== self));
  },
});
defineTrigger('addedToHand', {
  doc: 'This card is added to the hand from the Deck, GY or banishment (not by a draw).', args: A.none,
  compile: (): TriggerFn => trig('move', (ev: MoveEv, self) => ev.id === self && ev.to === 'hand' && ev.from !== 'field' && ev.from !== 'hand'),
});
defineTrigger('monstersToGyTogether', {
  doc: 'Two (or the given number) or more monsters are sent to the GY at the same time (a summon\'s materials).', args: A.oneOf(A.none, A.int(2)),
  compile: (a: true | Record<string, never> | number): TriggerFn => { const k = typeof a === 'number' ? a : 2; return trig('batch', (ev: { n: number }) => ev.n >= k); },
});
defineTrigger('oppMonsterToGy', {
  doc: "A monster the opponent controls is sent to the GY.", args: A.none,
  compile: (): TriggerFn => trig('oppMonGy', () => true),
});

