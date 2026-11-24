// The Finder's setup side, in the artifact's order: turn order, their field (going second), your
// hand, their hand traps, what you can't see, and draw effects already live. Labels come from the
// hand-trap data; the model does the rest.

import type { CardMap } from '../trainer/shared';
import type { HandTrapFile } from '../../finder/deck/schema';
import { drawBit } from '../../finder/engine/opponent';
import type { CardId } from '../../finder/engine/types';
import type { Catalog } from '../../finder/model/cards';
import { setMode, type FinderSnapshot, type ResolvedList } from '../../finder/model/finderState';
import { setAssumeOptions, unseenNote } from '../../finder/model/oppField';
import HandPicker from './HandPicker';
import OppFieldEditor from './OppFieldEditor';
import { Fine, Panel, Seg, Toggle, inputCls } from './ui';

export interface ChangeOpts { debounceMs?: number; reset?: boolean }
export interface SetupPanelProps {
  snap: FinderSnapshot; list: ResolvedList; cat: Catalog; thumbs: CardMap; traps: HandTrapFile;
  onChange(s: FinderSnapshot, o?: ChangeOpts): void; onToast(msg: string): void; onInspect(id: CardId): void;
}

export default function SetupPanel({ snap, list, cat, thumbs, traps, onChange, onToast, onInspect }: SetupPanelProps) {
  const toggle = (xs: string[], k: string) => (xs.includes(k) ? xs.filter((x) => x !== k) : xs.concat([k]));
  const drawTraps = traps.traps.filter((t) => drawBit(t.mechanism));
  return (
    <div className="space-y-3">
      <Panel>
        <Seg label="Turn order" value={snap.mode} options={[['first', 'Going first'], ['second', 'Going second']]}
          onChange={(m) => { if (m !== snap.mode) onChange(setMode(snap, m), { reset: true }); }} />
        {snap.mode === 'second' && (
          <div className="pt-1">
            <OppFieldEditor snap={snap} traps={traps} onChange={(s, ms) => onChange(s, { debounceMs: ms })} />
          </div>
        )}
        <div className="pt-1">
          <HandPicker snap={snap} list={list} cat={cat} thumbs={thumbs} onToast={onToast} onInspect={onInspect}
            onChange={(s) => onChange(s, { reset: true })} />
        </div>
      </Panel>

      <Panel title="Play around their hand traps">
        <div className="flex flex-wrap gap-1.5">
          {traps.traps.map((t) => {
            const live = snap.live.includes(t.id);
            return (
              <Toggle key={t.id} on={snap.hts.includes(t.id) && !live} disabled={live} title={live ? 'Already live this turn' : undefined}
                onClick={() => onChange({ ...snap, hts: toggle(snap.hts, t.id) })}>
                {t.label}
              </Toggle>
            );
          })}
        </div>
        <Fine>Each one switched on is used against you on the step that hurts most, then the lines are ranked by what survives.</Fine>

        <h2 className="text-sm font-bold text-md-text pt-1">What you can't see</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-md-textSecondary">
          <label className="flex items-center gap-1.5">Cards in their hand
            <input type="number" inputMode="numeric" min={0} max={15} placeholder="?" value={snap.oppHand ?? ''}
              onChange={(e) => onChange({ ...snap, oppHand: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) }, { debounceMs: 500 })}
              className={`${inputCls} w-14 py-1 tabular-nums`} />
          </label>
          <label className="flex items-center gap-1.5">An unknown Set card can
            <select value={snap.setAssume} onChange={(e) => onChange({ ...snap, setAssume: e.target.value })}
              className="px-1.5 py-1 rounded-md bg-md-surfaceAlt border border-md-border text-xs text-md-text">
              {setAssumeOptions(traps).map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <Fine>{unseenNote(snap)}</Fine>

        {drawTraps.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-md-text pt-1">Already live on you this turn</h2>
            <div className="flex flex-wrap gap-1.5">
              {drawTraps.map((t) => (
                <Toggle key={t.id} tone="orange" on={snap.live.includes(t.id)} onClick={() => onChange({ ...snap, live: toggle(snap.live, t.id) })}>
                  {t.label}
                </Toggle>
              ))}
            </div>
            <Fine>Switch one on when it has already resolved. You then get one line for each number of cards you could give them, from none upward. To drop one in mid-line, open "What if?" on that step.</Fine>
          </>
        )}
      </Panel>
    </div>
  );
}
