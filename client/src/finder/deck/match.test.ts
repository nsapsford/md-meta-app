import { describe, expect, it } from 'vitest';
import cardData from '../__harness__/reference/card-data.json';
import { DECK_MANIFEST } from './manifest';
import { matchDeckFile, type DeckList } from './match';
import { loadDeck } from './registry';
import { validateDeckFile, type CardFacts, type DeckFile } from './schema';
import { compileDeck } from './compile';
import { resolveList } from '../model/finderState';

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
      // `own`: the file's own Main Deck cards, less those marked generic.
      const own = f.cards.filter((c) => !c.generic && !EXTRA.test(typeOf(c.passcodes[0])!)).flatMap((c) => c.passcodes);
      expect([...(row.own ?? [])].sort((a, b) => a - b)).toEqual([...new Set(own)].sort((a, b) => a - b));
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

  it('a list with the official passcodes (not the old tool\'s artworks) matches with none unknown', async () => {
    const real = [94145021, 23434538, 7084129, 14558127, 42141493, 46986420];
    expect(matchDeckFile(m(real))).toEqual({ fileId: 'dm-azamina', known: real.length, total: real.length, unknown: [] });
    const d = await loadDeck('dm-azamina');
    const r = validateDeckFile(d.file, d.shared);
    if (!r.ok) throw new Error('invalid');
    const res = resolveList(m(real), r.file);
    expect([res.blanks, res.unknown]).toEqual([0, []]);
    expect(Object.keys(res.main).sort()).toEqual(['ASH', 'DM', 'DROLL', 'FUWA', 'MAXX', 'ROD']);
  });

  it('knows every passcode a card lists', () => {
    // Droll & Lock Bird has two passcodes (the file lists both); the old tool's list uses the second.
    // Droll is a staple both deck files know; with one of DM Azamina's own cards (Rod), both passcodes match it.
    expect(matchDeckFile(m([94145022, 7084129]))).toEqual({ fileId: 'dm-azamina', known: 2, total: 2, unknown: [] });
    expect(matchDeckFile(m([94145021, 7084129]))?.fileId).toBe('dm-azamina');
  });

  it('a deck of shared staples and generic cards only matches no deck file', () => {
    // Ash, Droll, Maxx "C", Fuwalos, Super Poly, Purulia, Ghost Ogre, Triple Tactics Talent, and 8 cards no file knows.
    const generic = [14558127, 94145021, 23434538, 42141493, 48130397, 84192580, 59438930, 25311006];
    expect(matchDeckFile(m([...generic, 1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(matchDeckFile(m(generic))).toBeNull();
    // One Dracotail card makes it a Branded Dracotail list.
    expect(matchDeckFile(m([...generic, 7375867, 1, 2, 3, 4, 5, 6, 7]))?.fileId).toBe('branded-dracotail');
  });

  it("a Dracotail list that differs from Appendix A (six cards the file doesn't know) still matches", () => {
    // As the user's saved Dracotail deck: Appendix A less six cards, plus Phryxul, Pan, Horn, Sting, Called by the Grave, Forbidden Droplet (unknown here as 91, 92, ...).
    const appendix = [94145021, 23434538, 59438930, 14558127, 7375867, 68468459, 55273560, 95515789, 42141493, 84192580, 75003700, 73819701, 1498449, 70871153, 25451383, 25311006, 44362883, 6153210, 32548318, 48130397, 29948294, 30271097, 5431722];
    const r = matchDeckFile(m([...appendix.slice(0, 17), 91, 92, 93, 94, 95, 96]));
    expect(r).toEqual({ fileId: 'branded-dracotail', known: 17, total: 23, unknown: [91, 92, 93, 94, 95, 96] });
  });
});

describe('the Synchron list', () => {
  // The user's Synchron list (40 Main Deck cards in 24 different passcodes; 15 Extra Deck cards).
  const MAIN: [number, number][] = [
    [94145021, 2], [9742784, 1], [74644400, 1], [16449363, 1], [91215724, 1], [23434538, 1], [77202120, 1], [17201951, 1], [18711696, 3], [63977008, 1],
    [37799519, 1], [14558127, 3], [13021682, 1], [63184227, 1], [42141493, 3], [73218792, 3], [39015, 1], [70088809, 3], [67723438, 3], [43834302, 2],
    [91002901, 1], [32807846, 1], [26387390, 1], [49415281, 3],
  ];
  const EXTRA_LIST = [89194103, 42711820, 90953320, 77075360, 93125329, 73580471, 44508094, 30983281, 81020646, 7841112, 84815190, 27572350, 79519259, 63436931, 29053656];
  const list: DeckList = { main: MAIN.map(([passcode, count]) => ({ passcode, count })), extra: EXTRA_LIST.map((passcode) => ({ passcode, count: 1 })) };

  it('is 40 Main Deck cards and matches the synchron file with nothing unknown', () => {
    expect(MAIN.reduce((t, [, k]) => t + k, 0)).toBe(40);
    expect(matchDeckFile(list)).toEqual({ fileId: 'synchron', known: MAIN.length, total: MAIN.length, unknown: [] });
  });

  it('resolves every Main and Extra Deck card to the file', async () => {
    const d = await loadDeck('synchron');
    const r = validateDeckFile(d.file, d.shared);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const res = resolveList(list, r.file);
    expect([res.blanks, res.unknown]).toEqual([0, []]);
    expect(Object.values(res.main).reduce((t, k) => t + k, 0)).toBe(40);
    expect(Object.keys(res.extra).length).toBe(15);
  });

  it('a list of staples with one Synchron card is a Synchron list; Reinforcement and Emergency Teleport alone are not', () => {
    const generic = [14558127, 94145021, 23434538, 42141493];
    expect(matchDeckFile(m([...generic, 63977008]))?.fileId).toBe('synchron');
    expect(matchDeckFile(m([...generic, 32807846, 67723438]))).toBeNull();
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
