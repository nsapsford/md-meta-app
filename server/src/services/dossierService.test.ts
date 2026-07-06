import { describe, it, expect } from 'vitest';
import {
  validateOpponentContent,
  validatePilotContent,
  parseModelJson,
  buildOpponentPrompt,
  buildPilotPrompt,
  type OpponentDossierContent,
  type PilotDossierContent,
  type CardPoolEntry,
} from './dossierService.js';

const validOpponent: OpponentDossierContent = {
  overview: 'Aggro deck that floods the board turn one.',
  keyStarters: ['Card A', 'Card B'],
  chokePoints: ['Negate the first extender before it links.'],
  typicalEndBoards: ['Two link monsters plus a floodgate.'],
  playArounds: ['Hold hand traps for the second main phase.'],
};

const validPilot: PilotDossierContent = {
  ...validOpponent,
  comboLines: ['Normal summon A, link into B.'],
  underInterruption: ['If negated on A, pivot to the backup line via C.'],
  matchupTips: [{ opponent: 'Kashtira', tip: 'Play around Unicorn by spacing summons.' }],
};

describe('validateOpponentContent', () => {
  it('accepts a well-formed opponent dossier', () => {
    expect(validateOpponentContent(validOpponent)).toBe(true);
  });

  it('rejects missing fields', () => {
    const { overview, ...rest } = validOpponent;
    expect(validateOpponentContent(rest)).toBe(false);
  });

  it('rejects empty arrays', () => {
    expect(validateOpponentContent({ ...validOpponent, keyStarters: [] })).toBe(false);
  });

  it('rejects non-string array entries', () => {
    expect(validateOpponentContent({ ...validOpponent, chokePoints: [1, 2] })).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(validateOpponentContent(null)).toBe(false);
    expect(validateOpponentContent('nope')).toBe(false);
  });
});

describe('validatePilotContent', () => {
  it('accepts a well-formed pilot dossier', () => {
    expect(validatePilotContent(validPilot)).toBe(true);
  });

  it('rejects a pilot dossier missing matchupTips', () => {
    const { matchupTips, ...rest } = validPilot;
    expect(validatePilotContent(rest)).toBe(false);
  });

  it('rejects matchupTips entries missing a tip', () => {
    expect(validatePilotContent({ ...validPilot, matchupTips: [{ opponent: 'Kashtira' }] })).toBe(false);
  });

  it('rejects an opponent-shaped payload (missing pilot-only fields)', () => {
    expect(validatePilotContent(validOpponent)).toBe(false);
  });
});

describe('parseModelJson', () => {
  it('parses plain JSON', () => {
    expect(parseModelJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('strips a ```json fenced block', () => {
    expect(parseModelJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('strips a plain ``` fenced block', () => {
    expect(parseModelJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
});

const pool: CardPoolEntry[] = [
  { name: 'Card A', desc: 'Special Summon this card.', count: 3 },
  { name: 'Card B', desc: null, count: 1 },
];

describe('buildOpponentPrompt', () => {
  it('includes the archetype name, card names, usage counts, and a JSON-only instruction', () => {
    const prompt = buildOpponentPrompt('Kashtira', pool);
    expect(prompt).toContain('Kashtira');
    expect(prompt).toContain('Card A (used 3x): Special Summon this card.');
    expect(prompt).toContain('Card B (used 1x)');
    expect(prompt).toMatch(/only.*JSON/i);
    expect(prompt).toContain('keyStarters');
  });
});

describe('buildPilotPrompt', () => {
  it('includes the deck name, archetype, card pool, and pilot-only schema fields', () => {
    const prompt = buildPilotPrompt('My Kashtira Build', 'Kashtira', pool);
    expect(prompt).toContain('My Kashtira Build');
    expect(prompt).toContain('Kashtira');
    expect(prompt).toContain('Card A (used 3x): Special Summon this card.');
    expect(prompt).toContain('comboLines');
    expect(prompt).toContain('matchupTips');
  });

  it('omits the archetype clause when the deck has no archetype', () => {
    const prompt = buildPilotPrompt('Homebrew Deck', null, pool);
    expect(prompt).toContain('Homebrew Deck');
    expect(prompt).not.toMatch(/a null build/i);
  });
});
