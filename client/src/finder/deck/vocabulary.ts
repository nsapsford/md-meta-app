// The deck file vocabulary: four registries of general words (conditions, picks, actions,
// triggers). A deck file is written only in these words; the validator (schema.ts) checks a
// file against each word's argument spec and the compiler (Task 5) turns each word into a
// closure by calling its `compile`. No card appears here: a word is named for what it does.
//
// Adding a word: one defineCond / definePick / defineAct / defineTrigger call below (doc,
// argument spec, compile), plus a row in docs/finder/vocabulary.md. Nothing else changes.

import type { CardId } from '../engine/types';
import type { EffectDef } from './schema';

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
// Compiling (implemented by Task 5)

/** A compiled word. Its exact signature per registry is the compiler's to settle. */
export type Compiled = (...args: any[]) => any;

/**
 * What a word's `compile` gets from the compiler. Task 5 implements this; `Props` is its
 * `CardProps` (the card table's per-card properties).
 */
export interface CompileCtx<Props = unknown> {
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
}

export interface WordDef {
  /** One line: what the word means. Also the "meaning" column of docs/finder/vocabulary.md. */
  doc: string;
  /** What the word's value must look like. */
  args: ArgSpec;
  /** Build the word's closure once, from its (validated) arguments. */
  compile(args: any, ctx: CompileCtx<any>): Compiled;
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

const notYet = (): never => { throw new Error('not compiled until Task 5'); };

// ---------------------------------------------------------------------------------------------
// Seed words. Shared shapes first.

/** Which cards: one card, a group, or a filter condition evaluated per card (at most one; none = any card). */
const WHICH = { card: A.optional(A.card), group: A.optional(A.group), filter: A.optional(A.cond) };
const WHICH_ONE = ['card', 'group', 'filter'];
const KIND = A.optional(A.enum('mon', 'st'));
const OPP = A.object({ kind: KIND, faceUp: A.optional(A.boolean), targetable: A.optional(A.boolean), destroyable: A.optional(A.boolean) });
const FREE = A.oneOf(A.none, A.int(1));

// Conditions
defineCond('has', { doc: 'A zone holds at least one card of the given card, group or filter (any card if none is given).', args: A.object({ zone: A.zone(), ...WHICH }, { atMostOne: WHICH_ONE }), compile: notYet });
defineCond('count', { doc: 'The number of matching cards in a zone is within atLeast..atMost.', args: A.object({ zone: A.zone(), ...WHICH, atLeast: A.optional(A.int(0)), atMost: A.optional(A.int(0)) }, { atMostOne: WHICH_ONE }), compile: notYet });
defineCond('control', { doc: 'You control a matching card on the field (optionally only monsters or Spells/Traps, or only face-up).', args: A.object({ ...WHICH, kind: KIND, faceUp: A.optional(A.boolean) }, { atMostOne: WHICH_ONE }), compile: notYet });
defineCond('monsterZoneFree', { doc: 'At least one (or the given number of) Main Monster Zones is free.', args: FREE, compile: notYet });
defineCond('stZoneFree', { doc: 'At least one (or the given number of) Spell/Trap Zones is free.', args: FREE, compile: notYet });
defineCond('notUsed', { doc: 'The named once-per-turn effect or shared limit has not been used this turn.', args: A.limit, compile: notYet });
defineCond('flag', { doc: 'The named deck-defined state flag is set.', args: A.flag, compile: notYet });
defineCond('addLockOff', { doc: 'You are not locked out of adding cards from the Deck to the hand.', args: A.none, compile: notYet });
defineCond('lpAbove', { doc: 'Your Life Points are above the given number.', args: A.int(0), compile: notYet });
defineCond('oppHasTarget', { doc: 'The opponent has a card matching the description (kind, face-up, targetable, destroyable).', args: A.oneOf(A.none, OPP), compile: notYet });
defineCond('spellActivatedThisTurn', { doc: 'You have activated a Spell card this turn.', args: A.none, compile: notYet });
defineCond('not', { doc: 'The nested condition is false.', args: A.cond, compile: notYet });
defineCond('any', { doc: 'At least one of the nested conditions is true.', args: A.list(A.cond, 1), compile: notYet });

// Picks: what the player chooses from; each choice becomes a separate move.
definePick('fromZone', { doc: 'Each distinct card of a group or filter in a zone.', args: A.object({ zone: A.zone(), group: A.optional(A.group), filter: A.optional(A.cond) }, { exactlyOne: ['group', 'filter'] }), compile: notYet });
definePick('fromField', { doc: 'Each card you control on the field, optionally of a group or filter, kind, or face-up only.', args: A.object({ group: A.optional(A.group), filter: A.optional(A.cond), kind: KIND, faceUp: A.optional(A.boolean) }, { atMostOne: ['group', 'filter'] }), compile: notYet });
definePick('otherHandCard', { doc: 'Each distinct card in hand other than this one (another copy of it counts), optionally of a group or filter.', args: A.oneOf(A.none, A.object({ group: A.optional(A.group), filter: A.optional(A.cond) }, { atMostOne: ['group', 'filter'] })), compile: notYet });
definePick('cheapest', { doc: 'Only the n (default 1) choices of the nested pick with the lowest discard value.', args: A.object({ of: A.pick, n: A.optional(A.int(1)) }), compile: notYet });
definePick('subsets', { doc: 'Each set of min..max choices of the nested pick.', args: A.object({ of: A.pick, min: A.int(0), max: A.int(1) }), compile: notYet });
definePick('oppCard', { doc: "Each of the opponent's cards matching the description (kind, face-up, targetable, destroyable).", args: A.oneOf(A.none, OPP), compile: notYet });

// Actions: what happens. `what` names 'self' or a chosen card (`choose[].as`).
defineAct('move', { doc: 'Move a card from where it is (or from the given zone) to a zone.', args: A.object({ what: A.choice, to: A.zone(), from: A.optional(A.zone()) }), compile: notYet });
defineAct('summon', { doc: 'Special Summon a card (from where it is or the given zone), optionally with its effects negated or under another name.', args: A.object({ what: A.choice, from: A.optional(A.zone()), noEff: A.optional(A.boolean), as: A.optional(A.card) }), compile: notYet });
defineAct('discard', { doc: 'Discard a card from the hand to the GY.', args: A.object({ what: A.choice }), compile: notYet });
defineAct('draw', { doc: 'Draw the given number of cards.', args: A.int(1), compile: notYet });
defineAct('setFromDeck', { doc: 'Set a Spell/Trap from the Deck to your field.', args: A.object({ what: A.choice }), compile: notYet });
defineAct('faceUp', { doc: 'Turn a Set Spell/Trap face-up (as when it is activated).', args: A.object({ what: A.choice }), compile: notYet });
defineAct('placeOnTop', { doc: 'Place a card on top of the Deck.', args: A.object({ what: A.choice }), compile: notYet });
defineAct('payLp', { doc: 'Pay the given Life Points, or half of them.', args: A.oneOf(A.int(1), A.enum('half')), compile: notYet });
defineAct('burn', { doc: 'Inflict the given damage to the opponent.', args: A.int(1), compile: notYet });
defineAct('oppRemove', { doc: "Destroy or banish one of the opponent's cards.", args: A.object({ what: A.choice, how: A.enum('destroy', 'banish') }), compile: notYet });
defineAct('setFlag', { doc: 'Set the named deck-defined state flag.', args: A.flag, compile: notYet });
defineAct('queue', { doc: 'Queue the named effect as a pending trigger to resolve next.', args: A.effect, compile: notYet });
defineAct('noDirectAttacks', { doc: 'You cannot attack directly for the rest of the turn.', args: A.none, compile: notYet });

// Triggers: when an effect with `trigger` is queued.
defineTrigger('normalSummoned', { doc: 'This card is Normal or Tribute Summoned.', args: A.none, compile: notYet });
defineTrigger('specialSummoned', { doc: 'This card is Special Summoned (optionally only from the given zone).', args: A.oneOf(A.none, A.object({ from: A.optional(A.zone()) })), compile: notYet });
defineTrigger('summonedNamed', { doc: 'A monster whose name on the field is the given card is summoned (Normal or Special, or only Special).', args: A.object({ name: A.card, special: A.optional(A.boolean) }), compile: notYet });
defineTrigger('leftField', { doc: 'This card leaves the field (optionally only to the given zone).', args: A.oneOf(A.none, A.object({ to: A.optional(A.zone()) })), compile: notYet });
defineTrigger('sentToGy', { doc: 'This card is sent to the GY (optionally only from the given zone).', args: A.oneOf(A.none, A.object({ from: A.optional(A.zone()) })), compile: notYet });
defineTrigger('oppMonsterToGy', { doc: "A monster the opponent controls is sent to the GY.", args: A.none, compile: notYet });
