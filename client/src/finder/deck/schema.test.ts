import { describe, it, expect } from 'vitest';
import { validateDeckFile, VOCAB_VERSION, type DeckFileError, type EffectDef } from './schema';
import { WORDS, defineCond, conds, type CompileCtx, type WordDef } from './vocabulary';
import vocabularyDoc from '../../../../docs/finder/vocabulary.md?raw';

const MINIMAL = {
  vocab: 1,
  id: 'T',
  name: 'Test deck',
  cards: [{ id: 'A', passcodes: [1], short: 'A' }],
  groups: {},
  endOfTurn: { setOrder: [] },
  boardValue: [],
};

const EFFECT = { key: 'a-eff', phase: 'main', from: 'hand', tags: {}, text: 'A: do it.', do: [] };

const withEffect = (e: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  ...MINIMAL,
  ...extra,
  cards: [{ ...MINIMAL.cards[0], effects: [{ ...EFFECT, ...e }] }],
});

const errorsOf = (raw: unknown, shared: Record<string, unknown> = {}): DeckFileError[] => {
  const r = validateDeckFile(raw, shared);
  if (r.ok) throw new Error('expected errors, got a valid file');
  return r.errors;
};

describe('validateDeckFile', () => {
  it('accepts a minimal file', () => {
    expect(validateDeckFile(MINIMAL, {}).ok).toBe(true);
  });

  it('names the card and field of an unknown word', () => {
    const r = validateDeckFile(withEffect({ do: [{ mvoe: { what: 'chosen', to: 'hand' } }] }), {});
    expect(r).toEqual({ ok: false, errors: [{ card: 'A', field: 'effects[0].do[0]', message: 'unknown action "mvoe"' }] });
  });

  it('rejects a group that names a missing card', () => {
    expect(errorsOf({ ...MINIMAL, groups: { g: ['A', 'ZZ'] } })).toEqual([{ card: null, field: 'groups.g[1]', message: 'unknown card "ZZ"' }]);
  });

  it('rejects ":" and "#" in effect keys (move keys use them as separators)', () => {
    expect(errorsOf(withEffect({ key: 'a:b' }))).toEqual([{ card: 'A', field: 'effects[0].key', message: 'effect key "a:b" cannot contain ":" or "#" (move keys use them as separators)' }]);
    expect(errorsOf(withEffect({ key: 'a#1' }))).toEqual([{ card: 'A', field: 'effects[0].key', message: 'effect key "a#1" cannot contain ":" or "#" (move keys use them as separators)' }]);
  });

  it('accepts a numeric order on an Extra Deck rule and rejects anything else', () => {
    const rule = { card: 'A', method: 'link', rating: 1, min: 1, max: 1 };
    expect(validateDeckFile({ ...MINIMAL, extraDeck: [{ ...rule, order: 2 }] }, {}).ok).toBe(true);
    expect(errorsOf({ ...MINIMAL, extraDeck: [{ ...rule, order: 'first' }] })).toEqual([{ card: null, field: 'extraDeck[0].order', message: 'expected a number, got "first"' }]);
  });

  it('rejects another vocabulary version', () => {
    expect(errorsOf({ ...MINIMAL, vocab: 99 })[0].message).toBe('written for vocabulary 99, this app has 1');
    expect(VOCAB_VERSION).toBe(1);
  });

  it('rejects duplicate card ids and duplicate effect keys', () => {
    const e2 = { ...EFFECT };
    const file = {
      ...MINIMAL,
      cards: [
        { id: 'A', passcodes: [1], short: 'A', effects: [EFFECT, e2] },
        { id: 'A', passcodes: [2], short: 'A again' },
      ],
    };
    expect(errorsOf(file)).toEqual([
      { card: 'A', field: 'effects[1].key', message: 'duplicate effect key "a-eff"' },
      { card: 'A', field: 'id', message: 'duplicate card id "A"' },
    ]);
  });

  it('merges a shared file named in uses', () => {
    const staples = { vocab: 1, cards: [{ id: 'S', passcodes: [9], short: 'Staple' }], groups: { traps: ['S'] } };
    const r = validateDeckFile({ ...MINIMAL, uses: ['staples'], groups: { both: ['A', 'S'] } }, { staples });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.cards.map((c) => c.id)).toEqual(['S', 'A']);
    expect(Object.keys(r.file.groups).sort()).toEqual(['both', 'traps']);
  });

  it("a listOrder map wins over the cards' own listOrder, the deck file's over a shared file's", () => {
    const staples = { vocab: 1, cards: [{ id: 'S', passcodes: [9], short: 'Staple', listOrder: 50 }, { id: 'U', passcodes: [8], short: 'Other', listOrder: 60 }], listOrder: { U: 40 } };
    const r = validateDeckFile({ ...MINIMAL, uses: ['staples'], listOrder: { S: 2, A: 1 } }, { staples });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.cards.map((c) => [c.id, c.listOrder])).toEqual([['S', 2], ['U', 40], ['A', 1]]);
    expect('listOrder' in r.file).toBe(false);
    expect(errorsOf({ ...MINIMAL, listOrder: { ZZ: 1, A: 'first' } })).toEqual([
      { card: null, field: 'listOrder.ZZ', message: 'unknown card "ZZ"' },
      { card: null, field: 'listOrder.A', message: 'expected a number, got "first"' },
    ]);
  });

  it('every word has a doc line', () => {
    for (const reg of Object.values(WORDS)) for (const w of reg.values()) expect(w.doc.length).toBeGreaterThan(10);
  });

  // Beyond the brief: the paths and checks later tasks rely on.

  it('rejects a duplicate card id between the deck and a shared file', () => {
    const staples = { vocab: 1, cards: [{ id: 'A', passcodes: [9], short: 'Other A' }] };
    expect(errorsOf({ ...MINIMAL, uses: ['staples'] }, { staples })).toEqual([
      { card: 'A', field: 'id', message: 'duplicate card id "A" (also in shared file "staples")' },
    ]);
  });

  it('rejects an unknown shared file', () => {
    expect(errorsOf({ ...MINIMAL, uses: ['nope'] })).toEqual([{ card: null, field: 'uses[0]', message: 'unknown shared file "nope"' }]);
  });

  it('prefixes top-level errors in a shared file with its key', () => {
    const staples = { vocab: 1, cards: [], groups: { g: ['ZZ'] } };
    expect(errorsOf({ ...MINIMAL, uses: ['staples'] }, { staples })).toEqual([
      { card: null, field: 'staples:groups.g[0]', message: 'unknown card "ZZ"' },
    ]);
  });

  it('lets a deck word name a card from a shared file', () => {
    const staples = { vocab: 1, cards: [{ id: 'S', passcodes: [9], short: 'Staple' }] };
    const r = validateDeckFile(withEffect({ cond: [{ has: { zone: 'hand', card: 'S' } }] }, { uses: ['staples'] }), { staples });
    expect(r.ok).toBe(true);
  });

  it('reports a bad word nested inside not and any', () => {
    const r = errorsOf(withEffect({ cond: [{ not: { any: [{ flag: 'f' }, { hsa: {} }] } }] }, { flags: ['f'] }));
    expect(r).toEqual([{ card: 'A', field: 'effects[0].cond[0].not.any[1]', message: 'unknown condition "hsa"' }]);
  });

  it('reports a word with more than one key', () => {
    expect(errorsOf(withEffect({ do: [{ draw: 1, burn: 100 }] }))).toEqual([
      { card: 'A', field: 'effects[0].do[0]', message: 'a word must have exactly one key, found 2' },
    ]);
  });

  it('reports bad arguments with the argument path', () => {
    expect(errorsOf(withEffect({ do: [{ move: { what: 'self', to: 'moon' } }] }))[0]).toEqual({
      card: 'A', field: 'effects[0].do[0].move.to', message: 'expected one of hand, deck, extra, gy, ban, field, got "moon"',
    });
    expect(errorsOf(withEffect({ do: [{ move: { what: 'self' } }] }))[0]).toEqual({
      card: 'A', field: 'effects[0].do[0].move.to', message: 'missing',
    });
    expect(errorsOf(withEffect({ do: [{ move: { what: 'self', to: 'gy', speed: 2 } }] }))[0]).toEqual({
      card: 'A', field: 'effects[0].do[0].move.speed', message: 'unknown argument "speed"',
    });
  });

  it('checks group, card, flag and mark references inside words', () => {
    const file = withEffect({
      cond: [{ has: { zone: 'deck', group: 'nope' } }, { flag: 'nope' }, { control: { card: 'ZZ' } }],
      marks: ['nope'],
    });
    expect(errorsOf(file)).toEqual([
      { card: 'A', field: 'effects[0].cond[0].has.group', message: 'unknown group "nope"' },
      { card: 'A', field: 'effects[0].cond[1].flag', message: 'unknown flag "nope"' },
      { card: 'A', field: 'effects[0].cond[2].control.card', message: 'unknown card "ZZ"' },
      { card: 'A', field: 'effects[0].marks[0]', message: 'unknown mark "nope"' },
    ]);
  });

  it('checks that a word names a chosen card bound by choose', () => {
    const ok = withEffect({ choose: [{ as: 'target', pick: { fromZone: { zone: 'deck', group: 'g' } } }], do: [{ move: { what: 'target', to: 'hand' } }] }, { groups: { g: ['A'] } });
    expect(validateDeckFile(ok, {}).ok).toBe(true);
    expect(errorsOf(withEffect({ do: [{ move: { what: 'target', to: 'hand' } }] }))).toEqual([
      { card: 'A', field: 'effects[0].do[0].move.what', message: 'unknown choice "target" (not bound by choose)' },
    ]);
  });

  it('accepts a group defined by a filter, and checks the filter', () => {
    expect(validateDeckFile({ ...MINIMAL, flags: ['f'], groups: { g: { filter: { not: { flag: 'f' } } } } }, {}).ok).toBe(true);
    expect(errorsOf({ ...MINIMAL, groups: { g: { filter: { nope: 1 } } } })).toEqual([
      { card: null, field: 'groups.g.filter', message: 'unknown condition "nope"' },
    ]);
  });

  it('checks trigger words, tags and the effect enums', () => {
    expect(errorsOf(withEffect({ trigger: { summonedTwice: {} }, tags: { deckTuch: true }, phase: 'later', from: 'pocket' }))).toEqual([
      { card: 'A', field: 'effects[0].phase', message: 'expected one of main, end, oppTurn, got "later"' },
      { card: 'A', field: 'effects[0].from', message: 'expected one of hand, field, setNotThisTurn, faceDown, faceUp, gy, ban, extra, got "pocket"' },
      { card: 'A', field: 'effects[0].trigger', message: 'unknown trigger "summonedTwice"' },
      { card: 'A', field: 'effects[0].tags.deckTuch', message: 'unknown tag "deckTuch"' },
    ]);
  });

  it('checks Extra Deck rules, end of turn and board value references', () => {
    const file = {
      ...MINIMAL,
      extraDeck: [{ card: 'ZZ', method: 'link', rating: 2, min: 2, max: 2, then: 'nope' }],
      endOfTurn: { setOrder: ['ZZ'], setOnlyIf: { YY: [] } },
      boardValue: [{ id: 'v', when: 'oppTurn', on: { control: { card: 'ZZ' } }, base: [{ value: 1, label: 'v' }] }],
    };
    expect(errorsOf(file)).toEqual([
      { card: null, field: 'extraDeck[0].card', message: 'unknown card "ZZ"' },
      { card: null, field: 'extraDeck[0].then', message: 'unknown effect "nope"' },
      { card: null, field: 'endOfTurn.setOrder[0]', message: 'unknown card "ZZ"' },
      { card: null, field: 'endOfTurn.setOnlyIf.YY', message: 'unknown card "YY"' },
      { card: null, field: 'boardValue[0].on.control.card', message: 'unknown card "ZZ"' },
    ]);
  });

  it('collects every error rather than stopping at the first', () => {
    expect(errorsOf({ ...MINIMAL, name: 3, groups: { g: ['ZZ', 'YY'] } })).toHaveLength(3);
  });

  it('reports a duplicate choose name within one effect', () => {
    const pick = { fromZone: { zone: 'deck', group: 'g' } };
    expect(errorsOf(withEffect({ choose: [{ as: 'x', pick }, { as: 'x', pick }] }, { groups: { g: ['A'] } }))).toEqual([
      { card: 'A', field: 'effects[0].choose[1].as', message: 'duplicate choice "x"' },
    ]);
  });

  it('gives a word compile function the effect and its name lookups', () => {
    const effect = { ...EFFECT, choose: [{ as: 'x', pick: { fromZone: { zone: 'deck', group: 'g' } } }] } as EffectDef;
    const ctx: CompileCtx = {
      ix: { A: 0 }, props: [], group: () => [0], flagBit: () => 1, markBit: () => 1,
      where: { card: 'A', key: 'a-eff', field: 'do[0]' }, effect,
      effectId: (k) => (k === 'a-eff' ? 1 : 0), limitId: () => 3,
      choiceSlot: (n) => effect.choose!.findIndex((c) => c.as === n),
      cond: () => () => true, pick: () => () => [], act: () => () => null, trigger: () => () => false,
      fail: (m) => { throw new Error(m); },
      rt: {} as CompileCtx['rt'],
    };
    // An unregistered word, as Task 5's words will be written: it resolves names once, at compile time.
    const word: WordDef = {
      doc: 'test word using every lookup', args: { k: 'none' },
      compile: (_args, c) => { const r = [c.effectId('a-eff'), c.limitId('a-eff'), c.choiceSlot('x'), c.effect!.key]; return () => r; },
    };
    expect(word.compile(true, ctx)()).toEqual([1, 3, 0, 'a-eff']);
  });

  it('refuses a word defined twice', () => {
    expect(() => defineCond('has', { doc: 'again and again', args: { k: 'number' }, compile: () => () => true })).toThrow(/already defined/);
    expect(conds.get('has')!.doc).not.toBe('again and again');
  });

  it('documents every registered word in docs/finder/vocabulary.md', () => {
    const KIND = { conds: 'condition', picks: 'pick', acts: 'action', triggers: 'trigger' } as const;
    const rows = new Set(
      vocabularyDoc.split('\n')
        .map((l) => /^\|\s*`([A-Za-z]+)`\s*\|\s*(\w+)\s*\|/.exec(l))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => `${m[2]}:${m[1]}`),
    );
    for (const [reg, words] of Object.entries(WORDS)) {
      for (const name of words.keys()) expect(rows, `${name} (${KIND[reg as keyof typeof KIND]})`).toContain(`${KIND[reg as keyof typeof KIND]}:${name}`);
    }
  });
});
