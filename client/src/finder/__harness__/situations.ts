// A fixed, seeded set of 360 test situations. The reference engine's best line for each is
// recorded in baseline.json; the new engine must score the same or higher on every one.
import { mulberry32 } from '../../utils/trainer';
import { refFullDeck, type RefCard, type RefCfg, type RefEngine, type RefIntr } from './loadReference';

/** One round, never clock-limited: the reference result is deterministic. */
export const PIN = { width: 240, rounds: 1, timeMs: 3_600_000, top: 3 } as const;
export const SEED = 20261115;

export interface Situation { id: string; group: 'first' | 'second' | 'trap' | 'draw' | 'mid'; cfg: RefCfg; policy?: RefIntr[] }
export interface BaselineRow { id: string; score: number; path: string[]; nodes: number }

// Each group draws from its own stream, mulberry32(SEED + offset), so changing one group never shifts another.
const OFFSET = { first: 0, second: 1000, trap: 2000, draw: 3000, mid: 4000 } as const;

const HT: Array<[string, string]> = [['ash', 'Ash Blossom'], ['imperm', 'Infinite Impermanence'], ['veiler', 'Effect Veiler'], ['droll', 'Droll & Lock Bird'], ['nibiru', 'Nibiru'], ['belle', 'Ghost Belle'], ['fuwalos', 'Mulcharmy Fuwalos'], ['purulia', 'Mulcharmy Purulia'], ['maxxc', 'Maxx "C"']];
const HT_PAIRS: Array<[string, string]> = [['ash', 'imperm'], ['ash', 'droll'], ['nibiru', 'maxxc']];

export function refRoot(engine: RefEngine, cfg: RefCfg): any {
  return cfg.base?.length ? engine.replay(cfg, cfg.base) : engine.newState(cfg);
}

type Mon = { name: string; atk: number; def: number; pos?: 'atk' | 'def'; intr?: string; noTarget?: boolean; noDestroy?: boolean; faceDown?: boolean };
type St = { name: string; kind?: 'st'; intr?: string; noTarget?: boolean };
type Field = { lp: number; mons: Mon[]; st: St[] };

const mon = (name: string, atk: number, def: number, extra: Partial<Mon> = {}): Mon => ({ name, atk, def, pos: 'atk', ...extra });
export const FIELDS: Field[] = [
  { lp: 8000, mons: [], st: [] },
  { lp: 8000, mons: [mon('Big Vanilla', 3000, 1000)], st: [] },
  { lp: 8000, mons: [mon('Attacker', 2500, 1500), mon('Wall', 1000, 2000, { pos: 'def' })], st: [] },
  { lp: 8000, mons: [mon('Negator', 2000, 1000, { intr: 'negMon' })], st: [] },
  { lp: 8000, mons: [mon('Untouchable Negator', 2000, 1000, { intr: 'negAny', noTarget: true })], st: [] },
  { lp: 8000, mons: [], st: [{ name: 'Set Counter Trap', intr: 'negSummon' }] },
  { lp: 8000, mons: [], st: [{ name: 'Set Popper', intr: 'pop' }] },
  { lp: 8000, mons: [mon('Extra Flooder', 2000, 1000, { intr: 'floodExtra' })], st: [] },
  { lp: 8000, mons: [], st: [{ name: 'Flood Spell', intr: 'floodSpell' }] },
  { lp: 8000, mons: [mon('Monster Flooder', 2000, 1000, { intr: 'floodMon' })], st: [] },
  { lp: 8000, mons: [mon('Face-down Monster', 1500, 1500, { faceDown: true })], st: [{ name: 'Set Spell Negator', intr: 'negST' }] },
  { lp: 2000, mons: [mon('Small Attacker', 1500, 1000)], st: [] },
  { lp: 8000, mons: [mon('Guard 1', 2000, 1000, { noDestroy: true }), mon('Guard 2', 1800, 1000), mon('Guard 3', 1600, 1000), mon('Guard 4', 1400, 1000), mon('Guard 5', 1200, 1000)], st: [] },
];

/** A fresh opponent field with uids 'o1', 'o2', ... unique within it. */
export function oppField(f: Field): NonNullable<RefCfg['opp']> {
  let n = 0;
  return {
    lp: f.lp,
    mons: f.mons.map((m) => ({ uid: 'o' + ++n, kind: 'mon', attr: 'DARK', race: 'Fiend', ...m })),
    st: f.st.map((x) => ({ uid: 'o' + ++n, kind: 'st', ...x })),
  };
}

export function buildSituations(engine: RefEngine, cards: RefCard[]): Situation[] {
  const full = refFullDeck(engine, cards);
  const mainIds = Object.entries(full.deck).flatMap(([id, n]) => Array<string>(n).fill(id));

  /** Draw `size` cards without replacement; the hand and the remaining deck as engine counts. */
  const draw = (rng: () => number, size: number): Pick<RefCfg, 'hand' | 'deck'> => {
    const pool = [...mainIds];
    const hand: Record<string, number> = {};
    for (let i = 0; i < size; i++) {
      const [id] = pool.splice(Math.floor(rng() * pool.length), 1);
      hand[id] = (hand[id] ?? 0) + 1;
    }
    const deck = { ...full.deck };
    for (const [id, n] of Object.entries(hand)) deck[id] -= n;
    return { hand, deck };
  };
  const first = (rng: () => number, extra: Partial<RefCfg> = {}): RefCfg => ({ mode: 'first', ...draw(rng, 5), extra: { ...full.extra }, ...extra });
  const out: Situation[] = [];
  const add = (group: Situation['group'], cfg: RefCfg, policy?: RefIntr[]) => {
    const n = out.filter((s) => s.group === group).length + 1;
    out.push({ id: `${group}-${String(n).padStart(3, '0')}`, group, cfg, ...(policy ? { policy } : {}) });
  };

  let rng = mulberry32(SEED + OFFSET.first);
  for (let i = 0; i < 200; i++) add('first', first(rng));

  rng = mulberry32(SEED + OFFSET.second);
  for (const f of FIELDS) for (let i = 0; i < 5; i++) add('second', { mode: 'second', ...draw(rng, 6), extra: { ...full.extra }, opp: oppField(f) });

  rng = mulberry32(SEED + OFFSET.trap);
  const pol = (kind: string): RefIntr => ({ kind, src: 'hand', label: HT.find((h) => h[0] === kind)![1] });
  for (const [k] of HT) for (let i = 0; i < 5; i++) add('trap', first(rng), [pol(k)]);
  for (const [a, b] of HT_PAIRS) for (let i = 0; i < 3; i++) add('trap', first(rng), [pol(a), pol(b)]);

  rng = mulberry32(SEED + OFFSET.draw);
  for (const mul of [1, 2, 4]) for (let i = 0; i < 7; i++) add('draw', first(rng, { mul }));

  // Mid-line: replay the first half of the reference's own best line. A draw whose line is empty or whose
  // replay throws is not skipped silently; the next draw from the same stream is used instead (deterministic).
  rng = mulberry32(SEED + OFFSET.mid);
  while (out.filter((s) => s.group === 'mid').length < 20) {
    const cfg = first(rng);
    try {
      const path: string[] = engine.solveBeam(engine.newState(cfg), { width: 60, rounds: 1, timeMs: 3_600_000 }).lines[0].state.path;
      if (path.length < 2) continue;
      const withBase = { ...cfg, base: path.slice(0, Math.ceil(path.length / 2)) };
      refRoot(engine, withBase);
      add('mid', withBase);
    } catch { continue; }
  }
  return out;
}
