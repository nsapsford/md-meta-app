import { afterEach, describe, expect, it, vi } from 'vitest';
import handTraps from '../deck/files/hand-traps.json';
import type { HandTrapFile } from '../deck/schema';
import type { SerializedLine, SerializedResult } from '../engine/serialize';
import { TOY_FACTS, TOY_FILE } from '../engine/__toy__/toyDeck';
import { CANCEL, createPool, type Pool } from '../worker/pool';
import type { Task } from '../worker/protocol';
import { DEFAULT_SNAPSHOT, setMode, type FinderSnapshot, type ResolvedList } from './finderState';
import { lineName, lineText } from './lineText';
import { createSolveSession, DEEP_BUDGET_MS, DEFAULT_BUDGET_MS, DRAW_PENALTIES, tradeOptions, worstVerdict, type SessionView } from './solveSession';

const TRAPS = handTraps as HandTrapFile;
const LIST: ResolvedList = { main: { ROD: 3, DM: 2 }, extra: {}, blanks: 0, unknown: [] };
const SNAP: FinderSnapshot = { ...DEFAULT_SNAPSHOT, hand: ['ROD', 'DM'], hts: [] };
const WITH_ASH: FinderSnapshot = { ...SNAP, hts: ['ash'] };

/** A scripted line: one step per path key, no tags (so no interruption can hit it). */
function line(path: string[], score: number, o: Partial<SerializedLine> = {}): SerializedLine {
  return {
    tag: 'Line', score, summary: { value: score, draws: 0, eff: 0, raw: score }, items: [], sets: [], chokes: null, safest: false, path,
    steps: path.map((key, i) => ({ pathIdx: i, key, ev: false, mons: [], sts: [], oppPresent: [], summoned: false, extraSummon: false, draws: 0, oppCount: 0, text: `step ${key}`, tags: {}, interrupted: null, summonsAfter: 0, canNeg: true, wipeHere: false, firstDeckAdd: false, notes: [], lineNote: null })),
    summons: 0, opening: [], drawFx: 0, board: { mons: [], st: [], hand: {}, lp: 8000, opp: [] },
    generated: { name: 'x', starters: [], steps: [], endBoard: [] }, ...o,
  } as SerializedLine;
}
const result = (lines: SerializedLine[], extra: Partial<SerializedResult> = {}): SerializedResult => ({ lines, safest: null, frontier: null, nodes: 100, ms: 10, width: 60, ...extra });

type Handler = (t: Task, onPartial?: (p: SerializedResult) => void) => unknown;
function fakePool(handler: Handler) {
  const calls: Task[] = [];
  let pending: ((e: unknown) => void)[] = [];
  let cancels = 0;
  const pool: Pool = {
    size: 2, ready: Promise.resolve(),
    run<T>(task: Task, onPartial?: (p: SerializedResult) => void): Promise<T> {
      calls.push(task);
      const p = new Promise<T>((res, rej) => { pending.push(rej); Promise.resolve().then(() => handler(task, onPartial)).then((v) => res(v as T), rej); });
      p.catch(() => {});
      return p;
    },
    cancelAll() { cancels++; for (const r of pending) r(CANCEL); pending = []; },
    dispose() {},
  };
  return { pool, calls, cancels: () => cancels };
}
const never = () => new Promise(() => {});

function session(handler: Handler) {
  const f = fakePool(handler);
  const views: SessionView[] = [];
  const s = createSolveSession({ pool: f.pool, traps: TRAPS, onChange: (v) => views.push(v) });
  return { ...f, s, views };
}
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 0));
  expect(cond()).toBe(true);
}
const solves = (calls: Task[]) => calls.filter((t): t is Extract<Task, { type: 'solve' }> => t.type === 'solve');
const LINES = [line(['a', 'b', 'c'], 300), line(['d'], 200), line(['e', 'f'], 100)];

afterEach(() => { vi.useRealTimers(); });

describe('the solve session', () => {
  it('moves idle → solving → testing → done, ending with the lines in score order', async () => {
    const { s, views } = session((t) => (t.type === 'solve' ? (t.policy ? { paths: [], nodes: 5 } : result([LINES[2], LINES[0], LINES[1]])) : null));
    expect(s.view().phase).toBe('idle');
    s.start(WITH_ASH, LIST);
    await until(() => s.view().phase === 'done');
    const phases = views.map((v) => v.phase).filter((p, i, a) => p !== a[i - 1]);
    expect(phases).toEqual(['solving', 'testing', 'done']);
    const v = s.view();
    expect(v.lines.map((l) => l.line.score)).toEqual([300, 200, 100]);
    expect(v.lines.every((l) => l.worst && !l.testing)).toBe(true);
    expect([v.selected, v.lines[0].badges]).toEqual(['a>b>c', ['Sturdiest']]);
    expect(v.intrs.map((x) => x.kind)).toEqual(['negDeckTouch']);
  });

  it('shows partial results before done', async () => {
    const { s, views } = session((t, post) => { post!(result([LINES[1]])); return result(LINES); });
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    const firstLines = views.findIndex((v) => v.lines.length > 0);
    expect(views[firstLines].phase).toBe('solving');
    expect(views[firstLines].lines.map((l) => l.key)).toEqual(['d']);
    expect(s.view().lines.map((l) => l.key)).toEqual(['a>b>c', 'd', 'e>f']);
  });

  it('a second start cancels the first; only its lines show', async () => {
    let n = 0;
    const { s, cancels } = session(() => (++n === 1 ? never() : result([LINES[1]])));
    s.start(SNAP, LIST);
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    expect(cancels()).toBe(2);
    expect(s.view().lines.map((l) => l.key)).toEqual(['d']);
  });

  it('ignores a cancelled run that still answers', async () => {
    let n = 0;
    let late: (v: unknown) => void = () => {};
    const { s } = session(() => (++n === 1 ? new Promise((r) => { late = r; }) : result([LINES[1]])));
    s.start(SNAP, LIST);
    await Promise.resolve();
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    late(result([LINES[0]]));
    await new Promise((r) => setTimeout(r, 0));
    expect(s.view().lines.map((l) => l.key)).toEqual(['d']);
  });

  it('debounces quick changes into one search', () => {
    vi.useFakeTimers();
    const { s, calls } = session(() => result(LINES));
    for (let i = 0; i < 3; i++) { s.start(SNAP, LIST, { debounceMs: 500 }); vi.advanceTimersByTime(200); }
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(solves(calls)).toHaveLength(1);
  });

  it('uses the default budget, and the deep one for Search deeper', async () => {
    const { s, calls } = session(() => result(LINES));
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    s.start(SNAP, LIST, { deep: true });
    await until(() => s.view().phase === 'done');
    expect(solves(calls).map((t) => t.timeMs)).toEqual([DEFAULT_BUDGET_MS, DEEP_BUDGET_MS]);
    expect(s.view().deep).toBe(true);
    expect([DEFAULT_BUDGET_MS, DEEP_BUDGET_MS]).toEqual([2750, 6000]);
  });

  it('ends in error with the worker\'s message', async () => {
    const { s } = session(() => { throw new Error('worker blew up'); });
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'error');
    expect(s.view().message).toBe('worker blew up');
  });

  it('has no testing phase with no interruptions chosen', async () => {
    const { s, views, calls } = session(() => result(LINES));
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    expect(views.some((v) => v.phase === 'testing')).toBe(false);
    expect(calls.every((t) => t.type === 'solve' && !t.policy)).toBe(true);
  });

  it('an empty hand ends done with one line that has no steps', async () => {
    const { s, calls } = session(() => result([line([], 10)]));
    s.start({ ...SNAP, hand: [] }, LIST);
    await until(() => s.view().phase === 'done');
    expect(solves(calls)[0].hand).toEqual([]);
    expect(s.view().lines).toHaveLength(1);
    expect(s.view().lines[0].line.steps).toEqual([]);
  });

  it('runs three solves under a live draw effect, one per draw penalty', async () => {
    const d1 = line(['x'], 0, { summary: { value: 0, draws: 1, eff: 1, raw: 400 } });
    const d0 = line(['y'], 0, { summary: { value: 0, draws: 0, eff: 0, raw: 300 } });
    const { s, calls } = session(() => result([d1, d0]));
    s.start({ ...SNAP, live: ['fuwalos'] }, LIST);
    await until(() => s.view().phase === 'done');
    expect(solves(calls).map((t) => t.cfg.drawPenalty)).toEqual([...DRAW_PENALTIES]);
    expect(solves(calls)[0].cfg.drawFx).toBe(1);
    const v = s.view();
    expect(v.trade.map((l) => [l.key, l.line.score])).toEqual([['y', 300], ['x', 345]]);
    expect(v.selected).toBe('x');
    expect(v.lines.find((l) => l.key === 'x')!.badges).toEqual(['Best trade']);
  });

  it('caps the hand traps used against a line by their hand size', async () => {
    const hit = line(['k'], 100);
    hit.steps[0].tags = { deckTouch: true };
    const { s, calls } = session((t) => (t.type === 'solve' ? (t.policy ? { paths: [], nodes: 0 } : result([hit])) : { score: 50 }));
    s.start({ ...WITH_ASH, oppHand: 0 }, LIST);
    await until(() => s.view().phase === 'done');
    expect(calls.some((t) => t.type === 'branch')).toBe(false);
    s.start(WITH_ASH, LIST);
    await until(() => s.view().phase === 'done');
    expect(calls.some((t) => t.type === 'branch')).toBe(true);
  });

  it('lockTo(2) then start sends cfg.base of the first two path keys', async () => {
    const { s, calls } = session(() => result(LINES));
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    s.lockTo(2);
    expect(s.view().base).toMatchObject({ steps: 2, path: ['a', 'b'] });
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    expect(solves(calls)[1].cfg.base).toEqual(['a', 'b']);
  });

  it('records events, undoes the last and starts over', async () => {
    const { s, calls } = session(() => result(LINES));
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    s.record({ t: 'gain', id: 'DM' }, 0);
    expect(s.view().base).toEqual({ steps: 2, events: [{ t: 'gain', id: 'DM' }], path: ['a', '@{"t":"gain","id":"DM"}'] });
    await until(() => s.view().phase === 'done');
    expect(solves(calls)[1].cfg.base).toEqual(['a', '@{"t":"gain","id":"DM"}']);
    s.recordHit(1, { kind: 'force', src: 'hand', label: 'Negate' });
    expect(s.view().base.events).toHaveLength(2);
    expect(s.view().base.path).toEqual(['a', '!{"k":"b","it":{"kind":"force","src":"hand","label":"Negate"}}']);
    s.undo();
    expect(s.view().base.events).toEqual([{ t: 'gain', id: 'DM' }]);
    s.startOver();
    expect(s.view().base).toEqual({ steps: 0, events: [], path: [] });
    await until(() => s.view().phase === 'done');
    expect(solves(calls)[solves(calls).length - 1].cfg.base).toBeUndefined();
  });

  it('drops the last record when it no longer fits', async () => {
    let n = 0;
    const { s } = session((t) => (t.type === 'solve' && t.cfg.base && ++n === 1 ? Promise.reject(new Error('replay: b')) : result(LINES)));
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    s.record({ t: 'gain', id: 'DM' }, 0);
    await until(() => s.view().phase === 'done' && s.view().base.events.length === 0);
    expect(s.view().message).toBe("That can't have happened at that point: replay: b. Last record removed.");
  });

  it('whatIf fills the branch from a branch task', async () => {
    const alt = line(['a', 'z'], 50);
    const { s, calls } = session((t) => (t.type === 'branch' ? alt : result(LINES)));
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    const it = { kind: 'force', src: 'hand' as const, label: 'Negate' };
    s.whatIf(1, it);
    expect(s.view().branch).toMatchObject({ step: 1, loading: true, line: null });
    await until(() => !s.view().branch!.loading);
    expect(s.view().branch).toEqual({ step: 1, it, line: alt, frontier: [], loading: false, error: null });
    expect(calls[calls.length - 1]).toMatchObject({ type: 'branch', prefix: ['a'], key: 'b', it, timeMs: 1500 });
    s.closeBranch();
    expect(s.view().branch).toBeNull();
  });

  it('keeps a line the user picked when the next results leave it out', async () => {
    let n = 0;
    const { s } = session((t, post) => { if (++n === 1) return result(LINES); post!(result([LINES[0]])); return result([LINES[0]]); });
    s.start(SNAP, LIST);
    await until(() => s.view().phase === 'done');
    s.select('d');
    expect(s.view().selected).toBe('d');
  });
});

describe('tradeOptions and worstVerdict', () => {
  it('keeps the best board per number of draws, only when it beats every cheaper one', () => {
    const l = (k: string, draws: number, raw: number) => line([k], 0, { summary: { draws, eff: draws, raw } });
    expect(tradeOptions([l('a', 0, 100), l('b', 1, 100.2), l('c', 1, 300), l('d', 2, 250), null]).map((x) => [x.path[0], x.score])).toEqual([['a', 100], ['c', 245]]);
  });
  it('says what the worst case does', () => {
    const l = line(['a'], 200, { items: [['A', 1], ['B', 1]] });
    const w = { line: line(['a'], 100, { items: [['A', 1]] }), applied: [{ it: { kind: 'negDeckTouch', src: 'hand' as const, label: 'Ash Blossom', short: 'Ash' }, step: 0 }], score: 100 };
    expect(worstVerdict({ line: l, worst: w }, 'first', [w.applied[0].it])).toEqual({ cls: 'warn', short: 'worst case: 1', long: 'Through Ash: drops to 1 interruption' });
    expect(worstVerdict({ line: l, worst: null }, 'first', [])).toBeNull();
  });
});

describe('lineName and lineText', () => {
  const short = (id: string) => ({ ROD: 'Rod', DM: 'DM', SET: 'Wall' } as Record<string, string>)[id] ?? id;
  it('names a line by turn order and hand', () => {
    expect(lineName(line([], 0), short, { mode: 'first', hand: ['ROD', 'UNK'] })).toBe('Going first: Rod + blank');
    expect(lineName(line([], 0, { safest: true }), short, { mode: 'second', hand: ['DM'] })).toBe('Going second: DM (safest lethal)');
  });
  it('copies a line as text', () => {
    const l = line(['a', 'b'], 0, { sets: ['SET'], items: [['Negate once', 1], ['Weak', 0.1]], board: { mons: [{ id: 'DM', uses: 0, marks: [] }], st: [{ id: 'SET', up: false, endSet: true }], hand: {}, lp: 8000, opp: [] } });
    l.steps[1].interrupted = 'Ash Blossom negates it';
    expect(lineText(l, short, { mode: 'first', hand: ['ROD'] })).toBe(['Going first: Rod', '', '1. step a', '2. step b [Ash Blossom negates it]', 'Then Set Wall.', '', 'End board: DM, Wall (Set)', 'Their turn: Negate once'].join('\n'));
  });
});

describe('with the real engine on the main thread', () => {
  it('finds and tests toy lines, and an empty hand gives the do-nothing line', async () => {
    const pool = createPool({ type: 'init', file: TOY_FILE, shared: {}, facts: TOY_FACTS }, { makeWorker: () => { throw new Error('none'); } });
    const traps: HandTrapFile = { vocab: 1, traps: [{ id: 'neg', name: 'Negator', label: 'Negator', short: 'Neg', mechanism: 'negDeckTouch', monster: true, passcodes: [1] }], boardOptions: [] };
    let v: SessionView | null = null;
    const s = createSolveSession({ pool, traps, onChange: (x) => { v = x; } });
    const list: ResolvedList = { main: { SEEKER: 3, TUNER: 3, BIG: 3, DRAWTWO: 3, WALL: 3 }, extra: { SYNC: 1 }, blanks: 0, unknown: [] };
    s.start({ ...DEFAULT_SNAPSHOT, hand: ['SEEKER', 'TUNER'], hts: ['neg'] }, list);
    await until(() => v?.phase === 'done' || v?.phase === 'error');
    expect(v!.phase).toBe('done');
    expect(v!.lines.length).toBeGreaterThanOrEqual(1);
    expect(v!.lines.every((l) => l.worst)).toBe(true);
    s.start(setMode({ ...DEFAULT_SNAPSHOT, hts: [] }, 'first'), list);
    await until(() => v?.phase === 'done' || v?.phase === 'error');
    expect([v!.phase, v!.lines.length, v!.lines[0].line.steps.length]).toEqual(['done', 1, 0]);
  }, 30000);
});
