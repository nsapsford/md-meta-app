import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseYdke } from './ydke';
import { matchDeckFile } from '../finder/deck/match';

// The imported Synchron list (My Decks) must be recognised by the Synchron Finder deck file.
describe('Synchron YDKE fixture', () => {
  it('opens the Synchron deck file in the Finder', () => {
    const deck = parseYdke(readFileSync(new URL('./__fixtures__/synchron.ydke', import.meta.url), 'utf8'));
    const match = matchDeckFile({ main: deck.main, extra: deck.extra });
    expect(match).not.toBeNull();
    expect(JSON.stringify(match)).toContain('synchron');
  });
});
