// One line: the verdict, the steps with a stepper, what-if chips and "This happened" on each step,
// the end board with its Sets, and what it does on their turn. Port of the artifact's verdictHtml /
// stepHtml / stepperHtml / applyProgress / boardRows / turnList / renderLine.

import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { CardMap } from '../trainer/shared';
import type { HandTrapFile } from '../../finder/deck/schema';
import type { SerializedLine, SerializedStep } from '../../finder/engine/serialize';
import type { CardId, Interruption } from '../../finder/engine/types';
import type { Catalog, TextPart } from '../../finder/model/cards';
import {
  headline, lineFacts, stepMarks, tradeNote, verdictText, whatIfOptions, worstDetail, type Protection, type StepMark,
} from '../../finder/model/lineView';
import { intrNames, worstVerdict, type ViewLine } from '../../finder/model/solveSession';
import { Btn, CardFace, Fine, Panel, RichText } from './ui';

export interface LineCtx {
  mode: 'first' | 'second'; intrs: Interruption[]; traps: HandTrapFile; protections: Protection[];
  cat: Catalog; thumbs: CardMap; tokens(text: string): TextPart[]; onInspect(id: CardId): void;
}

const TONE: Record<string, string> = { good: 'text-md-green', warn: 'text-md-orange', bad: 'text-md-red', plain: 'text-md-text' };
const BOX: Record<string, string> = { good: 'border-md-green/30 bg-md-green/5', warn: 'border-md-orange/30 bg-md-orange/5', bad: 'border-md-red/30 bg-md-red/5' };
const MARK: Record<StepMark['tone'], string> = {
  on: 'bg-md-orange/10 text-md-orange border-md-orange/30', safe: 'bg-md-green/10 text-md-green border-md-green/30',
  hit: 'bg-md-red/15 text-md-red border-md-red/40', draw: 'bg-md-purple/10 text-md-purple border-md-purple/30',
};

export const Spinner = () => <span className="inline-block w-3.5 h-3.5 border-2 border-md-border border-t-md-blue rounded-full animate-spin" aria-hidden="true" />;
export const Skeleton = () => (
  <div className="space-y-2" aria-hidden="true">
    {[40, 85, 70].map((w) => <div key={w} className="h-3 rounded bg-md-surfaceAlt animate-pulse-soft" style={{ width: `${w}%` }} />)}
  </div>
);

export function Stepper({ n, total, onStep }: { n: number; total: number; onStep(d: number): void }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Btn onClick={() => onStep(-1)} disabled={n <= 0} title="Previous step">‹</Btn>
      <span className="text-[11px] tabular-nums text-md-textSecondary whitespace-nowrap">{n >= total ? 'All done' : `Step ${n + 1} of ${total}`}</span>
      <span className="flex-1 min-w-[40px] h-1 rounded-full bg-md-surfaceAlt overflow-hidden"><i className="block h-full bg-md-blue transition-[width] duration-300" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
      <Btn primary onClick={() => onStep(1)} disabled={n >= total} title="Space or the right arrow key">Next ›</Btn>
    </div>
  );
}

export interface StepOpts {
  /** Steps before this are done (checked); this one is current. */
  progress?: number; onPick?(i: number): void;
  /** Steps before this are locked (recorded as happened). */
  lock?: number;
  /** Steps before this are greyed (before the branch point). */
  preTo?: number | null;
  hits?: Record<number, string>;
  whatIf?: { onWhatIf(i: number, it: Interruption): void; onRecord(i: number): void; recording: number | null; renderRecord(i: number, s: SerializedStep): ReactNode };
}

export function StepList({ steps, ctx, o = {} }: { steps: SerializedStep[]; ctx: LineCtx; o?: StepOpts }) {
  const [menu, setMenu] = useState<number | null>(null);
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => {
        const done = o.progress != null && i < o.progress, cur = o.progress === i;
        const locked = o.lock != null && i < o.lock;
        const marks = stepMarks(s, ctx.intrs, ctx.protections, o.hits?.[i]);
        const wi = o.whatIf && !locked ? whatIfOptions(s, ctx.intrs) : [];
        const canRecord = !!o.whatIf && !locked && !s.ev;
        return (
          <li key={i} className={clsx('flex gap-2.5 px-2.5 py-2 rounded-lg border transition-colors',
            s.interrupted ? 'border-md-red/40 bg-md-red/5' : cur ? 'border-md-blue/40 bg-md-blue/5' : 'border-md-border/60 bg-md-surfaceAlt/40',
            (done || (o.preTo != null && i < o.preTo)) && 'opacity-60', s.ev && 'border-dashed')}>
            <button type="button" onClick={() => o.onPick?.(i)} aria-label={`Step ${i + 1}: mark done`} disabled={!o.onPick}
              className={clsx('press shrink-0 w-6 h-6 mt-0.5 rounded-full text-[11px] font-bold tabular-nums flex items-center justify-center border',
                locked ? 'bg-md-surfaceAlt text-md-textMuted border-md-borderLight' : done ? 'bg-md-green/15 text-md-green border-md-green/40' : cur ? 'bg-md-blue text-white border-md-blue' : 'bg-md-surface text-md-textMuted border-md-border')}>
              {done || locked ? '✓' : i + 1}
            </button>
            <div className="flex-1 min-w-0 space-y-1.5" onClick={() => o.onPick?.(i)}>
              <p className="text-[13px] leading-snug text-md-textSecondary"><RichText parts={ctx.tokens(s.text)} onInspect={ctx.onInspect} /></p>
              {(marks.length > 0 || wi.length > 0 || canRecord) && (
                <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {marks.map((m, k) => <span key={k} title={m.title} className={clsx('px-1.5 py-px rounded border text-[10px] font-semibold', MARK[m.tone])}>{m.text}</span>)}
                  {wi.length > 0 && (
                    <button type="button" aria-expanded={menu === i} onClick={() => setMenu(menu === i ? null : i)}
                      className="px-1.5 py-px rounded border border-md-blue/30 text-[10px] font-semibold text-md-blue bg-md-blue/5">What if?</button>
                  )}
                  {canRecord && (
                    <button type="button" aria-expanded={o.whatIf!.recording === i} onClick={() => o.whatIf!.onRecord(i)}
                      className="px-1.5 py-px rounded border border-md-border text-[10px] font-semibold text-md-textSecondary">This happened</button>
                  )}
                </div>
              )}
              {menu === i && wi.length > 0 && (
                <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {wi.map((w) => <Btn key={w.label} onClick={() => { setMenu(null); o.whatIf!.onWhatIf(i, w.it); }}>{w.label}</Btn>)}
                </div>
              )}
              {s.interrupted && <p className="text-[11px] text-md-red">{s.interrupted}.</p>}
              {s.lineNote && <p className="text-[11px] text-md-textMuted">{s.lineNote}</p>}
              {o.whatIf && o.whatIf.recording === i && <div onClick={(e) => e.stopPropagation()}>{o.whatIf.renderRecord(i, s)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Sets({ line, ctx }: { line: SerializedLine; ctx: LineCtx }) {
  if (!line.sets.length) return null;
  return (
    <p className="text-[13px] text-md-textSecondary">Then Set {line.sets.map((id, i) => (
      <span key={i}>{i > 0 && ', '}<RichText parts={[{ text: ctx.cat.get(id)?.short ?? id, id }]} onInspect={ctx.onInspect} /></span>
    ))}.</p>
  );
}

export function BoardRows({ line, ctx }: { line: SerializedLine; ctx: LineCtx }) {
  const hand = Object.entries(line.board.hand).flatMap(([id, k]) => Array<CardId>(k).fill(id));
  const row = (label: string, cards: ReactNode[], none: string) => (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-md-textMuted">{label}</p>
      {cards.length ? <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-6 lg:grid-cols-7 gap-1.5">{cards}</div> : <p className="text-xs text-md-textMuted">{none}</p>}
    </div>
  );
  return (
    <div className="space-y-2.5">
      {row('Monsters', line.board.mons.map((m, i) => (
        <CardFace key={i} id={m.id} cat={ctx.cat} thumbs={ctx.thumbs} onClick={() => ctx.onInspect(m.id)} tag={m.uses > 1 ? `×${m.uses}` : undefined} />
      )), 'None')}
      {row('Spells / Traps', line.board.st.map((x, i) => (
        <CardFace key={i} id={x.id} cat={ctx.cat} thumbs={ctx.thumbs} onClick={() => ctx.onInspect(x.id)} setFace={!x.up} tag={x.up ? undefined : 'Set'} />
      )), 'None')}
      {row('Hand', hand.map((id, i) => <CardFace key={i} id={id} cat={ctx.cat} thumbs={ctx.thumbs} onClick={ctx.cat.has(id) ? () => ctx.onInspect(id) : undefined} />), 'Empty')}
      {ctx.mode === 'second' && <Fine>Left on their field: {line.board.opp.length ? line.board.opp.join(', ') : 'nothing'}.</Fine>}
    </div>
  );
}

export function TurnList({ line, ctx }: { line: SerializedLine; ctx: LineCtx }) {
  const items = line.items.filter((x) => x[1] >= 0.3);
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((x, i) => (
        <li key={i} className={clsx('flex items-start gap-2 text-[13px] leading-snug', x[1] >= 0.9 ? 'text-md-text' : 'text-md-textSecondary')}>
          <span className={clsx('mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full', x[1] >= 0.9 ? 'bg-md-gold' : 'bg-md-borderLight')} />
          <span className="flex-1"><RichText parts={ctx.tokens(x[0])} onInspect={ctx.onInspect} /></span>
          <span className="shrink-0 text-[10px] tabular-nums text-md-textMuted">{x[1].toFixed(2).replace(/0$/, '')}</span>
        </li>
      ))}
    </ul>
  );
}

export function Verdict({ v, ctx, drawFx, showWorst, onToggleWorst }: { v: ViewLine; ctx: LineCtx; drawFx: number; showWorst: boolean; onToggleWorst(): void }) {
  const l = v.line;
  const h = headline(l, ctx.mode);
  const t = verdictText(l, ctx.mode);
  const trade = tradeNote(l, drawFx, ctx.traps);
  const verdict = worstVerdict(v, ctx.mode, ctx.intrs);
  const wd = worstDetail(v);
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <div className={clsx('text-3xl font-black tabular-nums leading-none', TONE[h.tone])}>{h.big}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-md-text">{t.title}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {t.pills.map((p, i) => <span key={i} className={clsx('px-1.5 py-px rounded-full border text-[10px] font-semibold', p.soft ? 'border-md-border text-md-textMuted' : 'border-md-gold/40 text-md-gold bg-md-gold/5')}>{p.text}</span>)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-md-textMuted">{lineFacts(l, ctx.traps).map((f) => <span key={f}>{f}</span>)}</div>
      {trade && (
        <div className={clsx('p-2.5 rounded-lg border', BOX[trade.tone])}>
          <p className="text-xs font-bold text-md-text">{trade.title}</p>
          <p className="text-[11px] text-md-textSecondary">{trade.sub}</p>
        </div>
      )}
      {v.testing ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-md-border text-[11px] text-md-textSecondary"><Spinner />Testing this line against {intrNames(ctx.intrs)}…</div>
      ) : verdict && wd ? (
        <div className={clsx('flex items-start justify-between gap-2 p-2.5 rounded-lg border', BOX[verdict.cls])}>
          <div className="min-w-0">
            <p className="text-xs font-bold text-md-text">{verdict.long}</p>
            {wd.sub && <p className="text-[11px] text-md-textSecondary">{wd.sub}</p>}
          </div>
          {wd.hasLine && <Btn onClick={onToggleWorst}>{showWorst ? 'Back to the plan' : 'See that line'}</Btn>}
        </div>
      ) : null}
    </Panel>
  );
}

export interface LineViewProps {
  v: ViewLine; ctx: LineCtx; drawFx: number;
  /** The line shown: the plan, or its worst case. */
  showWorst: boolean; onToggleWorst(): void;
  progress: number; onProgress(n: number): void;
  /** Steps recorded as happened (locked). */
  lock: number;
  onWhatIf(i: number, it: Interruption): void;
  recording: number | null; onRecord(i: number | null): void; renderRecord(i: number, s: SerializedStep): ReactNode;
  onCopy(): void;
  happened?: ReactNode; branch?: ReactNode;
}

export default function LineView(p: LineViewProps) {
  const { v, ctx } = p;
  const shown = p.showWorst && v.worst ? v.worst.line : v.line;
  const total = shown.steps.length;
  const n = Math.max(Math.min(p.showWorst ? 0 : p.lock, total), Math.min(total, p.progress));
  const wd = !p.showWorst ? worstDetail(v) : null;
  const hits = wd?.firstHit ? { [wd.firstHit.step]: wd.firstHit.label } : undefined;
  const firstHit = p.showWorst ? shown.steps.findIndex((s) => s.interrupted) : -1;
  return (
    <div className="space-y-3">
      <Verdict v={v} ctx={ctx} drawFx={p.drawFx} showWorst={p.showWorst} onToggleWorst={p.onToggleWorst} />
      {p.happened}
      <Panel title={p.showWorst ? 'Worst case: what you do instead' : 'Steps'}
        right={<><Btn quiet onClick={p.onCopy}>Copy</Btn><Btn quiet disabled title="Comes with the next update">Save to my lines</Btn></>}>
        <div className="hidden md:block"><Stepper n={n} total={total} onStep={(d) => p.onProgress(n + d)} /></div>
        {shown.opening.map((t, i) => <p key={i} className="text-[12px] text-md-orange">{t}.</p>)}
        {total === 0 && <p className="text-sm text-md-textMuted">Nothing to play: pass with this hand.</p>}
        <StepList steps={shown.steps} ctx={ctx} o={{
          progress: n, lock: p.showWorst ? undefined : p.lock, hits, preTo: firstHit >= 0 ? firstHit : null,
          onPick: (i) => p.onProgress(n === i + 1 ? i : i + 1),
          whatIf: p.showWorst ? undefined : { onWhatIf: p.onWhatIf, onRecord: (i) => p.onRecord(p.recording === i ? null : i), recording: p.recording, renderRecord: p.renderRecord },
        }} />
        <Sets line={shown} ctx={ctx} />
      </Panel>
      {p.branch}
      <Panel title={p.showWorst ? 'Worst-case end board' : 'End board'}><BoardRows line={shown} ctx={ctx} /></Panel>
      {shown.items.some((x) => x[1] >= 0.3) && <Panel title="What it does on their turn"><TurnList line={shown} ctx={ctx} /></Panel>}
    </div>
  );
}
