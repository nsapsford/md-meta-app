import { useState, useEffect, useMemo } from 'react';
import { getSavedDecks, type SavedDeck } from '../api/deckIO';
import { getGames, logGame } from '../api/personalGames';
import {
  getOpponentDossier, getPilotDossier,
  generateOpponentDossier, generatePilotDossier,
  addDossierNote, type OpponentDossierContent, type PilotDossierContent,
  type DossierRow, type DossierNote, type NoteCategory, type DossierDepth,
} from '../api/dossiers';
import ErrorBanner from '../components/common/ErrorBanner';
import { hapticLight } from '../utils/haptics';

const MY_DECK_KEY = 'duel_mode_deck_id';

const CATEGORY_LABEL: Record<NoteCategory, string> = {
  'negate-priority': 'Negate priority',
  'play-around': 'Play-around',
  'combo-line': 'Combo line',
  general: 'General',
};

function DossierNotes({ notes, onAdd }: { notes: DossierNote[]; onAdd: (category: NoteCategory, text: string) => void }) {
  const [category, setCategory] = useState<NoteCategory>('general');
  const [text, setText] = useState('');

  return (
    <div className="mt-4 pt-4 border-t border-md-border/40">
      <h4 className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-2">Your notes</h4>
      {notes.length === 0 ? (
        <p className="text-xs text-md-textMuted mb-3">No notes yet.</p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {notes.map((n) => (
            <li key={n.id} className="text-sm text-md-textSecondary">
              <span className="text-[10px] font-bold text-md-blue uppercase mr-1.5">{CATEGORY_LABEL[n.category]}</span>
              {n.note}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)}
          className="bg-md-bg border border-md-border rounded-lg px-2 py-2 text-xs text-md-text focus:outline-none focus:border-md-blue">
          {(Object.keys(CATEGORY_LABEL) as NoteCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note..."
          className="flex-1 min-w-[140px] bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue" />
        <button
          onClick={() => { if (text.trim()) { onAdd(category, text.trim()); setText(''); } }}
          className="px-3 py-2 text-xs font-bold rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 hover:bg-md-blue/25 transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

function OpponentDossierView({
  content, notes, onAddNote,
}: { content: OpponentDossierContent; notes: DossierNote[]; onAddNote: (c: NoteCategory, t: string) => void }) {
  return (
    <div>
      <p className="text-sm text-md-text mb-4">{content.overview}</p>
      <Section title="Key starters" items={content.keyStarters} />
      <Section title="Choke points — negate these" items={content.chokePoints} accentClass="text-md-red" />
      <Section title="Typical end boards" items={content.typicalEndBoards} />
      <Section title="Play-arounds" items={content.playArounds} accentClass="text-md-green" />
      <DossierNotes notes={notes} onAdd={onAddNote} />
    </div>
  );
}

function PilotDossierView({
  content, notes, onAddNote,
}: { content: PilotDossierContent; notes: DossierNote[]; onAddNote: (c: NoteCategory, t: string) => void }) {
  return (
    <div>
      <p className="text-sm text-md-text mb-4">{content.overview}</p>
      <Section title="Combo lines" items={content.comboLines} accentClass="text-md-blue" />
      <Section title="Playing under interruption" items={content.underInterruption} accentClass="text-md-red" />
      <Section title="Key cards" items={content.keyStarters} />
      <Section title="Matchup tips" items={content.matchupTips.map((t) => `vs ${t.opponent}: ${t.tip}`)} />
      <DossierNotes notes={notes} onAdd={onAddNote} />
    </div>
  );
}

// accentClass takes the full Tailwind class (e.g. "text-md-red"), not just the
// color token — Tailwind's JIT scanner only picks up literal class strings in
// source, so building the class via `text-${accent}` interpolation would
// silently produce no styling in a production build.
function Section({ title, items, accentClass }: { title: string; items: string[]; accentClass?: string }) {
  return (
    <div className="mb-4">
      <h4 className={`text-xs font-bold uppercase tracking-widest mb-1.5 ${accentClass || 'text-md-textMuted'}`}>{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-md-textSecondary leading-snug">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function DuelMode() {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [recentOpponents, setRecentOpponents] = useState<string[]>([]);
  const [myDeckId, setMyDeckId] = useState<number | null>(() => {
    const stored = localStorage.getItem(MY_DECK_KEY);
    return stored ? Number(stored) : null;
  });
  const [opponentInput, setOpponentInput] = useState('');
  const [activeOpponent, setActiveOpponent] = useState<string | null>(null);
  const [tab, setTab] = useState<'opponent' | 'pilot'>('opponent');

  // Cached per "<key>:<depth>" so switching the depth toggle between an
  // already-generated quick and detailed dossier is instant (no refetch);
  // an absent cache entry (vs. one holding dossier: null) is what drives the
  // loading indicator below.
  type DepthEntry<T> = { dossier: DossierRow<T> | null; stale: boolean };
  const [opponentCache, setOpponentCache] = useState<Record<string, DepthEntry<OpponentDossierContent>>>({});
  const [opponentNotes, setOpponentNotes] = useState<DossierNote[]>([]);
  const [pilotCache, setPilotCache] = useState<Record<string, DepthEntry<PilotDossierContent>>>({});
  const [pilotNotes, setPilotNotes] = useState<DossierNote[]>([]);

  const [generating, setGenerating] = useState(false);
  // Defaults to 'quick' since Duel Mode is a live, mid-duel second screen —
  // 'detailed' is there for unhurried post-game review generation.
  const [depth, setDepth] = useState<DossierDepth>('quick');
  const [error, setError] = useState('');
  const [logFlash, setLogFlash] = useState('');

  useEffect(() => {
    getSavedDecks().then(setDecks).catch(() => {});
    getGames({ limit: 50 })
      .then((games) => {
        const seen = new Set<string>();
        const recent: string[] = [];
        for (const g of games) {
          if (!seen.has(g.opponent_deck)) { seen.add(g.opponent_deck); recent.push(g.opponent_deck); }
        }
        setRecentOpponents(recent.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  const myDeck = useMemo(() => decks.find((d) => d.id === myDeckId) ?? null, [decks, myDeckId]);

  const opponentKey = activeOpponent ? `${activeOpponent}:${depth}` : null;
  const opponentEntry = opponentKey ? opponentCache[opponentKey] : undefined;
  const pilotKey = myDeckId ? `${myDeckId}:${depth}` : null;
  const pilotEntry = pilotKey ? pilotCache[pilotKey] : undefined;

  function pickMyDeck(id: number) {
    setMyDeckId(id);
    localStorage.setItem(MY_DECK_KEY, String(id));
  }

  function selectOpponent(archetype: string) {
    setError('');
    setActiveOpponent(archetype);
  }

  // Fetches the archetype+depth combo the first time it's viewed; already-seen
  // combos are served straight from opponentCache, so flipping the toggle
  // back and forth between a previously-generated quick/detailed pair is instant.
  useEffect(() => {
    if (!activeOpponent || !opponentKey || opponentCache[opponentKey] !== undefined) return;
    let cancelled = false;
    getOpponentDossier(activeOpponent, depth)
      .then((res) => {
        if (cancelled) return;
        setOpponentCache((prev) => ({ ...prev, [opponentKey]: { dossier: res.dossier, stale: res.stale } }));
        setOpponentNotes(res.notes);
      })
      .catch((e: any) => !cancelled && setError(e.message || 'Failed to load dossier'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOpponent, depth]);

  useEffect(() => {
    if (!myDeckId || !pilotKey || pilotCache[pilotKey] !== undefined) return;
    let cancelled = false;
    getPilotDossier(myDeckId, depth)
      .then((res) => {
        if (cancelled) return;
        setPilotCache((prev) => ({ ...prev, [pilotKey]: { dossier: res.dossier, stale: res.stale } }));
        setPilotNotes(res.notes);
      })
      .catch((e: any) => !cancelled && setError(e.message || 'Failed to load dossier'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDeckId, depth]);

  async function handleGenerateOpponent() {
    if (!activeOpponent || !opponentKey) return;
    setGenerating(true);
    setError('');
    try {
      const generated = await generateOpponentDossier(activeOpponent, depth);
      setOpponentCache((prev) => ({ ...prev, [opponentKey]: { dossier: generated, stale: false } }));
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGeneratePilot() {
    if (!myDeckId || !pilotKey) return;
    setGenerating(true);
    setError('');
    try {
      const generated = await generatePilotDossier(myDeckId, depth);
      setPilotCache((prev) => ({ ...prev, [pilotKey]: { dossier: generated, stale: false } }));
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddNote(kind: 'opponent' | 'pilot', category: NoteCategory, note: string) {
    const note_ = await addDossierNote(
      kind === 'opponent'
        ? { kind, archetype: activeOpponent!, category, note }
        : { kind, deck_id: myDeckId!, category, note }
    );
    if (kind === 'opponent') setOpponentNotes((prev) => [note_, ...prev]);
    else setPilotNotes((prev) => [note_, ...prev]);
  }

  async function handleLogResult(result: 'win' | 'loss' | 'draw') {
    if (!myDeck || !activeOpponent) return;
    hapticLight();
    try {
      await logGame({ deck_played: myDeck.archetype || myDeck.name, opponent_deck: activeOpponent, result, went_first: null, notes: null });
      setLogFlash(`✓ ${result.toUpperCase()} logged`);
      setTimeout(() => setLogFlash(''), 2500);
    } catch (e: any) {
      setLogFlash(`Failed: ${e.message || 'unknown error'}`);
      setTimeout(() => setLogFlash(''), 4000);
    }
  }

  if (!myDeck) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-md-text">Duel Mode</h1>
        <p className="text-sm text-md-textSecondary">Pick the deck you're playing this session.</p>
        {decks.length === 0 ? (
          <p className="text-sm text-md-textMuted">No saved decks yet — save one in My Decks first.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {decks.map((d) => (
              <button key={d.id} onClick={() => pickMyDeck(d.id)}
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

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-md-text">Duel Mode</h1>
          <p className="text-xs text-md-textMuted">Playing {myDeck.name}</p>
        </div>
        <button onClick={() => setMyDeckId(null)} className="text-xs text-md-blue">Switch deck</button>
      </div>

      {error && <ErrorBanner message={error} />}

      {!activeOpponent ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={opponentInput} onChange={(e) => setOpponentInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && opponentInput.trim() && selectOpponent(opponentInput.trim())}
              placeholder="Opponent's archetype..."
              className="flex-1 bg-md-surface border border-md-border rounded-xl px-3 py-3 text-base text-md-text focus:outline-none focus:border-md-blue" />
            <button onClick={() => opponentInput.trim() && selectOpponent(opponentInput.trim())}
              className="px-4 py-3 rounded-xl bg-md-blue/15 text-md-blue border border-md-blue/30 font-bold">
              Go
            </button>
          </div>
          {recentOpponents.length > 0 && (
            <div>
              <p className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-2">Recent opponents</p>
              <div className="flex flex-wrap gap-2">
                {recentOpponents.map((o) => (
                  <button key={o} onClick={() => selectOpponent(o)}
                    className="press px-3 py-2 rounded-lg bg-md-surface border border-md-border text-sm text-md-textSecondary hover:border-md-blue/40">
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setActiveOpponent(null)} className="text-xs text-md-blue">← Back</button>
            <h2 className="text-lg font-bold text-md-text">{activeOpponent}</h2>
            <div className="w-10" />
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('opponent')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${tab === 'opponent' ? 'bg-md-blue/15 text-md-blue border border-md-blue/30' : 'bg-md-surface text-md-textMuted border border-md-border'}`}>
              Answer them
            </button>
            <button onClick={() => setTab('pilot')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${tab === 'pilot' ? 'bg-md-blue/15 text-md-blue border border-md-blue/30' : 'bg-md-surface text-md-textMuted border border-md-border'}`}>
              Your lines
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-bold text-md-textMuted uppercase tracking-widest">Generate:</span>
            <button onClick={() => setDepth('quick')}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${depth === 'quick' ? 'bg-md-blue/15 text-md-blue border border-md-blue/30' : 'bg-md-surface text-md-textMuted border border-md-border'}`}>
              Quick
            </button>
            <button onClick={() => setDepth('detailed')}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${depth === 'detailed' ? 'bg-md-blue/15 text-md-blue border border-md-blue/30' : 'bg-md-surface text-md-textMuted border border-md-border'}`}>
              Detailed
            </button>
            <button
              onClick={tab === 'opponent' ? handleGenerateOpponent : handleGeneratePilot}
              disabled={generating || (tab === 'opponent' ? !activeOpponent : !myDeckId)}
              className="ml-auto px-2.5 py-1 rounded-full text-xs font-bold bg-md-surface text-md-textMuted border border-md-border hover:border-md-blue/40 disabled:opacity-50 transition-colors">
              {generating ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>

          {tab === 'opponent' ? (
            opponentEntry === undefined ? (
              <p className="text-sm text-md-textMuted">Loading...</p>
            ) : opponentEntry.dossier ? (
              <div>
                {opponentEntry.stale && (
                  <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-md-orange/10 border border-md-orange/30">
                    <span className="text-xs text-md-orange">Meta has moved since this was generated.</span>
                    <button onClick={handleGenerateOpponent} disabled={generating}
                      className="text-xs font-bold text-md-orange underline disabled:opacity-50">
                      {generating ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                )}
                <OpponentDossierView
                  content={opponentEntry.dossier.content_json}
                  notes={opponentNotes}
                  onAddNote={(c, t) => handleAddNote('opponent', c, t)}
                />
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-md-surface border border-md-border text-center">
                <p className="text-sm text-md-textMuted mb-3">No {depth} dossier yet for {activeOpponent}.</p>
                <button onClick={handleGenerateOpponent} disabled={generating}
                  className="px-4 py-2 rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 text-sm font-bold disabled:opacity-50">
                  {generating ? 'Generating...' : 'Generate dossier'}
                </button>
              </div>
            )
          ) : pilotEntry === undefined ? (
            <p className="text-sm text-md-textMuted">Loading...</p>
          ) : pilotEntry.dossier ? (
            <div>
              {pilotEntry.stale && (
                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-md-orange/10 border border-md-orange/30">
                  <span className="text-xs text-md-orange">This deck changed since the guide was generated.</span>
                  <button onClick={handleGeneratePilot} disabled={generating}
                    className="text-xs font-bold text-md-orange underline disabled:opacity-50">
                    {generating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              )}
              <PilotDossierView
                content={pilotEntry.dossier.content_json}
                notes={pilotNotes}
                onAddNote={(c, t) => handleAddNote('pilot', c, t)}
              />
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-md-surface border border-md-border text-center">
              <p className="text-sm text-md-textMuted mb-3">No {depth} pilot guide yet for {myDeck.name}.</p>
              <button onClick={handleGeneratePilot} disabled={generating}
                className="px-4 py-2 rounded-lg bg-md-blue/15 text-md-blue border border-md-blue/30 text-sm font-bold disabled:opacity-50">
                {generating ? 'Generating...' : 'Generate pilot guide'}
              </button>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-md-border/40">
            <p className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-2">Log result</p>
            {logFlash && <p className="text-xs text-md-green mb-2">{logFlash}</p>}
            <div className="flex gap-2">
              {(['win', 'loss', 'draw'] as const).map((r) => (
                <button key={r} onClick={() => handleLogResult(r)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    r === 'win' ? 'bg-md-green/15 text-md-green border-md-green/30'
                    : r === 'loss' ? 'bg-md-red/15 text-md-red border-md-red/30'
                    : 'bg-md-textMuted/15 text-md-textMuted border-md-border'
                  }`}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
