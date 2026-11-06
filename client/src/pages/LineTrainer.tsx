import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SavedDeck } from '../api/deckIO';
import {
  createLine, updateLine, deleteLine, importAiLines, gradeItem,
  type ComboLine, type DrillReview, type Grade, type LinePayload,
} from '../api/lines';
import { savedDecksQuery, comboLinesQuery, drillReviewsQuery, resolvedCardsQuery } from '../queries/options';
import { drillItems, dueItems, expandDeck } from '../utils/trainer';
import ErrorBanner from '../components/common/ErrorBanner';
import LineEditor from '../components/trainer/LineEditor';
import LineLibrary from '../components/trainer/LineLibrary';
import OpeningDrill from '../components/trainer/OpeningDrill';
import ReviewSession from '../components/trainer/ReviewSession';
import CoverageView from '../components/trainer/CoverageView';
import type { CardMap } from '../components/trainer/shared';

const DECK_KEY = 'trainer_deck_id';
const DRAFTS_KEY = 'trainer_include_drafts';
const EMPTY_DECKS: SavedDeck[] = [];
const EMPTY_LINES: ComboLine[] = [];
const EMPTY_REVIEWS: DrillReview[] = [];

type Tab = 'drill' | 'lines' | 'coverage';
type Editing = { line: ComboLine | null; initial: LinePayload } | null;

const toPayload = (l: ComboLine): LinePayload => ({
  name: l.name, rank: l.rank, status: l.status, source: l.source, starters: l.starters, steps: l.steps, end_board: l.end_board,
});

export default function LineTrainer() {
  const queryClient = useQueryClient();
  const decksQ = useQuery(savedDecksQuery());
  const decks = decksQ.data ?? EMPTY_DECKS;
  const [deckId, setDeckId] = useState<number | null>(() => {
    const stored = localStorage.getItem(DECK_KEY) ?? localStorage.getItem('duel_mode_deck_id');
    return stored ? Number(stored) : null;
  });
  const deck = useMemo(() => decks.find((d) => d.id === deckId) ?? null, [decks, deckId]);

  const linesQ = useQuery({ ...comboLinesQuery(deckId ?? 0), enabled: deck != null });
  const reviewsQ = useQuery({ ...drillReviewsQuery(deckId ?? 0), enabled: deck != null });
  const lines = linesQ.data ?? EMPTY_LINES;
  const reviews = reviewsQ.data ?? EMPTY_REVIEWS;

  const mainDeck = useMemo(() => (deck ? expandDeck(deck.main_json) : []), [deck]);
  const deckPasscodes = useMemo(() => [...new Set(mainDeck)], [mainDeck]);
  const cardsQ = useQuery(resolvedCardsQuery(deckPasscodes));
  const cards: CardMap = useMemo(() => new Map((cardsQ.data ?? []).map((c) => [Number(c.id), c])), [cardsQ.data]);

  const [tab, setTab] = useState<Tab>('drill');
  const [drillMode, setDrillMode] = useState<'hands' | 'review'>('hands');
  const [reviewRun, setReviewRun] = useState(0); // bump to start a fresh review snapshot
  const [goingSecond, setGoingSecond] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(() => localStorage.getItem(DRAFTS_KEY) === '1');
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [actionError, setActionError] = useState('');
  const [flash, setFlash] = useState('');

  const eligible = useMemo(
    () => lines.filter((l) => includeDrafts || l.status === 'verified'),
    [lines, includeDrafts]
  );
  const handLines = useMemo(() => eligible.filter((l) => l.starters.length > 0), [eligible]);
  const now = Math.floor(Date.now() / 1000);
  const due = useMemo(() => dueItems(drillItems(eligible, reviews), now), [eligible, reviews, now]);

  // Load failures get a Retry; a failed action (save order, import, delete) just says what went wrong.
  const loadError = !linesQ.data ? (linesQ.error ?? reviewsQ.error)?.message ?? '' : '';

  function pickDeck(id: number) {
    setDeckId(id);
    localStorage.setItem(DECK_KEY, String(id));
    setEditing(null);
  }

  function toggleDrafts() {
    setIncludeDrafts((v) => {
      localStorage.setItem(DRAFTS_KEY, v ? '0' : '1');
      return !v;
    });
  }

  const refreshLines = () => queryClient.invalidateQueries({ queryKey: ['lines', deckId] });

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  }

  function startNew(starters: number[][] = []) {
    const maxRank = lines.reduce((m, l) => Math.max(m, l.rank), 0);
    setEditorError('');
    setEditing({
      line: null,
      initial: { name: '', rank: maxRank + 10, status: 'draft', source: 'manual', starters, steps: [], end_board: null },
    });
    setTab('lines');
  }

  async function saveLine(payload: LinePayload) {
    if (!deckId || !editing) return;
    setBusy(true);
    setEditorError('');
    try {
      if (editing.line) await updateLine(editing.line.id, payload);
      else await createLine(deckId, payload);
      await refreshLines();
      setEditing(null);
      showFlash('Line saved');
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(line: ComboLine) {
    if (!window.confirm(`Delete "${line.name}" and its drill history?`)) return;
    setBusy(true);
    try {
      await deleteLine(line.id);
      await refreshLines();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Re-number ranks 10, 20, 30… in the new order and save only the lines that moved.
  async function moveLine(line: ComboLine, direction: -1 | 1) {
    const order = [...lines];
    const i = order.findIndex((l) => l.id === line.id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    const changed = order.map((l, k) => ({ l, rank: (k + 1) * 10 })).filter(({ l, rank }) => l.rank !== rank);
    setBusy(true);
    try {
      await Promise.all(changed.map(({ l, rank }) => updateLine(l.id, { ...toPayload(l), rank })));
      await refreshLines();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      await refreshLines();
    } finally {
      setBusy(false);
    }
  }

  async function importAi() {
    if (!deckId) return;
    setBusy(true);
    setActionError('');
    try {
      const { created, skipped } = await importAiLines(deckId);
      await refreshLines();
      showFlash(`${created.length} AI draft${created.length === 1 ? '' : 's'} imported${skipped ? `, ${skipped} already here` : ''}. Set their starters and check them before marking verified.`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function grade(itemKey: string, g: Grade) {
    if (!deckId) return;
    const row = await gradeItem(deckId, itemKey, g);
    queryClient.setQueryData<DrillReview[]>(drillReviewsQuery(deckId).queryKey, (prev = []) => [
      ...prev.filter((r) => r.item_key !== row.item_key),
      row,
    ]);
  }

  if (!deck) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Line Trainer</h1>
        <p className="text-sm text-md-textSecondary">Pick the deck whose lines you want to learn.</p>
        {decksQ.isPending ? (
          <p className="text-sm text-md-textMuted">Loading…</p>
        ) : decks.length === 0 ? (
          <p className="text-sm text-md-textMuted">No saved decks yet. <Link to="/build-deck" className="text-md-blue underline">Save one</Link> first.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {decks.map((d) => (
              <button key={d.id} type="button" onClick={() => pickDeck(d.id)}
                className="press text-left p-4 rounded-xl bg-md-surface border border-md-border hover:border-md-blue/40 transition-colors">
                <p className="font-bold text-md-text">{d.name}</p>
                {d.archetype && <p className="text-xs text-md-textMuted">{d.archetype}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} type="button" onClick={() => { setTab(t); setEditing(null); setActionError(''); }}
      className={clsx('flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors border',
        tab === t ? 'bg-md-blue/15 text-md-blue border-md-blue/30' : 'bg-md-surface text-md-textMuted border-md-border')}>
      {label}
    </button>
  );
  const chip = (active: boolean, onClick: () => void, label: string) => (
    <button type="button" onClick={onClick}
      className={clsx('px-2.5 py-1 rounded-full text-xs font-bold border transition-colors',
        active ? 'bg-md-blue/15 text-md-blue border-md-blue/30' : 'bg-md-surface text-md-textMuted border-md-border')}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4 pb-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Line Trainer</h1>
          <p className="text-xs text-md-textMuted">{deck.name} · {lines.length} line{lines.length === 1 ? '' : 's'}</p>
        </div>
        <button type="button" onClick={() => setDeckId(null)} className="text-xs text-md-blue">Switch deck</button>
      </div>

      {loadError && <ErrorBanner message={loadError} onRetry={() => void refreshLines()} />}
      {actionError && (
        <div className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg bg-md-red/10 border border-md-red/30">
          <span className="text-xs text-md-red">{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="text-xs text-md-red/80" aria-label="Dismiss">✕</button>
        </div>
      )}
      {flash && <p className="text-xs text-md-green">{flash}</p>}

      <div className="flex gap-2">
        {tabBtn('drill', 'Drill')}
        {tabBtn('lines', 'Lines')}
        {tabBtn('coverage', 'Coverage')}
      </div>

      {editing ? (
        <LineEditor
          key={editing.line?.id ?? 'new'}
          initial={editing.initial}
          deckPasscodes={deckPasscodes}
          cards={cards}
          saving={busy}
          error={editorError}
          onSave={saveLine}
          onCancel={() => setEditing(null)}
        />
      ) : tab === 'lines' ? (
        <LineLibrary
          lines={lines}
          cards={cards}
          mainDeck={mainDeck}
          busy={busy}
          onNew={() => startNew()}
          onEdit={(l) => { setEditorError(''); setEditing({ line: l, initial: toPayload(l) }); }}
          onDelete={removeLine}
          onMove={moveLine}
          onImportAi={importAi}
        />
      ) : tab === 'coverage' ? (
        <CoverageView lines={eligible} mainDeck={mainDeck} />
      ) : linesQ.isPending ? (
        <p className="text-sm text-md-textMuted">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {chip(drillMode === 'hands', () => setDrillMode('hands'), 'Opening hands')}
            {chip(drillMode === 'review', () => { setDrillMode('review'); setReviewRun((n) => n + 1); }, `Review due (${due.length})`)}
            <span className="w-px h-4 bg-md-border mx-1" />
            {drillMode === 'hands' && chip(goingSecond, () => setGoingSecond((v) => !v), goingSecond ? 'Going 2nd · 6 cards' : 'Going 1st · 5 cards')}
            {chip(includeDrafts, toggleDrafts, includeDrafts ? 'Drafts included' : 'Verified only')}
          </div>
          {includeDrafts && lines.some((l) => l.status !== 'verified') && (
            <p className="text-[11px] text-md-orange">Unverified lines may be wrong. Drilling them can teach you a line that doesn't work.</p>
          )}
          {eligible.length === 0 ? (
            <div className="p-4 rounded-xl bg-md-surface border border-md-border text-sm text-md-textMuted space-y-2">
              <p>{lines.length === 0 ? 'No lines for this deck yet.' : 'No verified lines yet. Verify a line, or include drafts.'}</p>
              <button type="button" onClick={() => { setTab('lines'); }} className="text-md-blue font-semibold">Go to Lines</button>
            </div>
          ) : drillMode === 'hands' ? (
            <OpeningDrill
              lines={handLines}
              mainDeck={mainDeck}
              cards={cards}
              handSize={goingSecond ? 6 : 5}
              onGrade={grade}
              onAddLineForHand={(hand) => startNew([...new Set(hand)].map((p) => [p]))}
            />
          ) : (
            <ReviewSession
              key={reviewRun}
              items={due}
              cards={cards}
              onGrade={grade}
              onExit={() => setDrillMode('hands')}
            />
          )}
        </div>
      )}
    </div>
  );
}
