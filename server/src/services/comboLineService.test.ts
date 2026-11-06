import { describe, it, expect } from 'vitest';
import { validateLineInput, splitLineText, draftsFromAiLines } from './comboLineService.js';

const validBody = () => ({
  name: 'Starter A -> Baronne + Apollousa',
  rank: 1,
  status: 'verified',
  source: 'guide',
  starters: [[111, 222], [333]],
  steps: [
    { id: 's1', text: 'Normal Summon A, search B', branches: [{ id: 'b1', interruption: 'Ash Blossom', response: 'Use C instead' }] },
    { id: 's2', text: 'Link into Baronne', branches: [] },
  ],
  end_board: 'Baronne + Apollousa',
});

describe('validateLineInput', () => {
  it('accepts a complete line and normalises it', () => {
    const r = validateLineInput({ ...validBody(), name: '  padded  ', starters: [['111', 111, 222], [333]] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('padded');
    // passcodes are coerced to numbers and de-duplicated within a slot
    expect(r.value.starters).toEqual([[111, 222], [333]]);
    expect(r.value.steps[0].branches[0]).toEqual({ id: 'b1', interruption: 'Ash Blossom', response: 'Use C instead' });
  });

  it('defaults rank/status/source and allows an empty draft', () => {
    const r = validateLineInput({ name: 'Draft' });
    expect(r).toEqual({
      ok: true,
      value: { name: 'Draft', rank: 100, status: 'draft', source: 'manual', starters: [], steps: [], end_board: null },
    });
  });

  it('refuses to mark an empty line verified', () => {
    expect(validateLineInput({ name: 'x', status: 'verified', steps: validBody().steps })).toEqual({
      ok: false, error: 'a verified line needs at least one starter slot and one step',
    });
    expect(validateLineInput({ name: 'x', status: 'verified', starters: [[1]] }).ok).toBe(false);
  });

  it('rejects duplicate step/branch ids, since drill history is keyed on them', () => {
    const body = validBody();
    body.steps[1].id = 'b1';
    const r = validateLineInput(body);
    expect(r).toEqual({ ok: false, error: 'duplicate id "b1"' });
  });

  it.each([
    [{ name: '' }, /name/],
    [{ name: 'x', rank: -1 }, /rank/],
    [{ name: 'x', rank: 1.5 }, /rank/],
    [{ name: 'x', status: 'done' }, /status/],
    [{ name: 'x', source: 'reddit' }, /source/],
    [{ name: 'x', starters: [[]] }, /slot/],
    [{ name: 'x', starters: [[0]] }, /positive/],
    [{ name: 'x', starters: 'abc' }, /array/],
    [{ name: 'x', steps: [{ id: 'bad id', text: 'y' }] }, /id/],
    [{ name: 'x', steps: [{ id: 'a', text: '   ' }] }, /step text/],
    [{ name: 'x', steps: [{ id: 'a', text: 'y', branches: [{ id: 'b', interruption: '', response: 'r' }] }] }, /interruption/],
  ])('rejects %j', (body, pattern) => {
    const r = validateLineInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(pattern);
  });
});

describe('splitLineText', () => {
  it('splits arrow-chained lines', () => {
    expect(splitLineText('Normal Summon A -> search B → Link into C')).toEqual(['Normal Summon A', 'search B', 'Link into C']);
  });

  it('splits sentences', () => {
    expect(splitLineText('Activate A to search B. Summon B. Link into "C".')).toEqual([
      'Activate A to search B', 'Summon B', 'Link into "C"',
    ]);
  });

  it('keeps an unsplittable line as one step', () => {
    expect(splitLineText('Just summon the boss')).toEqual(['Just summon the boss']);
  });
});

describe('draftsFromAiLines', () => {
  it('makes unverified drafts with no starters and fresh ids', () => {
    let n = 0;
    const drafts = draftsFromAiLines(['A -> B', '', 'C. D.'], () => `id${n++}`);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ status: 'draft', source: 'ai-draft', starters: [], rank: 100 });
    expect(drafts[0].steps.map((s) => s.text)).toEqual(['A', 'B']);
    expect(drafts[1].name).toBe('AI draft 2: C');
    // every draft must pass the same validation as a hand-written line
    for (const d of drafts) expect(validateLineInput(d).ok).toBe(true);
    const ids = drafts.flatMap((d) => d.steps.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
