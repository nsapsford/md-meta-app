import { useEffect, useState } from 'react';
import { getSavedDecks, deleteSavedDeck, exportYdk, type SavedDeck } from '../api/deckIO';
import { copyText, shareYdk } from '../utils/deckShare';
import ErrorBanner from '../components/common/ErrorBanner';

const flatten = (rows: Array<{ passcode: number; count: number }>): number[] =>
  rows.flatMap((r) => Array(r.count).fill(r.passcode));

export default function MyDecks() {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getSavedDecks().then(setDecks).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (id: number) => {
    if (!window.confirm('Delete this deck?')) return;
    try { await deleteSavedDeck(id); setDecks((d) => d.filter((x) => x.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  const exportDeck = async (deck: SavedDeck, action: 'copy' | 'share') => {
    try {
      const ydk = await exportYdk(flatten(deck.main_json), flatten(deck.extra_json), flatten(deck.side_json));
      if (action === 'copy') await copyText(ydk); else await shareYdk(ydk, `${deck.name}.ydk`);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-md-gold">My Decks</h2>
      {error && <ErrorBanner message={error} onRetry={() => { setError(''); load(); }} />}
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
