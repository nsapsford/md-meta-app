import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSavedDeck, parseYdk, type SavedDeck } from '../../api/deckIO';
import { invalidateSavedDecks } from '../../queries/invalidate';
import { resolvedCardsQuery } from '../../queries/options';
import { groupPasscodes, parseYdke, type YdkeDeck } from '../../utils/ydke';
import { hapticSuccess } from '../../utils/haptics';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the newly saved deck. */
  onSaved?: (deck: SavedDeck) => void;
}

const total = (rows: YdkeDeck['main']) => rows.reduce((s, r) => s + r.count, 0);

/** A YDKE code decodes locally; .ydk text goes through the server's parser. */
async function decodeDeckText(text: string): Promise<YdkeDeck> {
  const trimmed = text.trim();
  if (trimmed.toLowerCase().startsWith('ydke://')) return parseYdke(trimmed);
  if (/#main|!side/i.test(trimmed)) {
    const parsed = await parseYdk(trimmed);
    return { main: groupPasscodes(parsed.main), extra: groupPasscodes(parsed.extra), side: groupPasscodes(parsed.side) };
  }
  throw new Error('Paste a ydke:// code or the contents of a .ydk file.');
}

/** Paste a YDKE code (or choose a .ydke/.ydk file) and save it to My Decks. */
export default function ImportDeckDialog({ open, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [deck, setDeck] = useState<YdkeDeck | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const passcodes = useMemo(
    () => (deck ? [...deck.main, ...deck.extra, ...deck.side].map((r) => r.passcode) : []),
    [deck],
  );
  const resolvedQ = useQuery(resolvedCardsQuery(passcodes));
  const unknown = useMemo(() => {
    if (!resolvedQ.data) return [];
    const known = new Set(resolvedQ.data.map((c) => Number(c.id)));
    return [...new Set(passcodes)].filter((p) => !known.has(p));
  }, [resolvedQ.data, passcodes]);

  if (!open) return null;

  const reset = () => { setName(''); setText(''); setDeck(null); setError(''); };
  const close = () => { reset(); onClose(); };

  const decode = async (value: string) => {
    setText(value);
    setError('');
    if (!value.trim()) { setDeck(null); return; }
    try { setDeck(await decodeDeckText(value)); }
    catch (e) { setDeck(null); setError(e instanceof Error ? e.message : String(e)); }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!name.trim()) setName(file.name.replace(/\.(ydke?|txt)$/i, ''));
    await decode(await file.text());
  };

  const save = async () => {
    if (!deck || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const saved = await createSavedDeck({ name: name.trim(), ...deck, source: 'ydke' });
      await invalidateSavedDecks(queryClient);
      hapticSuccess();
      onSaved?.(saved);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-panel bg-md-surface border border-md-border rounded-xl shadow-surface-lg w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Import a deck</h3>
        <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name" className="input-field" />
        <textarea
          value={text}
          onChange={(e) => void decode(e.target.value)}
          placeholder="Paste a ydke:// code or .ydk text"
          rows={4}
          className="input-field font-mono text-xs break-all"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="press text-xs px-2.5 py-1.5 rounded bg-md-surfaceHover hover:bg-md-borderLight">
            Choose .ydke / .ydk file
          </button>
          <input ref={fileRef} type="file" accept=".ydke,.ydk,.txt" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
        </div>
        {deck && (
          <div className="text-xs text-md-textSecondary space-y-1" data-testid="import-preview">
            <p>{total(deck.main)} main · {total(deck.extra)} extra · {total(deck.side)} side</p>
            {resolvedQ.isFetching && <p className="text-md-textMuted">Checking cards…</p>}
            {unknown.length > 0 && (
              <p className="text-md-gold">
                {unknown.length} card{unknown.length === 1 ? '' : 's'} not found in the card database ({unknown.slice(0, 4).join(', ')}{unknown.length > 4 ? '…' : ''}). It saves anyway; you can fix it in My Decks.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-xs text-md-red">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={close} className="press text-sm px-3 py-2 rounded-lg bg-md-surfaceHover hover:bg-md-borderLight">Cancel</button>
          <button
            disabled={busy || !deck || !name.trim()}
            onClick={save}
            className="press text-sm font-semibold px-3 py-2 rounded-lg bg-md-blue text-white hover:bg-md-blueLight disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save to My Decks'}
          </button>
        </div>
      </div>
    </div>
  );
}
