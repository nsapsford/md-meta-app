import type { Cfg, CardId, State, ZoneName, OppState } from './types';
import { createZoneOps } from './zones';

export interface StateOps {
  newState(cfg: Cfg, ix: Record<CardId, number>): State;
  clone(s: State): State;
  W(s: State, z: ZoneName): Uint8Array;
  OW(s: State): NonNullable<State['opp']>;
  getOpt(s: Pick<State, 'opt'>, i: number): boolean;
  setOpt(s: State, i: number): void;
  stateKey(s: State): number;
}


function mix(h: number, v: number): number {
  h = Math.imul(h ^ v, 0x9e3779b1);
  return h ^ (h >>> 15);
}

export function createStateOps(nCards: number, nOpt: number, nFlags: number): StateOps {
  if (nFlags > 30) throw new Error(`too many flags: ${nFlags} (max 30)`);
  const optWords = Math.max(1, Math.ceil(nOpt / 32));

  // Per-card random multipliers for zone hashing.
  const RA = new Int32Array(nCards), RB = new Int32Array(nCards);
  {
    let x = 0x9e3779b9 | 0;
    const nx = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x | 0; };
    for (let i = 0; i < nCards; i++) { RA[i] = nx() | 1; RB[i] = nx() | 1; }
  }

  function zkey(o: Uint8Array): number {
    let a = 0x1234567, b = 0x7654321;
    for (let i = 0; i < nCards; i++) {
      const v = o[i];
      if (v) { a = (a + Math.imul(RA[i], v + 7 * i + 1)) | 0; b = (Math.imul(b ^ RB[i], 0x85ebca6b) + v) | 0; }
    }
    return (a >>> 0) * 2097152 + (b >>> 11) + 1;
  }

  function W(s: State, z: ZoneName): Uint8Array {
    // One case per zone (hot): direct property reads and writes instead of keyed ones.
    switch (z) {
      case 'hand': if (!(s.own & 1)) { s.hand = s.hand.slice(); s.own |= 1; } s.k1 = 0; return s.hand;
      case 'deck': if (!(s.own & 2)) { s.deck = s.deck.slice(); s.own |= 2; } s.k2 = 0; return s.deck;
      case 'extra': if (!(s.own & 4)) { s.extra = s.extra.slice(); s.own |= 4; } s.k3 = 0; return s.extra;
      case 'gy': if (!(s.own & 8)) { s.gy = s.gy.slice(); s.own |= 8; } s.k4 = 0; return s.gy;
      case 'ban': if (!(s.own & 16)) { s.ban = s.ban.slice(); s.own |= 16; } s.k5 = 0; return s.ban;
    }
    throw new Error(`unknown zone ${String(z)}`);
  }

  function OW(s: State): OppState {
    if (!s.opp) throw new Error('no opponent in this state');
    if (!s.oppOwn) {
      const o = s.opp;
      s.opp = { mons: o.mons.slice(), st: o.st.slice(), lp: o.lp, lp0: o.lp0, k: null, k2: 0 };
      s.oppOwn = true;
    }
    s.opp.k = null;
    return s.opp;
  }

  function newState(cfg: Cfg, ix: Record<CardId, number>): State {
    for (const k of Object.keys(ix)) {
      const i = ix[k];
      if (!Number.isInteger(i) || i < 0 || i >= nCards) throw new Error(`card index of ${k} is ${i}, outside 0..${nCards - 1}`);
    }
    const zo = createZoneOps(ix, nCards);
    const z = (obj: Record<CardId, number>, name: string) => {
      for (const k of Object.keys(obj)) {
        if (ix[k] === undefined) throw new Error(`unknown card id in cfg.${name}: ${k}`);
      }
      return zo.zone(obj);
    };
    return {
      mode: cfg.mode || 'first',
      turn: 'me',
      phase: 'main',
      hand: z(cfg.hand, 'hand'), deck: z(cfg.deck, 'deck'), extra: z(cfg.extra, 'extra'),
      gy: zo.zone(), ban: zo.zone(),
      own: 31, k1: 0, k2: 0, k3: 0, k4: 0, k5: 0,
      mons: [], st: [], top: [],
      opt: Array.from({ length: optWords }, () => 0),
      flags: 0,
      ns: false, spell: false, summons: 0, lp: 8000, addLock: false, pend: [],
      opp: cfg.opp
        ? {
            mons: cfg.opp.mons.map((m, i) => ({ ...m, ui: i + 1 })),
            st: cfg.opp.st.map((x, i) => ({ ...x, ui: i + 1 })),
            lp: cfg.opp.lp, lp0: cfg.opp.lp, k: null, k2: 0,
          }
        : null,
      oppOwn: true,
      burn: 0, removed: 0, noDirect: false, log: [], uid: 1, path: [], spent: null, cur: null,
      cDeckTouch: 0, cDeckAdd: 0, cFieldMon: 0,
      drawFx: cfg.drawFx || 0, oppDraws: 0, drawPenalty: cfg.drawPenalty == null ? 55 : cfg.drawPenalty, opening: null,
    };
  }

  function clone(s: State): State {
    // Both states now share every zone and the opponent side; neither owns them until it writes.
    s.own = 0; s.oppOwn = false;
    return {
      mode: s.mode, turn: s.turn, phase: s.phase,
      hand: s.hand, deck: s.deck, extra: s.extra, gy: s.gy, ban: s.ban,
      own: 0, k1: s.k1, k2: s.k2, k3: s.k3, k4: s.k4, k5: s.k5,
      mons: s.mons.slice(), st: s.st.slice(), top: s.top.slice(),
      opt: s.opt.slice(), flags: s.flags,
      ns: s.ns, spell: s.spell, summons: s.summons, lp: s.lp, addLock: s.addLock, pend: s.pend.slice(),
      opp: s.opp, oppOwn: false,
      burn: s.burn, removed: s.removed, noDirect: s.noDirect, log: s.log, uid: s.uid, path: s.path, spent: s.spent, cur: null,
      cDeckTouch: s.cDeckTouch, cDeckAdd: s.cDeckAdd, cFieldMon: s.cFieldMon,
      drawFx: s.drawFx, oppDraws: s.oppDraws, drawPenalty: s.drawPenalty, opening: s.opening,
    };
  }

  function getOpt(s: Pick<State, 'opt'>, i: number): boolean { return ((s.opt[i >>> 5] >>> (i & 31)) & 1) === 1; }
  function setOpt(s: State, i: number): void { s.opt[i >>> 5] |= (1 << (i & 31)); }

  function stateKey(s: State): number {
    // Unrolled (hot): one direct property read per zone, as in the reference.
    if (!s.k1) s.k1 = zkey(s.hand);
    if (!s.k2) s.k2 = zkey(s.deck);
    if (!s.k3) s.k3 = zkey(s.extra);
    if (!s.k4) s.k4 = zkey(s.gy);
    if (!s.k5) s.k5 = zkey(s.ban);
    let a = 0x2545f491, b = 0x6a09e667;
    a = mix(a, s.k1 | 0); b = mix(b, (s.k1 / 4294967296) | 0);
    a = mix(a, s.k2 | 0); b = mix(b, (s.k2 / 4294967296) | 0);
    a = mix(a, s.k3 | 0); b = mix(b, (s.k3 / 4294967296) | 0);
    a = mix(a, s.k4 | 0); b = mix(b, (s.k4 / 4294967296) | 0);
    a = mix(a, s.k5 | 0); b = mix(b, (s.k5 / 4294967296) | 0);
    let m1 = 0, m2 = 0;
    for (let i = 0; i < s.mons.length; i++) {
      const m = s.mons[i];
      const bits = (m.noEff ? 1 : 0) | ((m.uses & 7) << 1) | ((m.lvl & 63) << 4) | (m.emz ? 1 << 10 : 0) | ((m.marks & 0xfffff) << 11);
      const v = mix(mix(m.id + 1, m.nm + 1), bits);
      m1 = (m1 + mix(0x1b873593, v)) | 0; m2 = (m2 + mix(0x5bd1e995, v + 0x7f4a7c15)) | 0;
    }
    a = mix(a, m1); b = mix(b, m2); a = mix(a, s.mons.length);
    m1 = 0; m2 = 0;
    for (let i = 0; i < s.st.length; i++) {
      const x = s.st[i];
      const v = mix(x.id + 1, (x.up ? 1 : 0) | (x.now ? 2 : 0));
      m1 = (m1 + mix(0x27d4eb2f, v)) | 0; m2 = (m2 + mix(0x165667b1, v + 0x3c6ef372)) | 0;
    }
    a = mix(a, m1); b = mix(b, m2); b = mix(b, s.st.length);
    for (let i = 0; i < s.top.length; i++) { const v = s.top[i]; a = mix(a, v + 1); b = mix(b, v + 77); }
    a = mix(a, 0x100 | (s.ns ? 1 : 0) | (s.spell ? 2 : 0) | (s.addLock ? 4 : 0) | (s.noDirect ? 8 : 0));
    a = mix(a, s.flags); b = mix(b, s.flags ^ 0x5bf03635);
    for (let i = 0; i < s.opt.length; i++) { a = mix(a, s.opt[i] | 0); b = mix(b, (s.opt[i] ^ 0x5bf03635) + 0x1f83d9ab * (i + 1)); }
    for (let i = 0; i < s.pend.length; i++) { const v = s.pend[i].e + 1; a = mix(a, v); b = mix(b, v * 31 + 7); }
    if (s.opp) {
      const o = s.opp;
      if (o.k === null) {
        let x = 0x811c9dc5 | 0, y = 0x01000193;
        for (let i = 0; i < o.mons.length; i++) { x = mix(x, o.mons[i].ui); y = mix(y, o.mons[i].ui * 131 + 1); }
        x = mix(x, 0xfff);
        for (let i = 0; i < o.st.length; i++) { x = mix(x, o.st[i].ui + 64); y = mix(y, o.st[i].ui * 137 + 5); }
        o.k = x; o.k2 = y;
      }
      a = mix(a, o.k); b = mix(b, o.k2); a = mix(a, s.burn);
    }
    a = mix(a, s.lp);
    if (s.drawFx) b = mix(b, 0x4000 | (s.drawFx << 8) | s.oppDraws);
    if (s.spent) { let sp = 0; for (const q in s.spent) sp |= 1 << Number(q); b = mix(b, sp + 0x9999); }
    return (a >>> 0) * 2097152 + (b >>> 11);
  }

  return { newState, clone, W, OW, getOpt, setOpt, stateKey };
}
