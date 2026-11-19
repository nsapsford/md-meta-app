// The engine's entry point: one compiled deck file in, everything the finder runs on it out.
// It knows no cards; what the cards do is all in the compiled deck.

import type { CompiledDeck } from '../deck/compile';
import { createMoves } from './moves';
import { createScore, type LineEval } from './score';
import { createSearch, type SolveOpts, type SolveResult } from './search';
import { createOpponent, eligible } from './opponent';
import type { Cfg, Interruption, Move, State, StepView, Tags, TurnEvent } from './types';
import type { CompiledProtection } from '../deck/compile';

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
  /** Solve from `root`; with `policy`, a greedy opponent spends each interruption on the first step it can hit. */
  solveBeam(root: State, opts?: SolveOpts): SolveResult;
  eligible(v: StepView, it: Interruption): boolean;
  /** Run `act` with the opponent's interruption `it` on it (recorded as `!{k, it}` on the path). */
  interrupt(pre: State, act: Move, it: Interruption): State;
  /** A draw effect live from the start of the turn (`^it` on the path). */
  startDraw(s: State, it: Interruption): State;
  /** Something that really happened, recorded by the player (`@ev` on the path). */
  applyEvent(s: State, ev: TurnEvent): State;
  protectionFor(pre: State, it: Interruption, tags: Tags): CompiledProtection | null;
}

export function createEngine(deck: CompiledDeck): Engine {
  const moves = createMoves(deck);
  const score = createScore(deck);
  const opp = createOpponent(deck, moves, deck.state);
  const search = createSearch(moves, score, deck.state, { eligible, interrupt: opp.interrupt });
  return {
    deck,
    newState: (cfg) => deck.state.newState(cfg, deck.ix),
    gen: moves.gen,
    exec: moves.exec,
    evaluate: score.evaluate,
    potential: score.potential,
    stateKey: deck.state.stateKey,
    solveBeam: search.solveBeam,
    eligible,
    interrupt: opp.interrupt,
    startDraw: opp.startDraw,
    applyEvent: opp.applyEvent,
    protectionFor: opp.protectionFor,
  };
}
