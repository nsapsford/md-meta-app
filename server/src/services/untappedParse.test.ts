import { describe, it, expect } from 'vitest';
import { parseRankStats, rankIdFromName, RANK_NAMES, type ArchetypeStats, type ManifestEntry } from './untappedParse.js';
import * as untappedService from './untappedService.js';

// Trimmed copy of a real `archetypes_by_rank_v3` response (2026-11-14). Note the
// manifest ids 2..7 are archetypes AND the stats keys "2".."7" are rank buckets —
// exactly the collision that used to make rank buckets look like opponents.
const stats: Record<string, ArchetypeStats> = {
  '1': {
    ALL: [6852, 6317, 4443, 2859],
    '2': [158, 148, 101, 91], '3': [461, 448, 314, 245], '4': [1248, 1028, 832, 562],
    '5': [2215, 1973, 1431, 884], '6': [1669, 1570, 1069, 653], '7': [1101, 1150, 696, 424],
    tier: 2,
  },
  '3': {
    ALL: [454, 406, 265, 207],
    '2': [66, 64, 43, 41], '3': [95, 92, 63, 46], '4': [111, 91, 62, 41],
    '5': [152, 133, 79, 68], '6': [30, 26, 18, 11], '7': [0, 0, 0, 0],
    tier: null,
  },
  '5': {
    ALL: [900, 800, 500, 400],
    '2': [10, 10, 5, 5], '3': [10, 10, 5, 5], '4': [10, 10, 5, 5],
    '5': [10, 10, 5, 5], '6': [10, 10, 5, 5], '7': [10, 10, 5, 5],
    tier: 1,
  },
};
const mk = (name: string): ManifestEntry => ({ arch_name: name, type: 1, type_name: 'ARCHETYPE' });
const manifest: Record<string, ManifestEntry> = {
  '1': mk('Dogmatika'), '2': mk('Bystial'), '3': mk('Spright'), '4': mk('Tearlaments'),
  '5': mk('Bystial Two'), '6': mk('Nobody'), '7': mk('Swordsoul'),
};

describe('parseRankStats', () => {
  const rows = parseRankStats(stats, manifest);

  it('emits one row per archetype × rank, owned by the archetype the entry belongs to', () => {
    const dogmatika = rows.filter((r) => r.archetype === 'Dogmatika');
    expect(dogmatika.map((r) => r.rank).sort()).toEqual(
      ['all', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'].sort()
    );
  });

  it('never treats a rank bucket as an opponent archetype', () => {
    // Bucket ids 2/4/7 collide with Bystial/Tearlaments/Swordsoul in the manifest;
    // none of those names may appear as anything but the owner of their own entry.
    const archetypes = new Set(rows.map((r) => r.archetype));
    expect(archetypes).toEqual(new Set(['Dogmatika', 'Spright', 'Bystial Two']));
    for (const r of rows) expect(r).not.toHaveProperty('deckB');
    // 3 archetypes × (ALL + 6 buckets), minus Spright's empty master bucket
    expect(rows).toHaveLength(3 * 7 - 1);
  });

  it('maps bucket keys to rank names and keeps first/second counts in order', () => {
    const master = rows.find((r) => r.archetype === 'Dogmatika' && r.rank === 'master')!;
    expect(master).toMatchObject({ rankId: 7, gamesFirst: 1101, gamesSecond: 1150, winsFirst: 696, winsSecond: 424 });
    const all = rows.find((r) => r.archetype === 'Dogmatika' && r.rankId === 0)!;
    expect(all.rank).toBe('all');
  });

  it('skips empty buckets and ignores unknown keys instead of inventing rows', () => {
    expect(rows.find((r) => r.archetype === 'Spright' && r.rank === 'master')).toBeUndefined();
    const withJunk = parseRankStats({ '1': { ...stats['1'], '99': [1, 1, 1, 1], extra: 'x' } }, manifest);
    expect(withJunk.some((r) => r.rankId === 99)).toBe(false);
    expect(withJunk).toHaveLength(7);
  });
});

describe('untapped service API surface', () => {
  it('no longer exposes rank-bucket-derived matchup pairings', () => {
    expect('getMatchupPairings' in untappedService).toBe(false);
    expect(typeof untappedService.getRankStats).toBe('function');
  });
});

describe('rank names', () => {
  it('round-trips names and ids', () => {
    expect(rankIdFromName('Master')).toBe(7);
    expect(rankIdFromName('all')).toBe(0);
    expect(rankIdFromName('nope')).toBeNull();
    expect(RANK_NAMES[7]).toBe('master');
  });
});
