// The engine's entry point: one compiled deck file in, everything the finder runs on it out.
// It knows no cards; what the cards do is all in the compiled deck.

import type { CompiledDeck } from '../deck/compile';
import { createMoves } from './moves';
import { createScore, type LineEval } from './score';
import { createSearch, type SolveOpts, type SolveResult } from './search';
import type { Cfg, Move, State } from './types';

export type { LineEval, SolveOpts, SolveResult };

export interface Engine {
  deck: CompiledDeck;
  /** The opening position for `cfg` (its `base` line is not replayed here). */
  newState(cfg: Cfg): State;
  gen(s: State): Move[];
  /** Run a move and record its key on the line's path (`~key` when negated). */
  exec(s: State, a: Move, neg: boolean): State;
  evaluate(s: State, full: boolean): LineEval;
  potential(s: State): number;
  stateKey(s: State): number;
  solveBeam(root: State, opts?: SolveOpts): SolveResult;
}

export function createEngine(deck: CompiledDeck): Engine {
  const moves = createMoves(deck);
  const score = createScore(deck);
  const search = createSearch(moves, score, deck.state);
  return {
    deck,
    newState: (cfg) => deck.state.newState(cfg, deck.ix),
    gen: moves.gen,
    exec: moves.exec,
    evaluate: score.evaluate,
    potential: score.potential,
    stateKey: deck.state.stateKey,
    solveBeam: search.solveBeam,
  };
}
