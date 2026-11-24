// The Line Trainer's Finder tab: matches the saved deck's list to a deck file, loads it, starts the
// worker pool and a solve session, restores the setup saved on this device and remembers the list.
// Two columns from xl: up (setup left, lines right); below that (phones, and desktops where the
// app's sidebar leaves too little room) one column with a Setup / Lines switch and a dock at the bottom. No server call: the list is passed in, or the copy saved on this
// device is used.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useIsNative } from '../../hooks/useIsNative';
import { importGenerated } from '../../api/lines';
import { copyText } from '../../utils/deckShare';
import type { DeckList } from '../../finder/deck/match';
import { DeckCompileError } from '../../finder/deck/deckError';
import type { DeckFileError } from '../../finder/deck/schema';
import type { CardId } from '../../finder/engine/types';
import { CANCEL, createPool, type Pool } from '../../finder/worker/pool';
import { cardTokens, shortOf } from '../../finder/model/cards';
import { restoreSnapshot, type FinderSnapshot } from '../../finder/model/finderState';
import { boardShort, headline } from '../../finder/model/lineView';
import { lineName, lineText, savedLineName } from '../../finder/model/lineText';
import { errorLine, openDeck, unknownNames, type OpenDeck } from '../../finder/model/openDeck';
import { createSolveSession, worstVerdict, type SessionView, type SolveSession } from '../../finder/model/solveSession';
import { saveFoundLine } from '../../finder/model/saveLine';
import { createFinderStorage } from '../../finder/model/storage';
import LoadingSpinner from '../common/LoadingSpinner';
import CardInspect from './CardInspect';
import { Stepper, type LineCtx } from './LineView';
import ResultsPanel, { type ResultsActions } from './ResultsPanel';
import SetupPanel, { type ChangeOpts } from './SetupPanel';
import { Btn, Fine, Panel, Seg, useThumbMap } from './ui';

export interface FinderTabProps {
  deckId: number; deckName: string; list: DeckList | null; fromDevice: boolean; onSaved(): void; onUseAiPanel(): void;
  /** Names for passcodes the deck file does not know (from the app's card data), for the unknown-cards note. */
  cardName?: (passcode: number) => string | undefined;
}

type Load = { s: 'loading' } | { s: 'nolist' } | { s: 'unknown' } | { s: 'broken'; errors: DeckFileError[] } | { s: 'failed'; message: string } | { s: 'ok'; deck: OpenDeck };
const DEBOUNCE_MS = 260;
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const EMPTY_CAT = new Map();

export default function FinderTab(p: FinderTabProps) {
  const { deckId, deckName, onSaved } = p;
  const native = useIsNative();
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
  const [prog, setProg] = useState<Record<string, number>>({});
  const [showWorst, setShowWorst] = useState(false);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef<FinderSnapshot | null>(null);
  const sessionRef = useRef<SolveSession | null>(null);
  // The setup is saved once typing pauses (not on every keystroke), and on leaving the tab.
  const saveT = useRef<{ t: ReturnType<typeof setTimeout>; run(): void } | null>(null);
  const flushSave = useCallback(() => { if (saveT.current) { clearTimeout(saveT.current.t); saveT.current.run(); saveT.current = null; } }, []);
  const saveSoon = useCallback((s: FinderSnapshot, ms: number) => {
    if (saveT.current) clearTimeout(saveT.current.t);
    const run = () => storage.saveState(deckId, s);
    saveT.current = { t: setTimeout(() => { saveT.current = null; run(); }, ms), run };
  }, [storage, deckId]);
  useEffect(() => flushSave, [flushSave]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), Math.max(2200, msg.length * 50));
  }, []);
  useEffect(() => () => { if (toastT.current) clearTimeout(toastT.current); }, []);

  // Remember the list on this device each time it is loaded from the server (not when it came from
  // this device: rewriting it would only make an old copy look new).
  useEffect(() => {
    if (p.list && !p.fromDevice) storage.remember(deckId, { name: deckName, list: p.list, savedAt: Date.now() });
  }, [listKey, deckId, deckName, storage, p.fromDevice]); // eslint-disable-line react-hooks/exhaustive-deps

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
    let live = true;
    pool.ready.catch((e) => {
      if (!live || e === CANCEL) return;
      if (e instanceof DeckCompileError) setLoad({ s: 'broken', errors: e.errors });
      else setLoad({ s: 'failed', message: (e as Error)?.message || String(e) || 'the search could not start' });
    });
    const session = createSolveSession({
      pool, traps: loaded.traps,
      onChange: (v) => {
        setView(v);
        // A record (a hand trap used) or undo changes the setup: show and keep it.
        if (v.snapshot && v.snapshot !== snapRef.current) { snapRef.current = v.snapshot; setSnap(v.snapshot); flushSave(); storage.saveState(deckId, v.snapshot); }
      },
    });
    sessionRef.current = session;
    const first = restoreSnapshot(storage.loadState(deckId), resolved, loaded.traps);
    snapRef.current = first;
    setSnap(first);
    session.start(first, resolved);
    return () => { live = false; session.dispose(); pool.dispose(); sessionRef.current = null; };
  }, [deck, deckId, storage, flushSave]);

  const change = useCallback((next: FinderSnapshot, o: ChangeOpts = {}) => {
    if (!deck) return;
    snapRef.current = next;
    setSnap(next);
    saveSoon(next, o.debounceMs ?? DEBOUNCE_MS);
    if (o.reset) { setProg({}); setShowWorst(false); }
    sessionRef.current?.start(next, deck.list, { debounceMs: o.debounceMs ?? DEBOUNCE_MS, reset: o.reset });
  }, [deck, saveSoon]);

  const cat = deck?.catalog ?? EMPTY_CAT;
  const thumbs = useThumbMap(cat);
  const short = useMemo(() => shortOf(cat), [cat]);
  const tokens = useMemo(() => cardTokens(cat), [cat]);
  const ctx: LineCtx | null = useMemo(() => (deck && view ? {
    mode: view.mode, intrs: view.intrs, traps: deck.loaded.traps, protections: deck.file.protections ?? [],
    cat: deck.catalog, thumbs, tokens, onInspect: setInspect,
  } : null), [deck, view, thumbs, tokens]);

  // The line shown and how far through it you are.
  const cur = view?.lines.find((l) => l.key === view.selected) ?? null;
  const worstOn = showWorst && !!cur?.worst;
  const shown = cur ? (worstOn ? cur.worst!.line : cur.line) : null;
  const progKey = cur ? cur.key + (worstOn ? '|w' : '') : '';
  const total = shown?.steps.length ?? 0;
  const lock = worstOn ? 0 : view?.base.steps ?? 0;
  const n = Math.max(Math.min(lock, total), Math.min(total, prog[progKey] ?? 0));
  const setN = useCallback((k: number) => { if (progKey) setProg((pr) => ({ ...pr, [progKey]: Math.max(0, Math.min(total, k)) })); }, [progKey, total]);

  // Space and the arrow keys walk the steps (not while typing).
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const onControl = !!t?.closest?.('button, summary, a');
      if (e.key === 'ArrowRight' || (e.key === ' ' && !onControl)) { setN(n + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { setN(n - 1); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, n, setN]);

  const actions: ResultsActions | null = useMemo(() => {
    const s = () => sessionRef.current;
    const again = () => { const sn = snapRef.current; if (deck && sn) s()?.start(sn, deck.list); };
    return {
      select: (k) => { setShowWorst(false); s()?.select(k); },
      deeper: () => { const sn = snapRef.current; if (deck && sn) s()?.start(sn, deck.list, { deep: true }); },
      whatIf: (i, it) => s()?.whatIf(i, it),
      closeBranch: () => s()?.closeBranch(),
      lock: (k) => { s()?.lockTo(k); again(); },
      record: (ev, after) => s()?.record(ev, after),
      hit: (i, it, used) => s()?.recordHit(i, it, used),
      undo: () => s()?.undo(),
      startOver: () => s()?.startOver(),
      copy: () => {
        if (!cur || !shown || !view) return;
        const lc = { mode: view.mode, hand: view.hand };
        const text = lineText(shown, short, { ...lc, name: lineName(cur.line, short, lc) });
        copyText(text).then(() => showToast('Steps copied.'), () => showToast('Copy was blocked. Select the steps and copy them by hand.'));
      },
      save: () => {
        if (!cur || !shown || !view || saving) return;
        setSaving(true);
        saveFoundLine(deckId, shown, savedLineName(cur.line, shown, short, { mode: view.mode, hand: view.hand }), importGenerated).then((r) => {
          setSaving(false);
          showToast(r.message);
          if (r.ok) onSaved();
        });
      },
      saving,
    };
  }, [deck, cur, shown, view, short, showToast, saving, deckId, onSaved]);

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
  const go = (v: 'setup' | 'lines') => { setPane(v); window.scrollTo(0, 0); };

  // The phone dock: on the setup side a peek at the best line; on the lines side the stepper.
  let peekBig = 'Add your hand', peekSub = 'Lines appear as you pick cards';
  if (cur && view) {
    const h = headline(cur.line, view.mode), v = worstVerdict(cur, view.mode, view.intrs);
    peekBig = view.drawFx ? `${plural(Number(cur.line.summary.draws) || 0, 'draw')} for ${boardShort(cur.line, view.mode)}` : `${h.big} ${h.small}`;
    peekSub = `${plural(cur.line.steps.length, 'step')}${cur.testing ? ' · testing…' : v ? ' · ' + v.short : ''}`;
  } else if (view && view.phase !== 'idle') { peekBig = 'Finding lines…'; peekSub = ''; }

  return (
    <div className="space-y-3 pb-24 xl:pb-4">
      {(onDevice || unknown.length > 0) && (
        <div className="space-y-1">
          {onDevice && <Fine className="text-md-orange">Using the list saved on this device.</Fine>}
          {unknown.length > 0 && <Fine>{deck.list.blanks} cards the Finder doesn't know are counted as blanks: {unknown.join(', ')}.</Fine>}
        </div>
      )}
      <Seg className="xl:hidden" label="View" value={pane} options={[['setup', 'Setup'], ['lines', 'Lines']]} onChange={go} />
      <div className="xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-4 xl:items-start">
        <div className={clsx(pane !== 'setup' && 'hidden xl:block')}>
          <SetupPanel snap={snap} list={deck.list} cat={deck.catalog} thumbs={thumbs} traps={traps} onChange={change} onToast={showToast} onInspect={setInspect} />
        </div>
        <div className={clsx(pane !== 'lines' && 'hidden xl:block')}>
          {ctx && actions ? (
            <ResultsPanel view={view} ctx={ctx} deck={deck} deckName={deck.file.name} short={short}
              progress={n} onProgress={setN} showWorst={worstOn} onToggleWorst={() => setShowWorst((w) => !w)} actions={actions} />
          ) : <LoadingSpinner />}
        </div>
      </div>

      <nav aria-label="Quick actions" className={clsx('xl:hidden fixed inset-x-0 z-30 px-3 py-2 bg-md-bg/[0.97] border-t border-md-border/60 shadow-2xl shadow-black/30', !native && 'md:left-40')}
        style={{ bottom: native ? 'calc(3.5rem + env(safe-area-inset-bottom))' : 0, paddingBottom: native ? undefined : 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
        {pane === 'lines' ? (
          <div className="flex items-center gap-2">
            <Btn onClick={() => go('setup')}>‹ Setup</Btn>
            <div className="flex-1 min-w-0">{shown && <Stepper n={n} total={total} onStep={(d) => setN(n + d)} />}</div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" disabled={!cur} onClick={() => go('lines')} className="press flex-1 min-w-0 text-left disabled:opacity-60">
              <b className="block text-sm tabular-nums text-md-text truncate">{peekBig}</b>
              <span className="block text-[11px] text-md-textMuted truncate">{peekSub}</span>
            </button>
            <Btn primary disabled={!cur} onClick={() => go('lines')}>View line ›</Btn>
          </div>
        )}
      </nav>

      <CardInspect id={inspect} cat={deck.catalog} list={deck.list} onClose={() => setInspect(null)} />
      {toast && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 xl:bottom-6 z-50 px-3 py-2 rounded-lg bg-md-surfaceAlt border border-md-border text-xs text-md-text shadow-surface-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
