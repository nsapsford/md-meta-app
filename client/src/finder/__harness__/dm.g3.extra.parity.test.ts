// Group 3 effects the group's situations never reach, compared in lockstep from hand-built
// positions. Each case also checks that the reference really offered the move it is there for.
import { describe, expect, it } from 'vitest';
import { withoutAccepted } from './acceptedDiffs';
import { G3, loadDeckFiles } from './groupParity';
import { loadReference, type RefCfg } from './loadReference';
import { formatDiffs, lockstepSides, newSide, reducedDeck, refSide, type Side } from './lockstep';

const { engine: ref, cards } = loadReference();
const full = reducedDeck(ref, cards, G3);

/** The G3 Main Deck less the hand (and less `without`, moved nowhere: as if already used). */
function cfgOf(hand: Record<string, number>, o: { mode?: 'first' | 'second'; without?: string[]; opp?: RefCfg['opp'] } = {}): RefCfg {
  const deck = { ...full.deck };
  for (const [id, n] of Object.entries(hand)) deck[id] -= n;
  for (const id of o.without ?? []) delete deck[id];
  return { mode: o.mode ?? 'first', hand, deck, extra: { ...full.extra }, ...(o.opp ? { opp: o.opp } : {}) };
}

/** Lockstep from `cfg`; returns the diffs and every move key the reference offered on the walk. */
function walk(cfg: RefCfg): { diffs: string; keys: Set<string> } {
  const loaded = loadDeckFiles();
  if (!loaded.ok) throw new Error(loaded.errors);
  const keys = new Set<string>();
  const base = refSide(ref);
  const spy: Side = { ...base, gen: (s) => { const a = base.gen(s); for (const m of a) keys.add(m.k); return a; } };
  const diffs = withoutAccepted(lockstepSides(spy, newSide(loaded.engine), cfg, { id: 'g3-extra', width: 40, depth: 12 }));
  return { diffs: formatDiffs(diffs), keys };
}

describe('group 3 extra lockstep checks', () => {
  it("Pharaoh's Servant with no DM Spell/Trap left in the Deck (no Set)", () => {
    const r = walk(cfgOf({ SERV: 1, PREP: 1, ASH: 1, FUWA: 1, MAXX: 1 }, { without: ['CIRC', 'CURT', 'TALI', 'SSRV'] }));
    expect(r.keys.has('serv:null')).toBe(true);
    expect(r.diffs).toBe('');
  });

  // Servant's two effects share one use a turn, so the wipe needs a Servant summoned another way: Souls revives it.
  it("Pharaoh's Servant's wipe ignores targeting and skips cards that cannot be destroyed", () => {
    const opp = {
      lp: 8000, mons: [],
      st: [
        { uid: 'o1', kind: 'st', name: 'Shrouded Trap', noTarget: true },
        { uid: 'o2', kind: 'st', name: 'Sturdy Trap', noDestroy: true },
        { uid: 'o3', kind: 'st', name: 'Set Popper', intr: 'pop' },
      ],
    };
    const r = walk(cfgOf({ SOULS: 1, CIRC: 1, PREP: 1, CURT: 1, ASH: 1, MAXX: 1 }, { mode: 'second', opp }));
    expect([...r.keys].some((k) => k.startsWith('servwipe'))).toBe(true);
    expect(r.diffs).toBe('');
  });

  it("Pharaoh's Servant's wipe against only a card that is not targetable", () => {
    const opp = { lp: 8000, mons: [], st: [{ uid: 'o1', kind: 'st', name: 'Shrouded Trap', noTarget: true }] };
    const r = walk(cfgOf({ SOULS: 1, CIRC: 1, PREP: 1, ASH: 1, MAXX: 1, FUWA: 1 }, { mode: 'second', opp }));
    expect([...r.keys].some((k) => k.startsWith('servwipe'))).toBe(true);
    expect(r.diffs).toBe('');
  });

  it("keeping one card in hand while you control Pharaoh's Servant (end-of-turn Sets)", () => {
    // Servant reveals Preparation, Preparation adds Illusion: Talisman and Soul Servant are left to Set.
    const r = walk(cfgOf({ SERV: 1, PREP: 1, TALI: 1, SSRV: 1, DROLL: 1 }));
    expect([...r.keys].some((k) => k.startsWith('serv:'))).toBe(true);
    expect(r.diffs).toBe('');
  });
});
