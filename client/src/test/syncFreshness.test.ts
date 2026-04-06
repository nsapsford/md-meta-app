import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeFreshness } from '../utils/syncFreshness';

const NOW = 1700000000;

afterEach(() => vi.restoreAllMocks());

function makeRecord(overrides: Partial<{ status: string; synced_at: number }>) {
  return { status: 'success', synced_at: NOW - 60, ...overrides };
}

describe('computeFreshness', () => {
  it('returns fresh when synced 1 minute ago', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ synced_at: NOW - 60 }))).toBe('fresh');
  });

  it('returns stale when synced 3 hours ago', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ synced_at: NOW - 3 * 3600 }))).toBe('stale');
  });

  it('returns outdated when synced 13 hours ago', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ synced_at: NOW - 13 * 3600 }))).toBe('outdated');
  });

  it('returns failed regardless of age when status is failed', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    expect(computeFreshness(makeRecord({ status: 'failed', synced_at: NOW - 60 }))).toBe('failed');
  });
});
