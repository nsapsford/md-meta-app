import { describe, it, expect } from 'vitest';
import { buildYdke, buildKonamiDeepLink } from './ydke';

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

describe('buildKonamiDeepLink', () => {
  it('embeds the URL-encoded YDKE payload (scheme stripped) in a #storm-access hash', () => {
    const url = buildKonamiDeepLink([89631139, 36996508], [44508094], [5318639]);
    expect(url).toBe(
      'https://www.db.yugioh-card.com/yugiohdb/member_deck.action?request_locale=en' +
        '#storm-access=' + encodeURIComponent('o6lXBZyFNAI=!viOnAg==!7ydRAA==!'),
    );
  });

  it('percent-encodes base64 padding so the hash round-trips through decodeURIComponent', () => {
    const url = buildKonamiDeepLink([89631139], [], []);
    const hash = url.split('#storm-access=')[1];
    expect(hash).not.toContain('=');
    expect(decodeURIComponent(hash)).toBe('o6lXBQ==!!!');
  });
});
