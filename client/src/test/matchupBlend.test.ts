import { describe, it, expect } from 'vitest';
import { blendMatchupRates } from '../utils/matchupBlend';

describe('blendMatchupRates', () => {
  it('returns 0.5 with low confidence when no data', () => {
    const result = blendMatchupRates(null, null);
    expect(result.rate).toBe(0.5);
    expect(result.confidence).toBe('low');
  });

  it('returns untapped rate alone when no tournament data', () => {
    const result = blendMatchupRates({ rate: 0.6, n: 200 }, null);
    expect(result.rate).toBe(0.6);
    expect(result.confidence).toBe('high');
  });

  it('returns medium confidence for small untapped sample', () => {
    const result = blendMatchupRates({ rate: 0.6, n: 50 }, null);
    expect(result.rate).toBe(0.6);
    expect(result.confidence).toBe('medium');
  });

  it('returns tournament rate alone when no untapped data', () => {
    const result = blendMatchupRates(null, { rate: 0.55, n: 40 });
    expect(result.rate).toBe(0.55);
    expect(result.confidence).toBe('medium');
  });

  it('marks low confidence for small tournament sample', () => {
    const result = blendMatchupRates(null, { rate: 0.55, n: 10 });
    expect(result.confidence).toBe('low');
  });

  it('blends 70/30 when both sources present', () => {
    const result = blendMatchupRates({ rate: 0.6, n: 200 }, { rate: 0.4, n: 50 });
    expect(result.rate).toBeCloseTo(0.54); // 0.6*0.7 + 0.4*0.3
    expect(result.confidence).toBe('high');
  });
});
