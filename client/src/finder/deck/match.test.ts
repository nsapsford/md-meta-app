import { describe, expect, it } from 'vitest';
import cardData from '../__harness__/reference/card-data.json';
import { DECK_MANIFEST } from './manifest';
import { matchDeckFile, type DeckList } from './match';
import { loadDeck } from './registry';
import { validateDeckFile, type CardFacts, type DeckFile } from './schema';
import { compileDeck } from './compile';

const m = (codes: number[]): DeckList => ({ main: codes.map((passcode) => ({ passcode, count: 1 })), extra: [] });
const EXTRA = /Fusion|Synchro|Link|XYZ/i;

describe('matchDeckFile', () => {
  it('matches at half coverage', () => {
    expect(matchDeckFile(m([1, 2, 3, 9]), [{ id: 'a', name: 'A', main: [1, 2, 3] }])).toEqual({ fileId: 'a', known: 3, total: 4, unknown: [9] });
    expect(matchDeckFile(m([1, 2, 8, 9]), [{ id: 'a', name: 'A', main: [1, 2] }])).toEqual({ fileId: 'a', known: 2, total: 4, unknown: [8, 9] });
  });
  it('refuses below half', () => {
    expect(matchDeckFile(m([1, 8, 9]), [{ id: 'a', name: 'A', main: [1, 2] }])).toBeNull();
    expect(matchDeckFile(m([]), [{ id: 'a', name: 'A', main: [1, 2] }])).toBeNull();
  });
  it('prefers the file that knows more, then the lower id', () => {
    const list = m([1, 2, 3, 4]);
    expect(matchDeckFile(list, [{ id: 'a', name: 'A', main: [1, 2] }, { id: 'b', name: 'B', main: [1, 2, 3] }])?.fileId).toBe('b');
    expect(matchDeckFile(list, [{ id: 'b', name: 'B', main: [1, 2] }, { id: 'a', name: 'A', main: [3, 4] }])?.fileId).toBe('a');
  });
  it('counts different cards, not copies', () => {
    const list: DeckList = { main: [{ passcode: 1, count: 3 }, { passcode: 9, count: 1 }], extra: [] };
    expect(matchDeckFile(list, [{ id: 'a', name: 'A', main: [1] }])).toEqual({ fileId: 'a', known: 1, total: 2, unknown: [9] });
  });
  it('ignores the Extra Deck', () => {
    const list: DeckList = { main: [{ passcode: 1, count: 1 }], extra: [{ passcode: 7, count: 1 }, { passcode: 8, count: 1 }] };
    expect(matchDeckFile(list, [{ id: 'a', name: 'A', main: [1] }])).toEqual({ fileId: 'a', known: 1, total: 1, unknown: [] });
  });

  it('the manifest matches the deck files', async () => {
    for (const row of DECK_MANIFEST) {
      const d = await loadDeck(row.id);
      const f = d.file as DeckFile;
      expect(f.id).toBe(row.id);
      expect(f.name).toBe(row.name);
      const cards = [...Object.values(d.shared).flatMap((s) => (s as DeckFile).cards), ...f.cards];
      const typeOf = (p: number) => d.facts.find((x) => x.passcode === p)?.type;
      const main = cards.filter((c) => { const t = typeOf(c.passcodes[0]); expect(t, c.id).toBeDefined(); return !EXTRA.test(t!); }).flatMap((c) => c.passcodes);
      expect([...row.main].sort((a, b) => a - b)).toEqual([...new Set(main)].sort((a, b) => a - b));
    }
  });

  it('the artifact list matches dm-azamina with nothing unknown', () => {
    const data = cardData as { pass_: number; count: number; zone: string }[];
    const list: DeckList = {
      main: data.filter((c) => c.zone === 'main').map((c) => ({ passcode: c.pass_, count: c.count })),
      extra: data.filter((c) => c.zone === 'extra').map((c) => ({ passcode: c.pass_, count: c.count })),
    };
    expect(matchDeckFile(list)).toEqual({ fileId: 'dm-azamina', known: list.main.length, total: list.main.length, unknown: [] });
  });

  it('knows every passcode a card lists', () => {
    // Droll & Lock Bird has two passcodes (the file lists both); the old tool's list uses the second.
    expect(matchDeckFile(m([94145022]))).toEqual({ fileId: 'dm-azamina', known: 1, total: 1, unknown: [] });
    expect(matchDeckFile(m([94145021]))?.fileId).toBe('dm-azamina');
  });
});

describe('loadDeck', () => {
  it('loads a deck file with its shared files, facts and the hand traps, ready to compile', async () => {
    const d = await loadDeck('dm-azamina');
    expect(Object.keys(d.shared)).toEqual(['staples']);
    expect(d.traps.traps.length).toBeGreaterThan(5);
    const r = validateDeckFile(d.file, d.shared);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(compileDeck(r.file, d.facts as CardFacts[]).ids.length).toBeGreaterThan(30);
  });
  it('refuses an unknown id', async () => {
    await expect(loadDeck('nope')).rejects.toThrow('no deck file');
  });
});
