import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { deleteSavedDeck, exportYdk, updateSavedDeck, type ResolvedCard, type SavedDeck } from '../api/deckIO';
import { cardQuickSearchQuery, resolvedCardsQuery, savedDecksQuery } from '../queries/options';
import { invalidateSavedDecks } from '../queries/invalidate';
import { useDebounce } from '../hooks/useDebounce';
import ErrorBanner from '../components/common/ErrorBanner';
import SearchInput from '../components/common/SearchInput';
import { copyText } from '../utils/deckShare';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import { buildYdke, parseYdke, type YdkeDeck } from '../utils/ydke';
import {
  SECTION_MAX, addBlockedReason, changeCount, flattenRows, isExtraDeckType, sectionTotal, type Section,
} from '../utils/deckEdit';

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'main', label: 'Main Deck' },
  { key: 'extra', label: 'Extra Deck' },
  { key: 'side', label: 'Side Deck' },
];

const cardImageSmall = (passcode: number) => `https://images.ygoprodeck.com/images/cards_small/${passcode}.jpg`;

const fromSaved = (d: SavedDeck): YdkeDeck => ({ main: d.main_json, extra: d.extra_json, side: d.side_json });

export default function MyDeckDetail() {
  const { id } = useParams();
  const deckId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const decksQ = useQuery(savedDecksQuery());
  const saved = useMemo(() => decksQ.data?.find((d) => d.id === deckId) ?? null, [decksQ.data, deckId]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<YdkeDeck | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [toSide, setToSide] = useState(false);
  const [replaceText, setReplaceText] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 300);

  useEffect(() => {
    if (saved && !editing) { setDraft(fromSaved(saved)); setName(saved.name); }
  }, [saved, editing]);

  const deck = draft ?? (saved ? fromSaved(saved) : null);
  const passcodes = useMemo(() => (deck ? [...deck.main, ...deck.extra, ...deck.side].map((r) => r.passcode) : []), [deck]);
  const resolvedQ = useQuery(resolvedCardsQuery(passcodes));
  const [extraInfo, setExtraInfo] = useState<Map<number, ResolvedCard>>(new Map());
  const cards = useMemo(() => {
    const m = new Map<number, ResolvedCard>(extraInfo);
    for (const c of resolvedQ.data ?? []) m.set(Number(c.id), c);
    return m;
  }, [resolvedQ.data, extraInfo]);
  const searchQ = useQuery({ ...cardQuickSearchQuery(debouncedQuery), enabled: editing && debouncedQuery !== '' });
  const unknownCount = resolvedQ.data ? [...new Set(passcodes)].filter((p) => !cards.has(p)).length : 0;

  if (!Number.isFinite(deckId)) return <ErrorBanner message="That deck link isn't valid." />;
  if (decksQ.isPending) return <p className="text-sm text-md-textMuted">Loading…</p>;
  if (!saved || !deck) {
    return (
      <div className="space-y-3">
        {decksQ.error && <ErrorBanner message={decksQ.error.message} onRetry={() => void decksQ.refetch()} />}
        <p className="text-sm text-md-textMuted">Deck not found. <Link to="/my-decks" className="text-md-blue underline">Back to My Decks</Link></p>
      </div>
    );
  }

  const bump = (section: Section, passcode: number, delta: number) => {
    if (delta > 0) {
      const reason = addBlockedReason(deck, section, passcode);
      if (reason) { setNotice(reason); return; }
    }
    hapticLight();
    setNotice('');
    setDraft(changeCount(deck, section, passcode, delta));
  };

  const addFromSearch = (card: { id: number; name: string; type: string; image_small_url: string }) => {
    const section: Section = toSide ? 'side' : isExtraDeckType(card.type) ? 'extra' : 'main';
    setExtraInfo((m) => new Map(m).set(card.id, { id: card.id, name: card.name, type: card.type, image_small_url: card.image_small_url }));
    bump(section, card.id, 1);
  };

  const replaceFromYdke = () => {
    try {
      setDraft(parseYdke(replaceText));
      setReplaceText('');
      setNotice('Deck replaced from the YDKE code. Save to keep it.');
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const cancel = () => { setEditing(false); setDraft(fromSaved(saved)); setName(saved.name); setNotice(''); setError(''); };

  const save = async () => {
    if (!name.trim()) { setError('The deck needs a name.'); return; }
    setBusy(true);
    setError('');
    try {
      await updateSavedDeck(saved.id, { name: name.trim(), archetype: saved.archetype, ...deck });
      await invalidateSavedDecks(queryClient);
      hapticSuccess();
      setEditing(false);
      setNotice('Saved.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this deck?')) return;
    try { await deleteSavedDeck(saved.id); await invalidateSavedDecks(queryClient); navigate('/my-decks'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const copyYdke = async () => {
    await copyText(buildYdke(flattenRows(deck.main), flattenRows(deck.extra), flattenRows(deck.side)));
    setNotice('YDKE code copied.');
  };
  const copyYdk = async () => {
    try {
      await copyText(await exportYdk(flattenRows(deck.main), flattenRows(deck.extra), flattenRows(deck.side)));
      setNotice('.ydk copied.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const btn = 'press text-xs px-2.5 py-1.5 rounded bg-md-surfaceHover hover:bg-md-borderLight';

  return (
    <div className="space-y-4">
      <Link to="/my-decks" className="text-xs text-md-blue">← My Decks</Link>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field max-w-xs" aria-label="Deck name" />
        ) : (
          <h2 className="page-title">{saved.name}</h2>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {editing ? (
            <>
              <button onClick={cancel} className={btn}>Cancel</button>
              <button disabled={busy} onClick={save} className="press text-xs font-semibold px-3 py-1.5 rounded bg-md-blue text-white hover:bg-md-blueLight disabled:opacity-50">
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setEditing(true); setNotice(''); }} className="press text-xs font-semibold px-3 py-1.5 rounded bg-md-blue text-white hover:bg-md-blueLight">Edit</button>
              <Link to="/trainer" onClick={() => localStorage.setItem('trainer_deck_id', String(saved.id))} className={btn}>Open in Line Trainer</Link>
              <button onClick={copyYdke} className={btn}>Copy YDKE</button>
              <button onClick={copyYdk} className={btn}>Copy .ydk</button>
              <button onClick={remove} className="press text-xs text-md-red px-2.5 py-1.5 rounded hover:bg-md-red/10">Delete</button>
            </>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {notice && <p className="text-xs text-md-textSecondary">{notice}</p>}
      {unknownCount > 0 && (
        <p className="text-xs text-md-gold">
          {unknownCount} card{unknownCount === 1 ? '' : 's'} in this deck {unknownCount === 1 ? "isn't" : "aren't"} in the card database. Edit the deck to remove {unknownCount === 1 ? 'it' : 'them'} or paste a corrected YDKE code.
        </p>
      )}

      {editing && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="bg-md-surface border border-md-border rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Add cards</p>
              <label className="ml-auto text-xs text-md-textMuted flex items-center gap-1">
                <input type="checkbox" checked={toSide} onChange={(e) => setToSide(e.target.checked)} /> to Side Deck
              </label>
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search cards…" />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {searchQ.isFetching && <p className="text-xs text-md-textMuted">Searching…</p>}
              {(debouncedQuery ? searchQ.data ?? [] : []).map((c) => (
                <button key={c.id} type="button" onClick={() => addFromSearch(c)}
                  className="press w-full flex items-center gap-2 text-left p-1.5 rounded hover:bg-md-surfaceHover">
                  <img src={c.image_small_url} alt="" className="w-7 h-10 object-cover rounded" loading="lazy" />
                  <span className="text-sm truncate">{c.name}</span>
                  <span className="ml-auto text-[10px] text-md-textMuted">{toSide ? 'side' : isExtraDeckType(c.type) ? 'extra' : 'main'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-md-surface border border-md-border rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold">Replace from a YDKE code</p>
            <textarea value={replaceText} onChange={(e) => setReplaceText(e.target.value)} rows={4}
              placeholder="ydke://…" className="input-field font-mono text-xs break-all" />
            <button disabled={!replaceText.trim()} onClick={replaceFromYdke} className={clsx(btn, 'disabled:opacity-50')}>Replace deck</button>
          </div>
        </div>
      )}

      {SECTIONS.map(({ key, label }) => {
        const rows = deck[key];
        const total = sectionTotal(rows);
        if (key === 'side' && total === 0 && !editing) return null;
        return (
          <section key={key} className="space-y-2" data-testid={`section-${key}`}>
            <h3 className="font-semibold">
              {label} <span className={clsx('text-sm', total > SECTION_MAX[key] ? 'text-md-red' : 'text-md-textMuted')}>({total})</span>
            </h3>
            {rows.length === 0 ? (
              <p className="text-xs text-md-textMuted">Empty.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                {rows.map((r) => {
                  const card = cards.get(r.passcode);
                  return (
                    <div key={r.passcode} className="relative" title={card?.name ?? `Unknown card ${r.passcode}`}>
                      <img
                        src={card?.image_small_url ?? cardImageSmall(r.passcode)}
                        alt={card?.name ?? `Unknown card ${r.passcode}`}
                        loading="lazy"
                        className={clsx('w-full aspect-[59/86] object-cover rounded bg-md-surfaceHover', !card && resolvedQ.data && 'ring-2 ring-md-gold')}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                      <span className="absolute top-1 right-1 text-[11px] font-bold bg-black/75 text-white rounded px-1.5">×{r.count}</span>
                      <p className="text-[10px] text-md-textMuted truncate mt-0.5">{card?.name ?? `#${r.passcode}`}</p>
                      {editing && (
                        <div className="flex justify-center gap-1 mt-0.5">
                          <button aria-label={`Remove a copy of ${card?.name ?? r.passcode}`} onClick={() => bump(key, r.passcode, -1)} className="press text-xs w-6 h-6 rounded bg-md-surfaceHover hover:bg-md-red/20">−</button>
                          <button aria-label={`Add a copy of ${card?.name ?? r.passcode}`} onClick={() => bump(key, r.passcode, 1)} className="press text-xs w-6 h-6 rounded bg-md-surfaceHover hover:bg-md-blue/20">+</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
