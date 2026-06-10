import { useState } from 'react';
import { deleteSavedDeck, exportYdk, type SavedDeck } from '../api/deckIO';
import { copyText, shareYdk } from '../utils/deckShare';
import ErrorBanner from '../components/common/ErrorBanner';
import { useOfflineQuery } from '../hooks/useOfflineQuery';
import { useOfflineCache } from '../offline/OfflineCacheContext';
import { savedDecksResource } from '../offline/resources';

const flatten = (rows: Array<{ passcode: number; count: number }>): number[] =>
  rows.flatMap((r) => Array(r.count).fill(r.passcode));

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
        <h2 className="text-2xl font-bold text-md-gold">My Decks</h2>
        {source === 'cache' && (
          <span className="text-[10px] uppercase font-semibold text-md-textMuted border border-md-border rounded px-1.5 py-0.5">
            Offline copy
          </span>
        )}
      </div>
      {error && <ErrorBanner message={error} onRetry={() => { setActionError(''); void refresh(); }} />}
      {loading ? (
        <p className="text-sm text-md-textMuted">Loading…</p>
      ) : decks.length === 0 ? (
        <p className="text-sm text-md-textMuted">No saved decks yet. Build one and use Import / Export → Save.</p>
      ) : (
        <div className="space-y-2">
          {decks.map((deck) => {
            const total = deck.main_json.reduce((s, c) => s + c.count, 0);
            return (
              <div key={deck.id} className="bg-md-surface border border-md-border rounded-lg p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{deck.name}</p>
                  <p className="text-xs text-md-textMuted">{total} main · {deck.source ?? 'manual'}</p>
                </div>
                <button onClick={() => exportDeck(deck, 'copy')} className="text-xs bg-md-surfaceHover px-2 py-1 rounded">Copy</button>
                <button onClick={() => exportDeck(deck, 'share')} className="text-xs bg-md-surfaceHover px-2 py-1 rounded">Share</button>
                <button onClick={() => remove(deck.id)} className="text-xs text-md-red px-2 py-1 rounded">Delete</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
