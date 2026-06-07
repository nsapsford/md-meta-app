import { describe, it, expect } from 'vitest';
import { parseYdk } from './deckCodecService.js';

describe('parseYdk', () => {
  it('parses main, extra, and side sections into passcode arrays', () => {
    const ydk = [
      '#created by MD Meta',
      '#main',
      '10497636',
      '10497636',
      '#extra',
      '1561110',
      '!side',
      '14558127',
      '',
    ].join('\n');

    expect(parseYdk(ydk)).toEqual({
      main: [10497636, 10497636],
      extra: [1561110],
      side: [14558127],
    });
  });

  it('tolerates a missing side section', () => {
    const ydk = '#main\n10497636\n#extra\n';
    expect(parseYdk(ydk)).toEqual({ main: [10497636], extra: [], side: [] });
  });

  it('ignores blank lines and comment lines', () => {
    const ydk = '#main\n\n10497636\n# a comment\n';
    expect(parseYdk(ydk)).toEqual({ main: [10497636], extra: [], side: [] });
  });

  it('throws with line context on a non-numeric token', () => {
    const ydk = '#main\n10497636\nnot-a-passcode\n';
    expect(() => parseYdk(ydk)).toThrow(/line 3/i);
  });
});
