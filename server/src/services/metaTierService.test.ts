import { describe, it, expect } from 'vitest';
import fixture from './__fixtures__/untapped-ranks.json' with { type: 'json' };
import {
  assignTier, adjustedCounts, computeMeta, computeMetaAdjusted, type RankRow,
} from './metaTierService.js';

type Fx = { decks: Record<string, { siteAdjusted: number | null; ranks: Record<string, number[]> }> };
const fx = fixture as unknown as Fx;

const rows: RankRow[] = Object.entries(fx.decks).flatMap(([deck, d]) =>
  Object.entries(d.ranks).map(([rank, [g1, g2, w1, w2]]) => ({
    deck, rank: Number(rank), games: g1 + g2, wins: w1 + w2,
  }))
);

describe('assignTier', () => {
  it('needs presence and a proven edge for tiers 1 and 2', () => {
    expect(assignTier(5, 2.2)).toBe(1);
    expect(assignTier(5, 1.5)).toBe(1);
    expect(assignTier(5, 0.8)).toBe(2);
    expect(assignTier(5, 0.01)).toBe(2);
    expect(assignTier(5, -0.4)).toBe(3);
  });
  it('does not tier a strong-looking deck nobody plays', () => {
    expect(assignTier(0.6, 6)).toBeNull();
    expect(assignTier(1.2, 6)).toBe(1);
    expect(assignTier(1.2, -1)).toBeNull(); // under the Tier 3 presence bar
    expect(assignTier(1.5, -1)).toBe(3);
  });
});

describe('adjustedCounts', () => {
  it("reproduces Untapped's displayed Bronze→Master win rates", () => {
    for (const [deck, d] of Object.entries(fx.decks)) {
      if (d.siteAdjusted == null) continue; // pooled "rest of field" row
      const per = new Map<number, { games: number; wins: number }>();
      for (const [rank, [g1, g2, w1, w2]] of Object.entries(d.ranks)) {
        per.set(Number(rank), { games: g1 + g2, wins: w1 + w2 });
      }
      const a = adjustedCounts(per);
      expect(Math.round((a.wins / a.games) * 1000) / 10, deck).toBeCloseTo(d.siteAdjusted, 0);
      expect(Math.abs((a.wins / a.games) * 100 - d.siteAdjusted), deck).toBeLessThan(0.1);
    }
  });

  it('is zero for a deck with no games', () => {
    expect(adjustedCounts(new Map())).toEqual({ games: 0, wins: 0 });
  });
});

describe('computeMeta (Diamond + Master)', () => {
  const r = computeMeta(rows);
  const by = new Map(r.entries.map((e) => [e.deck, e]));

  it('ranks the decks that are both common and clearly above average as Tier 1', () => {
    for (const d of ['Dracotail', 'Branded', 'Elfnote']) expect(by.get(d)?.tier, d).toBe(1);
  });

  it('does not tier decks whose edge is indistinguishable from average', () => {
    for (const d of ['Artmage', 'Dogmatika', 'Power Patron', 'Tearlaments']) {
      const t = by.get(d)?.tier ?? null;
      expect(t === null || t === 3, d).toBe(true);
    }
  });

  it('shares sum to at most 100 and edges are measured against the pool average', () => {
    const total = r.entries.reduce((n, e) => n + e.share, 0);
    expect(total).toBeGreaterThan(50);
    expect(total).toBeLessThanOrEqual(100.0001);
    expect(r.baseline).toBeGreaterThan(50);
    expect(r.baseline).toBeLessThan(60);
  });

  it('floor is always below edge', () => {
    for (const e of r.entries) expect(e.floor).toBeLessThan(e.edge);
  });

  it('a single rank only uses that rank', () => {
    const master = computeMeta(rows, [7]);
    const both = computeMeta(rows, [6, 7]);
    const m = master.entries.find((e) => e.deck === 'Branded')!;
    const b = both.entries.find((e) => e.deck === 'Branded')!;
    expect(m.games).toBeLessThan(b.games);
  });
});

describe('computeMetaAdjusted (all ranks)', () => {
  it('matches the site ordering at the top', () => {
    const r = computeMetaAdjusted(rows);
    const order = [...r.entries].sort((a, b) => b.winRate - a.winRate).map((e) => e.deck);
    expect(order.slice(0, 2)).toEqual(['Branded', 'Dracotail']);
  });
});
