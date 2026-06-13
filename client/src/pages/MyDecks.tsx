import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteSavedDeck, exportYdk, type SavedDeck } from '../api/deckIO';
import { copyText, shareYdk } from '../utils/deckShare';
import ErrorBanner from '../components/common/ErrorBanner';
import CardFan from '../components/common/CardFan';
import { useOfflineQuery } from '../hooks/useOfflineQuery';
import { useOfflineCache } from '../offline/OfflineCacheContext';
import { savedDecksResource } from '../offline/resources';

const flatten = (rows: Array<{ passcode: number; count: number }>): number[] =>
  rows.flatMap((r) => Array(r.count).fill(r.passcode));

// YGOPRODeck serves small card art keyed by passcode; the same CDN the server
// stores in `image_small_url`. Used as a fallback when the server hasn't supplied
// resolved signature cards (e.g. an older offline-cached response).
const cardImageSmall = (passcode: number): string =>
  `https://images.ygoprodeck.com/images/cards_small/${passcode}.jpg`;

// Prefer the server-chosen signature (boss/archetype) cards; fall back to the
// first few main-deck passcodes if they aren't available.
const fanCardsFor = (deck: SavedDeck) =>
  deck.signature_cards && deck.signature_cards.length > 0
    ? deck.signature_cards
    : deck.main_json.slice(0, 3).map((c) => ({ name: String(c.passcode), image: cardImageSmall(c.passcode) }));

export default function MyDecks() {
  const { enabled: cachingEnabled } = useOfflineCache();
  // Offline-first: renders instantly from the local cache (when enabled) and
  // silently revalidates against the server.
  const { data, loading, error: loadError, refresh, source } =
    useOfflineQuery(savedDecksResource, cachingEnabled);
  const [actionError, setActionError] = useState('');
  const decks = data ?? [];
  const error = actionError || loadError || '';

  const remove = async (id: number) => {
    if (!window.confirm('Delete this deck?')) return;
    try { await deleteSavedDeck(id); await refresh(); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
  };

  const exportDeck = async (deck: SavedDeck, action: 'copy' | 'share') => {
    try {
      const ydk = await exportYdk(flatten(deck.main_json), flatten(deck.extra_json), flatten(deck.side_json));
      if (action === 'copy') await copyText(ydk); else await shareYdk(ydk, `${deck.name}.ydk`);
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="page-title">My Decks</h2>
        {source === 'cache' && (
          <span className="text-[10px] uppercase font-semibold text-md-textMuted border border-md-border rounded px-1.5 py-0.5">
            Offline copy
          </span>
        )}
        <Link
          to="/build-deck"
          className="ml-auto bg-md-blue text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-md-blueLight"
        >
          Build a deck
        </Link>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => { setActionError(''); void refresh(); }} />}
      {loading ? (
        <p className="text-sm text-md-textMuted">Loading…</p>
      ) : decks.length === 0 ? (
        <p className="text-sm text-md-textMuted">
          No saved decks yet. Use <Link to="/build-deck" className="text-md-blue underline">Build a deck</Link> to create one.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {decks.map((deck) => {
            const total = deck.main_json.reduce((s, c) => s + c.count, 0);
            return (
              <div
                key={deck.id}
                className="group featured-card rounded-2xl overflow-hidden card-hover p-5 flex flex-col"
              >
                {/* Fanned cards — same visual language as the Dashboard */}
                <CardFan cards={fanCardsFor(deck)} />

                {/* Name + meta — matches the Dashboard deck-name styling */}
                <div className="mt-4 text-center">
                  <p className="font-bold text-md-text group-hover:text-md-gold transition-colors duration-300 truncate text-lg">
                    {deck.name}
                  </p>
                  <p className="text-xs text-md-textMuted mt-1">{total} main · {deck.source ?? 'manual'}</p>
                </div>

                <div className="flex items-center justify-center gap-2 mt-4">
                  <button onClick={() => exportDeck(deck, 'copy')} className="text-xs bg-md-surfaceHover px-2.5 py-1 rounded hover:bg-md-borderLight hover:text-md-text">Copy</button>
                  <button onClick={() => exportDeck(deck, 'share')} className="text-xs bg-md-surfaceHover px-2.5 py-1 rounded hover:bg-md-borderLight hover:text-md-text">Share</button>
                  <button onClick={() => remove(deck.id)} className="text-xs text-md-red px-2.5 py-1 rounded hover:bg-md-red/10">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
