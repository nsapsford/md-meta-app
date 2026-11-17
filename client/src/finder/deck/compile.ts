// The deck compiler: turns a validated deck file plus card facts into the closures and tables
// the engine runs. Everything a word means is in its `compile` (vocabulary.ts); this file only
// wires words together: it numbers cards, effects, limits and flags, builds each effect into a
// move generator once, and routes summons and zone moves to the effects they trigger. Nothing
// is interpreted at search time.

import type { CardId, FinalBoard, Mon, Move, OppCard, State, Tags, ZoneName } from '../engine/types';
import { createStateOps, type StateOps } from '../engine/state';
import { createOps, type Ops } from '../engine/ops';
import { step, done, L, type LedgerZone } from '../engine/record';
import type { BoardValueDef, CardDef, CardFacts, DeckFile, DeckFileError, EffectDef, Loc } from './schema';
import { KIND_LABEL, WORDS, type CompileCtx, type Compiled, type Word, type WordKind } from './vocabulary';

// ---------------------------------------------------------------------------------------------
// Public shapes

export interface CardProps {
  id: CardId; name: string; short: string; kind: 'M' | 'S' | 'T' | '?'; st: string | null; ext: boolean;
  sub: 'Normal' | 'Effect' | 'Ritual' | 'Fusion' | 'Synchro' | 'Xyz' | 'Link' | '?'; tuner: boolean;
  race: string | null; attr: string | null; lv: number | null; link: number | null; atk: number; def: number;
  discardValue: number; heldValue: number; normalSummon: boolean; immuneToRemoval: boolean;
}

export type Push = (key: string, tags: Tags, run: Move['run'], negatable?: boolean) => void;

/** A word that reads a card (`mats`, `slots`) gets the candidate as `Run.self`. */
export type CompiledExtraRule =
  | { card: number; method: 'synchro'; level: number; min: number; max: number; tuners: 'exactlyOne' | 'atMostOne'; mats: CondFn | null; then: number }
  | { card: number; method: 'link'; rating: number; min: number; max: number; mats: CondFn | null; bottomArrows: boolean; then: number }
  | { card: number; method: 'fusion'; slots: CondFn[]; relations: ('sameRace' | 'sameAttr' | 'differentRace' | 'differentNames')[]; then: number };

export interface CompiledProtection {
  id: string; label: string; order: number; where: CondFn[];
  covers: { marks: number; monsterOnly: boolean; inResponseOnly: boolean };
  /** Once-per-turn slot (index into `opt`), or -1. */
  limit: number;
  consume: ActFn[]; stepNote: string | null;
}

export interface CompiledDeck {
  file: DeckFile; ids: CardId[]; ix: Record<CardId, number>; UNK: number; props: CardProps[]; nOpt: number; nFlags: number; markBit: Record<string, number>;
  genMain(s: State, push: Push): void; genPending(s: State, push: Push): void;
  onPlace(s: State, m: Mon, special: boolean, from?: LedgerZone): void;
  onLeaveField(s: State, id: number, kind: 'mon' | 'st', wasFaceUp: boolean, to?: LedgerZone): void;
  onOppMonsterToGy(s: State): void;
  extra: CompiledExtraRule[]; protections: CompiledProtection[];
  /**
   * Queue effect `e` to resolve next, after monster `m` was summoned (an Extra Deck rule's `then`),
   * if its limit is free, its card is where it must be and its conditions hold. When the effect is
   * `m`'s own, the entry names `m`.
   */
  queueAfterSummon(s: State, e: number, m: Mon): void;
  finalize(s: State): { n: FinalBoard; sets: number[] };
  boardValue(n: FinalBoard, full: boolean): { sum: number; items: [string, number][] | null };
  /**
   * Per card index: a board-value entry's `on` names this card (by `card`, or by a `group` that
   * holds it). A monster on the final board without one is worth the scorer's default value.
   */
  hasBoardValue: boolean[];
  /** Per effect id (index 0 unused): what the engine needs to know about its moves. */
  effects: EffectInfo[];
  /** The state and card-move helpers the compiled closures use (engine/moves.ts reuses them). */
  state: StateOps; ops: Ops;
}

/**
 * What the engine reads about an effect's moves (their keys are `key` or `key:<choice>…`):
 * `activates` for the Spell floodgate, `fromExtra` (it Special Summons from the Extra Deck) for the
 * Extra Deck floodgate.
 */
export interface EffectInfo { key: string; activates: 'spell' | 'trap' | null; fromExtra: boolean }

export class DeckCompileError extends Error {
  errors: DeckFileError[];
  constructor(errors: DeckFileError[]) {
    super(errors.map((e) => `${e.card ? `${e.card}: ` : ''}${e.field ? `${e.field}: ` : ''}${e.message}`).join('; '));
    this.name = 'DeckCompileError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------------------------
// What compiled words are called with

/** Where a card is: a zone, or a monster / Spell-Trap on the field at an index (`uid` for monsters). */
export interface Place { zone: ZoneName | 'mon' | 'st' | 'opp' | 'none'; at: number; uid: OppCard['uid'] | null }
/** A card a word acts on: the effect's own card, or one the player chose. */
export interface CardRef extends Place { id: number }
/** One choice offered by a pick. `key` goes in the move key, `name` in the step text; `many` holds a subset's members. */
export interface Choice extends CardRef { key: string; name: string; many: Choice[] | null }
/** What an effect's words see: its own card, where it is, and the choices made so far (by `choose` slot). */
export interface Run { self: number; at: Place; chosen: (Choice | null)[] }

/** Conditions read only the fields of `FinalBoard`, so they work on a live state and on the final board. */
export type CondFn = (s: FinalBoard, r: Run) => boolean;
export type CountFn = (s: FinalBoard, r: Run) => number;
export type PickFn = (s: State, r: Run) => Choice[];
export type ActFn = (n: State, r: Run) => void;
export type TrigEvent =
  | { t: 'place'; id: number; nm: number; special: boolean; from: LedgerZone | null }
  | { t: 'move'; id: number; from: LedgerZone; to: LedgerZone }
  | { t: 'oppMonGy' };
export type TriggerFn = ((ev: TrigEvent, self: number) => boolean) & { on: TrigEvent['t'] };

/** Runtime helpers a word's closures call. Built once per compiled deck. */
export interface Runtime {
  state: StateOps; ops: Ops; ids: readonly CardId[]; props: readonly CardProps[]; UNK: number;
  /** Ledger name of a zone. */
  lz(z: ZoneName | 'field'): LedgerZone;
  /** The cached choice for a card in a zone (hand, deck, extra, gy, ban). */
  choiceIn(z: ZoneName, id: number): Choice;
  /** A choice for a field card. */
  choiceOnField(zone: 'mon' | 'st', at: number, id: number, uid: OppCard['uid'] | null): Choice;
  /** Call `fn` for each card `slot` names (-1: the effect's own card; a subset: each member). */
  each(r: Run, slot: number, fn: (c: CardRef) => void): void;
  /** Current index of a field card (indices shift as cards leave). -1 if gone. */
  monIndex(s: State, c: CardRef): number;
  stIndex(s: State, c: CardRef): number;
  /** Take a card out of where it is and put it in a zone (or on top of the Deck), with ledger and triggers. */
  moveCard(n: State, c: CardRef, to: ZoneName | 'top'): void;
  /** Take a card out of a zone other than the field (a summon's source). */
  takeOut(n: State, c: CardRef): LedgerZone;
  /** A card moved between zones (not leaving the field): queue the triggers it sets off. */
  moved(n: State, id: number, from: LedgerZone, to: LedgerZone): void;
}

// ---------------------------------------------------------------------------------------------
// Card properties

const SUBS = [[/Normal Monster/, 'Normal'], [/Ritual/, 'Ritual'], [/Fusion/, 'Fusion'], [/Synchro/, 'Synchro'], [/Link/, 'Link'], [/XYZ/i, 'Xyz']] as const;

/** Card properties from the type strings, as the reference's `init` reads them. */
function propsOf(c: CardDef, f: CardFacts): CardProps {
  const t = f.type, mon = /Monster/.test(t), link = /Link/.test(t);
  return {
    id: c.id, name: f.name, short: c.short,
    kind: mon ? 'M' : /Trap/.test(t) ? 'T' : 'S',
    st: mon ? null : f.race,
    ext: /Fusion|Synchro|Link|XYZ/i.test(t),
    sub: SUBS.find(([re]) => re.test(t))?.[1] ?? 'Effect',
    tuner: /Tuner/.test(t),
    race: mon ? f.race : null, attr: f.attr || null,
    lv: link ? null : f.level, link: link ? (f.link ?? f.level) : null,
    atk: f.atk || 0, def: f.def || 0,
    discardValue: c.discardValue ?? 3, heldValue: c.heldValue ?? 0,
    normalSummon: c.hints?.normalSummon !== false, immuneToRemoval: !!c.immuneToRemoval,
  };
}

const UNK_PROPS = (): CardProps => ({
  id: 'UNK', name: '?', short: 'unknown card', kind: '?', st: null, ext: false, sub: '?', tuner: false,
  race: null, attr: null, lv: null, link: null, atk: 0, def: 0, discardValue: 0, heldValue: 0, normalSummon: false, immuneToRemoval: false,
});

// ---------------------------------------------------------------------------------------------
// Text templates: `{as}` is the chosen card's short name, `{zone}` where the first choice came from.

const ZONE_TEXT: Record<Place['zone'], string> = { hand: 'hand', deck: 'Deck', extra: 'Extra Deck', gy: 'GY', ban: 'banishment', mon: 'the field', st: 'the field', opp: "the opponent's field", none: '' };

type Template = (r: Run) => string;

function template(text: string, choose: readonly string[], fail: (m: string) => never): Template {
  const parts: string[] = [];
  const slots: number[] = [];   // choice slot, or -1 for {zone}
  let last = 0;
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const name = m[1];
    const slot = name === 'zone' ? -1 : choose.indexOf(name);
    if (name !== 'zone' && slot < 0) fail(`unknown placeholder {${name}} (use a choose name or {zone})`);
    parts.push(text.slice(last, m.index));
    slots.push(slot);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  if (!slots.length) return () => text;
  return (r) => {
    let out = parts[0];
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      if (sl < 0) { const c = r.chosen[0]; out += c ? ZONE_TEXT[c.zone] : ''; } else out += r.chosen[sl]?.name ?? '';
      out += parts[i + 1];
    }
    return out;
  };
}

// ---------------------------------------------------------------------------------------------

const NOWHERE: Place = Object.freeze({ zone: 'none', at: -1, uid: null }) as Place;
const NOSETS: number[] = Object.freeze([]) as unknown as number[];
const EMPTY_CHOSEN: (Choice | null)[] = Object.freeze([]) as unknown as (Choice | null)[];
const LZ: Record<ZoneName | 'field', LedgerZone> = { hand: 'hand', deck: 'deck', extra: 'extra', gy: 'gy', ban: 'banished', field: 'field' };
const STAYS = new Set(['Continuous', 'Field', 'Equip']);

interface CompiledEffect {
  def: EffectDef; card: CardDef; self: number; id: number;
  gen(s: State, push: Push, pending: boolean, a: number | undefined): void;
  /** Queue check for a trigger: the limit is free, the card is where it must be and the conditions hold. */
  canQueue(s: State, at: Place | null): boolean;
  trigger: TriggerFn | null;
}

export function compileDeck(file: DeckFile, facts: CardFacts[]): CompiledDeck {
  // Cards and their facts.
  const byPass = new Map<number, CardFacts>();
  for (const f of facts) if (!byPass.has(f.passcode)) byPass.set(f.passcode, f);
  const missing: DeckFileError[] = [];
  const factOf = new Map<CardId, CardFacts>();
  for (const c of file.cards) {
    const f = c.passcodes.map((p) => byPass.get(p)).find(Boolean);
    if (f) factOf.set(c.id, f);
    else missing.push({ card: c.id, field: 'passcodes', message: `no card facts for ${c.id} (passcodes ${c.passcodes.join(', ')})` });
  }
  if (missing.length) throw new DeckCompileError(missing);

  const cardById = new Map(file.cards.map((c) => [c.id, c]));
  const ids: CardId[] = file.cards.map((c) => c.id).sort();
  ids.push('UNK');
  const N = ids.length, UNK = N - 1;
  const ix: Record<CardId, number> = {};
  ids.forEach((id, i) => { ix[id] = i; });
  const props: CardProps[] = ids.map((id) => (id === 'UNK' ? UNK_PROPS() : propsOf(cardById.get(id)!, factOf.get(id)!)));

  // Flags and marks: bit indices in name order.
  const flagNames = [...(file.flags ?? [])].sort();
  const markNames = [...(file.marks ?? [])].sort();
  const flagBits: Record<string, number> = {}, markBit: Record<string, number> = {};
  flagNames.forEach((n, i) => { flagBits[n] = i; });
  markNames.forEach((n, i) => { markBit[n] = i; });

  // Effects: ids 1.. by sorted key. Limits: slots by sorted name.
  const allEffects: { card: CardDef; def: EffectDef; i: number }[] = [];
  for (const card of file.cards) (card.effects ?? []).forEach((def, i) => allEffects.push({ card, def, i }));
  allEffects.sort((a, b) => (a.def.key < b.def.key ? -1 : a.def.key > b.def.key ? 1 : 0));
  const effectIds = new Map<string, number>();
  allEffects.forEach((e, i) => effectIds.set(e.def.key, i + 1));
  const limitOf = new Map<string, string>();   // effect key -> limit name
  for (const { def } of allEffects) if (def.limit) limitOf.set(def.key, def.limit === 'oncePerTurn' ? def.key : def.limit.shared);
  const limitNames = new Set(limitOf.values());
  for (const p of file.protections ?? []) if (p.limit) limitNames.add(p.limit);
  const slots = new Map([...limitNames].sort().map((n, i) => [n, i]));
  const nOpt = slots.size, nFlags = flagNames.length;

  const so = createStateOps(N, nOpt, nFlags);
  const fieldNames = new Array<((s: State) => number) | null>(N).fill(null);
  const ops = createOps(so, {
    UNK,
    level: (id) => props[id].lv ?? 0,
    fieldName: (s, id) => { const f = fieldNames[id]; return f ? f(s) : id; },
    onPlace: (s, m, special, from) => onPlace(s, m, special, from),
    onLeaveField: (s, id, kind, up, to) => onLeaveField(s, id, kind, up, to),
    onOppMonsterToGy: (s) => onOppMonsterToGy(s),
  });

  // Runtime helpers for words.
  const zoneChoices: Record<string, Choice[]> = {};
  for (const z of ['hand', 'deck', 'extra', 'gy', 'ban'] as const) {
    zoneChoices[z] = ids.map((id, i) => Object.freeze({ id: i, zone: z, at: -1, uid: null, key: id, name: props[i].short, many: null }) as Choice);
  }
  const monIndex = (s: State, c: CardRef): number => {
    const m = s.mons[c.at];
    if (m && m.uid === c.uid) return c.at;
    const i = s.mons.findIndex((x) => x.uid === c.uid);
    return i >= 0 ? i : s.mons.findIndex((x) => x.id === c.id);
  };
  const stIndex = (s: State, c: CardRef): number => (s.st[c.at]?.id === c.id ? c.at : s.st.findIndex((x) => x.id === c.id));

  const rt: Runtime = {
    state: so, ops, ids, props, UNK,
    lz: (z) => LZ[z],
    choiceIn: (z, id) => zoneChoices[z][id],
    choiceOnField: (zone, at, id, uid) => ({ id, zone, at, uid, key: ids[id], name: props[id].short, many: null }),
    each(r, slot, fn) {
      if (slot < 0) { fn({ id: r.self, zone: r.at.zone, at: r.at.at, uid: r.at.uid }); return; }
      const c = r.chosen[slot];
      if (!c) return;
      if (c.many) for (const x of c.many) fn(x); else fn(c);
    },
    monIndex, stIndex,
    moveCard(n, c, to) {
      const lzTo: LedgerZone = to === 'top' ? 'deck' : LZ[to];
      let id = c.id, from: LedgerZone, kind: 'mon' | 'st' | null = null, up = true;
      if (c.zone === 'mon') {
        const i = monIndex(n, c); if (i < 0) throw new Error(`card ${ids[c.id]} is not on the field`);
        id = n.mons.splice(i, 1)[0].id; from = 'field'; kind = 'mon';
      } else if (c.zone === 'st') {
        const i = stIndex(n, c); if (i < 0) throw new Error(`card ${ids[c.id]} is not on the field`);
        const x = n.st.splice(i, 1)[0]; id = x.id; up = x.up; from = 'field'; kind = 'st';
      } else if (c.zone === 'deck' && to === 'top') {
        ops.shuffle(n); takeZone(n, 'deck', id); from = 'deck';
      } else from = rt.takeOut(n, c);
      if (to === 'top') n.top.unshift(id);
      else so.W(n, to === 'deck' && props[id].ext ? 'extra' : to)[id]++;
      if (!(from === 'deck' && to === 'top')) L.mv(n, id, from, lzTo);
      if (kind) onLeaveField(n, id, kind, up, lzTo); else moved(n, id, from, lzTo);
    },
    takeOut(n, c) {
      if (c.zone === 'deck') { ops.fromDeck(n, c.id); return 'deck'; }
      if (c.zone === 'hand' || c.zone === 'extra' || c.zone === 'gy' || c.zone === 'ban') { takeZone(n, c.zone, c.id); return LZ[c.zone]; }
      throw new Error(`cannot take ${ids[c.id]} out of ${c.zone}`);
    },
    moved: (n, id, from, to) => moved(n, id, from, to),
  };
  function takeZone(n: State, z: ZoneName, id: number): void {
    const a = so.W(n, z);
    if (!a[id]) throw new Error(`missing card ${ids[id]} in ${z}`);
    a[id]--;
  }

  // Compiling words.
  interface Scope { effect: EffectDef | null; choose: string[]; bound: number; touched: boolean }
  const groupCache = new Map<string, readonly number[]>();
  const groupBusy = new Set<string>();
  let emptyState: State | null = null;

  function makeCtx(card: CardId | null, key: string | null, field: string, scope: Scope): CompileCtx {
    const fail = (message: string, sub?: string): never => {
      throw new DeckCompileError([{ card, field: sub ? join(field, sub) : field, message }]);
    };
    const nested = (kind: WordKind) => (word: Word, sub: string) => compileWord(kind, word, card, key, join(field, sub), scope);
    return {
      ix, props, rt, where: { card, key, field }, effect: scope.effect,
      group: (name) => group(name, fail),
      flagBit: (name) => (name in flagBits ? flagBits[name] : fail(`unknown flag "${name}"`)),
      markBit: (name) => (name in markBit ? markBit[name] : fail(`unknown mark "${name}"`)),
      effectId: (k) => effectIds.get(k) ?? fail(`unknown effect "${k}"`),
      limitId(name) {
        const ln = effectIds.has(name) ? limitOf.get(name) : name;
        if (ln === undefined) return fail(`effect "${name}" has no once-per-turn limit`);
        return slots.get(ln) ?? fail(`unknown limit "${name}"`);
      },
      choiceSlot(name) {
        const i = scope.choose.indexOf(name);
        if (!scope.effect || i < 0) return fail(`unknown choice "${name}"`);
        if (i >= scope.bound) return fail(`choice "${name}" is not chosen yet here`);
        scope.touched = true;
        return i;
      },
      cond: nested('conds'), pick: nested('picks'), act: nested('acts'), trigger: nested('triggers'),
      fail,
    };
  }

  function wordDef(kind: WordKind, word: Word, card: CardId | null, field: string) {
    const names = Object.keys(word);
    const def = names.length === 1 ? WORDS[kind].get(names[0]) : undefined;
    if (!def) throw new DeckCompileError([{ card, field, message: `not a ${KIND_LABEL[kind]}: ${JSON.stringify(word)}` }]);
    return { def, name: names[0], args: word[names[0]] };
  }

  function compileWord(kind: WordKind, word: Word, card: CardId | null, key: string | null, field: string, scope: Scope): Compiled {
    const { def, name, args } = wordDef(kind, word, card, field);
    return def.compile(args, makeCtx(card, key, join(field, name), scope));
  }

  /** A condition as a count of the cards it matches (for board value), when its word can count. */
  function countWord(word: Word, field: string): CountFn | null {
    const { def, name, args } = wordDef('conds', word, null, field);
    return def.count ? (def.count(args, makeCtx(null, null, join(field, name), topScope())) as CountFn) : null;
  }

  const topScope = (): Scope => ({ effect: null, choose: [], bound: 0, touched: false });
  const condAt = (w: Word, card: CardId | null, field: string, scope = topScope()) => compileWord('conds', w, card, null, field, scope) as CondFn;
  const actAt = (w: Word, card: CardId | null, field: string, scope = topScope()) => compileWord('acts', w, card, null, field, scope) as ActFn;

  function group(name: string, fail: (m: string) => never): readonly number[] {
    const hit = groupCache.get(name);
    if (hit) return hit;
    const g = file.groups[name];
    if (g === undefined) return fail(`unknown group "${name}"`);
    if (groupBusy.has(name)) return fail(`group "${name}" refers to itself`);
    let out: number[];
    if (Array.isArray(g)) out = [...new Set(g.map((id) => ix[id] ?? fail(`unknown card "${id}" in group "${name}"`)))].sort((a, b) => a - b);
    else {
      // A filter group is evaluated once per card, against an empty board.
      groupBusy.add(name);
      const f = condAt(g.filter, null, `groups.${name}.filter`);
      groupBusy.delete(name);
      emptyState ??= so.newState({ mode: 'first', hand: {}, deck: {}, extra: {} }, ix);
      out = [];
      for (let i = 0; i < UNK; i++) if (f(emptyState, { self: i, at: NOWHERE, chosen: EMPTY_CHOSEN })) out.push(i);
    }
    groupCache.set(name, out);
    return out;
  }

  // Where an effect's card must be.
  function locate(s: State, self: number, loc: Loc): Place | null {
    switch (loc) {
      case 'hand': case 'gy': case 'ban': case 'extra':
        return s[loc][self] ? { zone: loc, at: -1, uid: null } : null;
      case 'field': {
        for (let i = 0; i < s.mons.length; i++) { const m = s.mons[i]; if (m.id === self && !m.noEff) return { zone: 'mon', at: i, uid: m.uid }; }
        for (let i = 0; i < s.st.length; i++) if (s.st[i].id === self) return { zone: 'st', at: i, uid: null };
        return null;
      }
      default:
        for (let i = 0; i < s.st.length; i++) {
          const x = s.st[i];
          if (x.id !== self) continue;
          if (loc === 'faceUp' ? x.up : loc === 'faceDown' ? !x.up : !x.up && !x.now) return { zone: 'st', at: i, uid: null };
        }
        return null;
    }
  }

  function compileEffect(card: CardDef, def: EffectDef, i: number): CompiledEffect {
    const self = ix[card.id];
    const p = props[self];
    const base = `effects[${i}]`;
    const scope: Scope = { effect: def, choose: (def.choose ?? []).map((c) => c.as), bound: 0, touched: false };
    const w = (kind: WordKind, word: Word, field: string) => compileWord(kind, word, card.id, def.key, field, scope);
    const failAt = (field: string) => (m: string): never => { throw new DeckCompileError([{ card: card.id, field: join(base, field), message: m }]); };

    const choose = (def.choose ?? []).map((c, j) => { scope.bound = j; return { pick: w('picks', c.pick, `${base}.choose[${j}].pick`) as PickFn, optional: !!c.optional }; });
    scope.bound = choose.length;
    const early: CondFn[] = [], late: CondFn[] = [];
    (def.cond ?? []).forEach((c, j) => { scope.touched = false; const f = w('conds', c, `${base}.cond[${j}]`) as CondFn; (scope.touched ? late : early).push(f); });
    const acts = (list: Word[] | undefined, field: string) => (list ?? []).map((a, j) => w('acts', a, `${base}.${field}[${j}]`) as ActFn);
    const cost = acts(def.cost, 'cost'), doActs = acts(def.do, 'do'), onNeg = acts(def.onNegated, 'onNegated');
    const trigger = def.trigger ? (w('triggers', def.trigger, `${base}.trigger`) as TriggerFn) : null;

    // Tags: fixed ones in one frozen object; conditional ones evaluated per move.
    const fixed: Tags = {};
    const dyn: [keyof Tags, CondFn][] = [];
    for (const [k, v] of Object.entries(def.tags)) {
      if (typeof v === 'boolean') { if (v) (fixed as Record<string, boolean>)[k] = true; }
      else dyn.push([k as keyof Tags, w('conds', v, `${base}.tags.${k}`) as CondFn]);
    }
    if (def.marks?.length) fixed.marks = def.marks.reduce((m, name) => m | (1 << markBit[name]), 0);
    Object.freeze(fixed);
    const tagsFor = (s: State, r: Run): Tags => {
      if (!dyn.length) return fixed;
      const t: Tags = { ...fixed };
      for (const [k, f] of dyn) if (f(s, r)) (t as Record<string, boolean>)[k] = true;
      return t;
    };

    const text = template(def.text, scope.choose, failAt('text'));
    const negText = template(def.negText ?? `${card.short}: negated.`, scope.choose, failAt('negText'));
    const limit = def.limit ? slots.get(limitOf.get(def.key)!)! : -1;
    const froms: Loc[] = Array.isArray(def.from) ? def.from : [def.from];
    const negatable = def.negatable !== false;
    const inherent = def.tags.inherent === true;
    const ledgerEffect = def.ledger?.effect ?? 0;
    const activates = def.activates ?? null;
    const stays = STAYS.has(p.st ?? '');
    const needsZone = activates !== null && p.st !== 'Field';
    const nChoose = choose.length;
    const id = effectIds.get(def.key)!;
    const key = def.key;

    /** Move the card for its activation (a Spell/Trap) and write the activation to the ledger. */
    function activate(n: State, r: Run): Run {
      // A Spell/Trap that goes to the GY here (as the reference does) sets off no trigger: not even its own sentToGy.
      if (activates) {
        if (r.at.zone === 'hand') {
          takeZone(n, 'hand', self);
          L.act(n, self, ledgerEffect, 'hand');
          if (stays) { n.st.push({ id: self, up: true, now: false }); return { self, at: { zone: 'st', at: n.st.length - 1, uid: null }, chosen: r.chosen }; }
          so.W(n, 'gy')[self]++;
          return { self, at: { zone: 'gy', at: -1, uid: null }, chosen: r.chosen };
        }
        if (r.at.zone === 'st') {
          const i = stIndex(n, { id: self, ...r.at });
          L.act(n, self, ledgerEffect, 'field');
          if (stays) { n.st[i] = { ...n.st[i], up: true }; return r; }
          n.st.splice(i, 1); so.W(n, 'gy')[self]++;
          return { self, at: { zone: 'gy', at: -1, uid: null }, chosen: r.chosen };
        }
      }
      if (!inherent) L.act(n, self, ledgerEffect, r.at.zone === 'mon' || r.at.zone === 'st' ? 'field' : LZ[r.at.zone as ZoneName]);
      return r;
    }

    function mkRun(r: Run, pending: boolean): Move['run'] {
      return (s0, neg) => {
        const n = so.clone(s0);
        if (pending) n.pend = n.pend.slice(1);
        step(n, neg ? negText(r) : text(r), tagsFor(s0, r));
        if (limit >= 0) so.setOpt(n, limit);
        if (activates === 'spell') n.spell = true;
        const rr = activate(n, r);
        for (let k = 0; k < cost.length; k++) cost[k](n, rr);
        const list = neg ? onNeg : doActs;
        for (let k = 0; k < list.length; k++) list[k](n, rr);
        return done(n);
      };
    }

    function whereNow(s: State, a: number | undefined): Place | null {
      if (a !== undefined) {
        const i = s.mons.findIndex((m) => m.uid === a);
        if (i >= 0) return s.mons[i].noEff ? null : { zone: 'mon', at: i, uid: a };
      }
      for (let k = 0; k < froms.length; k++) { const at = locate(s, self, froms[k]); if (at) return at; }
      return null;
    }

    function gen(s: State, push: Push, pending: boolean, a: number | undefined): void {
      if (limit >= 0 && so.getOpt(s, limit)) return;
      const at = whereNow(s, a);
      if (!at) return;
      if (needsZone && at.zone === 'hand' && s.st.length >= 5) return;
      const chosen: (Choice | null)[] = new Array(nChoose).fill(null);
      const r: Run = { self, at, chosen };
      for (let k = 0; k < early.length; k++) if (!early[k](s, r)) return;
      const leaf = () => {
        const rr: Run = { self, at, chosen: chosen.slice() };
        for (let k = 0; k < late.length; k++) if (!late[k](s, rr)) return;
        let k2 = key;
        for (let k = 0; k < nChoose; k++) { const c = rr.chosen[k]; k2 += ':' + (c ? c.key : '-'); }
        push(k2, tagsFor(s, rr), mkRun(rr, pending), negatable);
      };
      const walk = (j: number): void => {
        if (j === nChoose) { leaf(); return; }
        const opts = choose[j].pick(s, r);
        if (!opts.length) { if (choose[j].optional) { chosen[j] = null; walk(j + 1); } return; }
        for (let k = 0; k < opts.length; k++) { chosen[j] = opts[k]; walk(j + 1); }
        chosen[j] = null;
      };
      walk(0);
    }

    function canQueue(s: State, at: Place | null): boolean {
      if (limit >= 0 && so.getOpt(s, limit)) return false;
      const where = at ?? whereNow(s, undefined);
      if (!where) return false;
      const r: Run = { self, at: where, chosen: new Array(nChoose).fill(null) };
      for (let k = 0; k < early.length; k++) if (!early[k](s, r)) return false;
      return true;
    }

    return { def, card, self, id, gen, canQueue, trigger };
  }

  const compiled = allEffects.map(({ card, def, i }) => compileEffect(card, def, i));
  const byId: (CompiledEffect | null)[] = [null, ...compiled];
  const effects: EffectInfo[] = [
    Object.freeze({ key: '', activates: null, fromExtra: false }),
    ...allEffects.map(({ def }) => Object.freeze({ key: def.key, activates: def.activates ?? null, fromExtra: summonsFromExtra(def) })),
  ];
  const byOrder = (a: CompiledEffect, b: CompiledEffect) => (a.def.order ?? 0) - (b.def.order ?? 0) || (a.def.key < b.def.key ? -1 : a.def.key > b.def.key ? 1 : 0);
  const main = compiled.filter((e) => !e.trigger && e.def.phase === 'main').sort(byOrder);
  const onTrig = (t: TrigEvent['t']) => compiled.filter((e) => e.trigger?.on === t).sort(byOrder);
  const placeTrig = onTrig('place'), moveTrig = onTrig('move'), oppTrig = onTrig('oppMonGy');

  // Field names.
  for (const card of file.cards) {
    const fn = card.fieldName;
    if (fn === undefined) continue;
    const self = ix[card.id];
    if (typeof fn === 'string') { const nm = ix[fn]; fieldNames[self] = () => nm; continue; }
    const alts = fn.map((alt, j) => ({ conds: alt.if.map((c, k) => condAt(c, card.id, `fieldName[${j}].if[${k}]`)), nm: ix[alt.name] }));
    const r: Run = { self, at: NOWHERE, chosen: EMPTY_CHOSEN };
    fieldNames[self] = (s) => { for (const a of alts) if (a.conds.every((c) => c(s, r))) return a.nm; return self; };
  }

  // Triggers.
  function onPlace(s: State, m: Mon, special: boolean, from?: LedgerZone): void {
    if (!placeTrig.length) return;
    const ev: TrigEvent = { t: 'place', id: m.id, nm: m.nm, special, from: from ?? null };
    for (const e of placeTrig) {
      if (!e.trigger!(ev, e.self)) continue;
      const mine = m.id === e.self;
      if (mine && m.noEff) continue;   // its effects are negated: its own trigger does not start
      if (!e.canQueue(s, mine ? { zone: 'mon', at: s.mons.indexOf(m), uid: m.uid } : null)) continue;
      s.pend.push(mine ? { e: e.id, a: m.uid } : { e: e.id });
    }
  }
  function moved(s: State, id: number, from: LedgerZone, to: LedgerZone): void {
    if (!moveTrig.length) return;
    const ev: TrigEvent = { t: 'move', id, from, to };
    for (const e of moveTrig) if (e.trigger!(ev, e.self) && e.canQueue(s, null)) s.pend.push({ e: e.id });
  }
  function onLeaveField(s: State, id: number, _kind: 'mon' | 'st', _up: boolean, to: LedgerZone = 'gy'): void { moved(s, id, 'field', to); }
  function onOppMonsterToGy(s: State): void {
    for (const e of oppTrig) if (e.canQueue(s, null)) s.pend.push({ e: e.id });
  }

  function queueAfterSummon(s: State, e: number, m: Mon): void {
    const c = byId[e];
    if (!c) return;
    const mine = m.id === c.self;
    if (mine && m.noEff) return;
    if (!c.canQueue(s, mine ? { zone: 'mon', at: s.mons.indexOf(m), uid: m.uid } : null)) return;
    s.pend.unshift(mine ? { e, a: m.uid } : { e });
  }

  function genMain(s: State, push: Push): void {
    for (let k = 0; k < main.length; k++) main[k].gen(s, push, false, undefined);
  }
  function genPending(s: State, push: Push): void {
    const p = s.pend[0];
    const e = p && byId[p.e];
    if (e) e.gen(s, push, true, p.a);
  }

  // Extra Deck rules and protections, as data.
  // Rules in (order, card id, method) order, so the file's order does not change the moves (as effects).
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ruleOrder = (file.extraDeck ?? []).map((x, j) => ({ x, j }))
    .sort((a, b) => (a.x.order ?? 0) - (b.x.order ?? 0) || cmp(a.x.card, b.x.card) || cmp(a.x.method, b.x.method));
  const extra: CompiledExtraRule[] = ruleOrder.map(({ x, j }) => {
    const f = `extraDeck[${j}]`;
    const then = x.then ? effectIds.get(x.then) ?? 0 : 0;
    if (x.method === 'fusion') return { card: ix[x.card], method: 'fusion', slots: x.slots.map((c, k) => condAt(c, null, `${f}.slots[${k}]`)), relations: x.relations ?? [], then };
    const mats = x.mats ? condAt(x.mats, null, `${f}.mats`) : null;
    if (x.method === 'synchro') return { card: ix[x.card], method: 'synchro', level: x.level, min: x.min, max: x.max, tuners: x.tuners, mats, then };
    return { card: ix[x.card], method: 'link', rating: x.rating, min: x.min, max: x.max, mats, bottomArrows: !!x.bottomArrows, then };
  });
  const protections: CompiledProtection[] = (file.protections ?? []).map((p, j) => {
    const f = `protections[${j}]`;
    return {
      id: p.id, label: p.label, order: p.order,
      where: p.where.map((c, k) => condAt(c, null, `${f}.where[${k}]`)),
      covers: { marks: (p.covers?.marks ?? []).reduce((m, n) => m | (1 << markBit[n]), 0), monsterOnly: !!p.covers?.monsterOnly, inResponseOnly: !!p.covers?.inResponseOnly },
      limit: p.limit ? slots.get(p.limit)! : -1,
      consume: p.consume.map((a, k) => actAt(a, null, `${f}.consume[${k}]`)),
      stepNote: p.stepNote ?? null,
    };
  });

  // End of turn.
  const eot = file.endOfTurn;
  const setOrder = eot.setOrder.map((id) => ix[id]);
  const keepOne = (eot.keepOneInHandIf ?? []).map((c, k) => condAt(c, null, `endOfTurn.keepOneInHandIf[${k}]`));
  const setOnly = new Map<number, CondFn[]>();
  for (const [id, list] of Object.entries(eot.setOnlyIf ?? {})) setOnly.set(ix[id], list.map((c, k) => condAt(c, id, `endOfTurn.setOnlyIf.${id}[${k}]`)));
  const R0: Run = { self: -1, at: NOWHERE, chosen: EMPTY_CHOSEN };

  function finalize(s: State): { n: FinalBoard; sets: number[] } {
    const n: FinalBoard = {
      hand: s.hand, deck: s.deck, extra: s.extra, gy: s.gy, ban: s.ban, mons: s.mons, st: s.st, top: s.top,
      opp: s.opp, lp: s.lp, noDirect: s.noDirect, flags: s.flags, opt: s.opt, spell: s.spell, addLock: s.addLock,
    };
    let any = false;
    for (let i = 0; i < setOrder.length; i++) if (s.hand[setOrder[i]]) { any = true; break; }
    if (!any) return { n, sets: NOSETS };
    n.hand = s.hand.slice(); n.st = s.st.slice();
    const sets: number[] = [];
    let keep = false;
    for (const c of keepOne) if (c(s, R0)) { keep = true; break; }
    outer: for (const id of setOrder) {
      const c = n.hand[id];
      const only = setOnly.get(id);
      for (let i = 0; i < c; i++) {
        if (n.st.length >= 5) break outer;
        if (keep && total(n.hand) <= 1) break outer;
        if (only) {
          const r: Run = { self: id, at: NOWHERE, chosen: EMPTY_CHOSEN };
          if (!only.every((f) => f(n, r))) continue;   // seen on the board as Set so far
        }
        n.hand[id]--; n.st.push({ id, up: false, now: false, endSet: true }); sets.push(id);
      }
    }
    return { n, sets };
  }

  // Board value.
  const entries = file.boardValue.map((b: BoardValueDef, j) => {
    const f = `boardValue[${j}]`;
    const on = countWord(b.on, `${f}.on`) ?? ((cf: CondFn): CountFn => (s, r) => (cf(s, r) ? 1 : 0))(condAt(b.on, null, `${f}.on`));
    return {
      on,
      base: b.base.map((x, k) => ({ conds: (x.if ?? []).map((c, q) => condAt(c, null, `${f}.base[${k}].if[${q}]`)), value: x.value, label: x.label })),
      adds: (b.adds ?? []).map((x, k) => ({ conds: x.if.map((c, q) => condAt(c, null, `${f}.adds[${k}].if[${q}]`)), value: x.value, label: x.label })),
      extraCopies: b.extraCopies ?? null,
    };
  });

  const hasBoardValue: boolean[] = ids.map(() => false);
  // Only cards a `control` word names (at any depth of `on`) count: a card named by another word
  // in the same `on` (a Deck or GY check, say) keeps its default value.
  const named = (v: unknown, field: string): void => {
    if (Array.isArray(v)) { v.forEach((x) => named(x, field)); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const c = o.control as Record<string, unknown> | undefined;
    if (c && typeof c === 'object') {
      if (typeof c.card === 'string' && ix[c.card] !== undefined) hasBoardValue[ix[c.card]] = true;
      if (typeof c.group === 'string') for (const i of group(c.group, (m) => { throw new DeckCompileError([{ card: null, field, message: m }]); })) hasBoardValue[i] = true;
    }
    for (const x of Object.values(o)) named(x, field);
  };
  file.boardValue.forEach((b, j) => named(b.on, `boardValue[${j}].on`));

  function boardValue(n: FinalBoard, full: boolean): { sum: number; items: [string, number][] | null } {
    const s = n;
    const items: [string, number][] | null = full ? [] : null;
    let sum = 0;
    for (const e of entries) {
      const k = e.on(s, R0);
      if (!k) continue;
      const b = e.base.find((x) => x.conds.every((c) => c(s, R0)));
      let v = 0, label = '';
      if (b) {
        v = b.value; label = b.label;
        for (const a of e.adds) if (a.conds.every((c) => c(s, R0))) { v += a.value; if (full) label += `, ${a.label}`; }
      }
      for (let i = 0; i < k; i++) {
        if (i > 0 && e.extraCopies) { sum += e.extraCopies.value; items?.push([e.extraCopies.label, e.extraCopies.value]); continue; }
        if (!b) continue;
        sum += v; items?.push([label, v]);
      }
    }
    return { sum, items };
  }

  function total(z: Uint8Array): number { let t = 0; for (let i = 0; i < z.length; i++) t += z[i]; return t; }

  return {
    file, ids, ix, UNK, props, nOpt, nFlags, markBit,
    genMain, genPending, onPlace, onLeaveField, onOppMonsterToGy,
    extra, protections, queueAfterSummon, finalize, boardValue, hasBoardValue, effects,
    state: so, ops,
  };
}

/**
 * Does the effect Special Summon from the Extra Deck? True when a `summon` in its cost or `do`
 * (at any depth) names `from: 'extra'`, or summons a choice whose pick reads the Extra Deck
 * (`zone: 'extra'` anywhere in the pick).
 */
function summonsFromExtra(def: EffectDef): boolean {
  const picks = new Map((def.choose ?? []).map((c) => [c.as, c.pick as unknown]));
  const readsExtra = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(readsExtra);
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return o.zone === 'extra' || Object.values(o).some(readsExtra);
  };
  const walk = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(walk);
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    const sm = o.summon as { what?: string; from?: string } | undefined;
    if (sm && typeof sm === 'object' && (sm.from === 'extra' || (sm.from === undefined && sm.what !== undefined && readsExtra(picks.get(sm.what))))) return true;
    return Object.values(o).some(walk);
  };
  return walk(def.cost ?? []) || walk(def.do ?? []);
}

function join(path: string, key: string): string {
  if (!path) return key;
  return key.startsWith('[') ? path + key : `${path}.${key}`;
}
