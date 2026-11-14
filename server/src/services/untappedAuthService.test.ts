import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('./cacheService.js', () => ({
  getCached: vi.fn(async (k: string) => store.get(k) ?? null),
  setCache: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
}));

const post = vi.fn();
vi.mock('axios', () => ({ default: { post: (...a: unknown[]) => post(...a) } }));

async function load() {
  vi.resetModules();
  return import('./untappedAuthService.js');
}

describe('untappedAuthService', () => {
  beforeEach(() => {
    store.clear();
    post.mockReset();
    delete process.env.UNTAPPED_REFRESH_TOKEN;
    delete process.env.UNTAPPED_ACCESS_TOKEN;
  });

  it('refreshes from UNTAPPED_REFRESH_TOKEN and persists the rotated refresh token', async () => {
    process.env.UNTAPPED_REFRESH_TOKEN = 'env-refresh';
    post.mockResolvedValueOnce({ data: { access_token: 'a1', refresh_token: 'r2', expires_in: 3600 } });
    const auth = await load();

    expect(await auth.getValidAccessToken()).toBe('a1');
    expect(String(post.mock.calls[0][1])).toContain('refresh_token=env-refresh');
    expect(store.get('untapped:refresh-token')).toEqual({ token: 'r2' });
  });

  it('prefers the persisted rotated token over the env var after a restart', async () => {
    process.env.UNTAPPED_REFRESH_TOKEN = 'env-refresh';
    store.set('untapped:refresh-token', { token: 'r2' });
    post.mockResolvedValueOnce({ data: { access_token: 'a2', expires_in: 3600 } });
    const auth = await load();

    expect(await auth.getValidAccessToken()).toBe('a2');
    expect(String(post.mock.calls[0][1])).toContain('refresh_token=r2');
    // no new refresh_token in the response: the one we used is kept
    expect(store.get('untapped:refresh-token')).toEqual({ token: 'r2' });
  });

  it('reuses the cached access token until it nears expiry, then refreshes', async () => {
    process.env.UNTAPPED_REFRESH_TOKEN = 'env-refresh';
    post
      .mockResolvedValueOnce({ data: { access_token: 'a1', refresh_token: 'r2', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { access_token: 'a3', refresh_token: 'r3', expires_in: 3600 } });
    const auth = await load();

    expect(await auth.getValidAccessToken()).toBe('a1');
    expect(await auth.getValidAccessToken()).toBe('a1');
    expect(post).toHaveBeenCalledTimes(1);

    auth.invalidateToken(); // e.g. after a 401
    expect(await auth.getValidAccessToken()).toBe('a3');
    expect(String(post.mock.calls[1][1])).toContain('refresh_token=r2');
  });

  it('falls back to UNTAPPED_ACCESS_TOKEN when refreshing fails', async () => {
    process.env.UNTAPPED_REFRESH_TOKEN = 'dead';
    process.env.UNTAPPED_ACCESS_TOKEN = 'static-access';
    post.mockRejectedValueOnce(new Error('invalid_grant'));
    const auth = await load();

    expect(await auth.getValidAccessToken()).toBe('static-access');
  });
});
