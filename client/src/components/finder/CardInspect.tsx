// A card's facts and full text, from the deck's own card facts (no server call).

import { useEffect } from 'react';
import clsx from 'clsx';
import { factsLine, type Catalog } from '../../finder/model/cards';
import type { ResolvedList } from '../../finder/model/finderState';
import type { CardId } from '../../finder/engine/types';
import { FRAME_BORDER } from './ui';

export default function CardInspect({ id, cat, list, onClose }: { id: CardId | null; cat: Catalog; list: ResolvedList; onClose(): void }) {
  const c = id ? cat.get(id) : undefined;
  useEffect(() => {
    if (!c) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c, onClose]);
  if (!c) return null;
  const count = (list.main[c.id] || 0) + (list.extra[c.id] || 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={c.name} onClick={(e) => e.stopPropagation()}
        className={clsx('w-full sm:max-w-md max-h-[75vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-md-surface border border-md-border border-l-4 p-4 space-y-2 shadow-surface-lg animate-slide-up', FRAME_BORDER[c.frame])}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-md-text leading-tight">{c.name}</h3>
            <p className="text-[11px] text-md-textMuted mt-0.5">{[factsLine(c), count ? `${count} in deck` : ''].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close card text" className="press shrink-0 w-8 h-8 rounded-lg text-md-textMuted hover:text-md-text">✕</button>
        </div>
        <p className="text-[13px] leading-relaxed text-md-textSecondary whitespace-pre-line">{c.facts?.text || 'No card text in the deck file.'}</p>
      </div>
    </div>
  );
}
