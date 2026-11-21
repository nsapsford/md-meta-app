import { describe, expect, it } from 'vitest';
import { DeckCompileError } from '../deck/compile';
import type { SerializedLine, SerializedResult } from '../engine';
import { TOY_FACTS, TOY_FILE, toyCfg } from '../engine/__toy__/toyDeck';
import type { InitMsg, PolicyResult, Reply } from './protocol';
import { buildEngine, handleMessage, runTask } from './runTask';

const INIT: InitMsg = { type: 'init', file: TOY_FILE, shared: {}, facts: TOY_FACTS };
const HAND = ['SEEKER', 'TUNER'];
const CFG = toyCfg({ SEEKER: 1, TUNER: 1 });

describe('runTask', () => {
  const engine = buildEngine(INIT);

  it('solves, posting partial results', () => {
    const parts: SerializedResult[] = [];
    const r = runTask(engine, { type: 'solve', cfg: CFG, hand: HAND, timeMs: 300 }, (p) => parts.push(p)) as SerializedResult;
    expect(r.lines.length).toBeGreaterThanOrEqual(1);
    expect(r.lines[0].tag).toBe('Line 1');
    expect(parts.length).toBeGreaterThanOrEqual(1);
  });

  it('solves from a recorded base line', () => {
    const first = (runTask(engine, { type: 'solve', cfg: CFG, hand: HAND, timeMs: 300 }) as SerializedResult).lines[0];
    const base = first.path.slice(0, 1);
    const r = runTask(engine, { type: 'solve', cfg: { ...CFG, base }, hand: HAND, timeMs: 300 }) as SerializedResult;
    expect(r.lines[0].path.slice(0, 1)).toEqual(base);
  });

  it('with a policy, returns the paths of its lines', () => {
    const it = { kind: 'negDeckTouch', src: 'hand' as const, label: 'Negator' };
    const r = runTask(engine, { type: 'solve', cfg: CFG, hand: HAND, timeMs: 300, top: 3, policy: [it] }) as PolicyResult;
    expect(r.paths.length).toBeGreaterThanOrEqual(1);
    expect(r.nodes).toBeGreaterThan(0);
  });

  it('rebuilds a plan as a bait line', () => {
    const first = (runTask(engine, { type: 'solve', cfg: CFG, hand: HAND, timeMs: 300 }) as SerializedResult).lines[0];
    const r = runTask(engine, { type: 'plan', cfg: CFG, path: first.path, hand: HAND }) as SerializedLine;
    expect([r.tag, r.bait]).toEqual(['Bait', true]);
  });

  it('runs a branch task', () => {
    const first = (runTask(engine, { type: 'solve', cfg: CFG, hand: HAND, timeMs: 300 }) as SerializedResult).lines[0];
    const st = first.steps[0];
    const r = runTask(engine, { type: 'branch', cfg: CFG, prefix: first.path.slice(0, st.pathIdx), key: st.key, it: { kind: 'force', src: 'hand', label: 'Negate' }, quick: true, hand: HAND }) as { score: number };
    expect(typeof r.score).toBe('number');
  });
});

describe('buildEngine', () => {
  it('throws DeckCompileError naming the card and field', () => {
    const broken = { ...TOY_FILE, cards: TOY_FILE.cards.map((c) => (c.id === 'SEEKER' ? { ...c, short: 7 } : c)) };
    let e: unknown;
    try { buildEngine({ ...INIT, file: broken }); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(DeckCompileError);
    const first = (e as DeckCompileError).errors[0];
    expect([first.card, first.field]).toEqual(['SEEKER', 'short']);
  });
});

describe('the worker message handler', () => {
  it('replies ready, then answers tasks by id', () => {
    const out: Reply[] = [];
    const box = { engine: null };
    handleMessage(box, INIT, (r) => out.push(r));
    handleMessage(box, { type: 'solve', cfg: CFG, hand: HAND, timeMs: 200, id: 7 }, (r) => out.push(r));
    expect(out[0]).toEqual({ type: 'ready' });
    const last = out[out.length - 1];
    expect([last.type, (last as { id: number }).id]).toEqual(['done', 7]);
    expect(out.slice(1, -1).every((r) => r.type === 'partial')).toBe(true);
  });

  it('replies initError for a broken file, then errors for tasks', () => {
    const out: Reply[] = [];
    const box = { engine: null };
    handleMessage(box, { ...INIT, file: { vocab: 1 } }, (r) => out.push(r));
    handleMessage(box, { type: 'plan', cfg: CFG, path: [], hand: HAND, id: 2 }, (r) => out.push(r));
    expect(out[0].type).toBe('initError');
    expect(out[1]).toMatchObject({ type: 'error', id: 2 });
  });
});
