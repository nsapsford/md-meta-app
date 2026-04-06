import { useState, useEffect, useCallback } from 'react';
import { searchCards } from '../api/cards';
import { scoreDeck, validateDeck } from '../api/meta';
import { useDebounce } from '../hooks/useDebounce';
import SearchInput from '../components/common/SearchInput';
import ErrorBanner from '../components/common/ErrorBanner';
import type { Card } from '../types/card';

interface DeckCard {
  name: string;
  count: number;
  image_small_url: string;
  type: string;
}

function isExtraDeck(type: string): boolean {
  return ['Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster'].some(t => type.includes(t));
}

export default function DeckBuilder() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [extraDeck, setExtraDeck] = useState<DeckCard[]>([]);
  const [score, setScore] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery) { setSearchResults([]); return; }
    setSearching(true);
    searchCards({ q: debouncedQuery, limit: '20' })
      .then((r) => setSearchResults(r.cards))
      .catch((e) => setError(e.message))
      .finally(() => setSearching(false));
  }, [debouncedQuery]);

  const addCard = useCallback((card: Card) => {
    const isExtra = isExtraDeck(card.type);
    const setter = isExtra ? setExtraDeck : setMainDeck;

    setter((prev) => {
      const existing = prev.find((c) => c.name === card.name);
      if (existing) {
        if (existing.count >= 3) return prev;
        return prev.map((c) => c.name === card.name ? { ...c, count: c.count + 1 } : c);
      }
      return [...prev, { name: card.name, count: 1, image_small_url: card.image_small_url, type: card.type }];
    });
  }, []);

  const removeCard = useCallback((name: string, isExtra: boolean) => {
    const setter = isExtra ? setExtraDeck : setMainDeck;
    setter((prev) => {
      const card = prev.find((c) => c.name === name);
      if (!card) return prev;
      if (card.count > 1) return prev.map((c) => c.name === name ? { ...c, count: c.count - 1 } : c);
      return prev.filter((c) => c.name !== name);
    });
  }, []);

  const mainCount = mainDeck.reduce((s, c) => s + c.count, 0);
  const extraCount = extraDeck.reduce((s, c) => s + c.count, 0);

  // Score deck
  useEffect(() => {
    const mainNames = mainDeck.flatMap((c) => Array(c.count).fill(c.name));
    const extraNames = extraDeck.flatMap((c) => Array(c.count).fill(c.name));
    if (mainNames.length === 0) { setScore(null); return; }

    const timer = setTimeout(() => {
      scoreDeck(mainNames, extraNames).then(setScore).catch((e) => setError(e.message));
      validateDeck(mainNames, extraNames, []).then(setValidation).catch((e) => setError(e.message));
    }, 500);
    return () => clearTimeout(timer);
  }, [mainDeck, extraDeck]);

  return (
    <div className="flex gap-4 h-[calc(100vh-3.5rem)]">
      {/* Search Panel */}
      <div className="w-72 flex-shrink-0 bg-md-surface border-r border-md-border p-3 overflow-y-auto">
        <SearchInput value={query} onChange={setQuery} placeholder="Search cards to add..." />
        <div className="mt-3 space-y-1">
          {searching && <p className="text-xs text-md-textMuted text-center py-2">Searching...</p>}
          {searchResults.map((card) => (
            <button
              key={card.id}
              onClick={() => addCard(card)}
              className="w-full flex items-center gap-2 p-2 rounded hover:bg-md-surfaceHover transition-colors text-left"
            >
              {card.image_small_url && (
                <img src={card.image_small_url} alt="" className="w-8 h-12 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{card.name}</p>
                <p className="text-xs text-md-textMuted truncate">{card.type}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Deck Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && <ErrorBanner message={error} onRetry={() => setError('')} />}

        {/* Score & Validation */}
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-md-gold">Deck Builder</h2>
          {score && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-md-textMuted">Meta Score:</span>
              <span className={`text-2xl font-bold ${score.score >= 70 ? 'text-md-green' : score.score >= 40 ? 'text-md-orange' : 'text-md-red'}`}>
                {score.score}
              </span>
              <span className="text-sm text-md-textMuted">/100</span>
            </div>
          )}
        </div>

        {validation && !validation.valid && (
          <div className="bg-md-red/10 border border-md-red/30 rounded-lg p-3">
            {validation.errors.map((e: string, i: number) => (
              <p key={i} className="text-sm text-md-red">{e}</p>
            ))}
          </div>
        )}

        {/* Main Deck */}
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="font-semibold mb-3">
            Main Deck <span className={`text-sm ${mainCount < 40 ? 'text-md-red' : mainCount > 60 ? 'text-md-red' : 'text-md-textMuted'}`}>({mainCount}/40-60)</span>
          </h3>
          {mainDeck.length === 0 ? (
            <p className="text-sm text-md-textMuted text-center py-8">Search and click cards to add them</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {mainDeck.map((card) => (
                <button
                  key={card.name}
                  onClick={() => removeCard(card.name, false)}
                  className="relative group"
                  title={`${card.name} (click to remove)`}
                >
                  <img src={card.image_small_url} alt={card.name} className="w-14 h-20 object-cover rounded" />
                  {card.count > 1 && (
                    <span className="absolute -top-1 -right-1 bg-md-blue text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {card.count}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-md-red/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-bold">-1</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Extra Deck */}
        <div className="bg-md-surface border border-md-border rounded-lg p-4">
          <h3 className="font-semibold mb-3">
            Extra Deck <span className={`text-sm ${extraCount > 15 ? 'text-md-red' : 'text-md-textMuted'}`}>({extraCount}/15)</span>
          </h3>
          {extraDeck.length === 0 ? (
            <p className="text-sm text-md-textMuted text-center py-4">Fusion/Synchro/XYZ/Link monsters go here</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {extraDeck.map((card) => (
                <button
                  key={card.name}
                  onClick={() => removeCard(card.name, true)}
                  className="relative group"
                  title={`${card.name} (click to remove)`}
                >
                  <img src={card.image_small_url} alt={card.name} className="w-14 h-20 object-cover rounded" />
                  {card.count > 1 && (
                    <span className="absolute -top-1 -right-1 bg-md-purple text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {card.count}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-md-red/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-bold">-1</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Card-level scores */}
        {score?.cardScores && Object.keys(score.cardScores).length > 0 && (
          <div className="bg-md-surface border border-md-border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Card Meta Relevance</h3>
            <div className="space-y-1">
              {Object.entries(score.cardScores)
                .sort(([, a]: any, [, b]: any) => b.score - a.score)
                .slice(0, 20)
                .map(([name, data]: [string, any]) => (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-md-textMuted text-xs">{data.decks.slice(0, 2).join(', ')}</span>
                    <span className={`font-mono w-12 text-right ${data.score > 0 ? 'text-md-green' : 'text-md-textMuted'}`}>
                      {data.score.toFixed(1)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
