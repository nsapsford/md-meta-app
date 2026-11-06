import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ComboLine, Grade } from '../../api/lines';
import { assignSlots, drawHand, judgePick, lineKey, missingSlots, type PickVerdict } from '../../utils/trainer';
import { hapticLight } from '../../utils/haptics';
import { CardThumb, GradeButtons, StatusBadge, StepReveal, cardName, type CardMap } from './shared';

const VERDICT_STYLE: Record<PickVerdict, string> = {
  best: 'border-md-green/40 bg-md-green/10 text-md-green',
  'correct-none': 'border-md-green/40 bg-md-green/10 text-md-green',
  'playable-worse': 'border-md-orange/40 bg-md-orange/10 text-md-orange',
  'not-playable': 'border-md-red/40 bg-md-red/10 text-md-red',
  'missed-line': 'border-md-red/40 bg-md-red/10 text-md-red',
};

export default function OpeningDrill({
  lines, mainDeck, cards, handSize, onGrade, onAddLineForHand,
}: {
  /** Lines eligible for this drill (verified only, unless drafts are included). */
  lines: ComboLine[];
  mainDeck: number[];
  cards: CardMap;
  handSize: number;
  onGrade: (itemKey: string, grade: Grade) => Promise<void>;
  onAddLineForHand: (hand: number[]) => void;
}) {
  const deal = useCallback(() => drawHand(mainDeck, handSize, Math.random), [mainDeck, handSize]);
  const [hand, setHand] = useState<number[]>(deal);
  const [pickedId, setPickedId] = useState<number | null | undefined>(undefined); // undefined = not picked yet
  const [revealed, setRevealed] = useState(0);
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState({ hands: 0, right: 0 });

  // Re-deal when the deck or hand size changes.
  const [dealtFor, setDealtFor] = useState({ mainDeck, handSize });
  if (dealtFor.mainDeck !== mainDeck || dealtFor.handSize !== handSize) {
    setDealtFor({ mainDeck, handSize });
    setHand(deal());
    setPickedId(undefined);
    setRevealed(0);
    setGraded(false);
  }

  const result = useMemo(
    () => (pickedId === undefined ? null : judgePick(lines, hand, pickedId)),
    [lines, hand, pickedId]
  );
  const best = result?.best ?? null;
  const usedByBest = useMemo(() => {
    if (!best) return new Set<number>();
    const idx = assignSlots(best.starters, hand) ?? [];
    return new Set(idx);
  }, [best, hand]);
  const pickedWrong = result != null && result.verdict !== 'best' && result.verdict !== 'correct-none';

  async function record(lineId: number, grade: Grade) {
    setSaving(true);
    setError('');
    try {
      await onGrade(lineKey(lineId), grade);
      setGraded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function pick(id: number | null) {
    hapticLight();
    const judged = judgePick(lines, hand, id);
    const right = judged.verdict === 'best' || judged.verdict === 'correct-none';
    setPickedId(id);
    setSession((s) => ({ hands: s.hands + 1, right: s.right + (right ? 1 : 0) }));
    // A wrong call is a miss for the line you should have played: it comes back sooner.
    if (!right && judged.best) void record(judged.best.id, 'again');
  }

  function next() {
    setHand(deal());
    setPickedId(undefined);
    setRevealed(0);
    setGraded(false);
    setError('');
  }

  if (mainDeck.length < handSize) {
    return <p className="text-sm text-md-textMuted">This deck has fewer than {handSize} main-deck cards.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[11px] text-md-textMuted">
        <span>Your opening hand ({handSize} cards)</span>
        {session.hands > 0 && <span>This session: {session.right}/{session.hands} right</span>}
      </div>
      <div className="grid gap-1.5 max-w-md mx-auto" style={{ gridTemplateColumns: `repeat(${hand.length}, minmax(0, 1fr))` }}>
        {hand.map((p, i) => (
          <CardThumb key={`${i}-${p}`} passcode={p} cards={cards} size="fill"
            highlight={usedByBest.has(i)} dim={result != null && best != null && !usedByBest.has(i)} />
        ))}
      </div>
      <p className="text-[11px] text-md-textMuted text-center">{hand.map((p) => cardName(cards, p)).join(' · ')}</p>

      {pickedId === undefined ? (
        <div className="space-y-2">
          <p className="text-sm font-bold text-md-text">What do you play?</p>
          {lines.length === 0 && (
            <p className="text-xs text-md-orange">No lines with starters to choose from yet. Add lines (or include drafts) first.</p>
          )}
          {lines.map((l) => (
            <button key={l.id} type="button" onClick={() => pick(l.id)}
              className="press w-full text-left px-3 py-2.5 rounded-xl bg-md-surface border border-md-border hover:border-md-blue/40 flex items-center gap-2">
              <span className="text-sm text-md-text flex-1">{l.name}</span>
              {l.status !== 'verified' && <StatusBadge line={l} />}
            </button>
          ))}
          <button type="button" onClick={() => pick(null)}
            className="press w-full px-3 py-2.5 rounded-xl border border-dashed border-md-border text-sm text-md-textSecondary">
            None of my lines works with this hand
          </button>
        </div>
      ) : result && (
        <div className="space-y-4">
          <div className={clsx('px-3 py-2.5 rounded-xl border text-sm', VERDICT_STYLE[result.verdict])}>
            {result.verdict === 'best' && <>Correct: <b>{best!.name}</b> is your best line here.</>}
            {result.verdict === 'correct-none' && <>Right: none of your stored lines starts from this hand.</>}
            {result.verdict === 'playable-worse' && <>Playable, but <b>{best!.name}</b> is ranked higher (better end board).</>}
            {result.verdict === 'not-playable' && (() => {
              const picked = lines.find((l) => l.id === pickedId)!;
              const missing = missingSlots(picked, hand);
              return (
                <>
                  This hand can't start <b>{picked.name}</b>
                  {missing.length > 0
                    ? <> — it needs {missing.map((slot) => slot.map((p) => cardName(cards, p)).join(' or ')).join(' and ')}.</>
                    : <> — it needs more copies than you drew.</>}
                  {best ? <> Best line: <b>{best.name}</b>.</> : <> None of your lines works here.</>}
                </>
              );
            })()}
            {result.verdict === 'missed-line' && <><b>{best!.name}</b> was playable from this hand.</>}
            {pickedWrong && best && <span className="block text-[11px] opacity-80 mt-1">Logged as a miss for {best.name}, so it comes back sooner.</span>}
          </div>

          {best ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-md-textMuted uppercase tracking-widest">Walk the line: {best.name}</p>
                {best.status !== 'verified' && <StatusBadge line={best} />}
              </div>
              <StepReveal steps={best.steps} revealed={revealed} onReveal={() => setRevealed((r) => r + 1)} />
              {revealed >= best.steps.length && best.end_board && (
                <p className="text-xs text-md-textSecondary">End board: <span className="text-md-text">{best.end_board}</span></p>
              )}
              {revealed >= best.steps.length && !pickedWrong && !graded && (
                <div className="space-y-1.5">
                  <p className="text-xs text-md-textMuted">How well did you know it?</p>
                  <GradeButtons onGrade={(g) => record(best.id, g)} disabled={saving} />
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => onAddLineForHand(hand)}
              className="press w-full py-2.5 rounded-xl border border-md-blue/40 bg-md-blue/10 text-sm font-bold text-md-blue">
              Add a line for this hand
            </button>
          )}

          {error && <p className="text-xs text-md-red">{error}</p>}
          {(graded || pickedWrong || !best) && (
            <button type="button" onClick={next} disabled={saving}
              className="press w-full py-3 rounded-xl bg-md-blue text-white text-sm font-bold disabled:opacity-50">
              Next hand
            </button>
          )}
        </div>
      )}
    </div>
  );
}
