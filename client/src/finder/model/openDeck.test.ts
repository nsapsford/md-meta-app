import { describe, expect, it } from 'vitest';
import { DECK_MANIFEST } from '../deck/manifest';
import type { LoadedDeck } from '../deck/registry';
import { errorLine, openDeck, unknownNames } from './openDeck';

const row = DECK_MANIFEST[0];
const LIST = { main: [...row.main.map((passcode) => ({ passcode, count: 1 })), { passcode: 1, count: 2 }], extra: [{ passcode: 2, count: 1 }] };

describe('opening a deck', () => {
  it('loads the matching deck file and resolves the list, unknown cards as blanks', async () => {
    const r = await openDeck(LIST);
    if (r.kind !== 'ok') throw new Error(r.kind);
    expect(r.fileId).toBe(row.id);
    expect(r.list.blanks).toBe(2);
    expect(r.list.unknown).toEqual([1, 2]);
    expect(r.catalog.size).toBe(r.file.cards.length);
    expect(r.loaded.traps.traps.length).toBeGreaterThan(0);
    expect(unknownNames(LIST, r.list, (p) => (p === 1 ? 'Card One' : undefined))).toEqual(['Card One']);
    expect(unknownNames(LIST, r.list)).toEqual(['1']);
  });
  it('knows no deck file for an unknown list', async () => {
    expect(await openDeck({ main: [{ passcode: 1, count: 3 }], extra: [] })).toEqual({ kind: 'unknown' });
  });
  it('reports every mistake of a broken deck file', async () => {
    const real = await openDeck(LIST);
    if (real.kind !== 'ok') throw new Error(real.kind);
    const broken = async (): Promise<LoadedDeck> => ({ ...real.loaded, file: { ...(real.loaded.file as object), cards: 'nope' } });
    const r = await openDeck(LIST, broken);
    if (r.kind !== 'broken') throw new Error(r.kind);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(errorLine({ card: 'X', field: 'effects', message: 'bad' })).toBe('X · effects · bad');
    expect(errorLine({ card: null, field: 'cards', message: 'bad' })).toBe('cards · bad');
  });
});
