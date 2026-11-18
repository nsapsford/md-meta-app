// Group 5 effects the group's situations never reach, compared in lockstep from hand-built
// positions. Each case also checks that the reference really offered the move. A position the
// situation config cannot state (a card already in the GY, or Set or face-up on the field) is built
// by putting the same cards there on both sides at the root.
//
// Deception's 1500 drain (an opponent's monster sent to their GY while you control an Azamina) has
// no move of its own, and no group 5 card destroys an opponent's monster; it is compared by running
// one destruction by hand on each side (the reference through Red-Eyes Dark Dragoon's move).
import { describe, expect, it } from 'vitest';
import { step, done } from '../engine/record';
import type { State } from '../engine/types';
import { withoutAccepted } from './acceptedDiffs';
import { G5, loadDeckFiles } from './groupParity';
import { loadReference, refOptsSet, type RefCfg } from './loadReference';
import { formatDiffs, lockstepSides, newSide, reducedDeck, refSide, type Side } from './lockstep';
import { OPT_MAP, toCfg } from './mapping';

const { engine: ref, cards } = loadReference();
const full = reducedDeck(ref, cards, G5);
const REF_IDS = Object.keys(ref.NAMES);

/** The G5 Main Deck less the hand (and less `without` / `withoutExtra`: cards the root places elsewhere). */
function cfgOf(hand: Record<string, number>, o: { mode?: 'first' | 'second'; without?: string[]; withoutExtra?: string[]; opp?: RefCfg['opp'] } = {}): RefCfg {
  const deck = { ...full.deck }, extra = { ...full.extra };
  for (const [id, n] of Object.entries(hand)) deck[id] -= n;
  for (const id of o.without ?? []) deck[id] -= 1;
  for (const id of o.withoutExtra ?? []) extra[id] -= 1;
  return { mode: o.mode ?? 'first', hand, deck, extra, ...(o.opp ? { opp: o.opp } : {}) };
}

/** What the root holds beyond the config: cards in the GY, Spells/Traps Set (not this turn) or face-up on the field. */
interface Extra { gy?: string[]; set?: string[]; up?: string[] }

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
      for (const id of extra.up ?? []) s.st.push({ id, up: true, now: false });
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
      for (const id of extra.up ?? []) s.st.push({ id: ix[id], up: true, now: false });
      return s;
    },
  };
  const diffs = withoutAccepted(lockstepSides(a, b, cfg, { id: 'g5-extra', width: 40, depth: 12 }));
  return { diffs: formatDiffs(diffs), keys };
}

const OPP = { lp: 8000, mons: [{ uid: 'o1', kind: 'mon', name: 'Foe', atk: 0 }, { uid: 'o2', kind: 'mon', name: 'Other Foe', atk: 0 }], st: [{ uid: 'o3', kind: 'st', name: 'Lid', faceDown: true }] };

describe('group 5 extra lockstep checks', () => {
  it('WANTED activated from a Set position (from the Deck, and from the GY)', () => {
    const r = walk(cfgOf({ ASH: 1, MAXX: 1, FUWA: 1, DROLL: 1, PREP: 1 }, { without: ['WANT'] }), { set: ['WANT'] });
    expect(r.keys.has('want:deck')).toBe(true);
    expect(r.diffs).toBe('');
    const g = walk(cfgOf({ ASH: 1, MAXX: 1, FUWA: 1, DROLL: 1, PREP: 1 }, { without: ['WANT', 'DIA'] }), { set: ['WANT'], gy: ['DIA'] });
    expect(g.keys.has('want:gy')).toBe(true);
    expect(g.diffs).toBe('');
  });

  it('Gandora-G wipes the field with a face-up Deception on it (no re-Set is earned)', () => {
    const r = walk(cfgOf({ SARC: 1, GAND: 1, ASH: 1, MAXX: 1, FUWA: 1, DROLL: 1 }, { mode: 'second', without: ['DECE'], opp: OPP }), { up: ['DECE'] });
    expect(r.keys.has('gand2:null')).toBe(true);
    expect([...r.keys].some((k) => k.startsWith('gand2:DM'))).toBe(true);
    expect(r.diffs).toBe('');
  });

  it('The Hallowed Azamina (GY) shuffles an Azamina monster from the GY into the Extra Deck', () => {
    const r = walk(cfgOf({ ASH: 1, MAXX: 1, FUWA: 1, DROLL: 1, PREP: 1 }, { without: ['HALL'], withoutExtra: ['ILIA'] }), { gy: ['HALL', 'ILIA'] });
    expect(r.keys.has('hallG:gILIA')).toBe(true);
    expect(r.diffs).toBe('');
  });

  it('Under a Spell floodgate The Hallowed Azamina (GY) is still offered, WANTED and Preparation of Rites are not', () => {
    const opp = { lp: 8000, mons: [{ uid: 'o1', kind: 'mon', name: 'Foe', atk: 1000 }], st: [{ uid: 'o2', kind: 'st', name: 'Spell Lock', intr: 'floodSpell' }] };
    const r = walk(cfgOf({ WANT: 1, ASH: 1, MAXX: 1, FUWA: 1, DROLL: 1, PREP: 1 }, { mode: 'second', without: ['HALL'], withoutExtra: ['ILIA'], opp }), { gy: ['HALL', 'ILIA'] });
    expect(r.keys.has('hallG:gILIA')).toBe(true);
    expect([...r.keys].some((k) => k.startsWith('want') || k.startsWith('prep'))).toBe(false);
    expect(r.diffs).toBe('');
  });
});

describe("Deception's drain, compared by hand", () => {
  // The same position on both sides: a face-up Deception (and an Azamina monster, when `azamina`), against two opponent monsters.
  const cfg = cfgOf({ ASH: 1 }, { mode: 'second', without: ['DECE'], opp: OPP });
  const DECE = { up: true, now: false };

  /** The reference: Dragoon (put on its field for the purpose, 0 ATK targets so it burns 0) destroys `uids` in turn. */
  function refRun(azamina: boolean, deceUp: boolean, uids: string[]) {
    let s = ref.newState(cfg);
    s.st.push({ id: 'DECE', ...DECE, up: deceUp });
    if (azamina) s.mons.push({ id: 'ILIA', emz: false, nm: 'ILIA', noEff: false, uses: 0, lvl: 6, gaze: false, uid: s.uid++ });
    s.mons.push({ id: 'DRAG', emz: false, nm: 'DRAG', noEff: false, uses: uids.length, lvl: 8, gaze: false, uid: s.uid++ });
    const texts: string[] = [];
    for (const u of uids) {
      const a = ref.gen(s).find((x) => x.k === 'drag:' + u);
      if (!a) throw new Error('the reference offers no drag:' + u);
      s = a.run(s, false);
      texts.push(s.log[s.log.length - 1].text.replace(/^Dragoon: destroy their [^,]*, burn 0\./, ''));
    }
    return { texts, burn: s.burn, lp: s.lp, oppLp: s.opp.lp, opts: refOptsSet(s).filter((n) => n === 'dec2').map((n) => OPT_MAP[n]) };
  }

  /** The new engine: a step that destroys `uids` in turn, through the deck's own opponent-removal op. */
  function newRun(azamina: boolean, deceUp: boolean, uids: string[]) {
    const loaded = loadDeckFiles();
    if (!loaded.ok) throw new Error(loaded.errors);
    const e = loaded.engine, d = e.deck, ix = d.ix;
    let s: State = e.newState(toCfg(cfg));
    s.st.push({ id: ix.DECE, ...DECE, up: deceUp });
    if (azamina) s.mons.push({ id: ix.ILIA, nm: ix.ILIA, emz: false, noEff: false, uses: 0, lvl: 6, marks: 0, uid: s.uid++ });
    const texts: string[] = [];
    for (const u of uids) {
      const n = d.state.clone(s);
      step(n, '');
      d.ops.oppRemove(n, u, 'destroy');
      s = done(n);
      texts.push(s.log[s.log.length - 1].text);
    }
    return { texts, burn: s.burn, lp: s.lp, oppLp: s.opp!.lp, opts: d.limitNames.filter((nm, i) => nm === 'dece2' && d.state.getOpt(s, i)) };
  }

  it('drains 1500 once per turn while you control an Azamina monster and Deception is face-up', () => {
    const r = refRun(true, true, ['o1', 'o2']);
    expect(r.texts).toEqual([' Deception drains 1500.', '']);
    expect(newRun(true, true, ['o1', 'o2'])).toEqual(r);
  });

  it('does not drain without an Azamina monster, or with Deception face-down', () => {
    for (const [az, up] of [[false, true], [true, false]] as const) {
      const r = refRun(az, up, ['o1']);
      expect(r.texts).toEqual(['']);
      expect(newRun(az, up, ['o1'])).toEqual(r);
    }
  });
});
