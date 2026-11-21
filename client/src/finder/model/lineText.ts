// A found line as plain text: its name (for saving) and the artifact's copy format.

import type { SerializedLine } from '../engine/serialize';
import type { CardId } from '../engine/types';
import { BLANK } from './finderState';

/** What the line was solved for. `name` overrides the line's own name (the plan's, when copying its worst case). */
export interface LineContext { mode: 'first' | 'second'; hand: CardId[]; name?: string }

export function lineName(l: SerializedLine, short: (id: CardId) => string, ctx: LineContext): string {
  const hand = ctx.hand.map((id) => (id === BLANK ? 'blank' : short(id))).join(' + ');
  return `${ctx.mode === 'second' ? 'Going second' : 'Going first'}: ${hand}${l.safest ? ' (safest lethal)' : ''}`;
}

/** Name, numbered steps (with what interrupted them), Sets, end board and what it does on their turn. */
export function lineText(l: SerializedLine, short: (id: CardId) => string, ctx: LineContext): string {
  const out = [ctx.name ?? lineName(l, short, ctx), ''];
  l.steps.forEach((s, i) => out.push(`${i + 1}. ${s.text}${s.interrupted ? ` [${s.interrupted}]` : ''}`));
  if (l.sets.length) out.push(`Then Set ${l.sets.map(short).join(', ')}.`);
  out.push('', 'End board: ' + l.board.mons.map((m) => short(m.id)).concat(l.board.st.map((x) => short(x.id) + (x.up ? '' : ' (Set)'))).join(', '));
  const it = l.items.filter((x) => x[1] >= 0.3).map((x) => x[0]);
  if (it.length) out.push('Their turn: ' + it.join('; '));
  return out.join('\n');
}
