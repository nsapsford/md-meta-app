// The deck file: its TypeScript shape and the validator. A deck file names its cards and says
// what each does in the words of vocabulary.ts. `validateDeckFile` checks a raw (parsed JSON)
// file, merges in the shared files it `uses`, and reports every problem it finds, each naming
// the card (or null for a top-level problem) and the JSON path of the field.

import type { CardId } from '../engine/types';
import { A, KIND_LABEL, WORDS, ZONES, type ArgSpec, type NameKind, type Word, type WordKind } from './vocabulary';

export type { Word } from './vocabulary';

export const VOCAB_VERSION = 1;

export interface CardFacts { passcode: number; name: string; type: string; race: string | null; attr: string | null; level: number | null; link: number | null; atk: number | null; def: number | null; text: string }

export interface DeckFile {
  vocab: number; id: string; name: string; uses?: string[];          // uses: shared files merged in first
  marks?: string[]; flags?: string[];                                 // deck-defined tag marks and state flags
  cards: CardDef[];
  groups: Record<string, CardId[] | { filter: Word }>;
  extraDeck?: ExtraRule[];
  protections?: ProtectionDef[];
  endOfTurn: { setOrder: CardId[]; keepOneInHandIf?: Word[]; setOnlyIf?: Record<CardId, Word[]> };
  boardValue: BoardValueDef[];
  /** List orders by card id that win over the cards' own `listOrder` (a shared file's card fits many decks; each deck orders it here). Merged into the cards. */
  listOrder?: Record<CardId, number>;
}
export interface CardDef { id: CardId; passcodes: number[]; short: string; discardValue?: number; heldValue?: number; immuneToRemoval?: boolean;
  hints?: { normalSummon?: boolean };
  /** Where the card comes when a pick lists several cards (lower first; cards without one come after, by id). */
  listOrder?: number; fieldName?: CardId | { if: Word[]; name: CardId }[]; gyName?: CardId; effects?: EffectDef[] }
export type Loc = 'hand' | 'field' | 'setNotThisTurn' | 'faceDown' | 'faceUp' | 'gy' | 'ban' | 'extra';
export interface EffectDef { key: string; order?: number; phase: 'main' | 'end' | 'oppTurn';
  from: Loc | Loc[];                                                  // where the card must be
  trigger?: Word; limit?: 'oncePerTurn' | { shared: string }; cond?: Word[]; cost?: Word[];
  choose?: { as: string; pick: Word; optional?: boolean }[]; do: Word[]; onNegated?: Word[];
  tags: Record<string, boolean | Word>; marks?: string[]; negatable?: boolean; activates?: 'spell' | 'trap';
  /** Tags the step records on top of `tags` (the opponent's responses read them); the move itself carries only `tags`. */
  stepTags?: Record<string, boolean | Word>;
  /** Marks the step records on top of `marks` (the move itself carries only `marks`). */
  stepMarks?: string[];
  /** A trigger: declining it is offered only when it has no move to make (default false: always offered). */
  mandatory?: boolean;
  text: string; negText?: string; ledger?: { effect?: number } }
/** An Extra Deck rule. Rules are tried in (`order`, card id, method) order, whatever their order in the file. */
export type ExtraRule = { order?: number } & (
  | { card: CardId; method: 'synchro'; level: number; min: number; max: number; tuners: 'exactlyOne' | 'atMostOne'; mats?: Word; then?: string }
  | { card: CardId; method: 'link'; rating: number; min: number; max: number; mats?: Word; bottomArrows?: boolean; then?: string }
  | { card: CardId; method: 'fusion'; slots: Word[]; relations?: ('sameRace' | 'sameAttr' | 'differentRace' | 'differentNames')[]; then?: string });
export interface ProtectionDef { id: string; label: string; order: number; where: Word[]; covers?: { marks?: string[]; monsterOnly?: boolean; inResponseOnly?: boolean }; limit?: string; consume: Word[]; stepNote?: string }
export interface BoardValueDef { id: string; when: 'oppTurn' | 'endPhase'; on: Word; base: { if?: Word[]; value: number; label: string }[]; adds?: { if: Word[]; value: number; label: string }[]; extraCopies?: { value: number; label: string }; effect?: EffectDef }
export interface DeckFileError { card: string | null; field: string; message: string }

/** Interruption tags an effect may carry (the engine's `Tags`, less `marks`, which a file names in `marks`). */
export const TAG_NAMES = ['deckTouch', 'deckAdd', 'fieldMon', 'handMon', 'gy', 'spell', 'trap', 'noResp', 'inherent', 'removal', 'dig'] as const;
const TAGS: ReadonlySet<string> = new Set(TAG_NAMES);

export const LOCS: readonly Loc[] = ['hand', 'field', 'setNotThisTurn', 'faceDown', 'faceUp', 'gy', 'ban', 'extra'];

// ---------------------------------------------------------------------------------------------
// The file's own fields, in the same spec language as word arguments. `effects` (on a card) and
// `effect` (on a board value) are checked separately, because each effect has its own scope of
// chosen names.

type Fields = Record<string, ArgSpec>;
const opt = A.optional;
const LOC = A.enum(...LOCS);
const LABEL_VALUE = A.object({ value: A.number, label: A.string });

const CARD: Fields = {
  id: A.string, passcodes: A.list(A.int(0), 1), short: A.string,
  discardValue: opt(A.number), heldValue: opt(A.number), immuneToRemoval: opt(A.boolean),
  hints: opt(A.object({ normalSummon: opt(A.boolean) })), listOrder: opt(A.number),
  fieldName: opt(A.oneOf(A.card, A.list(A.object({ if: A.condList, name: A.card })))),
  gyName: opt(A.card),
};

const EFFECT: Fields = {
  key: A.string, order: opt(A.number), phase: A.enum('main', 'end', 'oppTurn'),
  from: A.oneOf(LOC, A.list(LOC, 1)),
  trigger: opt(A.trigger),
  limit: opt(A.oneOf(A.enum('oncePerTurn'), A.object({ shared: A.string }))),
  cond: opt(A.condList), cost: opt(A.actList),
  choose: opt(A.list(A.object({ as: A.string, pick: A.pick, optional: opt(A.boolean) }))),
  do: A.actList, onNegated: opt(A.actList),
  tags: A.record(A.oneOf(A.boolean, A.cond), 'tag'), stepTags: opt(A.record(A.oneOf(A.boolean, A.cond), 'tag')), mandatory: opt(A.boolean),
  marks: opt(A.list(A.mark)), stepMarks: opt(A.list(A.mark)), negatable: opt(A.boolean), activates: opt(A.enum('spell', 'trap')),
  text: A.string, negText: opt(A.string), ledger: opt(A.object({ effect: opt(A.number) })),
};

const EXTRA_RULE: ArgSpec = {
  k: 'variant', tag: 'method', cases: {
    synchro: { order: opt(A.number), card: A.card, level: A.int(1), min: A.int(1), max: A.int(1), tuners: A.enum('exactlyOne', 'atMostOne'), mats: opt(A.cond), then: opt(A.effect) },
    link: { order: opt(A.number), card: A.card, rating: A.int(1), min: A.int(1), max: A.int(1), mats: opt(A.cond), bottomArrows: opt(A.boolean), then: opt(A.effect) },
    fusion: { order: opt(A.number), card: A.card, slots: A.list(A.cond, 1), relations: opt(A.list(A.enum('sameRace', 'sameAttr', 'differentRace', 'differentNames'))), then: opt(A.effect) },
  },
};

const PROTECTION = A.object({
  id: A.string, label: A.string, order: A.number, where: A.condList,
  covers: opt(A.object({ marks: opt(A.list(A.mark)), monsterOnly: opt(A.boolean), inResponseOnly: opt(A.boolean) })),
  limit: opt(A.string), consume: A.actList, stepNote: opt(A.string),
});

const BOARD_VALUE: Fields = {
  id: A.string, when: A.enum('oppTurn', 'endPhase'), on: A.cond,
  base: A.list(A.object({ if: opt(A.condList), value: A.number, label: A.string })),
  adds: opt(A.list(A.object({ if: A.condList, value: A.number, label: A.string }))),
  extraCopies: opt(LABEL_VALUE),
};

const END_OF_TURN = A.object({ setOrder: A.cardList, keepOneInHandIf: opt(A.condList), setOnlyIf: opt(A.record(A.condList, 'card')) });

const top = (required: boolean): Fields => {
  const r = (s: ArgSpec) => (required ? s : opt(s));
  return {
    id: r(A.string), name: r(A.string),
    marks: opt(A.list(A.string)), flags: opt(A.list(A.string)),
    groups: r(A.record(A.oneOf(A.cardList, A.object({ filter: A.cond })))),
    extraDeck: opt(A.list(EXTRA_RULE)), protections: opt(A.list(PROTECTION)),
    endOfTurn: r(END_OF_TURN),
    listOrder: opt(A.record(A.number, 'card')),
  };
};
const DECK_TOP = top(true);
const SHARED_TOP = top(false);

// ---------------------------------------------------------------------------------------------
// Checking

interface Symbols { card: Set<string>; group: Set<string>; flag: Set<string>; mark: Set<string>; effect: Set<string>; limit: Set<string> }

interface Ctx {
  sym: Symbols;
  errors: DeckFileError[];
  /** The card being checked (fields are then relative to it), or null at the top level. */
  card: string | null;
  /** Prefix of top-level fields: '' for the deck file, '<key>:' for a shared file. */
  prefix: string;
  /** Names bound by the current effect's `choose` (null outside an effect). */
  choices: Set<string> | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const join = (path: string, key: string) => (path ? `${path}.${key}` : key);
const at = (path: string, i: number) => `${path}[${i}]`;
const show = (v: unknown) => (v === undefined ? 'nothing' : JSON.stringify(v));

function err(c: Ctx, field: string, message: string): void {
  c.errors.push({ card: c.card, field: c.card === null ? c.prefix + field : field, message });
}

const NAME_LABEL: Record<NameKind, string> = { card: 'card', group: 'group', flag: 'flag', mark: 'mark', tag: 'tag', effect: 'effect', limit: 'effect or limit', choice: 'choice' };

function checkName(of: NameKind, v: unknown, path: string, c: Ctx): void {
  if (typeof v !== 'string') return err(c, path, 'expected a string');
  let known: boolean;
  switch (of) {
    case 'tag': known = TAGS.has(v); break;
    case 'limit': known = c.sym.effect.has(v) || c.sym.limit.has(v); break;
    case 'choice': known = v === 'self' || !!c.choices?.has(v); break;
    default: known = c.sym[of].has(v);
  }
  if (!known) err(c, path, of === 'choice' ? `unknown choice "${v}" (not bound by choose)` : `unknown ${NAME_LABEL[of]} "${v}"`);
}

function fits(s: ArgSpec, v: unknown): boolean {
  switch (s.k) {
    case 'name': case 'zone': case 'string': case 'enum': return typeof v === 'string';
    case 'number': return typeof v === 'number';
    case 'boolean': return typeof v === 'boolean';
    case 'none': return v === true || (isObj(v) && Object.keys(v).length === 0);
    case 'list': return Array.isArray(v);
    case 'optional': return fits(s.of, v);
    case 'oneOf': return s.of.some((x) => fits(x, v));
    default: return isObj(v);
  }
}

function describe(s: ArgSpec): string {
  switch (s.k) {
    case 'name': return `a ${NAME_LABEL[s.of]} name`;
    case 'zone': case 'enum': return `one of ${(s.k === 'zone' ? s.zones ?? ZONES : s.values).join(', ')}`;
    case 'number': return s.int ? 'an integer' : 'a number';
    case 'string': return 'a string';
    case 'boolean': return 'true or false';
    case 'none': return 'true or {}';
    case 'cond': case 'pick': case 'act': case 'trigger': return `a ${KIND_LABEL[`${s.k}s` as WordKind]}`;
    case 'list': return 'a list';
    case 'optional': return describe(s.of);
    case 'oneOf': return s.of.map(describe).join(' or ');
    default: return 'an object';
  }
}

function check(s: ArgSpec, v: unknown, path: string, c: Ctx, inWord: boolean): void {
  switch (s.k) {
    case 'name': return checkName(s.of, v, path, c);
    case 'zone': case 'enum': {
      const values = s.k === 'zone' ? s.zones ?? ZONES : s.values;
      if (typeof v !== 'string' || !values.includes(v)) err(c, path, `expected one of ${values.join(', ')}, got ${show(v)}`);
      return;
    }
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return err(c, path, `expected ${describe(s)}, got ${show(v)}`);
      if (s.int && !Number.isInteger(v)) return err(c, path, `expected an integer, got ${show(v)}`);
      if (s.min !== undefined && v < s.min) err(c, path, `expected at least ${s.min}, got ${v}`);
      return;
    case 'string': case 'boolean': case 'none':
      if (!fits(s, v)) err(c, path, `expected ${describe(s)}, got ${show(v)}`);
      return;
    case 'cond': case 'pick': case 'act': case 'trigger':
      return checkWord(`${s.k}s` as WordKind, v, path, c);
    case 'list':
      if (!Array.isArray(v)) return err(c, path, `expected a list, got ${show(v)}`);
      if (s.min !== undefined && v.length < s.min) err(c, path, `expected at least ${s.min} ${s.min === 1 ? 'entry' : 'entries'}`);
      v.forEach((x, i) => check(s.of, x, at(path, i), c, inWord));
      return;
    case 'optional':
      if (v !== undefined) check(s.of, v, path, c, inWord);
      return;
    case 'object':
      if (!isObj(v)) return err(c, path, `expected an object, got ${show(v)}`);
      checkFields(s.fields, v, path, c, inWord);
      if (s.atMostOne && present(v, s.atMostOne) > 1) err(c, path, `use at most one of ${s.atMostOne.join(', ')}`);
      if (s.exactlyOne && present(v, s.exactlyOne) !== 1) err(c, path, `needs exactly one of ${s.exactlyOne.join(', ')}`);
      return;
    case 'record':
      if (!isObj(v)) return err(c, path, `expected an object, got ${show(v)}`);
      for (const [k, x] of Object.entries(v)) {
        const n = c.errors.length;
        if (s.key) checkName(s.key, k, join(path, k), c);
        if (c.errors.length === n) check(s.of, x, join(path, k), c, inWord);
      }
      return;
    case 'oneOf': {
      const alt = s.of.find((x) => fits(x, v));
      if (!alt) return err(c, path, `expected ${describe(s)}, got ${show(v)}`);
      return check(alt, v, path, c, inWord);
    }
    case 'variant': {
      if (!isObj(v)) return err(c, path, `expected an object, got ${show(v)}`);
      const tag = v[s.tag];
      const fields = typeof tag === 'string' ? s.cases[tag] : undefined;
      if (!fields) return err(c, join(path, s.tag), `expected one of ${Object.keys(s.cases).join(', ')}, got ${show(tag)}`);
      checkFields({ [s.tag]: A.string, ...fields }, v, path, c, inWord);
      return;
    }
  }
}

const present = (v: Record<string, unknown>, keys: readonly string[]) => keys.filter((k) => v[k] !== undefined).length;

/** Check an object's fields against `fields`; keys in `handled` are checked by the caller. */
function checkFields(fields: Fields, v: Record<string, unknown>, path: string, c: Ctx, inWord: boolean, handled: readonly string[] = []): void {
  for (const [k, s] of Object.entries(fields)) {
    if (v[k] === undefined) { if (s.k !== 'optional') err(c, join(path, k), 'missing'); }
    else check(s, v[k], join(path, k), c, inWord);
  }
  for (const k of Object.keys(v)) {
    if (!(k in fields) && !handled.includes(k)) err(c, join(path, k), `unknown ${inWord ? 'argument' : 'field'} "${k}"`);
  }
}

function checkWord(kind: WordKind, v: unknown, path: string, c: Ctx): void {
  const label = KIND_LABEL[kind];
  if (!isObj(v)) return err(c, path, `expected a ${label} (an object with one key), got ${show(v)}`);
  const keys = Object.keys(v);
  if (keys.length !== 1) return err(c, path, `a word must have exactly one key, found ${keys.length}`);
  const def = WORDS[kind].get(keys[0]);
  if (!def) return err(c, path, `unknown ${label} "${keys[0]}"`);
  check(def.args, v[keys[0]], join(path, keys[0]), c, true);
}

function checkEffect(e: unknown, path: string, c: Ctx): void {
  if (!isObj(e)) return err(c, path, `expected an object, got ${show(e)}`);
  const choices = new Set<string>();
  if (Array.isArray(e.choose)) e.choose.forEach((ch, i) => {
    if (!isObj(ch) || typeof ch.as !== 'string') return;
    if (choices.has(ch.as)) err(c, join(at(join(path, 'choose'), i), 'as'), `duplicate choice "${ch.as}"`);
    choices.add(ch.as);
  });
  if (typeof e.key === 'string' && /[:#]/.test(e.key)) err(c, join(path, 'key'), `effect key "${e.key}" cannot contain ":" or "#" (move keys use them as separators)`);
  const saved = c.choices;
  c.choices = choices;
  checkFields(EFFECT, e, path, c, false);
  c.choices = saved;
}

function checkCard(card: Record<string, unknown>, c: Ctx): void {
  checkFields(CARD, card, '', c, false, ['effects']);
  if (card.effects === undefined) return;
  if (!Array.isArray(card.effects)) return err(c, 'effects', `expected a list, got ${show(card.effects)}`);
  card.effects.forEach((e, i) => checkEffect(e, at('effects', i), c));
}

/** Check one source file (the deck, or a shared file) against the merged symbols. */
function checkSource(f: Record<string, unknown>, shared: boolean, c: Ctx): void {
  c.card = null;
  c.choices = null;
  checkFields(shared ? SHARED_TOP : DECK_TOP, f, '', c, false, ['vocab', 'uses', 'cards', 'boardValue']);
  if (f.cards === undefined) err(c, 'cards', 'missing');
  else if (!Array.isArray(f.cards)) err(c, 'cards', `expected a list, got ${show(f.cards)}`);
  else f.cards.forEach((card, i) => {
    c.card = null;
    if (!isObj(card)) return err(c, at('cards', i), `expected an object, got ${show(card)}`);
    if (typeof card.id !== 'string') return err(c, join(at('cards', i), 'id'), `expected a string, got ${show(card.id)}`);
    c.card = card.id;
    checkCard(card, c);
  });
  c.card = null;
  const bv = f.boardValue;
  if (bv === undefined) { if (!shared) err(c, 'boardValue', 'missing'); return; }
  if (!Array.isArray(bv)) return err(c, 'boardValue', `expected a list, got ${show(bv)}`);
  bv.forEach((b, i) => {
    const p = at('boardValue', i);
    if (!isObj(b)) return err(c, p, `expected an object, got ${show(b)}`);
    checkFields(BOARD_VALUE, b, p, c, false, ['effect']);
    if (b.effect !== undefined) checkEffect(b.effect, join(p, 'effect'), c);
  });
}

interface Source { key: string | null; f: Record<string, unknown> }

/** Collect every name the files define, reporting duplicates (the later definition is the error). */
function collectSymbols(sources: Source[], c: Ctx): void {
  const cardFrom = new Map<string, string | null>();
  const groupFrom = new Map<string, string | null>();
  const also = (from: string | null | undefined, here: string | null) => (from && from !== here ? ` (also in shared file "${from}")` : '');
  for (const { key, f } of sources) {
    c.prefix = key ? `${key}:` : '';
    for (const card of Array.isArray(f.cards) ? f.cards : []) {
      if (!isObj(card) || typeof card.id !== 'string') continue;
      c.card = card.id;
      if (cardFrom.has(card.id)) err(c, 'id', `duplicate card id "${card.id}"${also(cardFrom.get(card.id), key)}`);
      else { cardFrom.set(card.id, key); c.sym.card.add(card.id); }
      (Array.isArray(card.effects) ? card.effects : []).forEach((e, i) => collectEffect(e, at('effects', i), c));
    }
    c.card = null;
    if (isObj(f.groups)) for (const g of Object.keys(f.groups)) {
      if (groupFrom.has(g)) err(c, join('groups', g), `duplicate group "${g}"${also(groupFrom.get(g), key)}`);
      else { groupFrom.set(g, key); c.sym.group.add(g); }
    }
    for (const k of ['flag', 'mark'] as const) {
      const list = f[`${k}s`];
      if (Array.isArray(list)) for (const x of list) if (typeof x === 'string') c.sym[k].add(x);
    }
    (Array.isArray(f.boardValue) ? f.boardValue : []).forEach((b, i) => { if (isObj(b)) collectEffect(b.effect, join(at('boardValue', i), 'effect'), c); });
  }
}

function collectEffect(e: unknown, path: string, c: Ctx): void {
  if (!isObj(e)) return;
  if (typeof e.key === 'string') {
    if (c.sym.effect.has(e.key)) err(c, join(path, 'key'), `duplicate effect key "${e.key}"`);
    else c.sym.effect.add(e.key);
  }
  if (isObj(e.limit) && typeof e.limit.shared === 'string') c.sym.limit.add(e.limit.shared);
}

const versionError = (v: unknown) => (typeof v === 'number' ? `written for vocabulary ${v}, this app has ${VOCAB_VERSION}` : `expected a vocabulary version number, got ${show(v)}`);

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function merge(deck: Record<string, unknown>, sources: Source[]): DeckFile {
  const out = { ...deck } as unknown as DeckFile;
  const all = sources.map((s) => s.f);
  const union = (k: 'marks' | 'flags') => { const u = [...new Set(all.flatMap((f) => list<string>(f[k])))]; if (u.length) out[k] = u; };
  const concat = <K extends 'extraDeck' | 'protections'>(k: K) => { const u = all.flatMap((f) => list<NonNullable<DeckFile[K]>[number]>(f[k])); if (u.length) out[k] = u as DeckFile[K]; };
  union('marks'); union('flags');
  concat('extraDeck'); concat('protections');
  // `listOrder` maps: a later file's entries win (the deck file comes last), and win over the cards' own.
  const order: Record<string, number> = Object.assign({}, ...all.map((f) => (isObj(f.listOrder) ? f.listOrder : {})));
  out.cards = all.flatMap((f) => list<CardDef>(f.cards)).map((c) => (Object.prototype.hasOwnProperty.call(order, c.id) ? { ...c, listOrder: order[c.id] } : c));
  delete out.listOrder;
  out.groups = Object.assign({}, ...all.map((f) => (isObj(f.groups) ? f.groups : {})));
  out.boardValue = all.flatMap((f) => list<BoardValueDef>(f.boardValue));
  const ends = all.map((f) => f.endOfTurn).filter(isObj) as DeckFile['endOfTurn'][];
  out.endOfTurn = {
    ...out.endOfTurn,
    setOrder: ends.flatMap((e) => e.setOrder ?? []),
  };
  const keep = ends.flatMap((e) => e.keepOneInHandIf ?? []);
  if (keep.length) out.endOfTurn.keepOneInHandIf = keep;
  const only = Object.assign({}, ...ends.map((e) => e.setOnlyIf ?? {}));
  if (Object.keys(only).length) out.endOfTurn.setOnlyIf = only;
  return out;
}

/**
 * Check a parsed deck file. `shared` maps the names a file may list in `uses` to their parsed
 * shared files (same shape, but `id`, `name`, `groups`, `endOfTurn` and `boardValue` optional).
 * On success the file comes back with its shared files merged in, shared definitions first.
 */
export function validateDeckFile(raw: unknown, shared: Record<string, unknown>): { ok: true; file: DeckFile } | { ok: false; errors: DeckFileError[] } {
  const c: Ctx = { sym: { card: new Set(), group: new Set(), flag: new Set(), mark: new Set(), effect: new Set(), limit: new Set() }, errors: [], card: null, prefix: '', choices: null };
  if (!isObj(raw)) return { ok: false, errors: [{ card: null, field: '', message: `expected an object, got ${show(raw)}` }] };
  if (raw.vocab !== VOCAB_VERSION) return { ok: false, errors: [{ card: null, field: 'vocab', message: versionError(raw.vocab) }] };

  const sources: Source[] = [];
  if (raw.uses !== undefined) {
    if (!Array.isArray(raw.uses)) err(c, 'uses', `expected a list, got ${show(raw.uses)}`);
    else raw.uses.forEach((key, i) => {
      if (typeof key !== 'string') return err(c, at('uses', i), `expected a string, got ${show(key)}`);
      if (!Object.prototype.hasOwnProperty.call(shared, key)) return err(c, at('uses', i), `unknown shared file "${key}"`);
      const f = shared[key];
      if (!isObj(f)) return err(c, at('uses', i), `shared file "${key}" is not an object`);
      if (f.vocab !== VOCAB_VERSION) return err(c, `${key}:vocab`, versionError(f.vocab));
      if (f.uses !== undefined) return err(c, `${key}:uses`, 'a shared file cannot use other shared files');
      sources.push({ key, f });
    });
  }
  sources.push({ key: null, f: raw });

  collectSymbols(sources, c);
  for (const s of sources) {
    c.prefix = s.key ? `${s.key}:` : '';
    checkSource(s.f, s.key !== null, c);
  }
  if (c.errors.length) return { ok: false, errors: c.errors };
  return { ok: true, file: merge(raw, sources) };
}
