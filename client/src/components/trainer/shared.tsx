import { useState } from 'react';
import clsx from 'clsx';
import type { ComboLine, Grade, ResolvedCard } from '../../api/lines';

export type CardMap = Map<number, ResolvedCard>;

// Same CDN the server stores in image_small_url; used when a passcode isn't in the local card DB.
const fallbackImage = (passcode: number) => `https://images.ygoprodeck.com/images/cards_small/${passcode}.jpg`;

export function cardName(cards: CardMap, passcode: number): string {
  return cards.get(passcode)?.name ?? `#${passcode}`;
}

export function CardThumb({
  passcode, cards, size = 'md', dim = false, highlight = false, onClick, title,
}: {
  passcode: number;
  cards: CardMap;
  /** 'fill' takes the width of its grid cell (hands of 5-6 must fit one phone row). */
  size?: 'sm' | 'md' | 'fill';
  dim?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  const card = cards.get(passcode);
  const src = card?.image_small_url || fallbackImage(passcode);
  const name = card?.name ?? `#${passcode}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title ?? name}
      className={clsx(
        'relative shrink-0 rounded-md overflow-hidden border bg-md-surfaceAlt aspect-[59/86]',
        size === 'sm' ? 'w-10' : size === 'fill' ? 'w-full' : 'w-14 sm:w-16',
        highlight ? 'border-md-gold ring-2 ring-md-gold/60' : 'border-md-border',
        dim && 'opacity-35',
        onClick && 'press'
      )}
    >
      {!failed ? (
        <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 p-1 text-[8px] leading-tight text-md-textMuted flex items-center text-center">{name}</span>
      )}
    </Tag>
  );
}

export function StatusBadge({ line }: { line: Pick<ComboLine, 'status' | 'source'> }) {
  return line.status === 'verified' ? (
    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-md-green/15 text-md-green border border-md-green/30">Verified</span>
  ) : (
    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-md-orange/15 text-md-orange border border-md-orange/30">
      {line.source === 'ai-draft' ? 'AI draft · unverified' : 'Unverified'}
    </span>
  );
}

/** Starter slots as card groups: cards within a slot are alternatives ("or"). */
export function StarterSlots({ starters, cards, hand }: { starters: number[][]; cards: CardMap; hand?: number[] }) {
  if (starters.length === 0) return <p className="text-xs text-md-orange">No starters set — this line can't come up in the opening-hand drill yet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {starters.map((slot, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] font-bold text-md-textMuted mx-0.5">+</span>}
          <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-md-border/60">
            {slot.map((p, j) => (
              <div key={p} className="flex items-center gap-0.5">
                {j > 0 && <span className="text-[9px] text-md-textMuted">or</span>}
                <CardThumb passcode={p} cards={cards} size="sm" highlight={hand?.includes(p)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const GRADE_STYLE: Record<Grade, string> = {
  again: 'bg-md-red/15 text-md-red border-md-red/30',
  hard: 'bg-md-orange/15 text-md-orange border-md-orange/30',
  good: 'bg-md-blue/15 text-md-blue border-md-blue/30',
  easy: 'bg-md-green/15 text-md-green border-md-green/30',
};
const GRADE_HINT: Record<Grade, string> = {
  again: 'Missed it',
  hard: 'Slow / shaky',
  good: 'Got it',
  easy: 'Instant',
};

export function GradeButtons({ onGrade, disabled }: { onGrade: (g: Grade) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(Object.keys(GRADE_STYLE) as Grade[]).map((g) => (
        <button
          key={g}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(g)}
          className={clsx('press py-2.5 rounded-xl border text-sm font-bold capitalize disabled:opacity-50 flex flex-col items-center leading-tight', GRADE_STYLE[g])}
        >
          {g}
          <span className="text-[9px] font-medium opacity-80 normal-case">{GRADE_HINT[g]}</span>
        </button>
      ))}
    </div>
  );
}

/** Steps revealed one at a time: the user says the next step to themselves, then taps to check. */
export function StepReveal({
  steps, revealed, onReveal, highlightIndex,
}: {
  steps: Array<{ id: string; text: string }>;
  revealed: number;
  onReveal: () => void;
  highlightIndex?: number;
}) {
  return (
    <div className="space-y-2">
      <ol className="space-y-1.5">
        {steps.slice(0, revealed).map((s, i) => (
          <li
            key={s.id}
            className={clsx(
              'text-sm leading-snug px-3 py-2 rounded-lg border',
              i === highlightIndex ? 'border-md-red/40 bg-md-red/10 text-md-text' : 'border-md-border/60 bg-md-surface text-md-textSecondary'
            )}
          >
            <span className="text-[10px] font-bold text-md-textMuted mr-2">{i + 1}</span>
            {s.text}
          </li>
        ))}
      </ol>
      {revealed < steps.length && (
        <button type="button" onClick={onReveal}
          className="press w-full py-3 rounded-xl border border-dashed border-md-blue/40 text-sm font-bold text-md-blue bg-md-blue/5">
          Say step {revealed + 1} to yourself, then tap to check
        </button>
      )}
    </div>
  );
}

export const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;
