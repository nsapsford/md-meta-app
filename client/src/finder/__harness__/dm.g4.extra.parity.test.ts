// Group 4 effects the group's situations never reach (or reach only once), compared in lockstep
// from hand-built positions. Each case also checks that the reference really offered the move.
// A position the situation config cannot state (a card already in the GY or Set on the field) is
// built by putting the same cards there on both sides at the root.
import { describe, expect, it } from 'vitest';
import { withoutAccepted } from './acceptedDiffs';
import { G4, loadDeckFiles } from './groupParity';
import { loadReference, type RefCfg } from './loadReference';
import { formatDiffs, lockstepSides, newSide, reducedDeck, refSide, type Side } from './lockstep';

const { engine: ref, cards } = loadReference();
const full = reducedDeck(ref, cards, G4);
const REF_IDS = Object.keys(ref.NAMES);

/** The G4 Main Deck less the hand (and less `without`: cards the root places elsewhere). */
function cfgOf(hand: Record<string, number>, o: { mode?: 'first' | 'second'; without?: string[]; opp?: RefCfg['opp'] } = {}): RefCfg {
  const deck = { ...full.deck };
  for (const [id, n] of Object.entries(hand)) deck[id] -= n;
  for (const id of o.without ?? []) deck[id] -= 1;
  return { mode: o.mode ?? 'first', hand, deck, extra: { ...full.extra }, ...(o.opp ? { opp: o.opp } : {}) };
}

/** What the root holds beyond the config: cards in the GY, Spells/Traps Set on the field. */
interface Extra { gy?: string[]; set?: string[] }

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
      return s;
    },
  };
  const diffs = withoutAccepted(lockstepSides(a, b, cfg, { id: 'g4-extra', width: 40, depth: 12 }));
  return { diffs: formatDiffs(diffs), keys };
}

describe('group 4 extra lockstep checks', () => {
  it('Shining Sarcophagus activated from a Set position, then DM of Black Magic and Gandora-G', () => {
    const r = walk(cfgOf({ DMBM: 1, GAND: 1, ASH: 1, MAXX: 1, FUWA: 1 }, { without: ['SARC'] }), { set: ['SARC'] });
    expect(r.keys.has('sarc:on')).toBe(true);
    expect(r.keys.has('dmbm')).toBe(true);
    expect(r.keys.has('gand')).toBe(true);
    expect(r.diffs).toBe('');
  });

  it("Gandora-G's wipe against only cards that cannot be targeted, two of them indestructible", () => {
    const opp = {
      lp: 8000,
      mons: [{ uid: 'o1', kind: 'mon', name: 'Shy Beast', noTarget: true, atk: 2000 }, { uid: 'o2', kind: 'mon', name: 'Rock', noDestroy: true, noTarget: true, atk: 1000 }],
      st: [{ uid: 'o3', kind: 'st', name: 'Sturdy Trap', noDestroy: true, noTarget: true }],
    };
    const r = walk(cfgOf({ SARC: 1, GAND: 1, CIRC: 1, SSRV: 1, ASH: 1, MAXX: 1 }, { mode: 'second', opp }));
    expect([...r.keys].some((k) => k.startsWith('gand2:DM'))).toBe(true);
    expect(r.keys.has('gand2:null')).toBe(true);
    expect(r.diffs).toBe('');
  });

  it("Soul Servant's GY draw does not count Dark Magician Girl's name in the GY", () => {
    // Soul Servant, Dark Magician and DMG Apprentice in the GY: the reference draws 1 (Dark Magician only).
    const r = walk(cfgOf({ ASH: 1, MAXX: 1, FUWA: 1, DROLL: 1, PREP: 1 }, { without: ['SSRV', 'DM', 'DMG'] }), { gy: ['SSRV', 'DM', 'DMG'] });
    expect(r.keys.has('ssrv2')).toBe(true);
    expect(r.diffs).toBe('');
  });
});
