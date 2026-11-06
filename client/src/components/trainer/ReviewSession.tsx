import { useState } from 'react';
import type { Grade } from '../../api/lines';
import type { DrillItem } from '../../utils/trainer';
import { GradeButtons, StarterSlots, StatusBadge, StepReveal, type CardMap } from './shared';

/**
 * Works through the items that were due when the session started (a fixed
 * snapshot, so grading an item doesn't reshuffle the queue mid-session).
 */
export default function ReviewSession({
  items, cards, onGrade, onExit,
}: {
  items: DrillItem[];
  cards: CardMap;
  onGrade: (itemKey: string, grade: Grade) => Promise<void>;
  onExit: () => void;
}) {
  const [queue] = useState(items);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [answerShown, setAnswerShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tally, setTally] = useState<Record<Grade, number>>({ again: 0, hard: 0, good: 0, easy: 0 });

  const item = queue[index];

  async function grade(g: Grade) {
    setSaving(true);
    setError('');
    try {
      await onGrade(item.key, g);
      setTally((t) => ({ ...t, [g]: t[g] + 1 }));
      setIndex((i) => i + 1);
      setRevealed(0);
      setAnswerShown(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (queue.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-md-surface border border-md-border text-sm text-md-textMuted">
        Nothing due right now. Drill opening hands, or come back later.
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-4 rounded-xl bg-md-surface border border-md-border space-y-3 text-center">
        <p className="text-sm font-bold text-md-text">Review done</p>
        <p className="text-xs text-md-textMuted">
          {queue.length} item{queue.length === 1 ? '' : 's'}: {tally.again} missed, {tally.hard} hard, {tally.good} good, {tally.easy} easy.
          {tally.again > 0 && ' Missed items come back in about 10 minutes.'}
        </p>
        <button type="button" onClick={onExit} className="press px-4 py-2 rounded-lg bg-md-blue text-white text-sm font-bold">Back</button>
      </div>
    );
  }

  const { line } = item;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[11px] text-md-textMuted">
        <span>{index + 1} / {queue.length}{item.isNew ? ' · new' : ''}</span>
        <button type="button" onClick={onExit} className="text-md-blue">End review</button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-md-text">{line.name}</span>
        {line.status !== 'verified' && <StatusBadge line={line} />}
      </div>

      {item.kind === 'line' ? (
        <div className="space-y-3">
          <p className="text-xs font-bold text-md-textMuted uppercase tracking-widest">Starting from</p>
          <StarterSlots starters={line.starters} cards={cards} />
          <p className="text-xs font-bold text-md-textMuted uppercase tracking-widest">Recall the full line</p>
          <StepReveal steps={line.steps} revealed={revealed} onReveal={() => setRevealed((r) => r + 1)} />
          {revealed >= line.steps.length && (
            <>
              {line.end_board && <p className="text-xs text-md-textSecondary">End board: <span className="text-md-text">{line.end_board}</span></p>}
              <GradeButtons onGrade={grade} disabled={saving} />
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <StepReveal steps={line.steps.slice(0, item.stepIndex! + 1)} revealed={item.stepIndex! + 1} onReveal={() => {}} highlightIndex={item.stepIndex} />
          <div className="px-3 py-2.5 rounded-xl border border-md-red/40 bg-md-red/10 text-sm text-md-text">
            Your opponent uses <b>{item.branch!.interruption}</b> on step {item.stepIndex! + 1}. What do you do?
          </div>
          {!answerShown ? (
            <button type="button" onClick={() => setAnswerShown(true)}
              className="press w-full py-3 rounded-xl border border-dashed border-md-blue/40 text-sm font-bold text-md-blue bg-md-blue/5">
              Answer it in your head, then tap to check
            </button>
          ) : (
            <>
              <div className="px-3 py-2.5 rounded-xl border border-md-green/30 bg-md-green/5 text-sm text-md-textSecondary">{item.branch!.response}</div>
              <GradeButtons onGrade={grade} disabled={saving} />
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-md-red">{error}</p>}
    </div>
  );
}
