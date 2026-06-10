import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, issueToken, verifyToken } from './authService.js';

describe('password hashing', () => {
  it('verifies the original password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces unique salts per hash', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('anything', 'not-a-valid-hash')).toBe(false);
  });
});

describe('auth tokens', () => {
  it('round-trips uid and email', () => {
    const token = issueToken(42, 'duelist@example.com');
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe(42);
    expect(payload!.email).toBe('duelist@example.com');
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a tampered payload', () => {
    const token = issueToken(42, 'duelist@example.com');
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 1, email: 'admin@example.com', exp: 9999999999 }))
      .toString('base64url');
    expect(verifyToken(`${forged}.${signature}`)).toBeNull();
  });

  it('rejects garbage tokens', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('abc')).toBeNull();
    expect(verifyToken('abc.def')).toBeNull();
  });
});
