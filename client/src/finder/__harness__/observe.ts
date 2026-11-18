// What a position looks like from outside, as canonical JSON, so a reference position and a new
// engine position can be compared with ===. Cards are named by id (the deck file's card ids are
// the reference's NAMES keys). Monsters and Spell/Traps are compared as multisets; the order
// of the cards on top of the Deck is kept. Pending triggers are named in queue order and the set
// once-per-turn slots as a sorted list, both in the new deck's names (mapping.ts: PEND_MAP,
// OPT_MAP; an unmapped name on either side throws). Other hidden bookkeeping (flags, the ledger)
// is not observed: a difference there shows up as different moves later in the walk.

import type { Engine } from '../engine';
import type { State } from '../engine/types';
import { refOptsSet, type RefEngine } from './loadReference';
import { checkNewNames, mapRefNames, OPT_MAP, PEND_MAP } from './mapping';

/** The name tables the observation uses; null keeps names as they are (a reference compared with itself). */
export interface NameMaps { pend: Record<string, string> | null; opt: Record<string, string> | null }
const MAPS: NameMaps = { pend: PEND_MAP, opt: OPT_MAP };
export const SAME_NAMES: NameMaps = { pend: null, opt: null };

interface View {
  zones: Record<'hand' | 'deck' | 'extra' | 'gy' | 'ban', string[]>;
  mons: unknown[][]; st: unknown[][]; top: string[];
  ns: boolean; spell: boolean; addLock: boolean; lp: number; summons: number; burn: number; removed: number; noDirect: boolean;
  pend: string[]; opts: string[]; opp: { lp: number; cards: string[] } | null; draws: number;
}

const ZONES = ['hand', 'deck', 'extra', 'gy', 'ban'] as const;

function zone(z: ArrayLike<number>, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < z.length; i++) if (z[i]) out.push(`${ids[i]}: ${z[i]}`);
  return out.sort();
}

const sortRows = (rows: unknown[][]): unknown[][] => rows.map((r) => [JSON.stringify(r), r] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((x) => x[1]);

function view(s: any, ids: readonly string[], idOf: (x: any) => string, addLock: boolean, pend: string[], opts: string[]): string {
  const v: View = {
    zones: Object.fromEntries(ZONES.map((z) => [z, zone(s[z], ids)])) as View['zones'],
    mons: sortRows(s.mons.map((m: any) => [idOf(m.id), idOf(m.nm), !!m.noEff, m.uses || 0, m.lvl || 0, !!m.emz])),
    st: sortRows(s.st.map((x: any) => [idOf(x.id), !!x.up, !!x.now])),
    top: s.top.map(idOf),
    ns: !!s.ns, spell: !!s.spell, addLock, lp: s.lp, summons: s.summons, burn: s.burn, removed: s.removed, noDirect: !!s.noDirect,
    pend, opts: opts.sort(),
    opp: s.opp ? { lp: s.opp.lp, cards: s.opp.mons.concat(s.opp.st).map((c: any) => String(c.uid)).sort() } : null,
    draws: s.oppDraws || 0,
  };
  return JSON.stringify(v);
}

const refIds = new WeakMap<RefEngine, string[]>();

export function refObserve(engine: RefEngine, s: any, maps: NameMaps = MAPS): string {
  let ids = refIds.get(engine);
  if (!ids) { ids = Object.keys(engine.NAMES); refIds.set(engine, ids); }
  const pt: string[] = s.pend.map((p: { t: string }) => p.t), os = refOptsSet(s);
  const pend = maps.pend ? mapRefNames(pt, maps.pend, 'trigger') : pt;
  const opts = maps.opt ? mapRefNames(os, maps.opt, 'once-per-turn slot') : os;
  return view(s, ids, (x: string) => x, !!s.droll, pend, opts);
}

export function newObserve(engine: Engine, s: State, maps: NameMaps = MAPS): string {
  const d = engine.deck, ids = d.ids;
  const pk = s.pend.map((p) => d.effects[p.e].key), os = d.limitNames.filter((_, i) => d.state.getOpt(s, i));
  const pend = maps.pend ? checkNewNames(pk, maps.pend, 'trigger') : pk;
  const opts = maps.opt ? checkNewNames(os, maps.opt, 'once-per-turn slot') : os;
  return view(s, ids, (x: number) => ids[x], s.addLock, pend, opts);
}
