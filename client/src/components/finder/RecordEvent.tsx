// What has happened so far this turn: on a step, lock the steps up to there or record what really
// happened (a step stopped, a hand trap resolved, a card lost, a card drawn or added, a monster they
// summoned); above the steps, the list of records with undo and "start the turn over". Port of the
// artifact's recTypes / recFormHtml / commitEvent / undoEvent.

import { useEffect, useMemo, useState } from 'react';
import { loadCardIndex, type CardIndex } from '../../finder/data/cardIndex';
import type { HandTrapFile } from '../../finder/deck/schema';
import type { SerializedStep } from '../../finder/engine/serialize';
import type { CardId, Interruption, TurnEvent } from '../../finder/engine/types';
import type { Catalog } from '../../finder/model/cards';
import type { ResolvedList } from '../../finder/model/finderState';
import { eventText, NEGATE, oppAddMon, recordOptions, stopCards, trapIt, type RecordType } from '../../finder/model/lineView';
import type { RecordedEvent } from '../../finder/model/solveSession';
import { Btn, Fine, Panel, inputCls } from './ui';

export interface RecordActions {
  lock(steps: number): void;
  record(ev: TurnEvent, afterStep: number): void;
  hit(step: number, it: Interruption, usedTrap?: string): void;
}
const LOCK = 'lock';
const selCls = 'px-1.5 py-1 rounded-md bg-md-surfaceAlt border border-md-border text-xs text-md-text max-w-full';

export default function RecordEvent({ index, step, traps, cat, list, events, actions, onDone }: {
  index: number; step: SerializedStep; traps: HandTrapFile; cat: Catalog; list: ResolvedList; events: number;
  actions: RecordActions; onDone(): void;
}) {
  const types = useMemo(() => [{ type: LOCK as typeof LOCK | RecordType, label: `Steps 1–${index + 1} happened as shown (lock them)` }, ...recordOptions(step, traps)], [index, step, traps]);
  const [type, setType] = useState<typeof LOCK | RecordType>(LOCK);
  const [by, setBy] = useState('');
  const onField = useMemo(() => [...new Set(step.mons.concat(step.sts))], [step]);
  const deckIds = useMemo(() => Object.keys(list.main).filter((id) => list.main[id] > 0 && cat.has(id))
    .sort((a, b) => (cat.get(a)!.order - cat.get(b)!.order) || (a < b ? -1 : 1)), [list, cat]);
  const [id, setId] = useState<CardId>('');
  const [to, setTo] = useState<'gy' | 'ban' | 'hand'>('gy');
  const [replace, setReplace] = useState(false);
  const [name, setName] = useState('');
  const [ix, setIx] = useState<CardIndex | null>(null);
  useEffect(() => { if (type === 'oppAdd' && !ix) loadCardIndex().then(setIx, () => {}); }, [type, ix]);
  const short = (x: CardId) => cat.get(x)?.short ?? x;
  const pickId = (ids: CardId[]) => (ids.includes(id) ? id : ids[0]);

  const commit = () => {
    if (type === LOCK) actions.lock(index + 1);
    else if (type === 'stop') {
      const t = stopCards(traps).find((h) => h.id === by);
      actions.hit(index, t ? { ...NEGATE, label: t.label } : NEGATE, t?.id);
    } else if (type.startsWith('trap:')) {
      const t = traps.traps.find((h) => `trap:${h.id}` === type);
      if (t) actions.hit(index, trapIt(t, true), t.id);
    } else if (type === 'lose') actions.record({ t: 'lose', id: pickId(onField), to }, index);
    else if (type === 'gain') actions.record({ t: 'gain', id: pickId(deckIds), replace }, index);
    else if (type === 'oppAdd') actions.record({ t: 'oppAdd', mon: oppAddMon(name, ix?.by.get(name.trim().toLowerCase()), `e${events + 1}`) }, index);
    onDone();
  };

  return (
    <div className="mt-1 p-2.5 rounded-lg bg-md-surface border border-md-border space-y-2 text-xs text-md-textSecondary">
      <label className="flex flex-col gap-1">What happened
        <select value={type} onChange={(e) => setType(e.target.value as RecordType)} className={selCls}>
          {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </label>
      {type === 'stop' && (
        <label className="flex flex-col gap-1">By which card?
          <select value={by} onChange={(e) => setBy(e.target.value)} className={selCls}>
            <option value="">Something else</option>
            {stopCards(traps).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      )}
      {type === 'lose' && (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1">Card
            <select value={pickId(onField)} onChange={(e) => setId(e.target.value)} className={selCls}>{onField.map((x) => <option key={x} value={x}>{short(x)}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">It went to
            <select value={to} onChange={(e) => setTo(e.target.value as typeof to)} className={selCls}>
              <option value="gy">the GY</option><option value="ban">banishment</option><option value="hand">my hand or Extra Deck</option>
            </select>
          </label>
        </div>
      )}
      {type === 'gain' && (
        <div className="space-y-1.5">
          <label className="flex flex-col gap-1">Card
            <select value={pickId(deckIds)} onChange={(e) => setId(e.target.value)} className={selCls}>{deckIds.map((x) => <option key={x} value={x}>{short(x)}</option>)}</select>
          </label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> it is the unknown card already counted in my hand</label>
        </div>
      )}
      {type === 'oppAdd' && (
        <label className="flex flex-col gap-1">Monster name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exact name fills in its stats" className={`${inputCls} text-xs py-1`} />
        </label>
      )}
      <div className="flex gap-1.5">
        <Btn primary onClick={commit}>{type === LOCK ? 'Lock and search again' : 'Record and search again'}</Btn>
        <Btn quiet onClick={onDone}>Cancel</Btn>
      </div>
    </div>
  );
}

/** The records so far, with undo and "start the turn over". */
export function HappenedPanel({ events, locked, short, onUndo, onStartOver }: {
  events: RecordedEvent[]; locked: number; short(id: CardId): string; onUndo(): void; onStartOver(): void;
}) {
  if (!events.length && !locked) return null;
  return (
    <Panel title="What has happened" className="border-md-gold/30"
      right={<><Btn onClick={onUndo}>Undo last</Btn><Btn quiet onClick={onStartOver}>Start the turn over</Btn></>}>
      <ul className="space-y-1">
        {locked > 0 && !events.length && <li className="text-[13px] text-md-text">Steps 1–{locked} happened as shown</li>}
        {events.map((e, i) => <li key={i} className="text-[13px] text-md-text">{eventText(e, short)}</li>)}
      </ul>
      <Fine>Steps up to here are locked. The lines below continue from this position.</Fine>
    </Panel>
  );
}
