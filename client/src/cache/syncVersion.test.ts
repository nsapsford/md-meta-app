import { describe, it, expect } from 'vitest';
import type { SyncRecord } from '../api/sync';
import { computeServerVersion } from './syncVersion';
import { isUpdateAvailable } from '../utils/syncFreshness';

const rec = (source: SyncRecord['source'], synced_at: number): SyncRecord => ({
  source,
  status: 'success',
  detail: null,
  synced_at,
});

describe('computeServerVersion', () => {
  it('is order-independent', () => {
    const a = [rec('ygoprodeck', 100), rec('untapped', 50)];
    const b = [rec('untapped', 50), rec('ygoprodeck', 100)];
    expect(computeServerVersion(a)).toBe(computeServerVersion(b));
  });

  it('changes when any source re-syncs', () => {
    const before = [rec('ygoprodeck', 100), rec('untapped', 50)];
    const after = [rec('ygoprodeck', 100), rec('untapped', 60)];
    expect(computeServerVersion(after)).not.toBe(computeServerVersion(before));
  });

  it('treats no records as version 0', () => {
    expect(computeServerVersion([])).toBe(0);
  });
});

describe('isUpdateAvailable', () => {
  it('returns false on the first run (no stored baseline)', () => {
    expect(isUpdateAvailable(150, null)).toBe(false);
  });

  it('returns false when versions match', () => {
    expect(isUpdateAvailable(150, 150)).toBe(false);
  });

  it('returns true when the server version differs', () => {
    expect(isUpdateAvailable(160, 150)).toBe(true);
  });
});
