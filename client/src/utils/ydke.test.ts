import { describe, it, expect } from 'vitest';
import { buildYdke } from './ydke';

describe('buildYdke', () => {
  it('encodes passcodes to the canonical ydke:// URL', () => {
    // Reference vector from ProjectIgnis/ydke.js
    const url = buildYdke([89631139, 36996508], [44508094], [5318639]);
    expect(url).toBe('ydke://o6lXBZyFNAI=!viOnAg==!7ydRAA==!');
  });

  it('encodes an empty deck as three empty sections', () => {
    expect(buildYdke([], [], [])).toBe('ydke://!!!');
  });

  it('preserves duplicate passcodes (one entry per copy)', () => {
    // Two copies of 89631139 -> 8 bytes -> 12 base64 chars
    const url = buildYdke([89631139, 89631139], [], []);
    expect(url).toBe('ydke://o6lXBaOpVwU=!!!');
  });
});
