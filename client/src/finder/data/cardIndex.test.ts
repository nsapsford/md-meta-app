import { describe, expect, it } from 'vitest';
import { createIndexLoader, loadCardIndex, parseCardIndex, searchIndex } from './cardIndex';

describe('card index', () => {
  it('parses the shipped file', async () => {
    const ix = await loadCardIndex();
    expect(ix.all.length).toBeGreaterThan(12000);
    const dm = ix.by.get('dark magician');
    expect([dm?.mon, dm?.atk, dm?.def]).toEqual([true, 2500, 2100]);
  });

  it('is loaded once', async () => {
    expect(await loadCardIndex()).toBe(await loadCardIndex());
  });

  it('does not keep a failed load: the next call tries again', async () => {
    const text = ['{"attrs":[],"races":[],"intrs":[]}', '===', ['X', 1, 2, 0, 0, 0, 0].join('\t'), '===', ''].join('\n');
    let calls = 0;
    const load = createIndexLoader(() => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(text)));
    await expect(load()).rejects.toThrow('offline');
    const ix = await load();
    expect(ix.all.map((c) => c.name)).toEqual(['X']);
    expect(await load()).toBe(ix);
    expect(calls).toBe(2);
  });

  it('searches by name', async () => {
    const ix = await loadCardIndex();
    expect(searchIndex(ix, 'baronne', 5)[0].name).toBe('Baronne de Fleur');
    expect(searchIndex(ix, 'zzzz', 5)).toEqual([]);
    expect(searchIndex(ix, 'dragon', 5)).toHaveLength(5);
  });

  it('reads both sections and maps the old interruption word', () => {
    const text = '{"attrs":["?","DARK"],"races":["Fiend"],"intrs":["","imperm","negST"]}\n===\nA Mon\t100\t200\t1\t0\t3\t1\n===\nA Trap\t2\tT\nA Spell\t0\tS';
    const ix = parseCardIndex(text);
    expect(ix.all).toEqual([
      { name: 'A Mon', mon: true, atk: 100, def: 200, attr: 'DARK', race: 'Fiend', kind: 'xyz', intr: 'negFieldMon' },
      { name: 'A Trap', mon: false, intr: 'negST', st: 'T' },
      { name: 'A Spell', mon: false, intr: '', st: 'S' },
    ]);
    expect(parseCardIndex('junk').all).toEqual([]);
  });
});
