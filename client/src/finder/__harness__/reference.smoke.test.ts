import { describe, it, expect } from 'vitest';
import { loadReference, refFullDeck } from './loadReference';

describe('reference fixture', () => {
  const { engine, cards } = loadReference();
  it('is the 40-card engine', () => {
    expect(cards).toHaveLength(40);
    expect(Object.keys(engine.NAMES)).toHaveLength(41);          // 40 cards + UNK
    expect(engine.P.ROD.kind).toBe('M');
  });
  it('finds a line for Rod plus four blanks', () => {
    const { deck, extra } = refFullDeck(engine, cards);
    deck.ROD -= 1;
    const r = engine.solveBeam(engine.newState({ mode: 'first', hand: { ROD: 1, UNK: 4 }, deck, extra }), { width: 60, rounds: 1, timeMs: 3_600_000 });
    expect(r.lines[0].score).toBeGreaterThan(0);
    expect(r.lines[0].state.log[0].text).toBe('Normal Summon Rod.');
  });
});
