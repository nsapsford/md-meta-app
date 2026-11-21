// Small pieces the Finder's components share: panels, the two-button switch, toggles, card faces
// and tappable card names. Every label comes from the caller (deck file, facts, hand-trap data).

import { useMemo, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { CardThumb, type CardMap } from '../trainer/shared';
import type { Catalog, Frame, TextPart } from '../../finder/model/cards';
import { BLANK } from '../../finder/model/finderState';
import type { CardId } from '../../finder/engine/types';

export const FRAME_BORDER: Record<Frame, string> = {
  normal: 'border-l-md-gold', effect: 'border-l-md-orange', ritual: 'border-l-md-blueLight', fusion: 'border-l-md-purple',
  synchro: 'border-l-md-text', xyz: 'border-l-md-textMuted', link: 'border-l-md-blue', spell: 'border-l-md-green', trap: 'border-l-md-red',
  other: 'border-l-md-borderLight',
};

export function Panel({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('p-3 sm:p-4 rounded-xl bg-md-surface border border-md-border space-y-2.5', className)}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {title && <h2 className="text-sm font-bold text-md-text">{title}</h2>}
          {right && <div className="flex items-center gap-1.5 flex-wrap">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export const Fine = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={clsx('text-[11px] leading-snug text-md-textMuted', className)}>{children}</p>
);

/** Two (or more) buttons, one pressed. */
export function Seg<T extends string>({ value, options, onChange, label, className }: { value: T; options: [T, string][]; onChange(v: T): void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={clsx('flex p-0.5 rounded-xl bg-md-surfaceAlt border border-md-border', className)}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={clsx('press flex-1 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-colors',
            value === v ? 'bg-md-blue/15 text-md-blue' : 'text-md-textMuted')}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onClick, disabled, title, children, tone = 'blue' }: { on: boolean; onClick(): void; disabled?: boolean; title?: string; children: ReactNode; tone?: 'blue' | 'orange' }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} title={title} onClick={onClick}
      className={clsx('press px-2.5 py-1 rounded-full text-xs font-bold border transition-colors disabled:opacity-40',
        on ? (tone === 'orange' ? 'bg-md-orange/15 text-md-orange border-md-orange/30' : 'bg-md-blue/15 text-md-blue border-md-blue/30')
          : 'bg-md-surface text-md-textMuted border-md-border')}>
      {children}
    </button>
  );
}

export function Btn({ onClick, children, primary, quiet, disabled, title, className }: { onClick?(): void; children: ReactNode; primary?: boolean; quiet?: boolean; disabled?: boolean; title?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={clsx('press px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:pointer-events-none',
        primary ? 'bg-md-blue text-white border-md-blue' : quiet ? 'bg-transparent text-md-textSecondary border-transparent hover:text-md-text' : 'bg-md-surfaceAlt text-md-text border-md-border hover:border-md-borderLight',
        className)}>
      {children}
    </button>
  );
}

export const inputCls = 'px-2 py-1.5 rounded-lg bg-md-surfaceAlt border border-md-border text-sm text-md-text placeholder:text-md-textMuted focus:outline-none focus:border-md-blue/50';

/** A CardMap for CardThumb from the deck's own facts (images come from the card CDN by passcode). */
export function useThumbMap(cat: Catalog): CardMap {
  return useMemo(() => {
    const m: CardMap = new Map();
    for (const c of cat.values()) if (c.passcode != null) m.set(c.passcode, { id: c.passcode, name: c.name, type: c.facts?.type ?? null, image_small_url: null });
    return m;
  }, [cat]);
}

/** A card face with its short name under it; a blank is a dashed card. */
export function CardFace({ id, cat, thumbs, onClick, tag, setFace, title }: {
  id: CardId; cat: Catalog; thumbs: CardMap; onClick?(): void; tag?: string; setFace?: boolean; title?: string;
}) {
  const c = cat.get(id);
  const label = id === BLANK ? 'Blank' : c?.short ?? id;
  return (
    <div className="min-w-0 flex flex-col items-center gap-0.5">
      <div className={clsx('relative w-full', setFace && 'opacity-70')}>
        {id === BLANK || !c || c.passcode == null ? (
          <button type="button" onClick={onClick} title={title ?? 'A card the line does not use'}
            className="press w-full aspect-[59/86] rounded-md border border-dashed border-md-borderLight bg-md-surfaceAlt text-[9px] font-bold text-md-textMuted flex items-center justify-center">
            Any
          </button>
        ) : (
          <CardThumb passcode={c.passcode} cards={thumbs} size="fill" onClick={onClick} title={title ?? c.name} />
        )}
        {tag && <span className="absolute bottom-0.5 inset-x-0.5 text-center text-[8px] font-bold rounded bg-md-bg/85 text-md-gold leading-tight py-px">{tag}</span>}
      </div>
      <span className="w-full text-center text-[9px] leading-tight text-md-textSecondary truncate" title={label}>{label}</span>
    </div>
  );
}

/** Text with each card name in it tappable (opens its text). */
export function RichText({ parts, onInspect }: { parts: TextPart[]; onInspect(id: CardId): void }) {
  return (
    <>
      {parts.map((p, i) => (p.id ? (
        <button key={i} type="button" onClick={(e) => { e.stopPropagation(); onInspect(p.id!); }}
          className="font-semibold text-md-text underline decoration-md-borderLight decoration-dotted underline-offset-2 hover:decoration-md-blue">
          {p.text}
        </button>
      ) : <span key={i}>{p.text}</span>))}
    </>
  );
}

/** Long-press (touch) or right-click calls `onLong`; a tap right after a long-press is swallowed. */
export function useLongPress(onLong: () => void, ms = 480) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(0);
  const clear = () => { if (t.current) { clearTimeout(t.current); t.current = null; } };
  return {
    handlers: {
      onTouchStart: () => { clear(); t.current = setTimeout(() => { fired.current = Date.now(); onLong(); }, ms); },
      onTouchEnd: clear, onTouchMove: clear, onTouchCancel: clear,
      onContextMenu: (e: { preventDefault(): void }) => { e.preventDefault(); onLong(); },
    },
    /** True when a click is the tail of a long-press. */
    swallow: () => Date.now() - fired.current < 600,
  };
}
