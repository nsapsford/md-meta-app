// Lockstep comparison: walk two engines side by side along the reference's own beam and report,
// at every position, the moves one side offers and the other doesn't.
//
// The walk follows side A's beam (the reference's: at each layer the `width` best children by
// score + potential, de-duplicated by position key, as in its solveBeam). Each position on it is
// paired with side B's position that looked the same. At a pair, every move is run plain and,
// when negatable, negated, on both sides; results are matched on (observed position, step text,
// tags, negatable, negated). Move keys and move order are not compared. Unmatched A results are
// `missing`, unmatched B results are `extra`. A position of A with no B partner leaves the beam
// after its diff is reported.

import type { Engine } from '../engine';
import { topK } from '../engine/search';
import type { Move, State } from '../engine/types';
import { refExec, type RefAction, type RefCard, type RefCfg, type RefEngine } from './loadReference';
import { newTags, refTags, toCfg } from './mapping';
import { newObserve, refObserve, type NameMaps } from './observe';

export interface MoveView { key: string; text: string; tags: string[]; negatable: boolean; negated: boolean; obs: string }
/** `obsDiff` is set only at the root, when the two starting positions look different. */
export interface StepDiff { situation: string; depth: number; path: string[]; missing: MoveView[]; extra: MoveView[]; evalDiff: string | null; obsDiff?: string | null }

/** A line's value as both sides can state it: card ids for Sets. */
export interface EvalView { score: number; items: [string, number][] | null; sets: string[] }

export interface SideMove { k: string; neg: boolean; tags: unknown }

/** One engine as the walk sees it. States are the engine's own; `root` ignores `cfg.base`. */
export interface Side<S = any, M extends SideMove = any> {
  root(cfg: RefCfg): S;
  gen(s: S): M[];
  exec(s: S, a: M, neg: boolean): S | null;
  observe(s: S): string;
  tags(a: M): string[];
  evaluate(s: S, full: boolean): EvalView;
  /** The beam's ranking: score + potential. */
  rank(s: S): number;
  stateKey(s: S): number;
  /**
   * A move that throws: false drops it (the reference's search skips such moves), true reports it
   * as an unmatched result whose `obs` is `throws: <message>`.
   */
  reportThrows: boolean;
}

/** The reference as a Side. `maps` names its pending triggers and once-per-turn slots (observe.ts). */
export function refSide(ref: RefEngine, maps?: NameMaps): Side<any, RefAction> {
  return {
    root: (cfg) => ref.newState(cfg),
    gen: (s) => ref.gen(s),
    exec: (s, a, neg) => refExec(s, a, neg),
    observe: (s) => refObserve(ref, s, maps),
    tags: (a) => refTags(a.tags),
    evaluate: (s, full) => { const e = ref.evaluate(s, full); return { score: e.score, items: e.items, sets: [...e.sets] }; },
    rank: (s) => ref.evaluate(s, false).score + ref.potential(s),
    stateKey: (s) => ref.stateKey(s),
    reportThrows: false,
  };
}

/** The new engine as a Side. */
export function newSide(neu: Engine): Side<State, Move> {
  const ids = neu.deck.ids;
  return {
    root: (cfg) => neu.newState(toCfg(cfg)),
    gen: (s) => neu.gen(s),
    exec: (s, a, neg) => neu.exec(s, a, neg),
    observe: (s) => newObserve(neu, s),
    tags: (a) => newTags(a.tags, neu.deck.markBit),
    evaluate: (s, full) => { const e = neu.evaluate(s, full); return { score: e.score, items: e.items, sets: e.sets.map((i) => ids[i]) }; },
    rank: (s) => neu.evaluate(s, false).score + neu.potential(s),
    stateKey: (s) => neu.stateKey(s),
    reportThrows: true,
  };
}

interface Result { view: MoveView; match: string; n: any }

/** The text of the step a move recorded, or '' if it recorded none. */
function stepText(pre: any, n: any): string {
  const last = n.log.length ? n.log[n.log.length - 1] : null;
  return last && last !== (pre.log.length ? pre.log[pre.log.length - 1] : null) ? last.text : '';
}

const matchKey = (v: MoveView) => JSON.stringify([v.obs, v.text, v.tags, v.negatable, v.negated]);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function runOne(side: Side, s: any, a: SideMove, neg: boolean): Result | null {
  const base = { key: a.k, tags: side.tags(a), negatable: a.neg, negated: neg };
  let n: any;
  try { n = side.exec(s, a, neg); } catch (e) {
    if (!side.reportThrows) return null;
    const view = { ...base, text: '', obs: 'throws: ' + errText(e) };
    return { view, match: 'throws', n: null };
  }
  if (!n) return null;
  const view: MoveView = { ...base, text: stepText(s, n), obs: side.observe(n) };
  return { view, match: matchKey(view), n };
}

/** Every move at `s`, plain and (when negatable) negated, in move order. */
function results(side: Side, s: any): Result[] {
  let acts: SideMove[];
  try { acts = side.gen(s); } catch (e) {
    if (!side.reportThrows) return [];
    return [{ view: { key: '(gen)', text: '', tags: [], negatable: false, negated: false, obs: 'throws: ' + errText(e) }, match: 'throws', n: null }];
  }
  const out: Result[] = [];
  for (const a of acts) {
    const r = runOne(side, s, a, false);
    if (r) out.push(r);
    if (a.neg) { const q = runOne(side, s, a, true); if (q) out.push(q); }
  }
  return out;
}

/** Match A's results to B's: index pairs, and the unmatched ones on each side. */
function matchResults(ra: Result[], rb: Result[]): { pair: Map<number, number>; missing: MoveView[]; extra: MoveView[] } {
  const free = new Map<string, number[]>();
  rb.forEach((r, j) => { if (r.match === 'throws') return; const l = free.get(r.match); if (l) l.push(j); else free.set(r.match, [j]); });
  const pair = new Map<number, number>();
  const used = new Set<number>();
  const missing: MoveView[] = [];
  ra.forEach((r, i) => {
    const l = r.match === 'throws' ? undefined : free.get(r.match);
    if (l && l.length) { const j = l.shift()!; pair.set(i, j); used.add(j); } else missing.push(r.view);
  });
  const extra = rb.filter((_, j) => !used.has(j)).map((r) => r.view);
  return { pair, missing, extra };
}

const EPS = 1e-9;

function itemsText(items: [string, number][] | null): string {
  return items ? JSON.stringify(items) : 'none';
}

/** How two evaluations differ (score beyond 1e-9, items, Sets), or null. */
export function evalDiff(a: EvalView, b: EvalView): string | null {
  const out: string[] = [];
  if (!(Math.abs(a.score - b.score) <= EPS)) out.push(`score ${a.score} vs ${b.score}`);
  const sortItems = (x: [string, number][] | null) => (x ? [...x].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] - q[1])) : null);
  const ia = sortItems(a.items), ib = sortItems(b.items);
  const sameItems = ia === null || ib === null
    ? ia === ib
    : ia.length === ib.length && ia.every((p, i) => p[0] === ib[i][0] && Math.abs(p[1] - ib[i][1]) <= EPS);
  if (!sameItems) out.push(`items ${itemsText(ia)} vs ${itemsText(ib)}`);
  if (a.sets.join(',') !== b.sets.join(',')) out.push(`sets [${a.sets.join(', ')}] vs [${b.sets.join(', ')}]`);
  return out.length ? out.join('; ') : null;
}

/** Walk `path` (side A's keys, `~` for negated) on both sides; B's matching keys and both end positions. */
function walk(a: Side, b: Side, cfg: RefCfg, path: string[]): { sa: any; sb: any; out: string[] } {
  let sa = a.root(cfg), sb = b.root(cfg);
  const out: string[] = [];
  path.forEach((k, i) => {
    const where = `translatePath: step ${i + 1} (${k})`;
    if (k[0] === '!' || k[0] === '^' || k[0] === '@') throw new Error(`${where}: interruption and event entries are not supported yet`);
    const neg = k[0] === '~';
    const key = neg ? k.slice(1) : k;
    const act = a.gen(sa).find((x: SideMove) => x.k === key);
    if (!act) throw new Error(`${where}: the reference offers no such move`);
    const ra = runOne(a, sa, act, neg);
    if (!ra || !ra.n) throw new Error(`${where}: the reference move gives no position`);
    let hit: Result | null = null, hitKey = '';
    for (const m of b.gen(sb) as SideMove[]) {
      if (neg && !m.neg) continue;
      const rb = runOne(b, sb, m, neg);
      if (rb && rb.n && rb.match === ra.match) { hit = rb; hitKey = m.k; break; }
    }
    if (!hit) throw new Error(`${where} has no match in the other engine; reference result: ${showMove(ra.view)}`);
    sa = ra.n; sb = hit.n;
    out.push(neg ? '~' + hitKey : hitKey);
  });
  return { sa, sb, out };
}

/** Side A's line `path` as side B's keys. Throws naming the first step with no match. */
export function translateSides(a: Side, b: Side, cfg: RefCfg, path: string[]): string[] {
  return walk(a, b, { ...cfg, base: undefined }, path).out;
}

export function translatePath(ref: RefEngine, neu: Engine, cfg: RefCfg, refPath: string[]): string[] {
  return translateSides(refSide(ref), newSide(neu), cfg, refPath);
}

/** The walk over two sides. `cfg.base` is replayed first on both (side A's keys). */
export function lockstepSides(a: Side, b: Side, cfg: RefCfg, o: { id: string; width: number; depth: number }): StepDiff[] {
  const diffs: StepDiff[] = [];
  const { sa, sb } = walk(a, b, { ...cfg, base: undefined }, cfg.base ?? []);
  const oa = a.observe(sa), ob = b.observe(sb);
  if (oa !== ob) diffs.push({ situation: o.id, depth: 0, path: sa.path.slice(), missing: [], extra: [], evalDiff: null, obsDiff: `${oa}\n      vs ${ob}` });
  let layer: [any, any][] = [[sa, sb]];
  const seen = new Set<number>([a.stateKey(sa)]);
  for (let depth = 0; depth < o.depth && layer.length; depth++) {
    const nextS: [any, any | null][] = [], nextH: number[] = [];
    for (const [pa, pb] of layer) {
      const ra = results(a, pa), rb = results(b, pb);
      const { pair, missing, extra } = matchResults(ra, rb);
      const ed = evalDiff(a.evaluate(pa, true), b.evaluate(pb, true));
      if (missing.length || extra.length || ed) diffs.push({ situation: o.id, depth, path: pa.path.slice(), missing, extra, evalDiff: ed });
      ra.forEach((r, i) => {
        if (r.view.negated || !r.n) return;
        const k = a.stateKey(r.n);
        if (seen.has(k)) return;
        seen.add(k);
        const j = pair.get(i);
        nextS.push([r.n, j === undefined ? null : rb[j].n]);
        nextH.push(a.rank(r.n));
      });
    }
    layer = topK(nextH, nextS.length, o.width).map((i) => nextS[i]).filter((p): p is [any, any] => p[1] !== null);
  }
  return diffs;
}

export function lockstep(ref: RefEngine, neu: Engine, cfg: RefCfg, o: { id: string; width: number; depth: number }): StepDiff[] {
  return lockstepSides(refSide(ref), newSide(neu), cfg, o);
}

/** The cards `ids` only, at their full counts, as deck and extra-deck counts keyed by engine id. */
export function reducedDeck(engine: RefEngine, cards: RefCard[], ids: string[]): { deck: Record<string, number>; extra: Record<string, number> } {
  const keep = new Set(ids);
  const deck: Record<string, number> = {}, extra: Record<string, number> = {};
  for (const c of cards) {
    const id = engine.BY_NAME[c.name];
    if (!id || !keep.has(id)) continue;
    (c.zone === 'extra' ? extra : deck)[id] = c.count;
  }
  const unknown = ids.filter((id) => !(id in deck) && !(id in extra));
  if (unknown.length) throw new Error(`reducedDeck: not in the reference's card list: ${unknown.join(', ')}`);
  return { deck, extra };
}

function showMove(m: MoveView): string {
  return `${m.negated ? '~' : ''}${m.key}${m.negatable ? '' : ' (not negatable)'} "${m.text}" [${m.tags.join(', ')}]\n      obs ${m.obs}`;
}

/** Diffs as readable text ('' when there are none): situation, depth, path, then each unmatched move. */
export function formatDiffs(diffs: StepDiff[]): string {
  return diffs.map((d) => {
    const lines = [`${d.situation} depth ${d.depth} path [${d.path.join(' ')}]`];
    for (const m of d.missing) lines.push(`  missing ${showMove(m)}`);
    for (const m of d.extra) lines.push(`  extra ${showMove(m)}`);
    if (d.obsDiff) lines.push(`  root obs ${d.obsDiff}`);
    if (d.evalDiff) lines.push(`  eval ${d.evalDiff}`);
    return lines.join('\n');
  }).join('\n');
}
