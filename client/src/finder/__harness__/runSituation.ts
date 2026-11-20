// One situation through the new engine, the way the gates and the parity report run it: the
// reference's `base` (mid-line situations) translated to the new engine's keys and replayed, the
// opponent's policy through the interruption map.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Engine, SolveOpts, SolveResult } from '../engine';
import type { State } from '../engine/types';
import type { RefEngine } from './loadReference';
import { translatePath } from './lockstep';
import { toCfg, toIntr } from './mapping';
import type { BaselineRow, Situation } from './situations';

/** Scores are sums taken in another order on the two sides: equal within this. */
export const SCORE_EPS = 1e-9;

export function readBaseline(): Map<string, BaselineRow> {
  const rows = JSON.parse(readFileSync(fileURLToPath(new URL('./baseline.json', import.meta.url)), 'utf8')) as BaselineRow[];
  return new Map(rows.map((r) => [r.id, r]));
}

/** The situation's starting position in the new engine. */
export function newRoot(ref: RefEngine, neu: Engine, sit: Situation): State {
  const cfg = toCfg(sit.cfg);
  if (sit.cfg.base?.length) {
    cfg.base = translatePath(ref, neu, sit.cfg, sit.cfg.base);
    return neu.replay(cfg, cfg.base);
  }
  return neu.newState(cfg);
}

export function solveNew(ref: RefEngine, neu: Engine, sit: Situation, opts: SolveOpts): SolveResult {
  return neu.solveBeam(newRoot(ref, neu, sit), { ...opts, policy: sit.policy?.map(toIntr) });
}

/** The situation's hand as a list of card ids (both engines use the same ids). */
export function handOf(sit: Situation): string[] {
  return Object.entries(sit.cfg.hand).flatMap(([c, n]) => Array<string>(n).fill(c));
}
