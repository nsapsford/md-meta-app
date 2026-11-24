// A line's board-value list (`LineEval.items`): what the board does on their turn, then, after a
// heading item worth 0, what it does in your End Phase (`when: 'endPhase'` entries). Light on
// purpose: the page imports it without the engine.

/** The item that heads the End Phase entries in a line's list (worth 0, so value filters drop it). */
export const END_PHASE_HEADING = 'In the End Phase';

/** A line's items split at the End Phase heading: what the board does on their turn, and in your End Phase. */
export function splitItems(items: readonly [string, number][]): { turn: [string, number][]; end: [string, number][] } {
  const at = items.findIndex((x) => x[0] === END_PHASE_HEADING && x[1] === 0);
  return at < 0 ? { turn: items.slice(), end: [] } : { turn: items.slice(0, at), end: items.slice(at + 1) };
}
