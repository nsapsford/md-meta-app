import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildYdke, buildKonamiDeepLink, parseYdke } from './ydke';

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

describe('parseYdke', () => {
  it('decodes the reference vector into counted rows', () => {
    expect(parseYdke('ydke://o6lXBZyFNAI=!viOnAg==!7ydRAA==!')).toEqual({
      main: [{ passcode: 89631139, count: 1 }, { passcode: 36996508, count: 1 }],
      extra: [{ passcode: 44508094, count: 1 }],
      side: [{ passcode: 5318639, count: 1 }],
    });
  });

  it('groups copies, keeping first-seen order', () => {
    const url = buildYdke([1, 2, 1, 1], [], []);
    expect(parseYdke(url).main).toEqual([{ passcode: 1, count: 3 }, { passcode: 2, count: 1 }]);
  });

  it('round-trips buildYdke', () => {
    const main = [94145021, 94145021, 9742784, 39015];
    const url = buildYdke(main, [89194103], []);
    const deck = parseYdke(url);
    expect(deck.main.reduce((s, r) => s + r.count, 0)).toBe(4);
    expect(deck.extra).toEqual([{ passcode: 89194103, count: 1 }]);
    expect(deck.side).toEqual([]);
  });

  it('accepts surrounding whitespace, a missing side section and a missing trailing !', () => {
    const url = buildYdke([89631139], [44508094], []).replace(/!+$/, '');
    expect(parseYdke(`  ${url}\n`).extra).toEqual([{ passcode: 44508094, count: 1 }]);
  });

  it('rejects text without the ydke:// prefix', () => {
    expect(() => parseYdke('o6lXBQ==!!!')).toThrow(/ydke:\/\//);
  });

  it('rejects a section that is not whole passcodes', () => {
    expect(() => parseYdke('ydke://o6lX!!!')).toThrow(/main/i);
  });

  it('rejects invalid base64', () => {
    expect(() => parseYdke('ydke://$$$$!!!')).toThrow(/main/i);
  });

  it('decodes the Synchron fixture (40 main / 15 extra)', () => {
    const code = readFileSync(new URL('./__fixtures__/synchron.ydke', import.meta.url), 'utf8');
    const deck = parseYdke(code);
    const n = (rows: { count: number }[]) => rows.reduce((s, r) => s + r.count, 0);
    expect([n(deck.main), n(deck.extra), n(deck.side)]).toEqual([40, 15, 0]);
    expect(deck.main).toContainEqual({ passcode: 43834302, count: 2 }); // Synchro Fellowship
    expect(deck.main).toContainEqual({ passcode: 67723438, count: 3 }); // Emergency Teleport
  });

  it('rejects oversized sections', () => {
    expect(() => parseYdke(buildYdke(Array(61).fill(1), [], []))).toThrow(/60/);
    expect(() => parseYdke(buildYdke([], Array(16).fill(1), []))).toThrow(/15/);
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
