import type { CardId } from './types';

/** Zone helpers over numeric card indices. A zone is a byte array of copies per card. */
export interface ZoneOps {
  zone(obj?: Record<CardId, number>): Uint8Array;
  toObj(z: Uint8Array): Record<CardId, number>;
  inc(z: Uint8Array, i: number, n?: number): void;
  dec(z: Uint8Array, i: number): void;
  has(z: Uint8Array, i: number): boolean;
  cnt(z: Uint8Array, i: number): number;
  keys(z: Uint8Array): number[];
  total(z: Uint8Array): number;
}

export function createZoneOps(ix: Record<CardId, number>, nCards: number): ZoneOps {
  const ids: CardId[] = new Array(nCards).fill('');
  for (const k of Object.keys(ix)) ids[ix[k]] = k;
  return {
    zone(obj) {
      const z = new Uint8Array(nCards);
      if (obj) {
        for (const k of Object.keys(obj)) {
          const i = ix[k];
          if (i === undefined) throw new Error(`unknown card id: ${k}`);
          z[i] = obj[k];
        }
      }
      return z;
    },
    toObj(z) {
      const o: Record<CardId, number> = {};
      for (let i = 0; i < nCards; i++) if (z[i]) o[ids[i]] = z[i];
      return o;
    },
    inc(z, i, n = 1) { z[i] += n; },
    dec(z, i) { if (!z[i]) throw new Error('missing card index ' + i); z[i]--; },
    has: (z, i) => z[i] > 0,
    cnt: (z, i) => z[i] || 0,
    keys(z) { const out: number[] = []; for (let i = 0; i < nCards; i++) if (z[i]) out.push(i); return out; },
    total(z) { let t = 0; for (let i = 0; i < nCards; i++) t += z[i]; return t; },
  };
}
