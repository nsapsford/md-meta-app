import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import cardData from './reference/card-data.json';

export interface RefCard { pass_: number; count: number; zone: 'main' | 'extra'; name: string; type: string; race: string; attr?: string; level?: number; atk?: number; dfn?: number; desc: string }
export interface RefCfg { mode: 'first' | 'second'; hand: Record<string, number>; deck: Record<string, number>; extra: Record<string, number>; opp?: { lp: number; mons: any[]; st: any[] }; mul?: number; dpen?: number; base?: string[] }
export interface RefAction { k: string; tags: Record<string, boolean>; neg: boolean; run(s: any, neg: boolean): any }
export interface RefIntr { kind: string; src: 'hand' | 'board'; label?: string; uid?: string; cardKind?: 'mon' | 'st'; force?: boolean }
export type RefEngine = { NAMES: Record<string, string>; SHORT: Record<string, string>; BY_NAME: Record<string, string>; P: Record<string, any>; newState(cfg: RefCfg): any; gen(s: any): RefAction[]; evaluate(s: any, full?: boolean): any; solveBeam(root: any, opts?: any): any; replay(cfg: RefCfg, path: string[]): any; interrupt(pre: any, act: RefAction, it: RefIntr): any; eligible(view: any, it: RefIntr): boolean; stateKey(s: any): number; potential(s: any): number; serialize(r: any, hand: string[], k?: number): any; serializeLine(l: any, hand: string[], tag: string): any; toGenerated(l: any, name: string, hand: string[]): any; branchTask(t: any): any; planOf(cfg: RefCfg, path: string[]): any };

/** Loads the saved artifact engine (CommonJS) and initialises it with the artifact's 40-card data. */
export function loadReference(): { engine: RefEngine; cards: RefCard[] } {
  const require = createRequire(import.meta.url);
  const engine = require('./reference/engine.cjs');
  const cards = cardData as RefCard[];
  engine.init(cards);
  return { engine: engine as RefEngine, cards };
}

let optNames: string[] | null = null;

/**
 * The reference's once-per-turn slot names in bit order (its private `OPT_NAMES`: bit b < 30 is
 * `o1` bit b, else `o2` bit b - 30), read from the engine's source since the engine doesn't export them.
 */
export function refOptNames(): string[] {
  if (optNames) return optNames;
  const src = readFileSync(fileURLToPath(new URL('./reference/engine.cjs', import.meta.url)), 'utf8');
  const m = /const OPT_NAMES = \[([^\]]*)\];/.exec(src);
  if (!m) throw new Error('refOptNames: OPT_NAMES not found in engine.cjs');
  optNames = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  return optNames;
}

/** The names of the once-per-turn slots set in a reference state, in bit order. */
export function refOptsSet(s: { o1: number; o2: number }): string[] {
  return refOptNames().filter((_, b) => (b < 30 ? (s.o1 >>> b) & 1 : (s.o2 >>> (b - 30)) & 1));
}

/** Runs an action and records it on the path, as the reference's private exec does. */
export function refExec(s: any, a: RefAction, neg: boolean): any {
  const n = a.run(s, neg);
  if (n) n.path = s.path.concat(neg ? '~' + a.k : a.k);
  return n;
}

/** The full 40-card list as engine deck and extra-deck counts, keyed by engine id. */
export function refFullDeck(engine: RefEngine, cards: RefCard[]): { deck: Record<string, number>; extra: Record<string, number> } {
  const deck: Record<string, number> = {};
  const extra: Record<string, number> = {};
  for (const c of cards) {
    const id = engine.BY_NAME[c.name];
    if (!id) continue;
    (c.zone === 'extra' ? extra : deck)[id] = c.count;
  }
  return { deck, extra };
}
