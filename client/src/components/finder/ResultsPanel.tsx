// The Finder's results side: the status line, the "holds up best" banner, the line tabs with their
// badges (or the trade-off options under a draw effect), and the line chosen. Port of the
// artifact's renderStatus / renderTabs / selectLine / renderLine.

import { useState } from 'react';
import clsx from 'clsx';
import type { SerializedStep } from '../../finder/engine/serialize';
import type { CardId, Interruption } from '../../finder/engine/types';
import { boardShort, headline, resultTabs, statusText } from '../../finder/model/lineView';
import type { OpenDeck } from '../../finder/model/openDeck';
import { intrNames, worstVerdict, type SessionView } from '../../finder/model/solveSession';
import BranchView from './BranchView';
import HowItDecides from './HowItDecides';
import LineView, { Skeleton, Spinner, type LineCtx } from './LineView';
import RecordEvent, { HappenedPanel, type RecordActions } from './RecordEvent';
import { Btn, Panel } from './ui';

const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const DOT: Record<string, string> = { good: 'bg-md-green', warn: 'bg-md-orange', bad: 'bg-md-red' };

export interface ResultsActions extends RecordActions {
  select(key: string): void; deeper(): void; whatIf(i: number, it: Interruption): void; closeBranch(): void;
  undo(): void; startOver(): void; copy(): void;
}
export interface ResultsPanelProps {
  view: SessionView | null; ctx: LineCtx; deck: OpenDeck; deckName: string; short(id: CardId): string;
  progress: number; onProgress(n: number): void; showWorst: boolean; onToggleWorst(): void;
  actions: ResultsActions;
}

export default function ResultsPanel({ view, ctx, deck, deckName, short, progress, onProgress, showWorst, onToggleWorst, actions }: ResultsPanelProps) {
  const [recording, setRecording] = useState<number | null>(null);
  const busy = !view || view.phase === 'solving' || view.phase === 'testing';
  const tabs = view ? resultTabs(view) : [];
  const cur = view?.lines.find((l) => l.key === view.selected) ?? tabs[0]?.v ?? null;
  const better = view?.better ? tabs.find((t) => t.v.key === view.better) : undefined;
  const trade = !!view?.drawFx;

  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex items-center gap-2" aria-live="polite">
          {busy && <Spinner />}
          <p className="flex-1 min-w-0 text-xs text-md-textSecondary">{view ? statusText(view, ctx.traps) : 'Starting…'}</p>
          <Btn onClick={actions.deeper} disabled={busy} title="Searches for about 6 seconds">Search deeper</Btn>
        </div>
        <div className="h-1 rounded-full bg-md-surfaceAlt overflow-hidden">
          <i className={clsx('block h-full bg-md-blue transition-[width] duration-300', view?.phase === 'solving' && 'animate-pulse-soft')}
            style={{ width: view?.phase === 'solving' ? '100%' : view?.phase === 'testing' ? `${Math.round(100 * (view.total ? view.tested / view.total : 0.05))}%` : '0%', opacity: busy ? 1 : 0 }} />
        </div>
        {view?.message && <p className="text-[11px] text-md-orange">{view.message}</p>}
      </Panel>

      {better && view && cur && better.v.key !== cur.key && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-md-green/30 bg-md-green/5 animate-fade-in">
          <p className="text-xs text-md-text">After testing, <b>{better.label}</b> holds up best against {intrNames(view.intrs)}.</p>
          <Btn primary onClick={() => actions.select(better.v.key)}>View it</Btn>
        </div>
      )}

      {tabs.length > 0 && view && (
        <div role="tablist" aria-label="Lines found" className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
          {tabs.map((t) => {
            const l = t.v.line, h = headline(l, view.mode), vd = worstVerdict(t.v, view.mode, view.intrs);
            const draws = Number(l.summary.draws) || 0;
            const sel = cur?.key === t.v.key;
            return (
              <button key={t.v.key} type="button" role="tab" aria-selected={sel} onClick={() => { setRecording(null); actions.select(t.v.key); }}
                className={clsx('press shrink-0 min-w-[112px] text-left p-2.5 rounded-xl border transition-colors',
                  sel ? 'bg-md-blue/10 border-md-blue/40' : 'bg-md-surface border-md-border hover:border-md-borderLight')}>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-md-textMuted">
                  {t.label}
                  {t.badge && <span className="px-1 py-px rounded bg-md-gold/15 text-md-gold normal-case tracking-normal">{t.badge}</span>}
                </span>
                {trade ? (
                  <>
                    <span className="block text-lg font-black tabular-nums text-md-text leading-tight">{draws}<small className="ml-1 text-[11px] font-semibold text-md-textMuted">{draws === 1 ? 'draw' : 'draws'}</small></span>
                    <span className="block text-[10px] text-md-textSecondary">{boardShort(l, view.mode)}</span>
                  </>
                ) : (
                  <span className="block text-lg font-black tabular-nums text-md-text leading-tight">{h.big}<small className="ml-1 text-[11px] font-semibold text-md-textMuted">{h.small}</small></span>
                )}
                <span className="flex items-center gap-1 text-[10px] text-md-textMuted">
                  {t.v.testing ? <><span className="w-1.5 h-1.5 rounded-full bg-md-blue animate-pulse-soft" />testing…</>
                    : vd ? <><span className={clsx('w-1.5 h-1.5 rounded-full', DOT[vd.cls])} />{vd.short}</> : plural(l.steps.length, 'step')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!cur || !view ? (
        <Panel><Skeleton /></Panel>
      ) : (
        <LineView
          v={cur} ctx={ctx} drawFx={view.drawFx}
          showWorst={showWorst && !!cur.worst} onToggleWorst={() => { setRecording(null); onToggleWorst(); }}
          progress={progress} onProgress={onProgress} lock={view.base.steps}
          onWhatIf={actions.whatIf}
          recording={recording} onRecord={setRecording}
          renderRecord={(i: number, s: SerializedStep) => (
            <RecordEvent key={`${cur.key}-${i}`} index={i} step={s} traps={ctx.traps} cat={ctx.cat} list={deck.list} events={view.base.events.length}
              actions={actions} onDone={() => setRecording(null)} />
          )}
          onCopy={actions.copy}
          happened={<HappenedPanel events={view.base.events} locked={view.base.steps} short={short} onUndo={actions.undo} onStartOver={actions.startOver} />}
          branch={view.branch && (
            <BranchView key={`${view.branch.step}|${view.branch.it.kind}|${view.branch.it.uid ?? ''}`} b={view.branch} line={cur.line} ctx={ctx} onClose={actions.closeBranch} />
          )}
        />
      )}

      <HowItDecides deckName={deckName} cardCount={deck.catalog.size} file={deck.file} traps={ctx.traps} />
    </div>
  );
}
