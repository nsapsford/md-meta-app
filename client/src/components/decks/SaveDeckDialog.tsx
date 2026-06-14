import { useState } from 'react';
import { createSavedDeck } from '../../api/deckIO';
import { hapticSuccess } from '../../utils/haptics';

// Minimal shape needed to build a save payload; compatible with DeckBuilder's DeckCard.
interface DeckCardLike {
  id: number;
  count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  main: DeckCardLike[];
  extra: DeckCardLike[];
  side: DeckCardLike[];
  onSaved?: (name: string) => void;
}

const toPayload = (cards: DeckCardLike[]) => cards.map((c) => ({ passcode: c.id, count: c.count }));

export default function SaveDeckDialog({ open, onClose, main, extra, side, onSaved }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      await createSavedDeck({
        name: trimmed,
        main: toPayload(main),
        extra: toPayload(extra),
        side: toPayload(side),
        source: 'manual',
      });
      hapticSuccess();
      onSaved?.(trimmed);
      setName('');
      onClose();
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-md-surface border border-md-border rounded-lg w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Save deck to My Decks</h3>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Deck name"
          className="w-full bg-md-bg border border-md-border rounded p-2 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-md-blue"
        />
        {error && <p className="text-xs text-md-red mb-2">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="press text-sm px-3 py-2 rounded bg-md-surfaceHover">Cancel</button>
          <button
            disabled={busy || !name.trim()}
            onClick={handleSave}
            className="press text-sm font-semibold px-3 py-2 rounded bg-md-blue text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
