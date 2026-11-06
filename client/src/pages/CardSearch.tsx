import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Card } from '../types/card';
import { useDebounce } from '../hooks/useDebounce';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SearchInput from '../components/common/SearchInput';
import CardImage from '../components/common/CardImage';
import NegateImpact from '../components/common/NegateImpact';
import ErrorBanner from '../components/common/ErrorBanner';
import { archetypesQuery, cardSearchInfiniteQuery } from '../queries/options';
import { useFirstContent } from '../launch/firstContent';

const CARD_TYPES = ['Effect Monster', 'Normal Monster', 'Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster', 'Ritual Monster', 'Spell Card', 'Trap Card'];
const ATTRIBUTES = ['DARK', 'LIGHT', 'WATER', 'FIRE', 'EARTH', 'WIND', 'DIVINE'];

const selectClass = "select-field";

function negateColorClass(value: number): string {
  if (value > 8) return 'text-md-red border-md-red/20 bg-md-red/10';
  if (value > 4) return 'text-md-orange border-md-orange/20 bg-md-orange/10';
  return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10';
}

function banClass(status: string): string {
  if (status === 'Banned') return 'bg-md-red/10 text-md-red border border-md-red/20';
  if (status === 'Limited') return 'bg-md-orange/10 text-md-orange border border-md-orange/20';
  return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
}

function rarityClass(rarity: string): string {
  if (rarity === 'UR') return 'bg-rarity-ur/10 text-rarity-ur border border-rarity-ur/20';
  if (rarity === 'SR') return 'bg-rarity-sr/10 text-rarity-sr border border-rarity-sr/20';
  return 'bg-rarity-r/10 text-rarity-r border border-rarity-r/20';
}

// ── Responsive column count (matches the old grid-cols-2/3/4/6 breakpoints) ──

const COLUMN_BREAKPOINTS: Array<[string, number]> = [
  ['(min-width: 1024px)', 6],
  ['(min-width: 768px)', 4],
  ['(min-width: 640px)', 3],
];
const mqls = typeof window !== 'undefined' ? COLUMN_BREAKPOINTS.map(([q, n]) => [window.matchMedia(q), n] as const) : [];
const subscribeColumns = (cb: () => void) => {
  mqls.forEach(([m]) => m.addEventListener('change', cb));
  return () => mqls.forEach(([m]) => m.removeEventListener('change', cb));
};
const getColumns = () => mqls.find(([m]) => m.matches)?.[1] ?? 2;
function useColumns() { return useSyncExternalStore(subscribeColumns, getColumns); }

// Card art is 59:86 (YGOPRODeck small images are 168×246).
const CARD_ASPECT = 86 / 59;
const GRID_GAP_PX = 12;
const INFO_HEIGHT_PX = 84; // name + badge row; measureElement corrects any drift

// ── One grid cell. Memoised: appending a page never re-renders existing cells. ──

const CardCell = memo(function CardCell({ card, onSelect }: { card: Card; onSelect: (card: Card) => void }) {
  return (
    <button
      type="button"
      className="press text-left bg-md-surface border border-md-border rounded-lg overflow-hidden card-hover group"
      onClick={() => onSelect(card)}
    >
      {/* Plain <img> with intrinsic size: no per-cell load state, no fade
          transition, nothing to redo when a row scrolls back into view. */}
      <img
        src={card.image_small_url}
        alt={card.name}
        width={168}
        height={246}
        loading="lazy"
        decoding="async"
        className="block w-full h-auto aspect-[59/86] object-cover bg-md-surfaceAlt"
      />
      <div className="p-2.5">
        <p className="text-xs font-medium truncate group-hover:text-md-blue transition-colors">{card.name}</p>
        <div className="flex flex-wrap items-center gap-1 mt-1.5 min-h-[1.25rem]">
          {card.ban_status_md && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${banClass(card.ban_status_md)}`}>
              {card.ban_status_md}
            </span>
          )}
          {card.md_rarity && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${rarityClass(card.md_rarity)}`}>
              {card.md_rarity}
            </span>
          )}
          {card.negate_effectiveness != null && card.negate_effectiveness > 2 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium border ${negateColorClass(card.negate_effectiveness)}`}>
              ⛔ +{card.negate_effectiveness.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

// ── Virtualized, infinitely loading grid ──
//
// Virtualizes rows (not cells) against the window scroll, so the sticky
// header, pull-to-refresh and scroll-direction logic keep working. Only the
// rows in view plus a small overscan are in the DOM, however many pages have
// loaded — a long scroll stays at roughly the same few hundred nodes.

function VirtualCardGrid({
  cards,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onSelect,
}: {
  cards: Card[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  onSelect: (card: Card) => void;
}) {
  const columns = useColumns();
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [width, setWidth] = useState(0);

  // Distance from the top of the document to the grid, and the grid's width,
  // re-read whenever the layout around it changes size.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
      setWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(cards.length / columns);
  const estimateRow = useCallback(() => {
    const cellWidth = width > 0 ? (width - GRID_GAP_PX * (columns - 1)) / columns : 160;
    return Math.round(cellWidth * CARD_ASPECT + INFO_HEIGHT_PX);
  }, [width, columns]);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: estimateRow,
    overscan: 3,
    gap: GRID_GAP_PX,
    scrollMargin,
  });

  // Column count or width changed: every cached row height is now wrong.
  useEffect(() => { virtualizer.measure(); }, [virtualizer, columns, width]);

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1;

  // Start loading the next page while the user is still ~3 rows away from the end.
  useEffect(() => {
    if (lastIndex >= rowCount - 3 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [lastIndex, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div ref={listRef}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((row) => {
          const start = row.index * columns;
          const rowCards = cards.slice(start, start + columns);
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full grid"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: GRID_GAP_PX,
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {rowCards.map((card) => (
                <CardCell key={card.id} card={card} onSelect={onSelect} />
              ))}
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && <LoadingSpinner size="sm" />}
    </div>
  );
}

export default function CardSearch() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [attribute, setAttribute] = useState('');
  const [archetype, setArchetype] = useState('');
  const [sort, setSort] = useState('popular');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const filters = useMemo(
    () => ({ q: debouncedQuery, type, attribute, archetype, sort }),
    [debouncedQuery, type, attribute, archetype, sort]
  );

  const archetypesQ = useQuery(archetypesQuery());
  const archetypes = archetypesQ.data ?? [];
  const searchQ = useInfiniteQuery(cardSearchInfiniteQuery(filters));
  const cards = useMemo(() => searchQ.data?.pages.flatMap((p) => p.cards) ?? [], [searchQ.data]);
  const total = searchQ.data?.pages[0]?.total ?? 0;
  const error = (!searchQ.data && searchQ.error?.message) || (!archetypesQ.data && archetypesQ.error?.message) || '';
  useFirstContent(searchQ.data != null || error !== '');

  // New filters start a new result list — jump back up to it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, [filters]);

  const fetchNextPage = searchQ.fetchNextPage;
  const onSelect = useCallback((card: Card) => setSelectedCard(card), []);

  return (
    <div className="space-y-5">
      <h2 className="page-title">Card Search</h2>

      {/* Filters */}
      <div className="bg-md-surface border border-md-border rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search cards..." />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
            <option value="popular">MDM Popular</option>
            <option value="name">Alphabetical</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            <option value="">All Types</option>
            {CARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={attribute} onChange={(e) => setAttribute(e.target.value)} className={selectClass}>
            <option value="">All Attributes</option>
            {ATTRIBUTES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={archetype} onChange={(e) => setArchetype(e.target.value)} className={selectClass}>
            <option value="">All Archetypes</option>
            {archetypes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => { void searchQ.refetch(); void archetypesQ.refetch(); }} />}

      {/* Results */}
      {searchQ.isPending ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : searchQ.data ? (
        <>
          <p className="text-xs text-md-textMuted font-mono">
            {total.toLocaleString()} results{searchQ.isFetching && !searchQ.isFetchingNextPage ? ' · updating…' : ''}
          </p>
          <VirtualCardGrid
            cards={cards}
            hasNextPage={searchQ.hasNextPage}
            isFetchingNextPage={searchQ.isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            onSelect={onSelect}
          />
        </>
      ) : null}

      {/* Card Detail Modal */}
      {selectedCard && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="modal-panel bg-md-surface border border-md-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-surface-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-6">
              <CardImage src={selectedCard.image_url} alt={selectedCard.name} size="lg" className="w-80 h-220 flex-shrink-0 rounded-lg shadow-card" />
              <div className="flex-1 space-y-1">
                <h3 className="text-xl font-bold tracking-tight">{selectedCard.name}</h3>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 bg-md-surfaceAlt rounded-md text-xs text-md-textSecondary border border-md-border/50">{selectedCard.type}</span>
                  {selectedCard.attribute && <span className="px-2 py-0.5 bg-md-surfaceAlt rounded-md text-xs text-md-textSecondary border border-md-border/50">{selectedCard.attribute}</span>}
                  {selectedCard.race && <span className="px-2 py-0.5 bg-md-surfaceAlt rounded-md text-xs text-md-textSecondary border border-md-border/50">{selectedCard.race}</span>}
                  {selectedCard.archetype && <span className="px-2 py-0.5 bg-md-blue/10 rounded-md text-xs text-md-blue border border-md-blue/20">{selectedCard.archetype}</span>}
                </div>
                <div className="flex gap-4 text-sm">
                  {selectedCard.atk != null && <span className="text-md-textMuted">ATK <span className="text-md-red font-bold">{selectedCard.atk}</span></span>}
                  {selectedCard.def != null && <span className="text-md-textMuted">DEF <span className="text-md-blue font-bold">{selectedCard.def}</span></span>}
                  {selectedCard.level != null && <span className="text-md-textMuted">LV <span className="text-md-gold font-bold">{selectedCard.level}</span></span>}
                  {selectedCard.link_val != null && <span className="text-md-textMuted">Link <span className="text-md-blue font-bold">{selectedCard.link_val}</span></span>}
                </div>
                <p className="text-sm text-md-textSecondary leading-relaxed">{selectedCard.description}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedCard.ban_status_md && (
                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${selectedCard.ban_status_md === 'Banned' ? 'bg-md-red/10 text-md-red border border-md-red/20' : 'bg-md-orange/10 text-md-orange border border-md-orange/20'}`}>
                      {selectedCard.ban_status_md}
                    </span>
                  )}
                  {selectedCard.md_rarity && (
                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${selectedCard.md_rarity === 'UR' ? 'bg-rarity-ur/10 text-rarity-ur border border-rarity-ur/20' : 'bg-rarity-sr/10 text-rarity-sr border border-rarity-sr/20'}`}>
                      {selectedCard.md_rarity}
                    </span>
                  )}
                </div>
                <NegateImpact card={selectedCard} />
              </div>
            </div>
            <button
              onClick={() => setSelectedCard(null)}
              className="mt-5 w-full py-2 bg-md-surfaceAlt border border-md-border rounded-lg text-sm text-md-textMuted hover:text-md-text hover:bg-md-surfaceHover transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
