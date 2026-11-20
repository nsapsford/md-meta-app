import { describe, expect, it } from 'vitest';
import { compileDeck } from '../deck/compile';
import { createEngine, DEFAULT_WIPE_AT, wipeAtOf, type Engine } from './index';
import handTraps from '../deck/files/hand-traps.json';
import type { HandTrapEntry } from '../deck/schema';
import type { BranchTask } from './replay';
import { robust } from './robust';
import type { SerializedLine, SerializedStep } from './serialize';
import type { Interruption, State } from './types';
import { TOY_FACTS, TOY_FILE, toyCfg } from './__toy__/toyDeck';

const e: Engine = createEngine(compileDeck(TOY_FILE, TOY_FACTS));
const move = (s: State, k: string) => { const a = e.gen(s).find((x) => x.k === k); if (!a) throw new Error('no move ' + k + ' in ' + e.gen(s).map((x) => x.k).join(' ')); return a; };
const IT = (kind: string, o: Partial<Interruption> = {}): Interruption => ({ kind, src: 'hand', label: 'Trap', monster: true, ...o });
const texts = (s: State) => s.log.map((st) => [st.text, st.interrupted ?? null]);

describe('replay', () => {
  it('rebuilds a solved line from its path', () => {
    const cfg = toyCfg({ SEEKER: 1, TUNER: 1, DRAWTWO: 1, BIG: 1 });
    const line = e.solveBeam(e.newState(cfg), { width: 32, rounds: 1, timeMs: 60_000 }).lines[0];
    const path = line.state!.path;
    expect(path.length).toBeGreaterThan(2);
    const r = e.replay(cfg, path);
    expect(e.stateKey(r)).toBe(e.stateKey(line.state!));
    expect(texts(r)).toEqual(texts(line.state!));
    // Each replayed step knows the position before it and its move.
    expect(r.log.every((st) => st.pre && st.act)).toBe(true);
  });

  it('replays ~, !, @ and ^ entries', () => {
    const cfg = toyCfg({ SEEKER: 1, DRAWTWO: 1, BIG: 1 });
    let s = e.startDraw(e.newState(cfg), IT('drawSpecialSummon', { label: 'Drawer' }));
    s = e.exec(s, move(s, 'drawtwo:BIG'), true);
    s = e.interrupt(s, move(s, 'ns:SEEKER'), IT('lockDeckAdds', { short: 'Lock' }));
    s = e.exec(s, move(s, 'dec:seeker-search'), false);
    s = e.applyEvent(s, { t: 'gain', id: 'BIG' });
    expect(s.path.map((k) => k[0])).toEqual(['^', '~', '!', 'd', '@']);
    const r = e.replay(cfg, s.path);
    expect(r.path).toEqual(s.path);
    expect(e.stateKey(r)).toBe(e.stateKey(s));
    expect([r.drawFx, r.addLock, r.opening]).toEqual([s.drawFx, s.addLock, s.opening]);
    expect(texts(r)).toEqual(texts(s));
  });

  it('throws naming a move that is not there', () => {
    const cfg = toyCfg({ SEEKER: 1 });
    expect(() => e.replay(cfg, ['ns:SEEKER', 'nope'])).toThrow('replay: nope');
    expect(() => e.replay(cfg, ['!' + JSON.stringify({ k: 'gone', it: IT('force') })])).toThrow('replay: gone');
  });
});

describe('planOf, asLine and branchTask', () => {
  const cfg = toyCfg({ SEEKER: 1, DRAWTWO: 1, BIG: 1 });
  const root = e.newState(cfg);

  it('planOf of an interrupted path is at least as good as stopping there', () => {
    const s = e.interrupt(root, move(root, 'drawtwo:BIG'), IT('negDeckTouch', { label: 'Negator' }));
    const stop = e.asLine(s);
    expect(stop.state).toBe(s);
    const plan = e.planOf(cfg, s.path);
    expect(plan.score).toBeGreaterThanOrEqual(stop.score);
    expect(plan.state!.path.some((k) => k[0] === '!' || k[0] === '~')).toBe(false);
    expect(plan.state!.path[0]).toBe('drawtwo:BIG');
  });

  it('branchTask: quick gives a score, full a serialized line, a missing move null', () => {
    const t: BranchTask = { type: 'branch', cfg, prefix: [], key: 'ns:SEEKER', it: IT('negSummon', { label: 'Counter' }), quick: true, width: 16 };
    const q = e.branchTask(t) as { score: number };
    expect(Object.keys(q)).toEqual(['score']);
    expect(typeof q.score).toBe('number');
    const full = e.branchTask({ ...t, quick: false, timeMs: 50, hand: ['SEEKER', 'DRAWTWO', 'BIG'] }) as SerializedLine;
    expect(full.tag).toBe('branch');
    expect(full.path[0][0]).toBe('!');
    expect(full.steps[0].interrupted).toBe('Counter: the summon is negated and the monster destroyed');
    expect(e.branchTask({ ...t, key: 'gone' })).toBeNull();
    const st = e.branchTask({ ...t, start: true, key: null, it: IT('drawSpecialSummon', { label: 'Drawer' }) }) as { score: number };
    expect(typeof st.score).toBe('number');
  });
});

describe('toGenerated', () => {
  it('writes blanks, starters, Set steps and the end board text', () => {
    const cfg = { ...toyCfg({ SEEKER: 1, WALL: 1 }), hand: { SEEKER: 1, WALL: 1, UNK: 2 } };
    let s = e.newState(cfg);
    s = e.exec(s, move(s, 'ns:SEEKER'), false);
    s = e.exec(s, move(s, 'dec:seeker-search'), false);
    const l = e.asLine(s);
    expect(l.sets).toEqual([e.deck.ix.WALL]);
    const g = e.toGenerated({ ...l, items: [['Wall: negate', 0.5], ['Small', 0.2], ['Edge', 0.3]] }, 'Toy line', ['SEEKER', 'WALL', 'UNK', 'UNK']);
    expect(g.name).toBe('Toy line');
    expect(g.freeCards).toBe(2);
    expect(g.starters).toEqual([['Toy Seeker'], ['Toy Wall']]);
    expect(g.steps[g.steps.length - 1]).toEqual({ text: 'Set Wall.', moves: [{ card: 'Toy Wall', from: 'hand', to: 'field' }] });
    expect(g.steps.length).toBe(s.log.length + 1);
    expect(g.endBoard).toEqual(['Toy Seeker', 'Toy Wall']);
    expect(g.endBoardText).toBe('Wall: negate; Edge');
  });
});

describe('robust', () => {
  // A fake line of three steps k0 k1 k2. An interruption on step i costs: force i + 1, negAny 3 - i.
  const BASE = ['k0', 'k1', 'k2'];
  const cost = (kind: string, i: number) => (kind === 'force' ? i + 1 : 3 - i);
  const lineOf = (path: string[]): SerializedLine => {
    let score = 10;
    const steps = path.map((k, i): SerializedStep => {
      const hit = k[0] === '!' ? (JSON.parse(k.slice(1)) as { k: string; it: Interruption }) : null;
      if (hit) score -= cost(hit.it.kind, Number(hit.k.slice(1)));
      return {
        pathIdx: i, key: hit ? hit.k : k, ev: false, mons: [], sts: [], oppPresent: [], summoned: false, extraSummon: false, draws: 0, oppCount: 0,
        text: k, tags: { spell: true }, interrupted: hit ? 'hit' : null, summonsAfter: 0, canNeg: true, wipeHere: false, firstDeckAdd: false, notes: [], lineNote: null,
      };
    });
    return { score, path, steps } as unknown as SerializedLine;
  };
  const run = async (t: BranchTask) => {
    const path = t.prefix.concat(['!' + JSON.stringify({ k: t.key, it: t.it })], BASE.slice(t.prefix.length + 1));
    const l = lineOf(path);
    return t.quick ? { score: l.score } : l;
  };
  const F = IT('force', { label: 'F' }), N = IT('negAny', { label: 'N' });

  it('spends every interruption and returns the lowest-scoring chain', async () => {
    const tasks: BranchTask[] = [];
    const r = await robust(toyCfg({}), lineOf(BASE), [F, N], (t) => { tasks.push(t); return run(t); });
    expect(r.applied).toEqual([{ it: N, step: 0 }, { it: F, step: 2 }]);
    expect(r.score).toBe(4);
    expect(r.line.path.map((k) => (k[0] === '!' ? JSON.parse(k.slice(1)).k + '!' : k))).toEqual(['k0!', 'k1', 'k2!']);
    expect(tasks.some((t) => t.quick) && tasks.some((t) => !t.quick)).toBe(true);
  });

  it('with one interruption, tries only its worst use', async () => {
    const r = await robust(toyCfg({}), lineOf(BASE), [F], run);
    expect([r.applied, r.score]).toEqual([[{ it: F, step: 2 }], 7]);
  });

  it('stops early below a bound and lists interruptions it never used', async () => {
    const pruned = await robust(toyCfg({}), lineOf(BASE), [F, N], run, { stopBelow: () => 8 });
    expect(pruned.pruned).toBe(true);
    const none = await robust(toyCfg({}), { ...lineOf(BASE), steps: [] }, [F], run);
    expect([none.applied, none.score]).toEqual([[{ it: F, step: null }], 10]);
  });
});

describe('wipeHere threshold', () => {
  const trap = (o: Partial<HandTrapEntry>): HandTrapEntry => ({ id: 'w', name: 'Wiper', label: 'Wiper', short: 'Wiper', mechanism: 'wipeAtSummons', monster: true, passcodes: [1], ...o });
  // Normal Summon Seeker (1 summon; its search declined: no step), then Tuner Special Summons itself (2).
  const line = (eng: Engine) => {
    let s = eng.newState(toyCfg({ SEEKER: 1, TUNER: 1 }));
    for (const k of ['ns:SEEKER', 'dec:seeker-search', 'tuner-ss']) s = eng.exec(s, eng.gen(s).find((x) => x.k === k)!, false);
    return eng.serializeLine(eng.asLine(s), [], 't').steps.map((st) => st.wipeHere);
  };
  const deck = compileDeck(TOY_FILE, TOY_FACTS);
  it("comes from the hand-trap data's param", () => {
    expect(wipeAtOf({ traps: [trap({ mechanism: 'negDeckTouch' }), trap({ param: 2 })] })).toBe(2);
    expect(wipeAtOf(handTraps as { traps: HandTrapEntry[] })).toBe(5);
    expect(wipeAtOf({ traps: [trap({})] })).toBeUndefined();
    expect(line(createEngine(deck, { traps: { traps: [trap({ param: 2 })] } }))).toEqual([false, true]);
    expect(line(createEngine(deck, { traps: { traps: [trap({ param: 1 })] } }))).toEqual([true, false]);
  });
  it('falls back to DEFAULT_WIPE_AT without data; wipeAt overrides the data', () => {
    expect(DEFAULT_WIPE_AT).toBe(5);
    expect(line(createEngine(deck))).toEqual([false, false]);
    expect(line(createEngine(deck, { traps: { traps: [trap({ param: 1 })] }, wipeAt: 2 }))).toEqual([false, true]);
  });
});
