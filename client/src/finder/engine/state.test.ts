import { describe, it, expect } from 'vitest';
import { createStateOps } from './state';
import { removeAt } from './ops';
import type { Cfg, Mon } from './types';

const ix = { A: 0, B: 1, C: 2, UNK: 3 };
const ops = createStateOps(4, 40, 5);
const cfg: Cfg = { mode: 'first', hand: { A: 2, B: 1 }, deck: { C: 3 }, extra: { UNK: 1 } };
const mon = (): Mon => ({ id: 0, nm: 0, emz: false, noEff: false, uses: 0, lvl: 4, marks: 0, uid: 1 });

describe('engine state', () => {
  it('newState fills zones, turn and phase', () => {
    const s = ops.newState(cfg, ix);
    expect(Array.from(s.hand)).toEqual([2, 1, 0, 0]);
    expect(Array.from(s.deck)).toEqual([0, 0, 3, 0]);
    expect(s.extra[3]).toBe(1);
    expect(s.turn).toBe('me');
    expect(s.phase).toBe('main');
    expect(s.drawPenalty).toBe(55);
    expect(s.opt.length).toBe(2);
  });

  it('throws naming an unknown card', () => {
    expect(() => ops.newState({ ...cfg, deck: { ZZ: 1 } }, ix)).toThrow(/ZZ/);
  });

  it('throws for a card index outside the zones', () => {
    expect(() => ops.newState(cfg, { ...ix, D: 4 })).toThrow(/D/);
  });

  it('stateKey tells pending effect 0 from effect 15', () => {
    const a = ops.newState(cfg, ix), b = ops.newState(cfg, ix);
    a.pend = [{ e: 0 }]; b.pend = [{ e: 15 }];
    expect(ops.stateKey(a)).not.toBe(ops.stateKey(b));
  });

  it('rejects more than 30 flags', () => {
    expect(() => createStateOps(4, 1, 31)).toThrow();
  });

  it('copy-on-write: writes do not touch the parent; unwritten zones are shared', () => {
    const p = ops.newState(cfg, ix);
    const c = ops.clone(p);
    expect(c.deck).toBe(p.deck);
    ops.W(c, 'hand')[0] = 0;
    expect(p.hand[0]).toBe(2);
    expect(c.hand[0]).toBe(0);
    expect(c.deck).toBe(p.deck);
    expect(c.gy).toBe(p.gy);
    // parent writing after clone must not leak into the child
    ops.W(p, 'deck')[2] = 0;
    expect(c.deck[2]).toBe(3);
  });

  it('clone copies mons, st, top, pend and opt', () => {
    const p = ops.newState(cfg, ix);
    p.mons.push(mon()); p.st.push({ id: 1, up: true, now: false }); p.top.push(1); p.pend.push({ e: 3 });
    const c = ops.clone(p);
    expect(c.mons).not.toBe(p.mons); expect(c.st).not.toBe(p.st);
    expect(c.top).not.toBe(p.top); expect(c.pend).not.toBe(p.pend); expect(c.opt).not.toBe(p.opt);
    ops.setOpt(c, 35);
    expect(ops.getOpt(p, 35)).toBe(false);
    expect(ops.getOpt(c, 35)).toBe(true);
  });

  it('OW copies the opponent side on first write only', () => {
    const p = ops.newState({ ...cfg, opp: { lp: 8000, mons: [], st: [] } }, ix);
    const c = ops.clone(p);
    const o = ops.OW(c);
    expect(o).not.toBe(p.opp);
    o.lp = 1;
    expect(p.opp!.lp).toBe(8000);
    expect(ops.OW(c)).toBe(o);
  });

  it('stateKey ignores path/log and is a safe integer', () => {
    const a = ops.newState(cfg, ix), b = ops.newState(cfg, ix);
    b.path = ['x', 'y']; b.log = [{ text: 't' } as never]; b.uid = 9;
    expect(ops.stateKey(a)).toBe(ops.stateKey(b));
    expect(Number.isSafeInteger(ops.stateKey(a))).toBe(true);
  });

  it('stateKey separates differing positions', () => {
    const base = () => { const s = ops.newState(cfg, ix); s.mons.push(mon()); return s; };
    const k0 = ops.stateKey(base());
    const edits: Array<(s: ReturnType<typeof base>) => void> = [
      (s) => ops.setOpt(s, 37),
      (s) => { s.ns = true; },
      (s) => { s.addLock = true; },
      (s) => { s.mons[0].noEff = true; },
      (s) => { s.drawFx = 2; },
      (s) => { s.flags = 4; },
      (s) => { ops.W(s, 'gy')[1] = 1; },
    ];
    const keys = new Set([k0]);
    for (const e of edits) { const s = base(); e(s); const k = ops.stateKey(s); expect(k).not.toBe(k0); keys.add(k); }
    expect(keys.size).toBe(edits.length + 1);
  });

  it('stateKey reflects zone writes after a cached key', () => {
    const s = ops.newState(cfg, ix);
    const k = ops.stateKey(s);
    ops.W(s, 'hand')[0] = 1;
    expect(ops.stateKey(s)).not.toBe(k);
  });
});

describe('removeAt', () => {
  it('removes and returns one element, as splice(i, 1)[0] does, in range and out of it', () => {
    for (const i of [0, 1, 3, 4, -1, 7]) {
      const a = [10, 11, 12, 13, 14], b = a.slice();
      expect(removeAt(a, i)).toBe(b.splice(i, 1)[0]);
      expect(a).toEqual(b);
    }
  });
});
