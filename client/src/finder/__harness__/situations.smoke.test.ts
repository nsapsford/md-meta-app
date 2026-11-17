import { describe, it, expect } from 'vitest';
import { loadReference } from './loadReference';
import { buildSituations } from './situations';

describe('situation set', () => {
  it('builds the same 360 situations every time', () => {
    const { engine, cards } = loadReference();
    const a = buildSituations(engine, cards), b = buildSituations(engine, cards);
    expect(a).toHaveLength(360);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.filter((s) => s.group === 'first')).toHaveLength(200);
    expect(a.filter((s) => s.group === 'second')).toHaveLength(65);
    expect(a.filter((s) => s.group === 'trap')).toHaveLength(54);
    expect(a.filter((s) => s.group === 'draw')).toHaveLength(21);
    expect(a.filter((s) => s.group === 'mid')).toHaveLength(20);
    expect(new Set(a.map((s) => s.id)).size).toBe(360);
    expect(a[0].id).toBe('first-001');
    for (const s of a) expect(Object.values(s.cfg.hand).reduce((t, n) => t + n, 0)).toBe(s.group === 'second' ? 6 : 5);
    for (const s of a.filter((x) => x.group === 'mid')) expect(s.cfg.base?.length).toBeGreaterThan(0);
  });
});
