// Messages between the page and the finder's Workers. A task is a pure function of its message,
// so any worker (or the page, as a fallback) can run it.

import type { BranchTask } from '../engine/replay';
import type { CardId, Cfg, Interruption } from '../engine/types';
import type { CardFacts, DeckFileError, HandTrapFile } from '../deck/schema';

/** The first message to a worker: the deck file, its shared files and the facts of their cards. */
export interface InitMsg {
  type: 'init'; file: unknown; shared: Record<string, unknown>; facts: CardFacts[];
  /** The hand-trap data, for the summon count a wipe-at-summons interruption waits for (optional). */
  traps?: Pick<HandTrapFile, 'traps'>;
}

export type SolveTask = { type: 'solve'; cfg: Cfg; hand: CardId[]; timeMs: number; top?: number; policy?: Interruption[] };
export type PlanTask = { type: 'plan'; cfg: Cfg; path: string[]; hand: CardId[] };
export type Task = SolveTask | PlanTask | BranchTask;

/** What a policy solve returns: the paths of its lines (rebuilt as plans by `plan` tasks). */
export interface PolicyResult { paths: string[][]; nodes: number }

export type Reply =
  | { type: 'ready' }
  | { type: 'initError'; errors: DeckFileError[] }
  | { type: 'partial' | 'done'; id: number; result: unknown }
  | { type: 'error'; id: number; message: string };
