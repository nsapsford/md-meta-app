import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { LinePayload, LineSource, LineStep } from '../../api/lines';
import { newId } from '../../utils/trainer';
import { CardThumb, cardName, type CardMap } from './shared';

// Suggestions for the "if they use…" field. Free text is still allowed.
const COMMON_INTERRUPTIONS = [
  'Ash Blossom & Joyous Spring', 'Infinite Impermanence', 'Nibiru, the Primal Being', 'Effect Veiler',
  'Ghost Ogre & Snow Rabbit', 'Ghost Belle & Haunted Mansion', 'Droll & Lock Bird', 'D.D. Crow',
  'Maxx "C"', 'Mulcharmy Fuwalos', 'Mulcharmy Purulia', 'Called by the Grave', 'Crossout Designator',
  'Dimension Shifter', 'Bystial Magnamhut', 'Psy-Framegear Gamma', 'Forbidden Droplet', 'Triple Tactics Talent',
];

const SOURCE_LABEL: Record<LineSource, string> = {
  manual: 'Worked out myself',
  guide: 'From a guide / top player',
  solver: 'From the combo solver',
  'ai-draft': 'AI draft',
};

export default function LineEditor({
  initial, deckPasscodes, cards, saving, error, onSave, onCancel,
}: {
  initial: LinePayload;
  /** Distinct main-deck passcodes, for picking starters. */
  deckPasscodes: number[];
  cards: CardMap;
  saving: boolean;
  error: string;
  onSave: (line: LinePayload) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState(initial.status);
  const [source, setSource] = useState(initial.source);
  const [endBoard, setEndBoard] = useState(initial.end_board ?? '');
  const [slots, setSlots] = useState<number[][]>(initial.starters.length ? initial.starters.map((s) => [...s]) : [[]]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [steps, setSteps] = useState<LineStep[]>(
    initial.steps.length ? initial.steps.map((s) => ({ ...s, branches: s.branches.map((b) => ({ ...b })) })) : [{ id: newId(), text: '', branches: [] }]
  );
  const [localError, setLocalError] = useState('');

  const sortedDeck = useMemo(
    () => [...deckPasscodes].sort((a, b) => cardName(cards, a).localeCompare(cardName(cards, b))),
    [deckPasscodes, cards]
  );

  const toggleCard = (p: number) => {
    setSlots((prev) => prev.map((slot, i) => (i !== activeSlot ? slot : slot.includes(p) ? slot.filter((x) => x !== p) : [...slot, p])));
  };
  const addSlot = () => { setSlots((prev) => [...prev, []]); setActiveSlot(slots.length); };
  const removeSlot = (i: number) => {
    setSlots((prev) => (prev.length === 1 ? [[]] : prev.filter((_, j) => j !== i)));
    setActiveSlot(0);
  };

  const updateStep = (i: number, patch: Partial<LineStep>) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const moveStep = (i: number, d: -1 | 1) => setSteps((prev) => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  function save() {
    const cleanSlots = slots.filter((s) => s.length > 0);
    const cleanSteps = steps
      .map((s) => ({ ...s, text: s.text.trim(), branches: s.branches.filter((b) => b.interruption.trim() && b.response.trim()) }))
      .filter((s) => s.text.length > 0);
    if (!name.trim()) return setLocalError('Give the line a name.');
    if (status === 'verified' && (cleanSlots.length === 0 || cleanSteps.length === 0)) {
      return setLocalError('A verified line needs at least one starter and one step.');
    }
    setLocalError('');
    onSave({
      name: name.trim(),
      rank: initial.rank,
      status,
      source,
      starters: cleanSlots,
      steps: cleanSteps,
      end_board: endBoard.trim() || null,
    });
  }

  const input = 'w-full bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-sm text-md-text focus:outline-none focus:border-md-blue';

  return (
    <div className="space-y-5 p-4 rounded-2xl bg-md-surface border border-md-blue/30">
      <div className="space-y-2">
        <label className="block text-xs font-bold text-md-textMuted uppercase tracking-widest">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "1-card: Starter A → full board"' className={input} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex rounded-lg border border-md-border overflow-hidden">
          {(['draft', 'verified'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={clsx('px-3 py-1.5 text-xs font-bold capitalize', status === s ? (s === 'verified' ? 'bg-md-green/15 text-md-green' : 'bg-md-orange/15 text-md-orange') : 'text-md-textMuted')}>
              {s === 'verified' ? 'Verified' : 'Draft'}
            </button>
          ))}
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value as LineSource)}
          className="bg-md-bg border border-md-border rounded-lg px-2 py-1.5 text-xs text-md-text focus:outline-none focus:border-md-blue">
          {(Object.keys(SOURCE_LABEL) as LineSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-md-textMuted -mt-3">
        Mark verified only after you've played the full line in Master Duel (or seen it confirmed by a guide or the solver).
      </p>

      {/* Starters */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-md-textMuted uppercase tracking-widest">Cards needed in hand</label>
        <p className="text-[11px] text-md-textMuted">Each box is one card the line needs. Put interchangeable cards in the same box (“A or B”).</p>
        <div className="flex flex-wrap gap-2">
          {slots.map((slot, i) => (
            <div key={i}
              className={clsx('flex items-center gap-1 p-1.5 rounded-lg border min-h-[3rem]', i === activeSlot ? 'border-md-gold bg-md-gold/5' : 'border-md-border')}
              onClick={() => setActiveSlot(i)}>
              {slot.length === 0 ? <span className="text-[11px] text-md-textMuted px-1">Tap cards below</span> : slot.map((p) => (
                <CardThumb key={p} passcode={p} cards={cards} size="sm" />
              ))}
              <button type="button" onClick={(e) => { e.stopPropagation(); removeSlot(i); }} className="text-md-textMuted hover:text-md-red text-xs px-1" aria-label="Remove card slot">✕</button>
            </div>
          ))}
          <button type="button" onClick={addSlot} className="press px-3 rounded-lg border border-dashed border-md-border text-xs text-md-textSecondary">+ Another card</button>
        </div>
        <div className="flex flex-wrap gap-1 max-h-52 overflow-y-auto p-1 rounded-lg bg-md-bg/60 border border-md-border/40">
          {sortedDeck.map((p) => (
            <CardThumb key={p} passcode={p} cards={cards} size="sm"
              highlight={slots[activeSlot]?.includes(p)}
              dim={!slots[activeSlot]?.includes(p) && slots.some((s) => s.includes(p))}
              onClick={() => toggleCard(p)} />
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-md-textMuted uppercase tracking-widest">Steps</label>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={step.id} className="space-y-2 p-2.5 rounded-xl border border-md-border/60 bg-md-bg/40">
              <div className="flex gap-2">
                <span className="text-xs font-bold text-md-textMuted pt-2 w-4">{i + 1}</span>
                <textarea value={step.text} onChange={(e) => updateStep(i, { text: e.target.value })} rows={2}
                  placeholder="e.g. Normal Summon A; effect: add B from Deck" className={clsx(input, 'resize-y')} />
              </div>
              {step.branches.map((b, bi) => (
                <div key={b.id} className="ml-6 space-y-1.5 p-2 rounded-lg border border-md-red/25 bg-md-red/5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-md-red uppercase shrink-0">If they use</span>
                    <input list="trainer-interruptions" value={b.interruption}
                      onChange={(e) => updateStep(i, { branches: step.branches.map((x, xi) => (xi === bi ? { ...x, interruption: e.target.value } : x)) })}
                      placeholder="Ash Blossom…" className={input} />
                    <button type="button" onClick={() => updateStep(i, { branches: step.branches.filter((_, xi) => xi !== bi) })}
                      className="text-md-textMuted hover:text-md-red text-xs" aria-label="Remove branch">✕</button>
                  </div>
                  <textarea value={b.response} rows={2}
                    onChange={(e) => updateStep(i, { branches: step.branches.map((x, xi) => (xi === bi ? { ...x, response: e.target.value } : x)) })}
                    placeholder="…then I do this instead (and end on this board)" className={clsx(input, 'resize-y')} />
                </div>
              ))}
              <div className="ml-6 flex flex-wrap gap-2 text-[11px]">
                <button type="button" onClick={() => updateStep(i, { branches: [...step.branches, { id: newId(), interruption: '', response: '' }] })}
                  className="text-md-red font-semibold">+ Interruption here</button>
                <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-md-textMuted disabled:opacity-30">↑</button>
                <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-md-textMuted disabled:opacity-30">↓</button>
                <button type="button" onClick={() => setSteps((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)))}
                  disabled={steps.length === 1} className="text-md-textMuted hover:text-md-red disabled:opacity-30">Delete step</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setSteps((prev) => [...prev, { id: newId(), text: '', branches: [] }])}
          className="press w-full py-2 rounded-lg border border-dashed border-md-border text-xs text-md-textSecondary">+ Add step</button>
        <datalist id="trainer-interruptions">
          {COMMON_INTERRUPTIONS.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-bold text-md-textMuted uppercase tracking-widest">End board</label>
        <input value={endBoard} onChange={(e) => setEndBoard(e.target.value)} placeholder="What you end on, and what it stops" className={input} />
      </div>

      {(localError || error) && <p className="text-xs text-md-red">{localError || error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving}
          className="press flex-1 py-2.5 rounded-xl bg-md-blue text-white text-sm font-bold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save line'}
        </button>
        <button type="button" onClick={onCancel} className="press px-4 py-2.5 rounded-xl border border-md-border text-sm text-md-textSecondary">Cancel</button>
      </div>
    </div>
  );
}
