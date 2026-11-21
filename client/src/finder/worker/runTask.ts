// Running one task on an engine: the artifact's runTask and workerMain. Used by the Worker and by
// the pool's main-thread fallback. Nothing here knows a card.

import { compileDeck, DeckCompileError } from '../deck/compile';
import { validateDeckFile } from '../deck/schema';
import { createEngine, type Engine, type SerializedResult } from '../engine';
import type { InitMsg, PolicyResult, Reply, Task } from './protocol';

export { DeckCompileError };

/** Validate, compile and start an engine; throws DeckCompileError when the file is wrong. */
export function buildEngine(init: InitMsg): Engine {
  const r = validateDeckFile(init.file, init.shared);
  if (!r.ok) throw new DeckCompileError(r.errors);
  return createEngine(compileDeck(r.file, init.facts), { traps: init.traps });
}

/** Search settings copied from the artifact's page. */
export const SOLVE_WIDTH = 60;
export const SOLVE_GROWTH = 4;

export function runTask(engine: Engine, m: Task, post?: (p: SerializedResult) => void): unknown {
  if (m.type === 'solve') {
    const root = m.cfg.base && m.cfg.base.length ? engine.replay(m.cfg, m.cfg.base) : engine.newState(m.cfg);
    const r = engine.solveBeam(root, {
      timeMs: m.timeMs, top: m.top ?? 4, policy: m.policy, width: SOLVE_WIDTH, growth: SOLVE_GROWTH,
      onRound: m.policy || !post ? undefined : (x) => post(engine.serialize(x, m.hand)),
    });
    if (!m.policy) return engine.serialize(r, m.hand);
    const out: PolicyResult = { paths: r.lines.map((l) => l.state!.path), nodes: r.nodes };
    return out;
  }
  if (m.type === 'plan') {
    const sl = engine.serializeLine(engine.planOf(m.cfg, m.path), m.hand, 'Bait');
    sl.bait = true;
    return sl;
  }
  if (m.type === 'branch') return engine.branchTask(m);
  return null;
}

/** A worker's message handler (the artifact's workerMain), with its engine kept in `box`. */
export function handleMessage(box: { engine: Engine | null }, m: InitMsg | (Task & { id: number }), reply: (r: Reply) => void): void {
  if (m.type === 'init') {
    try { box.engine = buildEngine(m); reply({ type: 'ready' }); } catch (err) {
      box.engine = null;
      reply({ type: 'initError', errors: err instanceof DeckCompileError ? err.errors : [{ card: null, field: '', message: String((err as Error)?.message ?? err) }] });
    }
    return;
  }
  try {
    if (!box.engine) throw new Error('the deck file did not load');
    const result = runTask(box.engine, m, (p) => reply({ type: 'partial', id: m.id, result: p }));
    reply({ type: 'done', id: m.id, result });
  } catch (err) {
    reply({ type: 'error', id: m.id, message: String((err as Error)?.message ?? err) });
  }
}
