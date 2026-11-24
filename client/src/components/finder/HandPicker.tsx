// "Your hand": the hand row (tap a card to take it out), type-to-find, and the deck's cards grouped
// by kind with copies left. Port of the artifact's renderHand / renderPicker / addCard / removeCard.

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { CardMap } from '../trainer/shared';
import {
  addToHand, bestMatch, copiesLeft, handSlots, matchScore, pickerGroups, removeFromHand, shortOf, type Catalog,
} from '../../finder/model/cards';
import { BLANK, MAX_HAND, type FinderSnapshot, type ResolvedList } from '../../finder/model/finderState';
import type { CardId } from '../../finder/engine/types';
import { Btn, CardFace, FRAME_BORDER, Fine, inputCls, useLongPress } from './ui';

export interface HandPickerProps {
  snap: FinderSnapshot; list: ResolvedList; cat: Catalog; thumbs: CardMap;
  onChange(s: FinderSnapshot): void; onToast(msg: string): void; onInspect(id: CardId): void;
}

export default function HandPicker({ snap, list, cat, thumbs, onChange, onToast, onInspect }: HandPickerProps) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => pickerGroups(cat, list), [cat, list]);
  const short = useMemo(() => shortOf(cat), [cat]);
  const query = q.trim().toLowerCase();
  const hit = bestMatch(cat, groups, list, snap.hand, query);
  const slots = Math.max(handSlots(snap), snap.hand.length);

  const add = (id: CardId) => {
    const r = addToHand(snap, list, id, short);
    if ('error' in r) onToast(r.error); else onChange(r.snap);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-md-text">Your hand</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-md-textMuted">{snap.hand.length} / {handSlots(snap)}</span>
          <Btn quiet onClick={() => onChange({ ...snap, hand: [] })} disabled={!snap.hand.length}>Clear</Btn>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5" aria-live="polite">
        {Array.from({ length: Math.min(MAX_HAND, slots) }, (_, i) => {
          const id = snap.hand[i];
          if (id === undefined) {
            return (
              <div key={`slot${i}`} aria-hidden="true"
                className={clsx('aspect-[59/86] rounded-md border border-dashed flex items-center justify-center text-[10px] font-bold',
                  i === snap.hand.length ? 'border-md-blue/50 text-md-blue/70' : 'border-md-border text-md-textMuted/60')}>
                {i + 1}
              </div>
            );
          }
          return (
            <div key={`${i}-${id}`} className="relative animate-fade-in">
              <CardFace id={id} cat={cat} thumbs={thumbs} onClick={() => onChange(removeFromHand(snap, i))} title={`Remove ${short(id)}`} />
              <span aria-hidden="true" className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-md-bg border border-md-border text-[9px] leading-[14px] text-center text-md-textMuted">✕</span>
            </div>
          );
        })}
      </div>

      <div className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to add a card" aria-label="Find a card to add to your hand"
          autoComplete="off" spellCheck={false} className={clsx(inputCls, 'w-full pr-28')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (hit) { add(hit); setQ(''); } }
            else if (e.key === 'Escape') setQ('');
            else if (e.key === 'Backspace' && !q && snap.hand.length) onChange(removeFromHand(snap, snap.hand.length - 1));
          }} />
        {query && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-md-textMuted">{hit ? `Enter adds ${short(hit)}` : 'No match'}</span>}
      </div>

      <div className="space-y-2.5">
        {groups.map((g) => (
          <div key={g.label} className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-md-textMuted">{g.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.ids.map((id) => (
                <PickChip key={id} id={id} cat={cat} left={copiesLeft(list, snap.hand, id)} dim={!!query && !matchScore(cat.get(id), id, query)}
                  hit={hit === id} full={snap.hand.length >= MAX_HAND} onAdd={() => add(id)} onInspect={() => onInspect(id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Fine>Tap a card to add it. Long-press or right-click shows its text.</Fine>
    </div>
  );
}

function PickChip({ id, cat, left, dim, hit, full, onAdd, onInspect }: {
  id: CardId; cat: Catalog; left: number; dim: boolean; hit: boolean; full: boolean; onAdd(): void; onInspect(): void;
}) {
  const c = cat.get(id);
  const lp = useLongPress(() => { if (c) onInspect(); });
  const blank = id === BLANK;
  return (
    <button type="button" aria-disabled={left <= 0} {...lp.handlers}
      onClick={() => { if (!lp.swallow()) onAdd(); }}
      title={blank ? 'A card the line will not use: a brick, a side card or an unknown draw' : c?.name}
      className={clsx('press inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg border border-l-[3px] text-xs font-semibold transition-colors select-none',
        'bg-md-surfaceAlt text-md-text border-md-border', left <= 0 && 'opacity-35',
        FRAME_BORDER[c?.frame ?? 'other'], dim && 'opacity-40', hit && 'ring-2 ring-md-blue/60', full && 'cursor-not-allowed')}>
      <span>{blank ? 'Blank / other' : c?.short ?? id}</span>
      {!blank && <span className="min-w-[18px] px-1 rounded bg-md-bg/70 text-[10px] tabular-nums text-md-textMuted text-center">{left}</span>}
    </button>
  );
}
