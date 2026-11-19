// Group 6 effects the group's situations never reach, compared in lockstep from hand-built
// positions. Each case also checks that the reference really offered the move. A position the
// situation config cannot state (a card already in the GY, Set on the field, or a monster on the
// field) is built by putting the same cards there on both sides at the root.
import { describe, expect, it } from 'vitest';
import { withoutAccepted } from './acceptedDiffs';
import { G6, loadDeckFiles } from './groupParity';
import { loadReference, type RefCfg } from './loadReference';
import { formatDiffs, lockstepSides, newSide, reducedDeck, refSide, type Side } from './lockstep';

const { engine: ref, cards } = loadReference();
const full = reducedDeck(ref, cards, G6);
const REF_IDS = Object.keys(ref.NAMES);

/** The G6 Main Deck less the hand (and less `without` / `withoutExtra`: cards the root places elsewhere). */
function cfgOf(hand: Record<string, number>, o: { mode?: 'first' | 'second'; without?: string[]; withoutExtra?: string[]; opp?: RefCfg['opp'] } = {}): RefCfg {
  const deck = { ...full.deck }, extra = { ...full.extra };
  for (const [id, n] of Object.entries(hand)) deck[id] -= n;
  for (const id of o.without ?? []) deck[id] -= 1;
  for (const id of o.withoutExtra ?? []) extra[id] -= 1;
  return { mode: o.mode ?? 'first', hand, deck, extra, ...(o.opp ? { opp: o.opp } : {}) };
}

/** What the root holds beyond the config: cards in the GY, Spells/Traps Set (not this turn), monsters on the field (with `uses`). */
interface Extra { gy?: string[]; set?: string[]; mons?: { id: string; nm?: string; uses?: number; lvl: number }[] }

/** Lockstep from `cfg` (plus `extra` at the root); the diffs and every move key the reference offered on the walk. */
function walk(cfg: RefCfg, extra: Extra = {}): { diffs: string; keys: Set<string> } {
  const loaded = loadDeckFiles();
  if (!loaded.ok) throw new Error(loaded.errors);
  const neu = loaded.engine, ix = neu.deck.ix;
  const keys = new Set<string>();
  const base = refSide(ref);
  const a: Side = {
    ...base,
    root: (c) => {
      const s = base.root(c);
      for (const id of extra.gy ?? []) s.gy[REF_IDS.indexOf(id)]++;
      for (const id of extra.set ?? []) s.st.push({ id, up: false, now: false });
      for (const m of extra.mons ?? []) s.mons.push({ id: m.id, emz: false, nm: m.nm ?? m.id, noEff: false, uses: m.uses ?? 0, lvl: m.lvl, gaze: false, uid: s.uid++ });
      return s;
    },
    gen: (s) => { const m = base.gen(s); for (const x of m) keys.add(x.k); return m; },
  };
  const nb = newSide(neu);
  const b: Side = {
    ...nb,
    root: (c) => {
      const s = nb.root(c);
      for (const id of extra.gy ?? []) s.gy[ix[id]]++;
      for (const id of extra.set ?? []) s.st.push({ id: ix[id], up: false, now: false });
      for (const m of extra.mons ?? []) s.mons.push({ id: ix[m.id], nm: ix[m.nm ?? m.id], emz: false, noEff: false, uses: m.uses ?? 0, lvl: m.lvl, marks: 0, uid: s.uid++ });
      return s;
    },
  };
  const diffs = withoutAccepted(lockstepSides(a, b, cfg, { id: 'g6-extra', width: 40, depth: 10 }));
  return { diffs: formatDiffs(diffs), keys };
}

const JUNK = { ASH: 1, MAXX: 1, FUWA: 1, DROLL: 1 };

describe('group 6 extra lockstep checks', () => {
  it('The Gaze of Timaeus activated from a Set position, on Dark Magician in the GY', () => {
    const r = walk(cfgOf({ ...JUNK, PREP: 1 }, { without: ['GAZE', 'DM'] }), { set: ['GAZE'], gy: ['DM'] });
    expect(r.keys.has('gaze:gDM:DRAG')).toBe(true);
    expect(r.diffs).toBe('');
  });

  it("Magicians' Souls does not revive Dark Magician of Destruction from the GY (its GY name is Dark Magician)", () => {
    const r = walk(cfgOf({ ...JUNK, SOULS: 1 }, { withoutExtra: ['DMOD'] }), { gy: ['DMOD'] });
    expect([...r.keys].some((k) => /^souls:b:[A-Z]+:DM$/.test(k))).toBe(true);
    expect([...r.keys].some((k) => k.endsWith(':DMOD'))).toBe(false);
    expect(r.diffs).toBe('');
  });

  it("Gandora-G's wipe spares Red-Eyes Dark Dragoon (it cannot be destroyed by card effects)", () => {
    const opp = { lp: 8000, mons: [{ uid: 'o1', kind: 'mon', name: 'Foe', atk: 1000 }], st: [{ uid: 'o2', kind: 'st', name: 'Lid', faceDown: true }] };
    const r = walk(cfgOf({ SARC: 1, GAND: 1, ASH: 1, MAXX: 1 }, { mode: 'second', withoutExtra: ['DRAG'], opp }), { mons: [{ id: 'DRAG', uses: 0, lvl: 8 }] });
    expect(r.keys.has('gand2:null')).toBe(true);
    expect(r.diffs).toBe('');
  });

  it("Super Polymerization fuses Dark Magician with the opponent's face-up Dragon into Dragoon, which then destroys", () => {
    const opp = { lp: 8000, mons: [{ uid: 'o1', kind: 'mon', name: 'Wyvern', race: 'Dragon', attr: 'DARK', atk: 2400 }, { uid: 'o2', kind: 'mon', name: 'Foe', atk: 1800 }], st: [] };
    const r = walk(cfgOf({ SPOLY: 1, ...JUNK }, { mode: 'second', without: ['DM'], opp }), { mons: [{ id: 'DM', lvl: 7 }] });
    expect([...r.keys].some((k) => /^spoly:DRAG:.*opo1/.test(k))).toBe(true);
    expect([...r.keys].some((k) => k.startsWith('drag:'))).toBe(true);
    expect(r.diffs).toBe('');
  });
});
