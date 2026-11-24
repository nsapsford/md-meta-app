// A pool of finder Workers (the artifact's Pool). Jobs queue and go to the first free worker; a
// worker that crashes hands its job back to the front of the queue. Where no Worker can be made
// (or every one has failed), tasks run on the main thread after a timeout, in slices of at most
// MAIN_THREAD_SLICE_MS. The engine is only loaded on the page for that fallback (and to report a
// broken deck file), so the pool itself stays light. Nothing here knows a card.

import { DeckCompileError } from '../deck/deckError';
import type { Engine, SerializedResult } from '../engine';
import type { InitMsg, Reply, Task } from './protocol';

type RunTaskModule = typeof import('./runTask');
let runTaskModule: Promise<RunTaskModule> | null = null;
const loadRunTask = () => (runTaskModule ??= import('./runTask'));

export const CANCEL: { cancelled: true } = Object.freeze({ cancelled: true as const });
/** The longest a task may run on the main thread at a time. */
export const MAIN_THREAD_SLICE_MS = 700;
/** A job that has crashed this many workers runs on the main thread instead. */
export const MAX_CRASHES = 2;

export interface WorkerLike {
  postMessage(m: unknown): void; terminate(): void;
  onmessage: ((e: { data: Reply }) => void) | null; onerror: ((e: unknown) => void) | null;
}
export interface Pool {
  run<T = unknown>(task: Task, onPartial?: (p: SerializedResult) => void, front?: boolean): Promise<T>;
  cancelAll(): void; dispose(): void; size: number; ready: Promise<void>;
}
export interface PoolOpts {
  size?: number;
  makeWorker?: () => WorkerLike;
  /** Runs a task on the main thread (default: an engine built from `init`). For tests. */
  runLocal?: (task: Task, post?: (p: SerializedResult) => void) => unknown | Promise<unknown>;
}

interface Job { task: Task; id: number; resolve(v: unknown): void; reject(e: unknown): void; onPartial?: (p: SerializedResult) => void; dead: boolean; crashes: number }
interface Slot { w: WorkerLike; job: Job | null; dead: boolean }

export function defaultPoolSize(): number {
  const n = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(6, n - 1));
}

const defaultWorker = (): WorkerLike => new Worker(new URL('./finder.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export function createPool(init: InitMsg, o: PoolOpts = {}): Pool {
  const size = o.size ?? defaultPoolSize();
  const makeWorker = o.makeWorker ?? defaultWorker;
  let slots: Slot[] = [];
  let queue: Job[] = [];
  const localJobs = new Set<Job>();
  let workersOk = true;
  let seq = 0;
  let disposed = false;
  let initErr: DeckCompileError | null = null;
  let engine: Engine | null = null;

  let settled = false;
  let resolveReady!: () => void, rejectReady!: (e: unknown) => void;
  const ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });
  ready.catch(() => {});
  const readyOk = () => { if (!settled) { settled = true; resolveReady(); } };
  const readyFail = (e: unknown) => { if (!settled) { settled = true; rejectReady(e); } };

  const localEngine = async (): Promise<{ m: RunTaskModule; e: Engine }> => { const m = await loadRunTask(); engine ??= m.buildEngine(init); return { m, e: engine }; };
  const runLocal = o.runLocal ?? (async (task: Task, post?: (p: SerializedResult) => void) => { const { m, e } = await localEngine(); return m.runTask(e, task, post); });

  // No workers: the main thread takes over. With the default runner, building the engine there
  // settles `ready`.
  function fallBack() {
    workersOk = false;
    if (settled) return;
    if (o.runLocal) { readyOk(); return; }
    localEngine().then(readyOk, (e) => { if (e instanceof DeckCompileError) fail(e); else readyFail(e); });
  }

  function make(): Slot {
    const w = makeWorker();
    const slot: Slot = { w, job: null, dead: false };
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') { readyOk(); return; }
      // At once: the worker answers every task after a failed init with a plain error.
      if (m.type === 'initError') { fail(new DeckCompileError(m.errors)); return; }
      const job = slot.job;
      if (!job || m.id !== job.id) return;
      if (m.type === 'partial') { job.onPartial?.(m.result as SerializedResult); return; }
      slot.job = null;
      if (m.type === 'error') job.reject(new Error(m.message)); else job.resolve(m.result);
      pump();
    };
    w.onerror = (ev) => {
      (ev as { preventDefault?: () => void } | null)?.preventDefault?.();
      const job = slot.job;
      slot.job = null;
      slot.dead = true;
      slots = slots.filter((s) => s !== slot);
      try { w.terminate(); } catch { /* already gone */ }
      if (!slots.length) fallBack();
      if (job && !job.dead) { if (++job.crashes >= MAX_CRASHES) local(job); else queue.unshift(job); }
      pump();
    };
    w.postMessage(init);
    slots.push(slot);
    return slot;
  }

  // The deck file is broken: every job, now and later, fails with its errors.
  function fail(e: DeckCompileError) {
    if (initErr) return;
    initErr = e;
    readyFail(e);
    for (const s of slots) { try { s.w.terminate(); } catch { /* gone */ } if (s.job) { s.job.dead = true; s.job.reject(e); } }
    slots = [];
    for (const j of queue) { j.dead = true; j.reject(e); }
    queue = [];
    for (const j of localJobs) { j.dead = true; j.reject(e); }
    localJobs.clear();
  }

  function local(job: Job) {
    localJobs.add(job);
    setTimeout(async () => {
      if (job.dead) { localJobs.delete(job); return; }
      const t = job.task as Task & { timeMs?: number };
      const post = (p: SerializedResult) => { if (!job.dead) job.onPartial?.(p); };
      try {
        if (!o.runLocal) await localEngine();   // the engine may take a moment to load: the job may be cancelled meanwhile
        if (job.dead) return;
        const r = await runLocal({ ...t, timeMs: Math.min(t.timeMs || 250, MAIN_THREAD_SLICE_MS) } as Task, post);
        if (!job.dead) job.resolve(r);
      } catch (e) {
        if (job.dead) return;
        if (e instanceof DeckCompileError) fail(e); else job.reject(e);
      } finally { localJobs.delete(job); }
    }, 0);
  }

  function pump() {
    while (queue.length) {
      if (initErr) { const j = queue.shift()!; j.dead = true; j.reject(initErr); continue; }
      if (!workersOk) { local(queue.shift()!); continue; }
      let slot = slots.find((s) => !s.job);
      if (!slot && slots.length < size) { try { slot = make(); } catch { if (!slots.length) fallBack(); else break; continue; } }
      if (!slot) break;
      const job = queue.shift()!;
      slot.job = job;
      slot.w.postMessage({ ...job.task, id: job.id });
    }
  }

  function run<T = unknown>(task: Task, onPartial?: (p: SerializedResult) => void, front?: boolean): Promise<T> {
    const p = new Promise<T>((resolve, reject) => {
      if (disposed) { reject(CANCEL); return; }
      if (initErr) { reject(initErr); return; }
      const job: Job = { task, id: ++seq, resolve: resolve as (v: unknown) => void, reject, onPartial, dead: false, crashes: 0 };
      if (front) queue.unshift(job); else queue.push(job);
      pump();
    });
    p.catch(() => {});
    return p;
  }

  function cancelAll() {
    for (const s of slots) if (s.job) { try { s.w.terminate(); } catch { /* gone */ } s.job.dead = true; s.job.reject(CANCEL); s.dead = true; }
    slots = slots.filter((s) => !s.dead);
    for (const j of queue) { j.dead = true; j.reject(CANCEL); }
    queue = [];
    for (const j of localJobs) { j.dead = true; j.reject(CANCEL); }
    localJobs.clear();
    // The worker that was checking the deck file may be gone: start another, so `ready` still settles.
    if (!settled && workersOk && !slots.length && !disposed) { try { make(); } catch { fallBack(); } }
  }

  function dispose() {
    disposed = true;
    cancelAll();
    readyFail(CANCEL);
    for (const s of slots) { try { s.w.terminate(); } catch { /* gone */ } }
    slots = [];
  }

  // One worker up front: it checks the deck file and settles `ready`.
  try { make(); } catch { fallBack(); }

  return { run, cancelAll, dispose, size, ready };
}
