import { describe, expect, it } from 'vitest';
import type { ImportResult } from '../../api/lines';
import type { SerializedLine } from '../engine/serialize';
import { saveFoundLine } from './saveLine';

const line = {
  generated: { name: 'old', starters: [['A']], steps: [{ text: 'Do a thing', branches: [] }], endBoard: ['B'] },
} as unknown as SerializedLine;

const result = (o: Partial<ImportResult> = {}): ImportResult => ({ created: [], rejected: [], failing: 0, repairPrompt: null, ...o });

function apiError(status: number | null, message = 'boom') {
  const e = new Error(message) as Error & { status: number | null };
  e.name = 'ApiError';
  e.status = status;
  return e;
}

describe('saveFoundLine', () => {
  it('sends one line with the given name as a Line Finder solver draft', async () => {
    const calls: Array<[number, string, unknown]> = [];
    const send = async (deckId: number, text: string, o?: unknown) => { calls.push([deckId, text, o]); return result(); };
    const r = await saveFoundLine(7, line, 'Going first: Rod', send);
    expect(r).toEqual({ ok: true, message: 'Saved to your lines as a draft.' });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(7);
    expect(calls[0][2]).toEqual({ generator: 'Line Finder', source: 'solver' });
    const body = JSON.parse(calls[0][1]);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].name).toBe('Going first: Rod');
    expect(body.lines[0].steps).toEqual([{ text: 'Do a thing', branches: [] }]);
  });

  it('says when the card ledger flagged the line', async () => {
    const r = await saveFoundLine(7, line, 'n', async () => result({ failing: 1 }));
    expect(r).toEqual({ ok: true, message: 'Saved as a draft. The card ledger flagged it; check it in Lines.' });
  });

  it('reports a rejection', async () => {
    const r = await saveFoundLine(7, line, 'n', async () => result({ rejected: [{ name: 'n', error: 'steps must be a list' }] }));
    expect(r).toEqual({ ok: false, message: 'The server could not read that line: steps must be a list' });
  });

  it('keeps the line when the server cannot be reached', async () => {
    const r = await saveFoundLine(7, line, 'n', async () => { throw apiError(null); });
    expect(r).toEqual({ ok: false, message: "Can't reach the server. The line stays here; try again in a minute." });
  });

  it.each([502, 503, 504])('treats %i (the server waking up) as unreachable', async (status) => {
    const r = await saveFoundLine(7, line, 'n', async () => { throw apiError(status, `Request failed with status code ${status}`); });
    expect(r).toEqual({ ok: false, message: "Can't reach the server. The line stays here; try again in a minute." });
  });

  it('passes on any other error message', async () => {
    const r = await saveFoundLine(7, line, 'n', async () => { throw apiError(404, 'Deck not found'); });
    expect(r).toEqual({ ok: false, message: 'Deck not found' });
  });
});
