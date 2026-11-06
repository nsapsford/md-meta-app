import { describe, it, expect, vi } from 'vitest';
import { memoize, invalidateDerived } from './memo.js';

describe('memoize', () => {
  it('shares one computation between concurrent callers', async () => {
    const compute = vi.fn(async () => 42);
    const [a, b] = await Promise.all([memoize('t:a', compute), memoize('t:a', compute)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes after invalidation by prefix', async () => {
    const compute = vi.fn(async () => 'x');
    await memoize('t:b', compute);
    invalidateDerived('t:');
    await memoize('t:b', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    let calls = 0;
    const compute = async () => { calls++; if (calls === 1) throw new Error('boom'); return 'ok'; };
    await expect(memoize('t:c', compute)).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 0));
    await expect(memoize('t:c', compute)).resolves.toBe('ok');
  });

  it('expires entries after the TTL', async () => {
    const compute = vi.fn(async () => 1);
    await memoize('t:d', compute, -1);
    await memoize('t:d', compute, -1);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
