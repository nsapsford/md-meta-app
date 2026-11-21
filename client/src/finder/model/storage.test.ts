import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAPSHOT } from './finderState';
import { createFinderStorage, type RememberedList } from './storage';

function memory() {
  const m = new Map<string, string>();
  return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
}
const R: RememberedList = { name: 'My deck', list: { main: [{ passcode: 1, count: 3 }], extra: [] }, savedAt: 123 };

describe('finder storage', () => {
  it('saves and loads the setup per deck', () => {
    const { m, store } = memory();
    const s = createFinderStorage(store);
    s.saveState(4, { ...DEFAULT_SNAPSHOT, hand: ['X'] });
    expect([...m.keys()]).toEqual(['finder_state_4']);
    expect(s.loadState(4)).toEqual({ ...DEFAULT_SNAPSHOT, hand: ['X'] });
    expect(s.loadState(5)).toBeNull();
  });

  it('remembers a list per deck and survives a throwing store', () => {
    const { m, store } = memory();
    const s = createFinderStorage(store);
    s.remember(4, R);
    expect(m.has('finder_list_4')).toBe(true);
    expect(s.recall(4)).toEqual(R);
    expect(s.recall(9)).toBeNull();
    m.set('finder_list_5', '{"name":"x","list":{"main":"no"}}');
    m.set('finder_list_6', 'not json');
    expect([s.recall(5), s.recall(6)]).toEqual([null, null]);
    s.forget(4);
    expect(s.recall(4)).toBeNull();

    const boom = () => { throw new Error('quota'); };
    const bad = createFinderStorage({ getItem: boom, setItem: boom, removeItem: boom });
    expect(() => { bad.remember(1, R); bad.saveState(1, DEFAULT_SNAPSHOT); bad.forget(1); }).not.toThrow();
    expect([bad.recall(1), bad.loadState(1)]).toEqual([null, null]);
  });

  it('works without any store', () => {
    const s = createFinderStorage(null);
    s.remember(1, R);
    expect(s.recall(1)).toBeNull();
  });
});
