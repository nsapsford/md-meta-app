// The Line Trainer's Finder tab: matches the saved deck's list to a deck file, loads it, starts the
// worker pool and a solve session, restores the setup saved on this device and remembers the list.
// Two columns from md: up (setup left, lines right); on a phone one column with a Setup / Lines
// switch. No server call: the list is passed in, or the copy saved on this device is used.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { DeckList } from '../../finder/deck/match';
import { DeckCompileError } from '../../finder/deck/deckError';
import type { DeckFileError } from '../../finder/deck/schema';
import type { CardId } from '../../finder/engine/types';
import { createPool, type Pool } from '../../finder/worker/pool';
import { restoreSnapshot, type FinderSnapshot } from '../../finder/model/finderState';
import { errorLine, openDeck, unknownNames, type OpenDeck } from '../../finder/model/openDeck';
import { createSolveSession, type SessionView, type SolveSession } from '../../finder/model/solveSession';
import { createFinderStorage } from '../../finder/model/storage';
import LoadingSpinner from '../common/LoadingSpinner';
import CardInspect from './CardInspect';
import SetupPanel, { type ChangeOpts } from './SetupPanel';
import { Btn, Fine, Panel, Seg, useThumbMap } from './ui';

export interface FinderTabProps {
  deckId: number; deckName: string; list: DeckList | null; fromDevice: boolean; onSaved(): void; onUseAiPanel(): void;
  /** Names for passcodes the deck file does not know (from the app's card data), for the unknown-cards note. */
  cardName?: (passcode: number) => string | undefined;
}

type Load = { s: 'loading' } | { s: 'nolist' } | { s: 'unknown' } | { s: 'broken'; errors: DeckFileError[] } | { s: 'failed'; message: string } | { s: 'ok'; deck: OpenDeck };
const DEBOUNCE_MS = 260;

export default function FinderTab(p: FinderTabProps) {
  const { deckId, deckName } = p;
  const storage = useMemo(() => createFinderStorage(), []);
  // The list: the one passed in, else the copy remembered on this device.
  const recalled = useMemo(() => (p.list ? null : storage.recall(deckId)), [p.list, storage, deckId]);
  const list = p.list ?? recalled?.list ?? null;
  const listKey = list ? JSON.stringify(list) : '';
  const onDevice = p.fromDevice || (!p.list && !!recalled);

  const [load, setLoad] = useState<Load>({ s: 'loading' });
  const [snap, setSnap] = useState<FinderSnapshot | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [pane, setPane] = useState<'setup' | 'lines'>('setup');
  const [inspect, setInspect] = useState<CardId | null>(null);
  const [toast, setToast] = useState('');
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef<FinderSnapshot | null>(null);
  const sessionRef = useRef<SolveSession | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 2200);
  }, []);
  useEffect(() => () => { if (toastT.current) clearTimeout(toastT.current); }, []);

  // Remember the list on this device each time it is loaded from the server.
  useEffect(() => {
    if (p.list) storage.remember(deckId, { name: deckName, list: p.list, savedAt: Date.now() });
  }, [listKey, deckId, deckName, storage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Match and load the deck file.
  useEffect(() => {
    if (!list) { setLoad({ s: 'nolist' }); return; }
    let live = true;
    setLoad({ s: 'loading' });
    openDeck(list).then(
      (r) => { if (live) setLoad(r.kind === 'ok' ? { s: 'ok', deck: r } : r.kind === 'broken' ? { s: 'broken', errors: r.errors } : { s: 'unknown' }); },
      (e) => { if (live) setLoad({ s: 'failed', message: (e as Error)?.message || String(e) }); },
    );
    return () => { live = false; };
  }, [listKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const deck = load.s === 'ok' ? load.deck : null;

  // The pool and the session, for as long as this deck is open.
  useEffect(() => {
    if (!deck) return;
    const { loaded, list: resolved } = deck;
    let pool: Pool;
    try {
      pool = createPool({ type: 'init', file: loaded.file, shared: loaded.shared, facts: loaded.facts, traps: loaded.traps });
    } catch (e) {
      setLoad({ s: 'failed', message: (e as Error)?.message || String(e) });
      return;
    }
    pool.ready.catch((e) => { if (e instanceof DeckCompileError) setLoad({ s: 'broken', errors: e.errors }); });
    const session = createSolveSession({
      pool, traps: loaded.traps,
      onChange: (v) => {
        setView(v);
        // A record (a hand trap used) or undo changes the setup: show and keep it.
        if (v.snapshot && v.snapshot !== snapRef.current) { snapRef.current = v.snapshot; setSnap(v.snapshot); storage.saveState(deckId, v.snapshot); }
      },
    });
    sessionRef.current = session;
    const first = restoreSnapshot(storage.loadState(deckId), resolved, loaded.traps);
    snapRef.current = first;
    setSnap(first);
    session.start(first, resolved);
    return () => { session.dispose(); pool.dispose(); sessionRef.current = null; };
  }, [deck, deckId, storage]);

  const change = useCallback((next: FinderSnapshot, o: ChangeOpts = {}) => {
    if (!deck) return;
    snapRef.current = next;
    setSnap(next);
    storage.saveState(deckId, next);
    sessionRef.current?.start(next, deck.list, { debounceMs: o.debounceMs ?? DEBOUNCE_MS, reset: o.reset });
  }, [deck, deckId, storage]);

  const thumbs = useThumbMap(deck?.catalog ?? EMPTY_CAT);

  if (load.s === 'nolist') {
    return <Panel><p className="text-sm text-md-textMuted">This deck's list isn't loaded yet, and none is saved on this device. Open the Finder once while online.</p></Panel>;
  }
  if (load.s === 'loading') return <LoadingSpinner />;
  if (load.s === 'unknown') {
    return (
      <Panel>
        <p className="text-sm text-md-text">The Line Finder doesn't know this deck yet.</p>
        <Btn primary onClick={p.onUseAiPanel}>Generate lines</Btn>
      </Panel>
    );
  }
  if (load.s === 'failed') return <Panel><p className="text-sm text-md-red">The Finder couldn't open this deck ({load.message}).</p></Panel>;
  if (load.s === 'broken') {
    return (
      <Panel>
        <p className="text-sm font-bold text-md-red">This deck's data file has a mistake</p>
        <ul className="space-y-1 text-xs text-md-textSecondary font-mono">
          {load.errors.map((e, i) => <li key={i}>{errorLine(e)}</li>)}
        </ul>
      </Panel>
    );
  }
  if (!deck || !snap) return <LoadingSpinner />;

  const unknown = deck.list.blanks ? unknownNames(list!, deck.list, p.cardName) : [];
  const traps = deck.loaded.traps;

  return (
    <div className="space-y-3 pb-24 md:pb-4">
      {(onDevice || unknown.length > 0) && (
        <div className="space-y-1">
          {onDevice && <Fine className="text-md-orange">Using the list saved on this device.</Fine>}
          {unknown.length > 0 && <Fine>{deck.list.blanks} cards the Finder doesn't know are counted as blanks: {unknown.join(', ')}.</Fine>}
        </div>
      )}
      <Seg className="md:hidden" label="View" value={pane} options={[['setup', 'Setup'], ['lines', 'Lines']]} onChange={(v) => { setPane(v); window.scrollTo(0, 0); }} />
      <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-4 md:items-start">
        <div className={clsx(pane !== 'setup' && 'hidden md:block')}>
          <SetupPanel snap={snap} list={deck.list} cat={deck.catalog} thumbs={thumbs} traps={traps} onChange={change} onToast={showToast} onInspect={setInspect} />
        </div>
        <div className={clsx('space-y-3', pane !== 'lines' && 'hidden md:block')}>
          <Panel><p className="text-xs text-md-textSecondary" aria-live="polite">{view ? `${view.phase} · ${view.lines.length} lines` : ''}</p></Panel>
        </div>
      </div>
      <CardInspect id={inspect} cat={deck.catalog} list={deck.list} onClose={() => setInspect(null)} />
      {toast && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-50 px-3 py-2 rounded-lg bg-md-surfaceAlt border border-md-border text-xs text-md-text shadow-surface-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

const EMPTY_CAT = new Map();
