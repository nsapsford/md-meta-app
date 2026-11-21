// "Their field" going second: LP, their monsters and Spell/Traps, each with what it does on your
// turn, uses and protection flags. Names complete from the card index (loaded when this opens).
// Port of the artifact's renderOpp / oppCardHtml / acSearch / acPick.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { loadCardIndex, searchIndex, type CardIndex, type IndexCard } from '../../finder/data/cardIndex';
import type { HandTrapFile } from '../../finder/deck/schema';
import type { FinderSnapshot, OppMonInput, OppStInput } from '../../finder/model/finderState';
import {
  ATTRS, MON_KINDS, POS_LABEL, addFromIndex, boardShort, fillMonByName, fillStByName, newMon, newSt, nextPos, nextUid,
} from '../../finder/model/oppField';
import { Btn, FRAME_BORDER, Fine, inputCls } from './ui';
import type { Frame } from '../../finder/model/cards';

export interface OppFieldEditorProps { snap: FinderSnapshot; traps: HandTrapFile; onChange(s: FinderSnapshot, debounceMs?: number): void }

const kindFrame = (k: OppMonInput['kind']): Frame => (k === 'main' ? 'effect' : k);
const selCls = 'px-1.5 py-1 rounded-md bg-md-surfaceAlt border border-md-border text-[11px] text-md-text min-w-0';

export default function OppFieldEditor({ snap, traps, onChange }: OppFieldEditorProps) {
  const [ix, setIx] = useState<CardIndex | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { let live = true; loadCardIndex().then((x) => { if (live) setIx(x); }, () => {}); return () => { live = false; }; }, []);
  const items = ix && q.trim().length >= 2 ? searchIndex(ix, q, 8) : [];
  const opp = snap.opp;
  const set = (o: Partial<FinderSnapshot['opp']>, ms?: number) => onChange({ ...snap, opp: { ...opp, ...o } }, ms);
  const setMon = (i: number, m: OppMonInput, ms?: number) => set({ mons: opp.mons.map((x, j) => (j === i ? m : x)) }, ms);
  const setSt = (i: number, x: OppStInput, ms?: number) => set({ st: opp.st.map((y, j) => (j === i ? x : y)) }, ms);
  const pick = (c: IndexCard) => { onChange(addFromIndex(snap, c)); setQ(''); setSel(0); };
  const byName = (name: string) => ix?.by.get(name.trim().toLowerCase());

  const intrSel = (value: string, onSel: (v: string) => void) => (
    <select value={value} onChange={(e) => onSel(e.target.value)} aria-label="What it does on your turn" className={clsx(selCls, 'flex-1')}>
      {traps.boardOptions.map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
    </select>
  );
  const usesSel = (value: number, onSel: (v: number) => void) => (
    <select value={value} onChange={(e) => onSel(Number(e.target.value))} aria-label="Times per turn" title="Times per turn" className={selCls}>
      {[1, 2, 3, 4].map((k) => <option key={k} value={k}>×{k}</option>)}
    </select>
  );
  const flags = (r: { noDestroy: boolean; noTarget: boolean }, onFlag: (f: 'noDestroy' | 'noTarget', v: boolean) => void) => (
    <div className="flex flex-wrap gap-3 text-[11px] text-md-textSecondary">
      <label className="flex items-center gap-1"><input type="checkbox" checked={r.noDestroy} onChange={(e) => onFlag('noDestroy', e.target.checked)} /> can't be destroyed</label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={r.noTarget} onChange={(e) => onFlag('noTarget', e.target.checked)} /> can't be targeted</label>
    </div>
  );
  const more = (uid: string) => (
    <Btn quiet onClick={() => setOpen((o) => ({ ...o, [uid]: !o[uid] }))}>{open[uid] ? 'Less' : 'More'}</Btn>
  );
  const del = (label: string, onDel: () => void) => (
    <button type="button" onClick={onDel} aria-label={`Remove ${label}`} className="press shrink-0 w-7 h-7 rounded-md text-md-textMuted hover:text-md-red">✕</button>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-md-text">Their field</h2>
        <label className="flex items-center gap-1.5 text-xs text-md-textMuted">LP
          <input type="number" inputMode="numeric" min={0} step={100} value={opp.lp}
            onChange={(e) => set({ lp: Number(e.target.value || 0) }, 500)} className={clsx(inputCls, 'w-20 py-1 tabular-nums')} />
        </label>
      </div>

      <div className="relative">
        <input value={q} placeholder="Add their card: type a name" aria-label="Add a card to their field" role="combobox" aria-expanded={items.length > 0}
          autoComplete="off" spellCheck={false} className={clsx(inputCls, 'w-full')}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onBlur={() => setTimeout(() => setQ(''), 160)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { setSel((s) => Math.min(items.length - 1, s + 1)); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { setSel((s) => Math.max(0, s - 1)); e.preventDefault(); }
            else if (e.key === 'Enter') { if (items[sel]) pick(items[sel]); e.preventDefault(); }
            else if (e.key === 'Escape') setQ('');
          }} />
        {items.length > 0 && (
          <ul role="listbox" className="absolute z-30 left-0 right-0 mt-1 rounded-lg bg-md-surfaceAlt border border-md-border shadow-surface-lg overflow-hidden">
            {items.map((c, i) => (
              <li key={c.name} role="option" aria-selected={i === sel}
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                className={clsx('px-2.5 py-1.5 border-l-[3px] cursor-pointer flex items-baseline justify-between gap-2', FRAME_BORDER[c.mon ? kindFrame(c.kind ?? 'main') : c.st === 'S' ? 'spell' : 'trap'],
                  i === sel ? 'bg-md-blue/10' : 'hover:bg-md-surfaceHover')}>
                <span className="text-sm text-md-text truncate">{c.name}</span>
                <small className="shrink-0 text-[10px] text-md-textMuted">
                  {c.mon ? `${c.atk}/${c.def}` : c.st === 'S' ? 'Spell' : 'Trap'}{c.intr ? ` · ${boardShort(traps, c.intr)}` : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>

      {opp.mons.length + opp.st.length === 0 && <Fine>Empty field. Add what they ended on, or leave it empty.</Fine>}

      {opp.mons.map((m, i) => (
        <div key={m.uid} className={clsx('p-2 rounded-lg bg-md-surfaceAlt/60 border border-md-border border-l-[3px] space-y-1.5', FRAME_BORDER[kindFrame(m.kind)])}>
          <div className="flex items-center gap-1.5">
            <input value={m.name} placeholder="Monster" aria-label="Monster name" className={clsx(inputCls, 'flex-1 min-w-0 py-1')}
              onChange={(e) => setMon(i, fillMonByName({ ...m, name: e.target.value }, byName(e.target.value)), 700)} />
            <input type="number" inputMode="numeric" value={m.atk} aria-label="ATK" title="ATK" className={clsx(inputCls, 'w-16 py-1 tabular-nums')}
              onChange={(e) => setMon(i, { ...m, atk: Number(e.target.value || 0) }, 350)} />
            <input type="number" inputMode="numeric" value={m.def} aria-label="DEF" title="DEF" className={clsx(inputCls, 'w-16 py-1 tabular-nums')}
              onChange={(e) => setMon(i, { ...m, def: Number(e.target.value || 0) }, 350)} />
            {del(m.name || 'monster', () => set({ mons: opp.mons.filter((_, j) => j !== i) }))}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setMon(i, { ...m, pos: nextPos(m.pos) })} title="Position: tap to change"
              className="press shrink-0 w-11 py-1 rounded-md border border-md-border bg-md-surface text-[11px] font-bold text-md-text">{POS_LABEL[m.pos]}</button>
            {intrSel(m.intr, (v) => setMon(i, { ...m, intr: v }))}
            {usesSel(m.uses, (v) => setMon(i, { ...m, uses: v }))}
            {more(m.uid)}
          </div>
          {open[m.uid] && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={m.attr} onChange={(e) => setMon(i, { ...m, attr: e.target.value })} aria-label="Attribute" className={selCls}>
                {ATTRS.map((a) => <option key={a}>{a}</option>)}
              </select>
              <input value={m.race} placeholder="Type" aria-label="Type" className={clsx(inputCls, 'w-28 py-1 text-xs')}
                onChange={(e) => setMon(i, { ...m, race: e.target.value }, 700)} />
              <select value={m.kind} onChange={(e) => setMon(i, { ...m, kind: e.target.value as OppMonInput['kind'] })} aria-label="Card kind" className={selCls}>
                {MON_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {flags(m, (f, v) => setMon(i, { ...m, [f]: v }))}
            </div>
          )}
        </div>
      ))}

      {opp.st.map((x, i) => (
        <div key={x.uid} className={clsx('p-2 rounded-lg bg-md-surfaceAlt/60 border border-md-border border-l-[3px] space-y-1.5', FRAME_BORDER[x.stype === 'S' ? 'spell' : 'trap'])}>
          <div className="flex items-center gap-1.5">
            <input value={x.name} placeholder="Set Spell/Trap" aria-label="Spell or Trap name" className={clsx(inputCls, 'flex-1 min-w-0 py-1')}
              onChange={(e) => setSt(i, fillStByName({ ...x, name: e.target.value }, byName(e.target.value)), 700)} />
            {del(x.name || 'card', () => set({ st: opp.st.filter((_, j) => j !== i) }))}
          </div>
          <div className="flex items-center gap-1.5">
            {intrSel(x.intr, (v) => setSt(i, { ...x, intr: v }))}
            {usesSel(x.uses, (v) => setSt(i, { ...x, uses: v }))}
            {more(x.uid)}
          </div>
          {open[x.uid] && flags(x, (f, v) => setSt(i, { ...x, [f]: v }))}
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => { const uid = nextUid(snap); setOpen((o) => ({ ...o, [uid]: true })); set({ mons: opp.mons.concat([newMon(uid)]) }); }}>+ Unknown monster</Btn>
        <Btn onClick={() => set({ st: opp.st.concat([newSt(nextUid(snap))]) })}>+ Set Spell/Trap</Btn>
        <Btn quiet onClick={() => set({ mons: [], st: [] })} disabled={!opp.mons.length && !opp.st.length}>Clear field</Btn>
      </div>
    </div>
  );
}
