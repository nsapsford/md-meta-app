import { useState, useEffect } from 'react';
import { searchCards, getArchetypes } from '../api/cards';
import type { Card, CardSearchResult } from '../types/card';
import { useDebounce } from '../hooks/useDebounce';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SearchInput from '../components/common/SearchInput';
import Pagination from '../components/common/Pagination';
import CardImage from '../components/common/CardImage';

const CARD_TYPES = ['Effect Monster', 'Normal Monster', 'Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster', 'Ritual Monster', 'Spell Card', 'Trap Card'];
const ATTRIBUTES = ['DARK', 'LIGHT', 'WATER', 'FIRE', 'EARTH', 'WIND', 'DIVINE'];

export default function CardSearch() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [attribute, setAttribute] = useState('');
  const [archetype, setArchetype] = useState('');
  const [sort, setSort] = useState('popular');
  const [result, setResult] = useState<CardSearchResult | null>(null);
  const [archetypes, setArchetypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    getArchetypes().then(setArchetypes).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, type, attribute, archetype, sort]);

  useEffect(() => {
    const params: Record<string, string> = { page: String(page), limit: '30', sort };
    if (debouncedQuery) params.q = debouncedQuery;
    if (type) params.type = type;
    if (attribute) params.attribute = attribute;
    if (archetype) params.archetype = archetype;

    setLoading(true);
    searchCards(params)
      .then(setResult)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedQuery, type, attribute, archetype, sort, page]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-md-gold">Card Search</h2>

      {/* Filters */}
      <div className="bg-md-surface border border-md-border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search cards..." />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue"
          >
            <option value="popular">MDM Popular</option>
            <option value="name">Alphabetical</option>
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue"
          >
            <option value="">All Types</option>
            {CARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={attribute}
            onChange={(e) => setAttribute(e.target.value)}
            className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue"
          >
            <option value="">All Attributes</option>
            {ATTRIBUTES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
            className="bg-md-bg border border-md-border rounded-lg px-3 py-2.5 text-sm text-md-text focus:outline-none focus:border-md-blue"
          >
            <option value="">All Archetypes</option>
            {archetypes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <LoadingSpinner />
      ) : result ? (
        <>
          <p className="text-sm text-md-textMuted">{result.total} results</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {result.cards.map((card) => (
              <div
                key={card.id}
                className="bg-md-surface border border-md-border rounded-lg overflow-hidden card-hover cursor-pointer"
                onClick={() => setSelectedCard(card)}
              >
                <CardImage src={card.image_small_url} alt={card.name} size="lg" className="w-full h-auto" />
                <div className="p-2">
                  <p className="text-xs font-medium truncate">{card.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {card.ban_status_md && (
                      <span className={`text-xs px-1 rounded ${card.ban_status_md === 'Banned' ? 'bg-md-red/20 text-md-red' : card.ban_status_md === 'Limited' ? 'bg-md-orange/20 text-md-orange' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {card.ban_status_md}
                      </span>
                    )}
                    {card.md_rarity && (
                      <span className={`text-xs px-1 rounded ${card.md_rarity === 'UR' ? 'bg-rarity-ur/20 text-rarity-ur' : card.md_rarity === 'SR' ? 'bg-rarity-sr/20 text-rarity-sr' : 'bg-rarity-r/20 text-rarity-r'}`}>
                        {card.md_rarity}
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
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedCard(null)}>
          <div className="bg-md-surface border border-md-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-6">
              <CardImage src={selectedCard.image_url} alt={selectedCard.name} size="lg" className="w-48 h-auto flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <h3 className="text-xl font-bold">{selectedCard.name}</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-md-bg rounded text-xs">{selectedCard.type}</span>
                  {selectedCard.attribute && <span className="px-2 py-1 bg-md-bg rounded text-xs">{selectedCard.attribute}</span>}
                  {selectedCard.race && <span className="px-2 py-1 bg-md-bg rounded text-xs">{selectedCard.race}</span>}
                  {selectedCard.archetype && <span className="px-2 py-1 bg-md-bg rounded text-xs">{selectedCard.archetype}</span>}
                </div>
                <div className="flex gap-4 text-sm">
                  {selectedCard.atk != null && <span>ATK: <span className="text-md-red font-semibold">{selectedCard.atk}</span></span>}
                  {selectedCard.def != null && <span>DEF: <span className="text-md-blue font-semibold">{selectedCard.def}</span></span>}
                  {selectedCard.level != null && <span>Level: <span className="text-md-gold font-semibold">{selectedCard.level}</span></span>}
                  {selectedCard.link_val != null && <span>Link: <span className="text-md-blue font-semibold">{selectedCard.link_val}</span></span>}
                </div>
                <p className="text-sm text-md-textMuted leading-relaxed">{selectedCard.description}</p>
                <div className="flex gap-2">
                  {selectedCard.ban_status_md && (
                    <span className={`text-sm px-2 py-1 rounded ${selectedCard.ban_status_md === 'Banned' ? 'bg-md-red/20 text-md-red' : 'bg-md-orange/20 text-md-orange'}`}>
                      {selectedCard.ban_status_md}
                    </span>
                  )}
                  {selectedCard.md_rarity && (
                    <span className={`text-sm px-2 py-1 rounded ${selectedCard.md_rarity === 'UR' ? 'bg-rarity-ur/20 text-rarity-ur' : 'bg-rarity-sr/20 text-rarity-sr'}`}>
                      {selectedCard.md_rarity}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedCard(null)} className="mt-4 w-full py-2 bg-md-bg border border-md-border rounded-lg text-sm hover:bg-md-surfaceHover transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
