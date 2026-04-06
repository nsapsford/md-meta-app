import { useState, useEffect } from 'react';
import { searchCards, getArchetypes } from '../api/cards';
import type { Card, CardSearchResult } from '../types/card';
import { useDebounce } from '../hooks/useDebounce';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SearchInput from '../components/common/SearchInput';
import Pagination from '../components/common/Pagination';
import CardImage from '../components/common/CardImage';
import NegateImpact from '../components/common/NegateImpact';
import ErrorBanner from '../components/common/ErrorBanner';

const CARD_TYPES = ['Effect Monster', 'Normal Monster', 'Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster', 'Ritual Monster', 'Spell Card', 'Trap Card'];
const ATTRIBUTES = ['DARK', 'LIGHT', 'WATER', 'FIRE', 'EARTH', 'WIND', 'DIVINE'];

const selectClass = "bg-md-bg border border-md-border rounded-lg px-3 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue/50 focus:ring-1 focus:ring-md-blue/20 transition-colors";

function negateColorClass(value: number): string {
  if (value > 8) return 'text-md-red border-md-red/20 bg-md-red/10';
  if (value > 4) return 'text-md-orange border-md-orange/20 bg-md-orange/10';
  return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10';
}

export default function CardSearch() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [attribute, setAttribute] = useState('');
  const [archetype, setArchetype] = useState('');
  const [sort, setSort] = useState('popular');
  const [result, setResult] = useState<CardSearchResult | null>(null);
  const [archetypes, setArchetypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    getArchetypes().then(setArchetypes).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { setPage(1); }, [debouncedQuery, type, attribute, archetype, sort]);

  useEffect(() => {
    const controller = new AbortController();
    const params: Record<string, string> = { page: String(page), limit: '30', sort };
    if (debouncedQuery) params.q = debouncedQuery;
    if (type) params.type = type;
    if (attribute) params.attribute = attribute;
    if (archetype) params.archetype = archetype;

    setLoading(true);
    searchCards(params, controller.signal)
      .then(setResult)
      .catch((e) => { if (e.name !== 'CanceledError') setError(e.message); })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQuery, type, attribute, archetype, sort, page]);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold tracking-tight"><span className="text-shimmer">Card Search</span></h2>

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

      {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : result ? (
        <>
          <p className="text-xs text-md-textMuted font-mono">{result.total.toLocaleString()} results</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {result.cards.map((card) => (
              <div
                key={card.id}
                className="bg-md-surface border border-md-border rounded-lg overflow-hidden card-hover cursor-pointer group"
                onClick={() => setSelectedCard(card)}
              >
                <div className="overflow-hidden">
                  <CardImage src={card.image_small_url} alt={card.name} size="lg" className="w-full h-auto transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate group-hover:text-md-blue transition-colors">{card.name}</p>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {card.ban_status_md && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${card.ban_status_md === 'Banned' ? 'bg-md-red/10 text-md-red border border-md-red/20' : card.ban_status_md === 'Limited' ? 'bg-md-orange/10 text-md-orange border border-md-orange/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                        {card.ban_status_md}
                      </span>
                    )}
                    {card.md_rarity && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${card.md_rarity === 'UR' ? 'bg-rarity-ur/10 text-rarity-ur border border-rarity-ur/20' : card.md_rarity === 'SR' ? 'bg-rarity-sr/10 text-rarity-sr border border-rarity-sr/20' : 'bg-rarity-r/10 text-rarity-r border border-rarity-r/20'}`}>
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
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Pagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />
          </div>
        </>
      ) : null}

      {/* Card Detail Modal */}
      {selectedCard && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-md-surface border border-md-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-surface-lg animate-slide-up"
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
