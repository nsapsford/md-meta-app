import { useState } from 'react';
import { parseYdk, exportYdk, createSavedDeck, type ResolvedCard } from '../../api/deckIO';
import { copyText, shareYdk } from '../../utils/deckShare';
import { buildYdke } from '../../utils/ydke';

// Konami Card Database "My Deck" — decks saved here (while logged into your
// Konami ID) sync into the Neuron app. The deck-transfer browser extension
// adds an "import from YDKE" button on this page.
const KCD_MY_DECK_URL = 'https://www.db.yugioh-card.com/yugiohdb/member_deck.action?request_locale=en';

export interface BuilderCard {
  id: number;
  name: string;
  count: number;
  image_small_url: string;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // Current builder contents, for export + save.
  main: BuilderCard[];
  extra: BuilderCard[];
  side: BuilderCard[];
  // Called when an import resolves; parent loads these into the builder.
  onImport: (cards: ResolvedCard[], sections: { main: number[]; extra: number[]; side: number[] }) => void;
}

const flatten = (cards: BuilderCard[]): number[] => cards.flatMap((c) => Array(c.count).fill(c.id));
const toPayload = (cards: BuilderCard[]) => cards.map((c) => ({ passcode: c.id, count: c.count }));

export default function DeckImportExport({ open, onClose, main, extra, side, onImport }: Props) {
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [ydkInput, setYdkInput] = useState('');
  const [ydkOutput, setYdkOutput] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleImport = async () => {
    setBusy(true); setStatus('');
    try {
      const parsed = await parseYdk(ydkInput);
      onImport(parsed.cards, { main: parsed.main, extra: parsed.extra, side: parsed.side });
      if (parsed.unresolved.length > 0) {
        setStatus(`Imported. ${parsed.unresolved.length} card id(s) not found and skipped: ${parsed.unresolved.join(', ')}`);
      } else {
        setStatus('Imported successfully.');
        onClose();
      }
    } catch (e: any) {
      setStatus(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const buildExport = async () => {
    setBusy(true); setStatus('');
    try {
      const ydk = await exportYdk(flatten(main), flatten(extra), flatten(side));
      setYdkOutput(ydk);
    } catch (e: any) {
      setStatus(e.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const ydkeUrl = () => buildYdke(flatten(main), flatten(extra), flatten(side));

  const copyYdke = async () => {
    setStatus('');
    try {
      await copyText(ydkeUrl());
      setStatus('YDKE copied. Paste it into the Konami DB deck editor (with the deck-transfer extension) to send it to Neuron.');
    } catch (e: any) {
      setStatus(e.message || 'Copy failed');
    }
  };

  const openKonamiDb = async () => {
    try { await copyText(ydkeUrl()); } catch { /* clipboard may be blocked; still open KCD */ }
    setStatus('YDKE copied to clipboard. Opening the Konami Card Database — create/edit a deck, import the YDKE, then Save to sync into Neuron.');
    window.open(KCD_MY_DECK_URL, '_blank');
  };

  const handleSave = async () => {
    const name = window.prompt('Deck name?');
    if (!name) return;
    setBusy(true); setStatus('');
    try {
      await createSavedDeck({
        name,
        main: toPayload(main),
        extra: toPayload(extra),
        side: toPayload(side),
        source: 'manual',
      });
      setStatus(`Saved "${name}".`);
    } catch (e: any) {
      setStatus(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-md-surface border border-md-border rounded-lg w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setTab('import')} className={`text-sm font-semibold ${tab === 'import' ? 'text-md-gold' : 'text-md-textMuted'}`}>Import</button>
          <button onClick={() => { setTab('export'); buildExport(); }} className={`text-sm font-semibold ${tab === 'export' ? 'text-md-gold' : 'text-md-textMuted'}`}>Export</button>
          <button onClick={onClose} className="ml-auto text-md-textMuted hover:text-md-text">✕</button>
        </div>

        {tab === 'import' ? (
          <div className="space-y-3">
            <p className="text-xs text-md-textMuted">Paste a .ydk deck list (passcodes).</p>
            <textarea
              value={ydkInput}
              onChange={(e) => setYdkInput(e.target.value)}
              rows={8}
              className="w-full bg-md-bg border border-md-border rounded p-2 text-xs font-mono"
              placeholder={'#main\n10497636\n...'}
            />
            <button disabled={busy || !ydkInput.trim()} onClick={handleImport} className="bg-md-blue text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
              Import into builder
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea readOnly value={ydkOutput} rows={8} className="w-full bg-md-bg border border-md-border rounded p-2 text-xs font-mono" />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => copyText(ydkOutput)} className="bg-md-surfaceHover text-sm px-3 py-2 rounded">Copy .ydk</button>
              <button disabled={busy} onClick={() => shareYdk(ydkOutput)} className="bg-md-surfaceHover text-sm px-3 py-2 rounded">Share / Download</button>
              <button disabled={busy} onClick={handleSave} className="bg-md-blue text-white text-sm font-semibold px-3 py-2 rounded ml-auto">Save to My Decks</button>
            </div>
            <div className="border-t border-md-border pt-3">
              <p className="text-xs text-md-textMuted mb-2">Send to Konami Neuron (via the Konami Card Database):</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={copyYdke} className="bg-md-surfaceHover text-sm px-3 py-2 rounded">Copy YDKE</button>
                <button disabled={busy} onClick={openKonamiDb} className="bg-md-gold text-black text-sm font-semibold px-3 py-2 rounded">Open Konami DB →</button>
              </div>
            </div>
          </div>
        )}

        {status && <p className="mt-3 text-xs text-md-textSecondary">{status}</p>}
      </div>
    </div>
  );
}
