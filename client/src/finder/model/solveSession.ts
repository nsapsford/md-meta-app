// One Finder search and everything that follows it: lines arriving as the search runs, testing
// each against their interruptions (worst case), what-if branches, and recording what really
// happened so the next search continues from there. Port of the artifact's startSolve /
// tradeOptions / adopt / branchRun / finish / worstVerdict / commitEvent / undoEvent / whatIf /
// whatIfDraw, with the page state passed in. Nothing here knows a card.

import type { HandTrapFile } from '../deck/schema';
import { drawBit } from '../engine/opponent';
import { isReplayError, replayReason, type BranchTask } from '../engine/replay';
import { robust, type Applied, type RobustResult } from '../engine/robust';
import type { SerializedLine, SerializedResult } from '../engine/serialize';
import type { CardId, Cfg, Interruption, TurnEvent } from '../engine/types';
import { CANCEL, type Pool } from '../worker/pool';
import type { PolicyResult } from '../worker/protocol';
import { buildCfg, buildIntrs } from './buildCfg';
import type { FinderSnapshot, ResolvedList } from './finderState';

/** The default search budget (the user's choice: 2.75 s). */
export const DEFAULT_BUDGET_MS = 2750;
/** "Search deeper". */
export const DEEP_BUDGET_MS = 6000;
/** The policy search for bait lines, normal and deep. */
export const POLICY_BUDGET_MS = 700;
export const DEEP_POLICY_BUDGET_MS = 2500;
/** Under a draw effect: how much a card for them costs, in points (100 = one hard interruption); 55 picks the suggestion. */
export const DRAW_PENALTIES = [15, 55, 110] as const;
export const DEFAULT_DRAW_PENALTY = 55;
/** Line tabs a search returns. */
export const TOP_LINES = 3;
/** How long testing may run, normal and deep. */
const TEST_MS = 7000, DEEP_TEST_MS = 20000;
/** A lethal line that the worst case makes not lethal ranks below lethal ones by this much. */
const LETHAL_BONUS = 30;

export type RecordedEvent = TurnEvent | { t: 'hit'; step: number; it: Interruption };
export interface BranchResult { step: number; it: Interruption; line: SerializedLine | null; frontier: SerializedLine[]; loading: boolean; error: string | null }
export interface ViewLine { key: string; line: SerializedLine; worst: RobustResult | null; badges: string[]; testing: boolean }
export interface SessionView {
  phase: 'idle' | 'solving' | 'testing' | 'done' | 'error'; lines: ViewLine[]; safest: ViewLine | null; trade: ViewLine[]; selected: string | null;
  nodes: number; ms: number; tested: number; total: number; deep: boolean; message: string; better: string | null;
  base: { steps: number; events: RecordedEvent[]; path: string[] }; branch: BranchResult | null;
  /** What the lines were solved for (for lineName / lineText) and against. */
  mode: 'first' | 'second'; hand: CardId[]; intrs: Interruption[]; drawFx: number;
  /** The setup the next search uses: records can change it (a hand trap used) and undo puts it back. The page shows this. */
  snapshot: FinderSnapshot | null;
}

interface Entry { key: string; line: SerializedLine; worst: RobustResult | null; testing: boolean; rscore: number; safest: boolean; bait: boolean; trade: boolean; kept: boolean }

const n = (x: unknown) => (typeof x === 'number' ? x : 0);
const hard = (l: SerializedLine) => l.items.filter((x) => x[1] >= 0.9).length;
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');

/** Their interruptions in a few words (each named once, at most three). */
export function intrNames(intrs: Interruption[]): string {
  const seen: string[] = [];
  for (const it of intrs) { const l = it.short ?? it.label; if (!seen.includes(l)) seen.push(l); }
  return seen.length > 3 ? seen.slice(0, 3).join(', ') + ` +${seen.length - 3}` : seen.join(' + ');
}

// Under a draw effect: one line per number of cards they draw, the best board for that price,
// kept only if it beats every cheaper one. Scores are put on the same scale (55 points a card).
const tradeScore = (l: SerializedLine) => (l.summary.lethal ? n(l.summary.raw) : n(l.summary.raw) - DEFAULT_DRAW_PENALTY * n(l.summary.eff));
export function tradeOptions(list: (SerializedLine | null | undefined)[]): SerializedLine[] {
  const by = new Map<number, SerializedLine>();
  for (const l of list) {
    if (!l || l.summary.raw == null) continue;
    const d = n(l.summary.draws), c = by.get(d);
    if (!c || n(l.summary.raw) > n(c.summary.raw) + 1e-9) by.set(d, l);
  }
  let out: SerializedLine[] = [];
  let top = -Infinity;
  for (const d of [...by.keys()].sort((a, b) => a - b)) {
    const l = by.get(d)!;
    if (n(l.summary.raw) <= top + 0.5) continue;
    top = n(l.summary.raw);
    out.push({ ...l, score: tradeScore(l) });
  }
  if (out.length > 6) {
    const keep = new Set([out[0]].concat(out.slice().sort((a, b) => b.score - a.score).slice(0, 5)));
    out = out.filter((l) => keep.has(l));
  }
  return out;
}

const lethalBonus = (l: SerializedLine, w: RobustResult | null) => (l.summary.lethal && !(w && w.line.summary.lethal) ? LETHAL_BONUS : 0);

export interface Verdict { cls: 'good' | 'warn' | 'bad'; short: string; long: string }
/** What the worst case does to a line, in words. */
export function worstVerdict(v: Pick<ViewLine, 'line' | 'worst'>, mode: 'first' | 'second', intrs: Interruption[]): Verdict | null {
  const l = v.line, worst = v.worst, w = worst?.line;
  if (!worst || !w) return null;
  // Did spending their interruptions leave you worse off at all?
  const used = worst.score < l.score - 0.5 ? worst.applied.filter((a: Applied) => a.step != null) : [];
  const names = intrNames(intrs);
  // A line dropped early (clearly weaker) or cut off by the time limit may be even worse than shown.
  const dw = n(w.summary.draws), dp = n(l.summary.draws);
  const soft = (dw > dp ? `, and they draw ${dw}` : '') + (worst.pruned ? ', or worse' : worst.partial ? ' (not fully tested)' : '');
  const plus = dw > dp ? ` +${plural(dw - dp, 'draw')}` : '';
  if (mode === 'second') {
    const lpLeft = fmt(Math.max(0, n(w.summary.oppLp) - n(w.summary.battle)));
    if (w.summary.lethal) return { cls: 'good', short: 'worst case: lethal', long: `Still lethal through ${names}` };
    if (l.summary.lethal) return { cls: 'bad', short: 'worst case: not lethal', long: `Not lethal if they use ${names} well: they keep ${lpLeft} LP${soft}` };
    return { cls: used.length ? 'warn' : 'good', short: `worst case: ${lpLeft} LP`, long: used.length ? `Through ${names}: they keep ${lpLeft} LP${soft}` : `${names} doesn't change this line` };
  }
  const hp = hard(l), hw = hard(w);
  if (!used.length || hw >= hp) return { cls: used.length && dw > dp ? 'warn' : 'good', short: `worst case: ${hw}${plus}`, long: used.length ? `Through ${names}: still ${plural(hw, 'interruption')}${soft}` : `${names} can't make this line worse` };
  return { cls: hw >= hp - 1 ? 'warn' : 'bad', short: `worst case: ${hw}${plus}`, long: `Through ${names}: drops to ${plural(hw, 'interruption')}${soft}` };
}

/** `reset`: forget every record and lock first (the hand or turn order changed), without searching for the old setup. */
export interface StartOpts { deep?: boolean; debounceMs?: number; reset?: boolean }

export function createSolveSession(d: { pool: Pool; traps: HandTrapFile; onChange(v: SessionView): void; now?: () => number }) {
  const { pool, traps } = d;
  const now = d.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  let gen = 0;
  let phase: SessionView['phase'] = 'idle';
  let lines: Entry[] = [];
  let byKey = new Map<string, Entry>();
  let selected: string | null = null, bestKey: string | null = null, better: string | null = null;
  let interacted = false, ranked = false, deep = false;
  let nodes = 0, ms = 0, t0 = 0, tested = 0, total = 0;
  let message = '', notice = '';
  let branch: BranchResult | null = null;
  let cfg: Cfg | null = null, intrs: Interruption[] = [], handIds: CardId[] = [], mode: 'first' | 'second' = 'first';
  let last: { snap: FinderSnapshot; list: ResolvedList } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const branchCache = new Map<string, Promise<unknown>>();
  /** Undo entries: the base before a record or lock, and the setup it was solved with (a record can use up a hand trap). */
  type Snap = { path: string[]; steps: number; n: number; snap: FinderSnapshot | null };
  const base = { path: [] as string[], steps: 0, events: [] as RecordedEvent[], stack: [] as Snap[] };

  const toView = (e: Entry): ViewLine => {
    const isBest = e.key === bestKey, under = !!cfg?.drawFx;
    const badge = isBest && ranked && intrs.length ? 'Sturdiest' : isBest && under ? 'Best trade' : e.safest ? 'Safest' : e.bait ? 'Bait' : e.kept ? 'Earlier' : null;
    return { key: e.key, line: e.line, worst: e.worst, badges: badge ? [badge] : [], testing: e.testing };
  };
  function view(): SessionView {
    const vs = lines.map(toView);
    return {
      phase, lines: vs, safest: vs.find((v) => lines.find((e) => e.key === v.key)!.safest) ?? null, trade: cfg?.drawFx ? vs : [], selected,
      nodes, ms, tested, total, deep, message, better,
      base: { steps: base.steps, events: base.events.slice(), path: base.path.slice() }, branch: branch ? { ...branch } : null,
      mode, hand: handIds.slice(), intrs: intrs.slice(), drawFx: cfg?.drawFx ?? 0, snapshot: last ? last.snap : null,
    };
  }
  const emit = () => d.onChange(view());

  // Worker lines into entries; a line seen before keeps its identity (and its test results).
  function prepList(raw: (SerializedLine | null | undefined)[], trade = false): Entry[] {
    const out: Entry[] = [];
    for (const r of raw) {
      if (!r) continue;
      const key = r.path.join('>');
      let e = byKey.get(key);
      if (!e) { e = { key, line: r, worst: null, testing: false, rscore: r.score, safest: false, bait: false, trade: false, kept: false }; byKey.set(key, e); }
      if (r.safest) e.safest = true;
      if (r.bait) e.bait = true;
      if (trade) e.trade = true;
      if (!out.includes(e)) out.push(e);
    }
    return out;
  }
  const prep = (res: SerializedResult) => prepList(res.lines.concat(res.safest ? [res.safest] : []));
  const bestOf = (es: Entry[]) => { let b: Entry | null = null; for (const e of es) if (!b || e.line.score > b.line.score) b = e; return b ? b.key : null; };
  const tradeOf = (rs: SerializedResult[]) => { const c = prepList(tradeOptions(rs.flatMap((r) => (r.frontier || []).concat(r.lines))), true); return { c, best: bestOf(c) }; };

  function adopt(next: Entry[], best?: string | null) {
    bestKey = best || (next.length ? next[0].key : null);
    const prev = selected ? byKey.get(selected) : undefined;
    if (interacted && prev && lines.includes(prev)) {
      if (!next.includes(prev)) { prev.kept = true; next = next.concat([prev]); }
    } else selected = bestKey;
    lines = next;
    emit();
  }

  function branchRun(t: BranchTask): Promise<unknown> {
    const k = t.prefix.join('>') + '|' + t.key + '|' + t.it.kind + '|' + t.it.src + '|' + (t.it.uid || '') + (t.quick ? '|q' : '|f') + (t.start ? '|start' : '');
    let p = branchCache.get(k);
    if (!p) { p = pool.run(t); branchCache.set(k, p); }
    return p;
  }

  function finish(my: number) {
    if (my !== gen) return;
    phase = 'done';
    ms = now() - t0;
    emit();
  }

  const restoreSnap = (snap: FinderSnapshot | null) => { if (snap && last) last = { ...last, snap }; };
  /** Forget every record, putting back the setup from before the first. */
  function clearBase() {
    if (base.stack.length) restoreSnap(base.stack[0].snap);
    base.path = []; base.steps = 0; base.events = []; base.stack = [];
  }
  function popBase() {
    const sn = base.stack.pop();
    if (!sn) return false;
    base.path = sn.path; base.steps = sn.steps; base.events.length = sn.n;
    restoreSnap(sn.snap);
    return true;
  }
  const pushBase = () => base.stack.push({ path: base.path, steps: base.steps, n: base.events.length, snap: last ? last.snap : null });
  const current = () => (selected ? byKey.get(selected) ?? lines.find((e) => e.key === selected) ?? null : null);
  const resolve = () => { if (last) void solve(false); };

  async function solve(isDeep: boolean): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!last) return;
    const { snap, list } = last;
    const my = ++gen;
    pool.cancelAll();
    branchCache.clear();
    byKey = new Map();
    lines = []; selected = null; bestKey = null;
    branch = null; interacted = false; ranked = false; better = null; tested = 0; total = 0; deep = isDeep; nodes = 0; ms = 0;
    message = notice; notice = '';
    cfg = buildCfg(snap, list, traps);
    intrs = buildIntrs(snap, traps);
    handIds = snap.hand.slice();
    mode = snap.mode;
    if (base.path.length) cfg.base = base.path.slice();
    const c = cfg, hand = handIds, its = intrs;
    phase = 'solving'; t0 = now();
    emit();
    const alive = () => my === gen;
    try {
      const budget = isDeep ? DEEP_BUDGET_MS : DEFAULT_BUDGET_MS;
      // Under a live draw effect, three searches value a card for them differently, so the trade-off has both ends.
      const pA: Promise<{ trade?: SerializedResult[]; res?: SerializedResult; nodes: number }> = c.drawFx
        ? Promise.all(DRAW_PENALTIES.map((drawPenalty) => pool.run<SerializedResult>({ type: 'solve', cfg: { ...c, drawPenalty }, hand, timeMs: budget, top: TOP_LINES },
          drawPenalty === DEFAULT_DRAW_PENALTY ? (part) => { if (alive()) { nodes = part.nodes; const t = tradeOf([part]); if (t.c.length) adopt(t.c, t.best); } } : undefined)))
          .then((rs) => ({ trade: rs, nodes: rs.reduce((t, r) => t + r.nodes, 0) }))
        : pool.run<SerializedResult>({ type: 'solve', cfg: c, hand, timeMs: budget, top: TOP_LINES }, (part) => { if (alive()) { nodes = part.nodes; adopt(prep(part)); } })
          .then((res) => ({ res, nodes: res.nodes }));
      const pB = its.length ? pool.run<PolicyResult>({ type: 'solve', cfg: c, hand, timeMs: isDeep ? DEEP_POLICY_BUDGET_MS : POLICY_BUDGET_MS, top: TOP_LINES, policy: its }) : null;
      const A = await pA;
      if (!alive()) return;
      nodes = A.nodes;
      let cands: Entry[];
      let best: string | null = null;
      if (A.trade) { const t = tradeOf(A.trade); cands = t.c; best = t.best; } else cands = prep(A.res!);
      if (!its.length) { adopt(cands, best); finish(my); return; }
      cands.forEach((e) => { e.testing = true; });
      phase = 'testing';
      adopt(cands, best);
      const B = await pB!;
      if (!alive()) return;
      nodes += B.nodes;
      const plans = await Promise.all(B.paths.map((path) => pool.run<SerializedLine>({ type: 'plan', cfg: c, path, hand }).catch(() => null)));
      if (!alive()) return;
      for (const p of plans) {
        if (!p) continue;
        const e = prepList([p])[0];
        if (!cands.includes(e)) { e.testing = true; cands.push(e); }
      }
      cands = cands.slice(0, 8);
      adopt(cands, best);
      let bestW = -Infinity;
      const deadline = now() + (isDeep ? DEEP_TEST_MS : TEST_MS);
      const counted = (t: BranchTask) => { total++; return branchRun(t).finally(() => { tested++; if (alive()) emit(); }); };
      const test = async (e: Entry, prune: boolean) => {
        const w = await robust(c, e.line, its, counted, {
          branchMs: isDeep ? 500 : 250, hand, firstMoves: isDeep ? 5 : 3, from: base.steps, handMax: snap.oppHand ?? undefined,
          stopBelow: prune ? () => bestW - LETHAL_BONUS : undefined, expired: () => now() > deadline,
        });
        if (!alive()) return;
        e.worst = w; e.testing = false; e.rscore = w.score + lethalBonus(e.line, w);
        if (!w.pruned && e.rscore > bestW) bestW = e.rscore;
        emit();
      };
      const firstL = cands.find((e) => e.key === best) || cands[0];
      if (firstL) await test(firstL, false);
      await Promise.all(cands.filter((e) => e !== firstL).map((e) => test(e, true)));
      if (!alive()) return;
      const order = cands.slice().sort((a, b) => (b.rscore - a.rscore) || (b.line.score - a.line.score));
      ranked = true;
      const top = order[0];
      let keep = order.slice(0, c.drawFx ? 6 : 5);
      if (c.drawFx) keep = keep.sort((a, b) => (n(a.line.summary.draws) - n(b.line.summary.draws)) || (b.line.score - a.line.score));   // fewest draws first
      const cur = current();
      if (interacted && cur && top && top.key !== cur.key) better = top.key;
      adopt(keep, top ? top.key : null);
      finish(my);
    } catch (e) {
      if (!alive() || e === CANCEL) return;
      const msg = (e as Error)?.message || '';
      // The recorded events no longer fit (their field or the last event changed things). Any other
      // failure is not the record's fault: it shows as an error and the records stay.
      if (base.path.length && isReplayError(msg)) {
        if (!popBase()) clearBase();
        const why = replayReason(msg);
        notice = `That can't have happened at that point${why ? ': ' + why : ''}. Last record removed.`;
        void solve(false);
        return;
      }
      phase = 'error'; message = msg || 'unknown error';
      emit();
    }
  }

  async function runBranch(stepIndex: number, it: Interruption) {
    const e = current();
    if (!e || !cfg) return;
    const st = e.line.steps[stepIndex];
    if (!st) return;
    interacted = true;
    const my = gen;
    const b: BranchResult = { step: stepIndex, it, line: null, frontier: [], loading: true, error: null };
    branch = b;
    emit();
    const prefix = e.line.path.slice(0, st.pathIdx);
    try {
      if (drawBit(it.kind)) {
        // A draw effect lands on a step: re-solve from there three ways and keep the best board for each number of draws.
        const dit = { ...it, force: it.force ?? true };
        const res = await Promise.all(DRAW_PENALTIES.map((drawPenalty) => pool.run<{ best: SerializedLine; frontier: SerializedLine[] } | null>(
          { type: 'branch', cfg: cfg!, drawPenalty, prefix, key: st.key, it: dit, frontier: true, timeMs: 1200, width: 60, maxWidth: 4000, hand: handIds }, undefined, true)));
        const all: SerializedLine[] = [];
        for (const r of res) if (r) { all.push(r.best); all.push(...r.frontier); }
        b.frontier = tradeOptions(all);
        let bi = -1;
        b.frontier.forEach((o, i) => { if (bi < 0 || o.score > b.frontier[bi].score) bi = i; });
        b.line = bi >= 0 ? b.frontier[bi] : null;
      } else {
        b.line = await pool.run<SerializedLine | null>({ type: 'branch', cfg, prefix, key: st.key, it, timeMs: 1500, width: 60, maxWidth: 4000, hand: handIds }, undefined, true);
      }
    } catch (err) {
      if (err === CANCEL) return;
      b.error = (err as Error)?.message || 'unknown error';
    }
    b.loading = false;
    if (my === gen && branch === b) emit();
  }

  return {
    /** Search for `snap` (cancelling any search before it). With `debounceMs`, waits that long for more changes first. */
    start(snap: FinderSnapshot, list: ResolvedList, o: StartOpts = {}): void {
      if (o.reset) clearBase();
      last = { snap, list };
      if (timer) { clearTimeout(timer); timer = null; }
      if (o.debounceMs) { const dp = !!o.deep; timer = setTimeout(() => { timer = null; void solve(dp); }, o.debounceMs); return; }
      void solve(!!o.deep);
    },
    select(key: string): void {
      const e = lines.find((x) => x.key === key);
      if (!e) return;
      interacted = true;
      selected = key; branch = null;
      if (better === key) better = null;
      emit();
    },
    /** Lock the first `stepIndex` steps of the selected line: the next search continues from there. */
    lockTo(stepIndex: number): void {
      const e = current();
      if (!e) return;
      const l = e.line;
      const k = Math.max(base.steps, Math.min(stepIndex, l.steps.length));
      pushBase();
      base.path = l.path.slice(0, l.steps[k] ? l.steps[k].pathIdx : l.path.length);
      base.steps = k;
      interacted = true;
      emit();
    },
    /**
     * Something that really happened, after step `afterStep` of the selected line (default: after the
     * locked steps). `snap`: the setup from now on, if the event changed it. Searches again.
     */
    record(ev: TurnEvent, afterStep?: number, snap?: FinderSnapshot): void {
      const e = current();
      let prefix = base.path, steps = base.steps;
      if (afterStep != null && e) {
        const l = e.line;
        prefix = l.path.slice(0, l.steps[afterStep + 1] ? l.steps[afterStep + 1].pathIdx : l.path.length);
        steps = afterStep + 1;
      }
      pushBase();
      restoreSnap(snap ?? null);
      base.path = prefix.concat(['@' + JSON.stringify(ev)]);
      base.steps = steps + 1;
      base.events.push(ev);
      resolve();
    },
    /**
     * Step `stepIndex` of the selected line was hit by `it` (negated, or what `it` does). `usedTrap`:
     * the hand trap they used, switched off from now on, with one card fewer in their hand (undo
     * puts both back). Searches again.
     */
    recordHit(stepIndex: number, it: Interruption, usedTrap?: string): void {
      const e = current();
      const st = e?.line.steps[stepIndex];
      if (!e || !st || !st.key) return;
      pushBase();
      if (usedTrap && last) {
        const s0 = last.snap;
        restoreSnap({ ...s0, hts: s0.hts.filter((k) => k !== usedTrap), oppHand: s0.oppHand == null ? null : Math.max(0, s0.oppHand - 1) });
      }
      base.path = e.line.path.slice(0, st.pathIdx).concat(['!' + JSON.stringify({ k: st.key, it })]);
      base.steps = stepIndex + 1;
      base.events.push({ t: 'hit', step: stepIndex, it });
      resolve();
    },
    /** Take back the last record (or lock). Searches again. */
    undo(): void { if (popBase()) resolve(); },
    /** Forget every record and lock. Searches again. */
    startOver(): void { clearBase(); resolve(); },
    whatIf(stepIndex: number, it: Interruption): void { void runBranch(stepIndex, it); },
    closeBranch(): void { branch = null; emit(); },
    dispose(): void {
      if (timer) { clearTimeout(timer); timer = null; }
      gen++;
      pool.cancelAll();
    },
    view,
  };
}
export type SolveSession = ReturnType<typeof createSolveSession>;
