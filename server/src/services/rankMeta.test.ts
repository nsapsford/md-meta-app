import { describe, it, expect } from 'vitest';
import { mirrorAdjustedWinRate, buildRankMeta } from './rankMeta.js';
import type { RankStatRow } from './untappedParse.js';

const row = (archetype: string, rankId: number, gf: number, gs: number, wf: number, ws: number, tier: number | null = 1): RankStatRow & { tier: number | null } =>
  ({ archetype, rankId, rank: 'x', gamesFirst: gf, gamesSecond: gs, winsFirst: wf, winsSecond: ws, tier });

describe('mirrorAdjustedWinRate', () => {
  it('matches (wr - share*50) / (1 - share) in percent terms', () => {
    // 55% raw at 10% share → (55 - 5) / 0.9 = 55.56%
    expect(mirrorAdjustedWinRate(0.55, 0.1)).toBeCloseTo(0.5556, 4);
  });
  it('leaves a 50% deck at 50% and handles degenerate shares', () => {
    expect(mirrorAdjustedWinRate(0.5, 0.3)).toBeCloseTo(0.5, 10);
    expect(mirrorAdjustedWinRate(0.6, 0)).toBe(0.6);
    expect(mirrorAdjustedWinRate(0.6, 1)).toBe(0.5);
  });
});

describe('buildRankMeta', () => {
  const rows = [
    row('Big', 7, 600, 600, 360, 300),          // 1200 games, raw 55%
    row('Small', 7, 20, 20, 15, 12),            // 40 games, raw 67.5% — low sample
    row('Big', 5, 5000, 5000, 1, 1),            // other rank: must be ignored
  ];
  const out = buildRankMeta(rows, 7);

  it('only uses the requested rank and computes shares over that rank', () => {
    expect(out.map((e) => e.deck)).toEqual(['Big', 'Small']);
    expect(out[0].play_rate).toBeCloseTo(1200 / 1240, 6);
    expect(out[1].games).toBe(40);
  });

  it('reports raw, mirror-corrected and going-first/second win rates', () => {
    const big = out[0];
    expect(big.win_rate_raw).toBeCloseTo(0.55, 6);
    expect(big.win_rate).toBeCloseTo(mirrorAdjustedWinRate(0.55, 1200 / 1240), 10);
    expect(big.win_rate_first).toBeCloseTo(0.6, 6);
    expect(big.win_rate_second).toBeCloseTo(0.5, 6);
  });

  it('flags low samples', () => {
    expect(out[0].low_sample).toBe(false);
    expect(out[1].low_sample).toBe(true);
  });

  it('returns nothing for a rank with no data', () => {
    expect(buildRankMeta(rows, 3)).toEqual([]);
  });
});
