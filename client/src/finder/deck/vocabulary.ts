// The deck file vocabulary: four registries of general words (conditions, picks, actions,
// triggers). A deck file is written only in these words; the validator (schema.ts) checks a
// file against each word's argument spec and the compiler (Task 5) turns each word into a
// closure by calling its `compile`. No card appears here: a word is named for what it does.
//
// Adding a word: one defineCond / definePick / defineAct / defineTrigger call below (doc,
// argument spec, compile), plus a row in docs/finder/vocabulary.md. Nothing else changes.

import type { CardId, FinalBoard, State } from '../engine/types';
import type { EffectDef } from './schema';
import { L } from '../engine/record';
import type { ActFn, CardProps, CardRef, Choice, CondFn, CountFn, PickFn, Run, Runtime, TrigEvent, TriggerFn } from './compile';

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
const OPP = A.object({ kind: KIND, faceUp: A.optional(A.boolean), targetable: A.optional(A.boolean), destroyable: A.optional(A.boolean) });
const FREE = A.oneOf(A.none, A.int(1));

type Zone = 'hand' | 'deck' | 'extra' | 'gy' | 'ban' | 'field';
type Match = (s: FinalBoard, r: Run, id: number) => boolean;
interface WhichArgs { card?: CardId; group?: string; filter?: Word }

const ANY: Match = () => true;

/** A card test from `which` arguments (any card if none). A filter sees the candidate as `self`. */
function matcher(a: WhichArgs, ctx: CompileCtx): Match {
  if (a.card !== undefined) { const c = ctx.ix[a.card]; return (_s, _r, id) => id === c; }
  if (a.group !== undefined) {
    const mask = new Uint8Array(ctx.props.length);
    for (const i of ctx.group(a.group)) mask[i] = 1;
    return (_s, _r, id) => mask[id] === 1;
  }
  if (a.filter !== undefined) {
    const f = ctx.cond(a.filter, 'filter') as CondFn;
    // One scratch Run per filter: not re-entrant (a filter that, through its own words, ran this same filter again would see it overwritten).
    const sub: Run = { self: 0, at: { zone: 'none', at: -1, uid: null }, chosen: [] };
    return (s, r, id) => { sub.self = id; sub.chosen = r.chosen; return f(s, sub); };
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

/** Count matching cards in a zone (field: monsters and Spells/Traps). */
function zoneCounter(zone: Zone, m: Match, n: number): CountFn {
  if (zone === 'field') return (s, r) => {
    let k = 0;
    for (const x of s.mons) if (m(s, r, x.id)) k++;
    for (const x of s.st) if (m(s, r, x.id)) k++;
    return k;
  };
  return (s, r) => { const z = s[zone]; let k = 0; for (let i = 0; i < n; i++) if (z[i] && m(s, r, i)) k += z[i]; return k; };
}

interface ControlArgs extends WhichArgs { kind?: 'mon' | 'st'; faceUp?: boolean }
function controlCounter(a: ControlArgs, ctx: CompileCtx): CountFn {
  const m = matcher(a, ctx);
  const mons = a.kind !== 'st' && a.faceUp !== false;   // monsters on the field are face-up
  const sts = a.kind !== 'mon';
  const up = a.faceUp;
  return (s, r) => {
    let k = 0;
    if (mons) for (const x of s.mons) if (m(s, r, x.id)) k++;
    if (sts) for (const x of s.st) if ((up === undefined || x.up === up) && m(s, r, x.id)) k++;
    return k;
  };
}

interface OppArgs { kind?: 'mon' | 'st'; faceUp?: boolean; targetable?: boolean; destroyable?: boolean }
/**
 * An opponent's card test; each given field must match. `targetable` defaults to true (as the
 * reference's oppTargets); the other absent fields do not matter.
 */
function oppTest(a: OppArgs | true): (x: { faceDown?: boolean; noTarget?: boolean; noDestroy?: boolean }) => boolean {
  if (a === true) a = {};
  const tg = a.targetable ?? true, up = a.faceUp, ds = a.destroyable;
  return (x) => !x.noTarget === tg
    && (up === undefined || !x.faceDown === up)
    && (ds === undefined || !x.noDestroy === ds);
}

const free = (a: true | Record<string, never> | number): number => (typeof a === 'number' ? a : 1);
const trig = (on: TrigEvent['t'], f: (ev: any, self: number) => boolean): TriggerFn => Object.assign(f, { on });

// Conditions
defineCond('has', {
  doc: 'A zone holds at least one card of the given card, group or filter (any card if none is given).',
  args: A.object({ zone: A.zone(), ...WHICH }, { atMostOne: WHICH_ONE }),
  compile: (a: WhichArgs & { zone: Zone }, ctx): CondFn => { const c = zoneCounter(a.zone, matcher(a, ctx), ctx.props.length); return (s, r) => c(s, r) > 0; },
  count: (a: WhichArgs & { zone: Zone }, ctx): CountFn => zoneCounter(a.zone, matcher(a, ctx), ctx.props.length),
});
defineCond('count', {
  doc: 'The number of matching cards in a zone is within atLeast..atMost.',
  args: A.object({ zone: A.zone(), ...WHICH, atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }, { atMostOne: WHICH_ONE }),
  compile: (a: WhichArgs & { zone: Zone; atLeast?: number; atMost?: number }, ctx): CondFn => {
    const c = zoneCounter(a.zone, matcher(a, ctx), ctx.props.length);
    const lo = a.atLeast ?? 0, hi = a.atMost ?? Infinity;
    return (s, r) => { const k = c(s, r); return k >= lo && k <= hi; };
  },
});
defineCond('control', {
  doc: 'You control a matching card on the field (optionally only monsters or Spells/Traps, or only face-up).',
  args: A.object({ ...WHICH, kind: KIND, faceUp: A.optional(A.boolean) }, { atMostOne: WHICH_ONE }),
  compile: (a: ControlArgs, ctx): CondFn => { const c = controlCounter(a, ctx); return (s, r) => c(s, r) > 0; },
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

// Picks: what the player chooses from; each choice becomes a separate move.
function fieldPick(m: Match, kind: 'mon' | 'st' | undefined, faceUp: boolean | undefined, rt: Runtime): PickFn {
  return (s, r) => {
    const out: Choice[] = [];
    if (kind !== 'st' && faceUp !== false) s.mons.forEach((x, i) => { if (m(s, r, x.id) && !takenAt(r.chosen, 'mon', i)) out.push(rt.choiceOnField('mon', i, x.id, x.uid)); });
    if (kind !== 'mon') s.st.forEach((x, i) => { if ((faceUp === undefined || x.up === faceUp) && m(s, r, x.id) && !takenAt(r.chosen, 'st', i)) out.push(rt.choiceOnField('st', i, x.id, null)); });
    return out;
  };
}

definePick('fromZone', {
  doc: 'Each distinct card of a group or filter in a zone.',
  args: A.object({ zone: A.zone(), group: A.optional(A.group), filter: A.optional(A.cond) }, { exactlyOne: ['group', 'filter'] }),
  compile: (a: { zone: Zone; group?: string; filter?: Word }, ctx): PickFn => {
    const m = matcher(a, ctx);
    if (a.zone === 'field') return fieldPick(m, undefined, undefined, ctx.rt);
    const z = a.zone, n = ctx.props.length, rt = ctx.rt;
    return (s, r) => {
      const out: Choice[] = [], zz = s[z];
      for (let i = 0; i < n; i++) if (zz[i] && m(s, r, i) && zz[i] > taken(r.chosen, z, i)) out.push(rt.choiceIn(z, i));
      return out;
    };
  },
});
definePick('fromField', {
  doc: 'Each card you control on the field, optionally of a group or filter, kind, or face-up only.',
  args: A.object({ group: A.optional(A.group), filter: A.optional(A.cond), kind: KIND, faceUp: A.optional(A.boolean) }, { atMostOne: ['group', 'filter'] }),
  compile: (a: { group?: string; filter?: Word; kind?: 'mon' | 'st'; faceUp?: boolean }, ctx): PickFn => fieldPick(matcher(a, ctx), a.kind, a.faceUp, ctx.rt),
});
definePick('otherHandCard', {
  doc: 'Each distinct card in hand other than this one (another copy of it counts), optionally of a group or filter.',
  args: A.oneOf(A.none, A.object({ group: A.optional(A.group), filter: A.optional(A.cond) }, { atMostOne: ['group', 'filter'] })),
  compile: (a: true | { group?: string; filter?: Word }, ctx): PickFn => {
    const m = a === true ? ANY : matcher(a, ctx);
    const n = ctx.props.length, rt = ctx.rt;
    return (s, r) => {
      const out: Choice[] = [], h = s.hand;
      for (let i = 0; i < n; i++) {
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
definePick('subsets', {
  doc: 'Each set of min..max choices of the nested pick.',
  args: A.object({ of: A.pick, min: A.int(0), max: A.int(1) }),
  compile: (a: { of: Word; min: number; max: number }, ctx): PickFn => {
    const of = ctx.pick(a.of, 'of') as PickFn;
    if (a.min > a.max) ctx.fail(`min ${a.min} is above max ${a.max}`);
    return (s, r) => {
      const opts = of(s, r), out: Choice[] = [], cur: Choice[] = [];
      const walk = (start: number): void => {
        if (cur.length >= a.min) {
          const many = cur.slice();
          out.push({ id: -1, zone: many[0]?.zone ?? 'none', at: -1, uid: null, key: many.map((c) => c.key).join('+'), name: many.map((c) => c.name).join(' and '), many });
        }
        if (cur.length === a.max) return;
        for (let i = start; i < opts.length; i++) { cur.push(opts[i]); walk(i + 1); cur.pop(); }
      };
      walk(0);
      return out;
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
  doc: 'Special Summon a card (from where it is or the given zone), optionally with its effects negated or under another name.',
  args: A.object({ what: A.choice, from: A.optional(A.zone()), noEff: A.optional(A.boolean), as: A.optional(A.card) }),
  compile: (a: { what: string; from?: Zone; noEff?: boolean; as?: CardId }, ctx): ActFn => {
    if (a.from === 'field') ctx.fail('a monster is summoned from a zone, not from the field', 'from');
    const slot = slotOf(a.what, ctx), rt = ctx.rt, noEff = !!a.noEff, nm = a.as === undefined ? undefined : ctx.ix[a.as];
    return (n, r) => rt.each(r, slot, (c) => {
      const lz = rt.takeOut(n, fromZone(c, a.from, n));
      L.sum(n, c.id, 'special', lz);
      rt.ops.place(n, c.id, { special: true, noEff, nm, from: lz });
    });
  },
});
defineAct('discard', {
  doc: 'Discard a card from the hand to the GY.', args: A.object({ what: A.choice }),
  compile: (a: { what: string }, ctx): ActFn => {
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => rt.moveCard(n, { id: c.id, zone: 'hand', at: -1, uid: null }, 'gy'));
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
defineAct('payLp', {
  doc: 'Pay the given Life Points, or half of them.', args: A.oneOf(A.int(1), A.enum('half')),
  compile: (a: number | 'half'): ActFn => (a === 'half' ? (n) => { n.lp = Math.floor(n.lp / 2); } : (n) => { n.lp -= a; }),
});
defineAct('burn', {
  doc: 'Inflict the given damage to the opponent.', args: A.int(1),
  compile: (a: number, ctx): ActFn => { const OW = ctx.rt.state.OW; return (n) => { n.burn += a; if (n.opp) OW(n).lp -= a; }; },
});
defineAct('oppRemove', {
  doc: "Destroy or banish one of the opponent's cards.", args: A.object({ what: A.choice, how: A.enum('destroy', 'banish') }),
  compile: (a: { what: string; how: 'destroy' | 'banish' }, ctx): ActFn => {
    if (a.what === 'self') ctx.fail("names one of the opponent's cards (a choice), not this card", 'what');
    const slot = slotOf(a.what, ctx), rt = ctx.rt;
    return (n, r) => rt.each(r, slot, (c) => { if (c.uid !== null) rt.ops.oppRemove(n, c.uid, a.how); });
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

// Triggers: when an effect with `trigger` is queued.
interface PlaceEv { id: number; nm: number; special: boolean; from: string | null }
interface MoveEv { id: number; from: string; to: string }

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
defineTrigger('summonedNamed', {
  doc: 'A monster whose name on the field is the given card is summoned (Normal or Special, or only Special).', args: A.object({ name: A.card, special: A.optional(A.boolean) }),
  compile: (a: { name: CardId; special?: boolean }, ctx): TriggerFn => {
    const nm = ctx.ix[a.name], sp = !!a.special;
    return trig('place', (ev: PlaceEv) => ev.nm === nm && (!sp || ev.special));
  },
});
defineTrigger('leftField', {
  doc: 'This card leaves the field (optionally only to the given zone).', args: A.oneOf(A.none, A.object({ to: A.optional(A.zone()) })),
  compile: (a: true | { to?: Zone }, ctx): TriggerFn => {
    const t = a === true || a.to === undefined ? null : ctx.rt.lz(a.to);
    return trig('move', (ev: MoveEv, self) => ev.id === self && ev.from === 'field' && (t === null || ev.to === t));
  },
});
defineTrigger('sentToGy', {
  doc: 'This card is sent to the GY (optionally only from the given zone).', args: A.oneOf(A.none, A.object({ from: A.optional(A.zone()) })),
  compile: (a: true | { from?: Zone }, ctx): TriggerFn => {
    const f = a === true || a.from === undefined ? null : ctx.rt.lz(a.from);
    return trig('move', (ev: MoveEv, self) => ev.id === self && ev.to === 'gy' && (f === null || ev.from === f));
  },
});
defineTrigger('oppMonsterToGy', {
  doc: "A monster the opponent controls is sent to the GY.", args: A.none,
  compile: (): TriggerFn => trig('oppMonGy', () => true),
});

