import { useState } from 'react';
import { parseYdk, exportYdk, createSavedDeck, type ResolvedCard } from '../../api/deckIO';
import { copyText, shareYdk, openDeckPortal } from '../../utils/deckShare';
import { buildYdke, buildKonamiDeepLink } from '../../utils/ydke';
import { useIsNative } from '../../hooks/useIsNative';

// Deck Transfer extension (DawnbrandBots) — adds YDKE import/export to the
// Konami DB deck editor and powers the #storm-access auto-import deep link.
const EXTENSION_FIREFOX_URL = 'https://addons.mozilla.org/en-US/firefox/addon/deck-transfer-for-master-duel/';
const EXTENSION_CHROME_URL = 'https://chromewebstore.google.com/detail/deck-transfer-for-yu-gi-o/lgcpomfflpfipndmldmgblhpbnnfidgk';

// Konami DB won't save a main deck outside this range.
const KONAMI_MIN_MAIN = 40;

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
  // Name of the deck in the builder (if saved/known); carried to Konami DB via clipboard.
  deckName?: string;
  // Called when an import resolves; parent loads these into the builder.
  onImport: (cards: ResolvedCard[], sections: { main: number[]; extra: number[]; side: number[] }) => void;
  // Called after a save here so the parent can remember the deck name.
  onSaved?: (name: string) => void;
}

type Status = { kind: 'ok' | 'err'; text: string } | null;

const flatten = (cards: BuilderCard[]): number[] => cards.flatMap((c) => Array(c.count).fill(c.id));
const toPayload = (cards: BuilderCard[]) => cards.map((c) => ({ passcode: c.id, count: c.count }));
const countOf = (cards: BuilderCard[]) => cards.reduce((s, c) => s + c.count, 0);

export default function DeckImportExport({ open, onClose, main, extra, side, deckName, onImport, onSaved }: Props) {
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [ydkInput, setYdkInput] = useState('');
  const [ydkOutput, setYdkOutput] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const isNative = useIsNative();

  if (!open) return null;

  const mainCount = countOf(main);
  const totalCount = mainCount + countOf(extra) + countOf(side);
  const deckEmpty = totalCount === 0;

  const ok = (text: string) => setStatus({ kind: 'ok', text });
  const err = (text: string) => setStatus({ kind: 'err', text });

  const switchTab = (next: 'import' | 'export') => {
    setTab(next);
    setStatus(null);
    if (next === 'export') buildExport();
  };

  const handleImport = async () => {
    setBusy(true); setStatus(null);
    try {
      const parsed = await parseYdk(ydkInput);
      onImport(parsed.cards, { main: parsed.main, extra: parsed.extra, side: parsed.side });
      if (parsed.unresolved.length > 0) {
        err(`Imported. ${parsed.unresolved.length} card id(s) not found and skipped: ${parsed.unresolved.join(', ')}`);
      } else {
        ok('Imported successfully.');
        onClose();
      }
    } catch (e: any) {
      err(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const buildExport = async () => {
    setBusy(true);
    try {
      const ydk = await exportYdk(flatten(main), flatten(extra), flatten(side));
      setYdkOutput(ydk);
    } catch (e: any) {
      err(e.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const ydkeUrl = () => buildYdke(flatten(main), flatten(extra), flatten(side));

  const copyWithFeedback = async (text: string, label: string) => {
    setStatus(null);
    try {
      await copyText(text);
      ok(`${label} copied ✓`);
    } catch (e: any) {
      err(e.message || 'Copy failed');
    }
  };

  const copyYdke = () => copyWithFeedback(ydkeUrl(), 'YDKE');

  const sendToKonami = async () => {
    // Kick off the open before any await — clipboard prompts can void the
    // user activation that popup blockers require.
    const portal = openDeckPortal(buildKonamiDeepLink(flatten(main), flatten(extra), flatten(side)));

    // The storm-access hash can't carry a name, so ride the clipboard:
    // the deck itself travels in the URL, leaving the clipboard free.
    let copied: 'name' | 'ydke' | null = null;
    try {
      await copyText(deckName || ydkeUrl());
      copied = deckName ? 'name' : 'ydke';
    } catch {
      // Clipboard is best-effort.
    }

    const target = await portal;
    if (target === 'none') {
      err('No browser could be opened. Install Firefox for Android, or copy the YDKE and import it on the Konami DB manually.');
      return;
    }
    const opened =
      target === 'firefox' ? 'Sent to Firefox'
      : target === 'default' ? 'Firefox not found — opened your default browser instead (auto-fill needs Firefox with the extension from step 1)'
      : 'Opened Konami DB';
    const fillNote =
      copied === 'name' ? `The deck list fills in automatically — paste the copied name ("${deckName}") and hit Save.`
      : copied === 'ydke' ? 'The deck list fills in automatically — name it and hit Save. (YDKE also copied as a backup.)'
      : 'The deck list fills in automatically — name it and hit Save.';
    ok(`${opened}. ${fillNote}`);
  };

  const handleSave = async () => {
    const name = window.prompt('Deck name?', deckName || '');
    if (!name) return;
    setBusy(true); setStatus(null);
    try {
      await createSavedDeck({
        name,
        main: toPayload(main),
        extra: toPayload(extra),
        side: toPayload(side),
        source: 'manual',
      });
      onSaved?.(name);
      ok(`Saved "${name}".`);
    } catch (e: any) {
      err(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel bg-md-surface border border-md-border rounded-xl shadow-surface-lg w-full max-w-lg p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => switchTab('import')} className={`text-sm font-semibold ${tab === 'import' ? 'text-md-gold' : 'text-md-textMuted'}`}>Import</button>
          <button onClick={() => switchTab('export')} className={`text-sm font-semibold ${tab === 'export' ? 'text-md-gold' : 'text-md-textMuted'}`}>Export</button>
          <button onClick={onClose} className="ml-auto text-md-textMuted hover:text-md-text">✕</button>
        </div>

        {tab === 'import' ? (
          <div className="space-y-3">
            <p className="text-xs text-md-textMuted">Paste a .ydk deck list (passcodes).</p>
            <textarea
              value={ydkInput}
              onChange={(e) => setYdkInput(e.target.value)}
              rows={8}
              className="input-field text-xs font-mono"
              placeholder={'#main\n10497636\n...'}
            />
            <button disabled={busy || !ydkInput.trim()} onClick={handleImport} className="bg-md-blue text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
              Import into builder
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {deckEmpty && <p className="text-xs text-md-textMuted">The builder is empty — add cards before exporting.</p>}
            <textarea readOnly value={ydkOutput} rows={8} className="input-field text-xs font-mono" />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || deckEmpty} onClick={() => copyWithFeedback(ydkOutput, '.ydk')} className="bg-md-surfaceHover text-sm px-3 py-2 rounded disabled:opacity-50">Copy .ydk</button>
              <button disabled={busy || deckEmpty} onClick={() => shareYdk(ydkOutput)} className="bg-md-surfaceHover text-sm px-3 py-2 rounded disabled:opacity-50">Share / Download</button>
              <button disabled={busy || deckEmpty} onClick={handleSave} className="bg-md-blue text-white text-sm font-semibold px-3 py-2 rounded ml-auto disabled:opacity-50">Save to My Decks</button>
            </div>

            <div className="border-t border-md-border pt-3 space-y-2">
              <p className="text-xs font-semibold text-md-text">Send to Master Duel / Neuron (via the Konami DB)</p>
              <ol className="text-xs text-md-textMuted list-decimal list-inside space-y-1">
                <li>
                  One-time: install the Deck Transfer extension in{' '}
                  <a href={EXTENSION_FIREFOX_URL} target="_blank" rel="noopener noreferrer" className="text-md-blue underline">Firefox</a>
                  {!isNative && (
                    <>
                      {' '}or{' '}
                      <a href={EXTENSION_CHROME_URL} target="_blank" rel="noopener noreferrer" className="text-md-blue underline">Chrome</a>
                    </>
                  )}
                  {isNative && ' for Android'}.
                </li>
                <li>Log in to the Konami DB with your Konami ID. (Not logged in yet? Log in, then tap Send again.)</li>
                <li>Tap Send — the deck fills in automatically. Paste the copied name, then Save.</li>
                <li>Master Duel: set the saved deck to Public, then use the in-game deck import. Neuron picks it up automatically.</li>
              </ol>
              {!deckEmpty && mainCount < KONAMI_MIN_MAIN && (
                <p className="text-xs text-md-gold">Heads up: the Konami DB only saves decks with {KONAMI_MIN_MAIN}–60 main-deck cards (currently {mainCount}).</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button disabled={busy || deckEmpty} onClick={copyYdke} className="bg-md-surfaceHover text-sm px-3 py-2 rounded disabled:opacity-50">Copy YDKE</button>
                <button disabled={busy || deckEmpty} onClick={sendToKonami} className="bg-md-gold text-black text-sm font-semibold px-3 py-2 rounded disabled:opacity-50">
                  {isNative ? 'Send via Firefox →' : 'Send to Konami DB →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {status && (
          <p className={`mt-3 text-xs ${status.kind === 'ok' ? 'text-md-green' : 'text-md-red'}`}>{status.text}</p>
        )}
      </div>
    </div>
  );
}
