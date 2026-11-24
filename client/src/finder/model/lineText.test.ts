import { describe, expect, it } from 'vitest';
import type { SerializedLine } from '../engine/serialize';
import { lineName, savedLineName } from './lineText';

const short = (id: string) => id.toUpperCase();
const ctx = { mode: 'first' as const, hand: ['h1', 'h2'] };
const line = (mons: string[], st: string[] = []) => ({
  safest: false,
  board: { mons: mons.map((id) => ({ id, uses: 1, marks: [] })), st: st.map((id) => ({ id, up: false, endSet: true })), hand: {}, lp: 8000, opp: [] },
}) as unknown as SerializedLine;

describe('savedLineName', () => {
  it('adds the end board to the line name', () => {
    expect(savedLineName(line(['m1', 'm2'], ['s1']), line(['m1', 'm2'], ['s1']), short, ctx)).toBe('Going first: H1 + H2 → M1, M2, S1');
  });

  it('gives different end boards for the same hand different names', () => {
    const a = line(['m1', 'm2']), b = line(['m1', 'm3']);
    expect(savedLineName(a, a, short, ctx)).not.toBe(savedLineName(b, b, short, ctx));
  });

  it('gives the same line the same name each time', () => {
    const a = line(['m1', 'm2']);
    expect(savedLineName(a, a, short, ctx)).toBe(savedLineName(line(['m1', 'm2']), line(['m1', 'm2']), short, ctx));
  });

  it('keeps within 120 characters by shortening the board, not the hand', () => {
    const big = line(Array.from({ length: 40 }, (_, i) => `monster${i}`));
    const name = savedLineName(big, big, short, ctx);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name.startsWith(`${lineName(big, short, ctx)} → MONSTER0, `)).toBe(true);
    expect(name.endsWith('…')).toBe(true);
  });

  it('is the plain line name when nothing is left on the board', () => {
    const empty = line([]);
    expect(savedLineName(empty, empty, short, ctx)).toBe(lineName(empty, short, ctx));
  });
});
