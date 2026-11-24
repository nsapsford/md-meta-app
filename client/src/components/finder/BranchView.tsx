// "What you do instead": the best line after one interruption at one step, with the way back to
// the line. Under a draw effect, the best board for each number of cards given away. Port of the
// artifact's renderBranch.

import { useState } from 'react';
import clsx from 'clsx';
import { drawBit, DRAW_TEXT } from '../../finder/engine/opponent';
import type { SerializedLine } from '../../finder/engine/serialize';
import { boardShort, branchTitle, headline } from '../../finder/model/lineView';
import type { BranchResult } from '../../finder/model/solveSession';
import { BoardRows, Sets, Skeleton, StepList, TurnList, type LineCtx } from './LineView';
import { Btn, Fine, Panel } from './ui';

const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

export default function BranchView({ b, line, ctx, onClose }: { b: BranchResult; line: SerializedLine; ctx: LineCtx; onClose(): void }) {
  const draw = !!drawBit(b.it.kind);
  const best = b.line ? b.frontier.indexOf(b.line) : -1;
  const [pick, setPick] = useState<number | null>(null);
  const sel = pick ?? best;
  const shown = draw ? b.frontier[sel] ?? b.line : b.line;
  const step = line.steps[b.step];
  return (
    <Panel className="border-md-blue/30" title={branchTitle(b.step, b.it, step)} right={<Btn quiet onClick={onClose}>Back to the line</Btn>}>
      {b.loading ? <Skeleton />
        : b.error ? <p className="text-sm text-md-red">That search failed ({b.error}). Try it again.</p>
          : !shown ? <p className="text-sm text-md-textSecondary">Nothing useful follows. Pass with what you have.</p>
            : (
              <div className="space-y-2.5">
                {draw ? (
                  <>
                    <Fine>From {step?.tags.inherent ? 'the next summon' : 'this step'} on, {DRAW_TEXT[b.it.kind]}. Choose how many cards you give them:</Fine>
                    <div className="flex flex-wrap gap-1.5">
                      {b.frontier.map((o, i) => (
                        <button key={i} type="button" aria-pressed={i === sel} onClick={() => setPick(i)}
                          className={clsx('press px-2.5 py-1.5 rounded-lg border text-left', i === sel ? 'border-md-blue/50 bg-md-blue/10' : 'border-md-border bg-md-surfaceAlt')}>
                          <span className="block text-xs font-bold tabular-nums text-md-text">{plural(Number(o.summary.draws) || 0, 'draw')}</span>
                          <span className="block text-[10px] text-md-textMuted">{boardShort(o, ctx.mode)}{i === best ? ' · Best trade' : ''}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm"><b className="tabular-nums text-md-text">{headline(shown, ctx.mode).big} {headline(shown, ctx.mode).small}</b> <span className="text-md-textMuted">is the best you can still reach.</span></p>
                )}
                <StepList steps={shown.steps} ctx={ctx} o={{ preTo: b.step }} />
                <Sets line={shown} ctx={ctx} />
                <BoardRows line={shown} ctx={ctx} />
                {shown.items.some((x) => x[1] >= 0.3) && (<><h3 className="text-xs font-bold text-md-text">What it does on their turn</h3><TurnList line={shown} ctx={ctx} /></>)}
              </div>
            )}
    </Panel>
  );
}
