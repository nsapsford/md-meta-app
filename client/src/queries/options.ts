import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import {
  getTierList, getDecks, getDeckProfile, getFeaturedDecks, getMetaTrends, getMetaMovers, getBanList, scoreDeck, validateDeck,
} from '../api/meta';
import {
  getMatchupMatrix, getEcosystemAnalysis, getLadderEv, getMatchupAdvisor,
} from '../api/matchups';
import { searchCards, getArchetypes } from '../api/cards';
import type { Card } from '../types/card';
import { getSyncStatus } from '../api/sync';
import { getSavedDecks } from '../api/deckIO';
import { getGames, getSpread } from '../api/personalGames';
import { getOpponentDossier, getPilotDossier, type DossierDepth } from '../api/dossiers';
import { getLines, getDrillReviews, resolveCards } from '../api/lines';

// One place for every server read: its cache key, fetcher, freshness and
// persistence. Components call useQuery(xxxQuery(...)), so two components
// asking for the same data share one request and one cache entry.
//
// Key prefixes are what invalidation targets:
//   ['personal', ...]  anything derived from logged games
//   ['matchups', ...]  matchup analytics (some blend personal games)
//   ['saved-decks']    the user's deck list
//   ['lines', deckId]  Line Trainer lines (and, beneath it, their drill reviews)
//
// Shared meta data does not pass the AbortSignal through: if the user leaves a
// page mid-request, the response still lands in the cache for next time.
// Parameterised queries that the user can supersede (search, matrix toggles)
// do pass it, so an outdated request is cancelled instead of racing.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const PUBLIC = { persist: 'public' } as const;
const USER = { persist: 'user' } as const;

export type FeaturedDeck = Awaited<ReturnType<typeof getFeaturedDecks>>[number];

// ── Shared meta data ──

export const syncStatusQuery = () =>
  queryOptions({
    queryKey: ['sync-status'],
    queryFn: getSyncStatus,
    staleTime: MINUTE,
    refetchInterval: 5 * MINUTE,
    meta: PUBLIC,
  });

export const tierListQuery = (rank?: number | null) =>
  queryOptions({
    queryKey: rank != null ? ['tier-list', 'rank', rank] : ['tier-list'],
    queryFn: () => getTierList(rank),
    meta: PUBLIC,
  });

export const featuredDecksQuery = () =>
  queryOptions({
    queryKey: ['decks', 'featured'],
    queryFn: async () => {
      const res = await getFeaturedDecks();
      return Array.isArray(res) ? res : [];
    },
    meta: PUBLIC,
  });

export const decksQuery = () =>
  queryOptions({ queryKey: ['decks', 'list'], queryFn: () => getDecks(), meta: PUBLIC });

export const deckProfileQuery = (name: string) =>
  queryOptions({
    queryKey: ['decks', 'profile', name],
    queryFn: () => getDeckProfile(name),
    meta: PUBLIC,
  });

export const metaTrendsQuery = () =>
  queryOptions({ queryKey: ['meta-trends'], queryFn: getMetaTrends, meta: PUBLIC });

export const metaMoversQuery = (window: 7 | 14) =>
  queryOptions({
    queryKey: ['meta-trends', 'movers', window],
    queryFn: () => getMetaMovers(window),
    placeholderData: keepPreviousData,
    meta: PUBLIC,
  });

export const banListQuery = () =>
  queryOptions({ queryKey: ['ban-list'], queryFn: getBanList, staleTime: HOUR, meta: PUBLIC });

export const archetypesQuery = () =>
  queryOptions({ queryKey: ['cards', 'archetypes'], queryFn: getArchetypes, staleTime: 24 * HOUR, meta: PUBLIC });

// ── Matchup analytics ──

export type MatrixSource = 'blended' | 'untapped' | 'tournament';

export const matchupMatrixQuery = (source: MatrixSource, infer: boolean, includePersonal: boolean) =>
  queryOptions({
    queryKey: ['matchups', 'matrix', { source, infer, includePersonal }],
    queryFn: ({ signal }) => getMatchupMatrix(source, infer, signal, includePersonal),
    // Toggling a filter keeps the previous matrix on screen until the new one lands.
    placeholderData: keepPreviousData,
    meta: PUBLIC,
  });

export const ecosystemQuery = () =>
  queryOptions({
    queryKey: ['matchups', 'ecosystem'],
    queryFn: () => getEcosystemAnalysis(),
    meta: PUBLIC,
  });

export const ladderEvQuery = (includePersonal: boolean, reinforce = false) =>
  queryOptions({
    queryKey: ['matchups', 'ladder-ev', { includePersonal, reinforce }],
    queryFn: () => getLadderEv(undefined, includePersonal, { reinforce }),
    meta: PUBLIC,
  });

export const advisorQuery = (deck: string, includePersonal: boolean) =>
  queryOptions({
    queryKey: ['matchups', 'advisor', deck, { includePersonal }],
    queryFn: ({ signal }) => getMatchupAdvisor(deck, signal, includePersonal),
    enabled: deck !== '',
    placeholderData: keepPreviousData,
    meta: PUBLIC,
  });

// ── Cards ──

export const CARD_PAGE_SIZE = 60; // divisible by every grid column count (2/3/4/6)

export interface CardFilters {
  q: string;
  type: string;
  attribute: string;
  archetype: string;
  sort: string;
}

export const cardSearchInfiniteQuery = (filters: CardFilters) =>
  infiniteQueryOptions({
    queryKey: ['cards', 'search', filters],
    queryFn: ({ pageParam, signal }) => {
      const params: Record<string, string> = { page: String(pageParam), limit: String(CARD_PAGE_SIZE), sort: filters.sort };
      if (filters.q) params.q = filters.q;
      if (filters.type) params.type = filters.type;
      if (filters.attribute) params.attribute = filters.attribute;
      if (filters.archetype) params.archetype = filters.archetype;
      return searchCards(params, signal);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    // Pages of search results go stale quickly and add up — memory only.
    gcTime: 5 * MINUTE,
  });

export const cardQuickSearchQuery = (q: string) =>
  queryOptions({
    queryKey: ['cards', 'quick-search', q],
    queryFn: ({ signal }): Promise<Card[]> => searchCards({ q, limit: '20' }, signal).then((r) => r.cards),
    enabled: q !== '',
    placeholderData: keepPreviousData,
    gcTime: 5 * MINUTE,
  });

// ── Deck builder ──

export const deckScoreQuery = (main: string[], extra: string[]) =>
  queryOptions({
    queryKey: ['deck-builder', 'score', main, extra],
    queryFn: async () => {
      const [score, validation] = await Promise.all([scoreDeck(main, extra), validateDeck(main, extra, [])]);
      return { score, validation };
    },
    enabled: main.length > 0,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 5 * MINUTE,
  });

// ── The user's own data ──

export const savedDecksQuery = () =>
  queryOptions({ queryKey: ['saved-decks'], queryFn: getSavedDecks, meta: USER });

export const personalGamesQuery = (params: { deck?: string; limit?: number }) =>
  queryOptions({
    queryKey: ['personal', 'games', params],
    queryFn: () => getGames(params),
    meta: USER,
  });

export const personalSpreadQuery = (params: { deck?: string; days?: number } = {}) =>
  queryOptions({
    queryKey: ['personal', 'spread', params],
    queryFn: () => getSpread(params),
    meta: USER,
  });

export const opponentDossierQuery = (archetype: string, depth: DossierDepth) =>
  queryOptions({
    queryKey: ['dossier', 'opponent', archetype, depth],
    queryFn: () => getOpponentDossier(archetype, depth),
    meta: USER,
  });

export const pilotDossierQuery = (deckId: number, depth: DossierDepth) =>
  queryOptions({
    queryKey: ['dossier', 'pilot', deckId, depth],
    queryFn: () => getPilotDossier(deckId, depth),
    meta: USER,
  });

// ── Line Trainer ──

export const comboLinesQuery = (deckId: number) =>
  queryOptions({
    queryKey: ['lines', deckId],
    queryFn: () => getLines(deckId),
    meta: USER,
  });

// Nested under ['lines', deckId] so invalidating a deck's lines (e.g. after a
// delete, which also drops drill history) refreshes its reviews too.
export const drillReviewsQuery = (deckId: number) =>
  queryOptions({
    queryKey: ['lines', deckId, 'reviews'],
    queryFn: () => getDrillReviews(deckId),
    meta: USER,
  });

/** Names and images for a set of passcodes (a saved deck's cards). Card data barely changes. */
export const resolvedCardsQuery = (passcodes: number[]) =>
  queryOptions({
    queryKey: ['cards', 'resolve', [...new Set(passcodes)].sort((a, b) => a - b)],
    queryFn: () => resolveCards([...new Set(passcodes)]),
    enabled: passcodes.length > 0,
    staleTime: 24 * HOUR,
    meta: PUBLIC,
  });
