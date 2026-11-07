import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDeckContext, type CardRow } from './deckContext.js';
import { checkLineLedger, matchesPhrase, optRules } from './ledgerChecker.js';
import { parseGeneratedLine, buildPastePrompt, extractJson } from './prompts.js';
import { toTrainerLine } from './convert.js';
import { validateLineInput } from '../comboLineService.js';
import type { GeneratedLine } from './types.js';

// Real card text for a real Master Duel Dark Magician list.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/darkMagician.json', import.meta.url), 'utf8'));
const { ctx, missing } = buildDeckContext(
  { name: 'Dark Magician', archetype: 'Dark Magician', main: fixture.main, extra: fixture.extra },
  fixture.cards as CardRow[],
  ['Ash Blossom & Joyous Spring', 'Infinite Impermanence'],
);
const card = (name: string) => [...ctx.main, ...ctx.extra].find((c) => c.name === name)!;

const errors = (line: GeneratedLine) => checkLineLedger(line, ctx).filter((i) => i.severity === 'error').map((i) => i.message);

const rodLine = (): GeneratedLine => ({
  name: 'Rod into Circle',
  starters: [["Magician's Rod"]],
  steps: [
    {
      text: 'Normal Summon Magician\'s Rod; add Dark Magical Circle.',
      summons: [{ card: "Magician's Rod", method: 'normal' }],
      activations: [{ card: "Magician's Rod", effect: 1 }],
      moves: [{ card: 'Dark Magical Circle', from: 'deck', to: 'hand' }],
    },
    {
      text: 'Activate Dark Magical Circle; add Dark Magician from the top 3.',
      activations: [{ card: 'Dark Magical Circle', effect: 1 }],
      moves: [{ card: 'Dark Magician', from: 'deck', to: 'hand' }],
    },
  ],
  endBoard: ["Magician's Rod", 'Dark Magical Circle'],
});

describe('deck context', () => {
  it('includes the Extra Deck and full card text', () => {
    expect(missing).toEqual([]);
    expect(ctx.main.reduce((n, c) => n + c.copies, 0)).toBe(42);
    expect(ctx.extra).toHaveLength(15);
    expect(card('Red-Eyes Dark Dragoon').text).toMatch(/Normal Monsters used as Fusion Material/);
    const prompt = buildPastePrompt(ctx);
    expect(prompt).toContain('Baronne de Fleur');
    expect(prompt).toContain('ONLY Extra Deck monsters available');
    // never truncated: the once-per-turn clause at the end of a long text is present
    expect(prompt).toContain('You can only use each effect of "Magicians\' Souls" once per turn.');
  });
});

describe('card text parsing', () => {
  it('reads once-per-turn clauses', () => {
    expect(optRules(card("Magicians' Souls")).eachEffectOnce).toBe(true);
    expect(optRules(card("Dark Magician, the Pharaoh's Servant")).oneEffectPerTurn).toBe(true);
    expect(optRules(card('Dark Magical Curtain')).activateOnce).toBe(true);
  });

  it('matches material phrases', () => {
    expect(matchesPhrase(card('Dark Magician'), 'LIGHT or DARK')).toBe(true);
    expect(matchesPhrase(card('Dark Magician'), 'Dragon')).toBe(false);
    expect(matchesPhrase(card('Gandora-G the Dragon of Destruction'), 'Dragon')).toBe(true);
  });
});

describe('checkLineLedger', () => {
  it('passes a legal line', () => {
    expect(errors(rodLine())).toEqual([]);
  });

  it('rejects cards that are not in the deck, with a suggestion', () => {
    const line = rodLine();
    line.steps[0].moves = [{ card: 'Dark Magic Circle', from: 'deck', to: 'hand' }];
    expect(errors(line).join(' ')).toMatch(/"Dark Magic Circle" isn't in your deck/);
  });

  it('rejects Extra Deck monsters you do not run', () => {
    const line = rodLine();
    line.steps.push({ text: 'Link Summon', summons: [{ card: 'Accesscode Talker', method: 'link', materials: ["Magician's Rod"] }] });
    expect(errors(line).join(' ')).toMatch(/Accesscode Talker/);
  });

  it('rejects a second Normal Summon', () => {
    const line = rodLine();
    line.starters.push(['Ash Blossom & Joyous Spring']);
    line.steps.push({ text: 'Normal Summon Ash', summons: [{ card: 'Ash Blossom & Joyous Spring', method: 'normal' }] });
    expect(errors(line).join(' ')).toMatch(/second Normal Summon/);
  });

  it('rejects searching more copies than you run', () => {
    const line = rodLine();
    line.steps.push({ text: 'Add another Dark Magician', moves: [{ card: 'Dark Magician', from: 'deck', to: 'hand' }] });
    expect(errors(line).join(' ')).toMatch(/"Dark Magician" isn't in your Deck/);
  });

  it('rejects reusing a hard once-per-turn effect', () => {
    const line: GeneratedLine = {
      name: 'Illusion twice',
      starters: [['Illusion of Chaos']],
      steps: [
        { text: 'Reveal Illusion; add Dark Magician, put Illusion on top.', activations: [{ card: 'Illusion of Chaos', effect: 1 }], moves: [{ card: 'Dark Magician', from: 'deck', to: 'hand' }] },
        { text: 'Reveal again', activations: [{ card: 'Illusion of Chaos', effect: 1 }], moves: [{ card: "Magician's Rod", from: 'deck', to: 'hand' }] },
      ],
      endBoard: [],
    };
    expect(errors(line).join(' ')).toMatch(/once per turn and was already used/);
  });

  it('knows Dark Magical Curtain stops the summoned monster activating effects', () => {
    const line: GeneratedLine = {
      name: 'Curtain into Servant',
      starters: [['Dark Magical Curtain']],
      steps: [
        { text: 'Activate Curtain: Special Summon Pharaoh\'s Servant from Deck.', activations: [{ card: 'Dark Magical Curtain' }], summons: [{ card: "Dark Magician, the Pharaoh's Servant", method: 'special', from: 'deck' }] },
        { text: 'Servant destroys their backrow', activations: [{ card: "Dark Magician, the Pharaoh's Servant", effect: 2 }] },
      ],
      endBoard: ["Dark Magician, the Pharaoh's Servant"],
    };
    expect(errors(line).join(' ')).toMatch(/can't activate its effects this turn/);
  });

  it('checks Synchro Levels and Link material types', () => {
    const synchro: GeneratedLine = {
      name: 'bad Baronne',
      starters: [['Ash Blossom & Joyous Spring'], ['Dark Magician Girl the Magician\'s Apprentice']],
      freeCards: 1,
      steps: [
        { text: 'Discard to summon DMG', summons: [{ card: "Dark Magician Girl the Magician's Apprentice", method: 'special' }], moves: [{ card: '*', from: 'hand', to: 'gy' }] },
        { text: 'Normal Summon Ash', summons: [{ card: 'Ash Blossom & Joyous Spring', method: 'normal' }] },
        { text: 'Synchro for Baronne', summons: [{ card: 'Baronne de Fleur', method: 'synchro', materials: ['Ash Blossom & Joyous Spring', "Dark Magician Girl the Magician's Apprentice"] }] },
      ],
      endBoard: ['Baronne de Fleur'],
    };
    expect(errors(synchro).join(' ')).toMatch(/add up to 9, but "Baronne de Fleur" is Level 10/);

    const link: GeneratedLine = {
      name: 'bad Little Knight',
      starters: [['Dark Magician'], ["Magician's Rod"]],
      steps: [
        { text: 'Normal Summon Rod', summons: [{ card: "Magician's Rod", method: 'normal' }] },
        { text: 'Pretend DM is on field', summons: [{ card: 'Dark Magician', method: 'special' }] },
        { text: 'Link', summons: [{ card: 'S:P Little Knight', method: 'link', materials: ["Magician's Rod", 'Dark Magician'] }] },
      ],
      endBoard: ['S:P Little Knight'],
    };
    expect(errors(link).join(' ')).toMatch(/Normal Monster; "S:P Little Knight" needs Effect Monsters/);
  });

  it('rejects an end board the steps never build', () => {
    const line = rodLine();
    line.endBoard.push('Red-Eyes Dark Dragoon');
    expect(errors(line).join(' ')).toMatch(/don't leave it on your field/);
  });

  it('only warns on fusions it cannot fully read (Gaze of Timaeus uses one material)', () => {
    const line: GeneratedLine = {
      name: 'Gaze',
      starters: [['The Gaze of Timaeus'], ['Dark Magician']],
      steps: [
        { text: 'Special Summon DM somehow', summons: [{ card: 'Dark Magician', method: 'special' }] },
        { text: 'Gaze: shuffle DM to Fusion Summon Dragoon', activations: [{ card: 'The Gaze of Timaeus' }], summons: [{ card: 'Red-Eyes Dark Dragoon', method: 'fusion', materials: ['Dark Magician'], materialsTo: 'deck' }] },
      ],
      endBoard: ['Red-Eyes Dark Dragoon'],
    };
    const issues = checkLineLedger(line, ctx);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('parsing and conversion', () => {
  it('parses model JSON and converts to a valid trainer line', () => {
    const parsed = parseGeneratedLine(JSON.parse(JSON.stringify({ ...rodLine(), steps: [{ ...rodLine().steps[0], branches: [{ interruption: 'Ash Blossom & Joyous Spring', response: 'Go into Curtain instead' }] }] })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let n = 0;
    const trainer = toTrainerLine(parsed.line, ctx, 100, () => `id${n++}`);
    expect(trainer.starters).toEqual([[7084129]]);
    expect(trainer.steps[0].branches).toHaveLength(1);
    expect(validateLineInput(trainer).ok).toBe(true);
  });

  it('rejects malformed lines', () => {
    expect(parseGeneratedLine({ name: 'x', starters: 'Rod', steps: [] }).ok).toBe(false);
  });
});

describe('Dark Magician lines written with the paste-in prompt', () => {
  const data = JSON.parse(readFileSync(new URL('./fixtures/darkMagicianLines.json', import.meta.url), 'utf8'));
  for (const raw of data.lines) {
    it(`"${raw.name}" parses and passes the ledger`, () => {
      const r = parseGeneratedLine(raw);
      expect(r.ok).toBe(true);
      if (r.ok) expect(errors(r.line)).toEqual([]);
    });
  }
});

describe('pasting JSON copied out of a chat', () => {
  const clean = readFileSync(new URL('./fixtures/darkMagicianLines.json', import.meta.url), 'utf8');
  const withQuote = JSON.stringify({ lines: [{ ...JSON.parse(clean).lines[0], notes: 'If they Maxx "C" (or Mulcharmy Fuwalos), stop early: end on "Red-Eyes Dark Dragoon".' }] });

  it('recovers when the backslashes before inner quotes were lost', () => {
    const mangled = withQuote.replace(/\\"/g, '"');
    expect(() => JSON.parse(mangled)).toThrow();
    const parsed = extractJson(mangled) as any;
    expect(parsed.lines[0].notes).toBe('If they Maxx "C" (or Mulcharmy Fuwalos), stop early: end on "Red-Eyes Dark Dragoon".');
  });

  it('accepts curly quotes from a phone keyboard and a ```json fence', () => {
    const curly = '```json\n' + JSON.stringify({ lines: [] }).replace(/"/g, '“') + '\n```';
    expect(extractJson(curly)).toEqual({ lines: [] });
  });

  it('handles a quoted name followed by a comma in prose, and inside arrays', () => {
    const mangled = '{"lines":[{"name":"x","notes":"Add "Dark Magician", then Gaze it.","tags":["Maxx "C"","Ash"]}]}';
    expect(extractJson(mangled)).toEqual({ lines: [{ name: 'x', notes: 'Add "Dark Magician", then Gaze it.', tags: ['Maxx "C"', 'Ash'] }] });
  });

  it('leaves valid JSON untouched', () => {
    expect(extractJson(withQuote)).toEqual(JSON.parse(withQuote));
  });
});
