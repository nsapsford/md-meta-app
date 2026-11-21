import { describe, expect, it, vi } from 'vitest';
import { DeckCompileError } from '../deck/compile';
import { TOY_FACTS, TOY_FILE, toyCfg } from '../engine/__toy__/toyDeck';
import type { InitMsg, Reply, Task } from './protocol';
import { CANCEL, createPool, defaultPoolSize, MAIN_THREAD_SLICE_MS, MAX_CRASHES, type WorkerLike } from './pool';

/** A requested budget above the main-thread slice. */
const REQUESTED_MS = 2500;
const INIT: InitMsg = { type: 'init', file: TOY_FILE, shared: {}, facts: TOY_FACTS };
const solve = (n = 0): Task => ({ type: 'solve', cfg: toyCfg({ SEEKER: 1 }), hand: ['SEEKER'], timeMs: REQUESTED_MS, top: n || undefined });

class FakeWorker implements WorkerLike {
  sent: any[] = [];
  terminated = false;
  onmessage: ((e: { data: Reply }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(m: unknown) { this.sent.push(m); }
  terminate() { this.terminated = true; }
  /** The id of the task it is running (the last one sent). */
  get job(): number { return this.sent[this.sent.length - 1].id; }
  reply(r: Reply) { this.onmessage!({ data: r }); }
  done(result: unknown) { this.reply({ type: 'done', id: this.job, result }); }
}

function fakes() {
  const made: FakeWorker[] = [];
  return { made, makeWorker: () => { const w = new FakeWorker(); made.push(w); return w; } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the worker pool', () => {
  it('sizes itself to the machine', () => {
    const n = defaultPoolSize();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('starts one worker with the init message, and is ready when it says so', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 2, makeWorker: f.makeWorker });
    expect(f.made).toHaveLength(1);
    expect(f.made[0].sent[0]).toBe(INIT);
    f.made[0].reply({ type: 'ready' });
    await expect(pool.ready).resolves.toBeUndefined();
  });

  it('queues a third task while two workers are busy and starts it when one finishes', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 2, makeWorker: f.makeWorker });
    const a = pool.run(solve()), b = pool.run(solve()), c = pool.run(solve(3));
    expect(f.made).toHaveLength(2);
    expect(f.made.map((w) => w.sent.length)).toEqual([2, 2]);   // init + one task each
    f.made[1].done('B');
    await expect(b).resolves.toBe('B');
    expect(f.made[1].sent[2]).toMatchObject({ type: 'solve', top: 3 });
    f.made[0].done('A'); f.made[1].done('C');
    expect(await Promise.all([a, c])).toEqual(['A', 'C']);
  });

  it('passes partial replies on without resolving', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker });
    const parts: unknown[] = [];
    let done = false;
    const p = pool.run(solve(), (x) => parts.push(x)).then((r) => { done = true; return r; });
    const w = f.made[0];
    w.reply({ type: 'partial', id: w.job, result: 'p1' });
    w.reply({ type: 'partial', id: w.job, result: 'p2' });
    await tick();
    expect([parts, done]).toEqual([['p1', 'p2'], false]);
    w.done('final');
    expect(await p).toBe('final');
  });

  it('turns an error reply into a rejection', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker });
    const p = pool.run(solve());
    f.made[0].reply({ type: 'error', id: f.made[0].job, message: 'boom' });
    await expect(p).rejects.toThrow('boom');
  });

  it('gives a crashed worker\'s job back to the front, and another worker finishes it', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 2, makeWorker: f.makeWorker });
    const a = pool.run(solve(1)), b = pool.run(solve(2)), c = pool.run(solve(3));
    f.made[0].onerror!({});
    expect(f.made[0].terminated).toBe(true);
    expect(f.made).toHaveLength(3);
    expect(f.made[2].sent[1]).toMatchObject({ top: 1 });   // a, ahead of c
    f.made[2].done('A');
    await expect(a).resolves.toBe('A');
    expect(f.made[2].sent[2]).toMatchObject({ top: 3 });
    f.made[1].done('B'); f.made[2].done('C');
    expect(await Promise.all([b, c])).toEqual(['B', 'C']);
  });

  it('runs on the main thread, in slices of at most 700 ms, when no worker can be made', async () => {
    const ran: Task[] = [];
    const pool = createPool(INIT, { makeWorker: () => { throw new Error('no workers here'); }, runLocal: (t) => { ran.push(t); return 'local'; } });
    await expect(pool.ready).resolves.toBeUndefined();
    await expect(pool.run(solve())).resolves.toBe('local');
    expect(MAIN_THREAD_SLICE_MS).toBe(700);
    expect((ran[0] as { timeMs: number }).timeMs).toBe(700);
  });

  it('falls back to the main thread when every worker has failed', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker, runLocal: () => 'local' });
    const p = pool.run(solve());
    f.made[0].onerror!({});
    await expect(p).resolves.toBe('local');
  });

  it('really solves on the main thread with the default runner', async () => {
    const pool = createPool(INIT, { makeWorker: () => { throw new Error('none'); } });
    await pool.ready;
    const r = await pool.run<{ lines: unknown[] }>(solve());
    expect(r.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects ready on the main thread too when the deck file is broken', async () => {
    const pool = createPool({ ...INIT, file: { vocab: 1 } }, { makeWorker: () => { throw new Error('none'); } });
    await expect(pool.ready).rejects.toBeInstanceOf(DeckCompileError);
    await expect(pool.run(solve())).rejects.toBeInstanceOf(DeckCompileError);
  });

  it('cancels running and queued jobs, terminating busy workers', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker });
    const a = pool.run(solve()), b = pool.run(solve());
    pool.cancelAll();
    await expect(a).rejects.toBe(CANCEL);
    await expect(b).rejects.toBe(CANCEL);
    expect(f.made[0].terminated).toBe(true);
    const c = pool.run(solve());
    expect(f.made).toHaveLength(2);
    f.made[1].done('C');
    await expect(c).resolves.toBe('C');
  });

  it('cancels main-thread jobs that have not run yet', async () => {
    const runLocal = vi.fn(() => 'x');
    const pool = createPool(INIT, { makeWorker: () => { throw new Error('none'); }, runLocal });
    const a = pool.run(solve());
    pool.cancelAll();
    await expect(a).rejects.toBe(CANCEL);
    await tick();
    expect(runLocal).not.toHaveBeenCalled();
  });

  it('rejects ready, and every job, with the deck file\'s errors', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker });
    const a = pool.run(solve());
    const errors = [{ card: 'SEEKER', field: 'effects[0].do', message: 'bad' }];
    f.made[0].reply({ type: 'initError', errors });
    const e = await pool.ready.catch((x) => x);
    expect(e).toBeInstanceOf(DeckCompileError);
    expect(e.errors).toEqual(errors);
    await expect(a).rejects.toBeInstanceOf(DeckCompileError);
    await expect(pool.run(solve())).rejects.toBeInstanceOf(DeckCompileError);
  });

  it('rejects with the deck-file errors even when the worker answers the next task first', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker });
    const a = pool.run(solve());
    const errors = [{ card: 'SEEKER', field: 'short', message: 'bad' }];
    const w = f.made[0];
    const id = w.job;
    w.reply({ type: 'initError', errors });
    w.reply({ type: 'error', id, message: 'the deck file did not load' });
    const e = await a.catch((x: DeckCompileError) => x);
    expect(e).toBeInstanceOf(DeckCompileError);
    expect((e as DeckCompileError).errors).toEqual(errors);
  });

  it('runs a job that keeps crashing workers on the main thread', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 2, makeWorker: f.makeWorker, runLocal: () => 'local' });
    const a = pool.run(solve(1)), b = pool.run(solve(2));
    f.made[0].onerror!({});
    expect(f.made).toHaveLength(3);
    expect(f.made[2].sent[1]).toMatchObject({ top: 1 });
    expect(MAX_CRASHES).toBe(2);
    f.made[2].onerror!({});
    expect(f.made).toHaveLength(3);   // not sent to another worker
    await expect(a).resolves.toBe('local');
    f.made[1].done('B');
    await expect(b).resolves.toBe('B');
  });

  it('drops partial results of a main-thread job cancelled while it runs', async () => {
    const parts: unknown[] = [];
    let pool: ReturnType<typeof createPool> | null = null;
    pool = createPool(INIT, { makeWorker: () => { throw new Error('none'); }, runLocal: (_t, post) => { pool!.cancelAll(); post!({} as never); return 'late'; } });
    const a = pool.run(solve(), (p) => parts.push(p));
    await expect(a).rejects.toBe(CANCEL);
    await tick();
    expect(parts).toEqual([]);
  });

  it('still settles ready when the checking worker is cancelled before it answers', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker });
    void pool.run(solve());
    pool.cancelAll();
    expect(f.made[0].terminated).toBe(true);
    expect(f.made).toHaveLength(2);
    f.made[1].reply({ type: 'ready' });
    await expect(pool.ready).resolves.toBeUndefined();

    const g = fakes();
    const p2 = createPool(INIT, { size: 1, makeWorker: g.makeWorker });
    p2.dispose();
    await expect(p2.ready).rejects.toBe(CANCEL);
  });

  it('disposes', async () => {
    const f = fakes();
    const pool = createPool(INIT, { size: 1, makeWorker: f.makeWorker });
    pool.dispose();
    expect(f.made[0].terminated).toBe(true);
    await expect(pool.run(solve())).rejects.toBe(CANCEL);
  });
});
