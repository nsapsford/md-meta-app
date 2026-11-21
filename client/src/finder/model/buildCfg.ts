// From the Finder's setup to what the engine searches: the opening position (Cfg) and the
// interruptions to test lines against. Port of the artifact's buildCfg / buildIntrs. Nothing here
// knows a card.

import type { HandTrapFile } from '../deck/schema';
import { drawBit } from '../engine/opponent';
import type { CardId, Cfg, Interruption, OppCard } from '../engine/types';
import { BLANK, DEFAULT_LP, type FinderSnapshot, type ResolvedList } from './finderState';

/** Board kinds that are floodgates: they shape the position, they are not interruptions. */
const isFloodgate = (kind: string) => kind.startsWith('flood');

/** The draw-effect bits of the live draw effects. */
export function liveBits(s: Pick<FinderSnapshot, 'live'>, traps: Pick<HandTrapFile, 'traps'>): number {
  let bits = 0;
  for (const t of traps.traps) if (s.live.includes(t.id)) bits |= drawBit(t.mechanism);
  return bits;
}

/**
 * The opening position. Hand cards come out of the Deck; blanks are never put in it (a draw from
 * the unknown rest of the Deck already gives a blank). Their field is only there going second.
 * `traps` gives the live draw effects (`cfg.drawFx`).
 */
export function buildCfg(s: FinderSnapshot, list: ResolvedList, traps?: Pick<HandTrapFile, 'traps'>): Cfg {
  const deck: Record<CardId, number> = {};
  for (const [id, n] of Object.entries(list.main)) if (n > 0) deck[id] = n;
  const extra: Record<CardId, number> = {};
  for (const [id, n] of Object.entries(list.extra)) if (n > 0) extra[id] = n;
  const hand: Record<CardId, number> = {};
  for (const id of s.hand) {
    hand[id] = (hand[id] || 0) + 1;
    if (id !== BLANK && deck[id]) { deck[id]--; if (!deck[id]) delete deck[id]; }
  }
  const cfg: Cfg = { mode: s.mode, hand, deck, extra };
  const bits = traps ? liveBits(s, traps) : 0;
  if (bits) cfg.drawFx = bits;
  if (s.mode === 'second') {
    cfg.opp = {
      lp: Math.max(1, s.opp.lp || DEFAULT_LP),
      mons: s.opp.mons.map((m): OppCard => ({
        uid: m.uid, kind: 'mon', name: m.name || 'monster', atk: +m.atk || 0, def: +m.def || 0, pos: m.pos, attr: m.attr || '?',
        race: (m.race || '?').trim() || '?', noDestroy: !!m.noDestroy, noTarget: !!m.noTarget, faceDown: m.pos === 'set', ext: m.kind !== 'main', intr: m.intr || null,
      })),
      st: s.opp.st.map((x): OppCard => ({
        uid: x.uid, kind: 'st', name: x.name || 'Set card', noDestroy: !!x.noDestroy, noTarget: !!x.noTarget, intr: x.intr || (!x.name && s.setAssume) || null,
      })),
    };
  }
  return cfg;
}

/**
 * Their interruptions: the hand traps switched on that are not already live, then (going second)
 * each card on their field once per use. Floodgates and face-down monsters are not interruptions.
 */
export function buildIntrs(s: FinderSnapshot, traps: Pick<HandTrapFile, 'traps'>): Interruption[] {
  const out: Interruption[] = [];
  for (const t of traps.traps) {
    if (!s.hts.includes(t.id) || s.live.includes(t.id)) continue;
    const it: Interruption = { kind: t.mechanism, src: 'hand', label: t.label, short: t.short, monster: t.monster };
    if (t.param !== undefined) it.param = t.param;
    out.push(it);
  }
  if (s.mode === 'second') {
    for (const m of s.opp.mons) {
      if (!m.intr || isFloodgate(m.intr) || m.pos === 'set') continue;
      for (let i = 0; i < (+m.uses || 1); i++) out.push({ kind: m.intr, src: 'board', uid: m.uid, cardKind: 'mon', label: m.name || 'Their monster' });
    }
    for (const x of s.opp.st) {
      const k = x.intr || (!x.name && s.setAssume) || '';
      if (!k || isFloodgate(k)) continue;
      for (let i = 0; i < (+x.uses || 1); i++) out.push({ kind: k, src: 'board', uid: x.uid, cardKind: 'st', label: x.name || 'An unknown Set card' });
    }
  }
  return out;
}
