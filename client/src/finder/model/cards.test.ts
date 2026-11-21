import { describe, expect, it } from 'vitest';
import dmFacts from '../deck/files/dm-azamina.cards.json';
import dmFile from '../deck/files/dm-azamina.json';
import handTraps from '../deck/files/hand-traps.json';
import staplesFacts from '../deck/files/staples.cards.json';
import staples from '../deck/files/staples.json';
import { validateDeckFile, type CardFacts, type HandTrapFile } from '../deck/schema';
import {
  addToHand, bestMatch, buildCatalog, cardBand, cardStats, cardTokens, copiesLeft, factsLine, frameOf, GROUP_LABELS,
  handSlots, matchScore, pickerGroups, removeFromHand, shortOf,
} from './cards';
import { BLANK, DEFAULT_SNAPSHOT, type FinderSnapshot, type ResolvedList } from './finderState';

const TRAPS = handTraps as HandTrapFile;
const r = validateDeckFile(dmFile, { staples });
if (!r.ok) throw new Error('invalid deck file');
const FILE = r.file;
const CAT = buildCatalog(FILE, [...(dmFacts as CardFacts[]), ...(staplesFacts as CardFacts[])], TRAPS);
const LIST: ResolvedList = { main: { ROD: 3, SOULS: 2, CIRC: 1, TALI: 1, ASH: 3, DM: 1 }, extra: { DRAG: 1 }, blanks: 1, unknown: [1] };
const short = shortOf(CAT);

describe('the card catalogue', () => {
  it('reads frames from the card type', () => {
    expect(['Normal Monster', 'Effect Monster', 'Ritual Effect Monster', 'Fusion Monster', 'Link Monster', 'Spell Card', 'Trap Card', 'Synchro Monster'].map((type) => frameOf({ type })))
      .toEqual(['normal', 'effect', 'ritual', 'fusion', 'link', 'spell', 'trap', 'synchro']);
    expect(frameOf(null)).toBe('other');
  });
  it('gives every card of the merged file its facts, and marks hand traps and Extra Deck cards', () => {
    expect(CAT.size).toBe(FILE.cards.length);
    expect(CAT.get('ROD')).toMatchObject({ short: 'Rod', name: "Magician's Rod", frame: 'effect', extra: false, handTrap: false });
    expect(CAT.get('ASH')).toMatchObject({ handTrap: true, extra: false });
    expect(CAT.get('DRAG')).toMatchObject({ frame: 'fusion', extra: true });
  });
  it('shows a band, stats and a facts line', () => {
    expect([cardBand(CAT.get('ROD')), cardStats(CAT.get('ROD'))]).toEqual(['★ 3', '1600/100']);
    expect(cardBand(CAT.get('CIRC'))).toBe('Cont.');
    expect([cardBand(CAT.get('TALI')), cardStats(CAT.get('TALI'))]).toEqual(['Trap', '']);
    expect(cardBand(undefined)).toBe('Any');
    expect(factsLine(CAT.get('ROD')!)).toBe('DARK Spellcaster · Level 3 · 1600 / 100');
    expect(factsLine(CAT.get('CIRC')!)).toBe('Continuous Spell');
    expect(short(BLANK)).toBe('Blank');
  });
});

describe('the picker', () => {
  it('groups the list by kind, in list order, with the blank last; the Extra Deck is not offered', () => {
    const g = pickerGroups(CAT, LIST);
    expect(g.map((x) => x.label)).toEqual([GROUP_LABELS.mon, GROUP_LABELS.spell, GROUP_LABELS.trap, GROUP_LABELS.handTrap, GROUP_LABELS.other]);
    expect(g[0].ids).toEqual(['DM', 'SOULS', 'ROD']);
    expect(g[3].ids).toEqual(['ASH']);
    expect(g[4].ids).toEqual([BLANK]);
  });
  it('counts copies left; blanks never run out', () => {
    expect(copiesLeft(LIST, ['ROD', 'ROD'], 'ROD')).toBe(1);
    expect(copiesLeft(LIST, [], 'DRAG')).toBe(0);
    expect(copiesLeft(LIST, [BLANK, BLANK], BLANK)).toBe(Infinity);
  });
  it('finds a card by typing, skipping cards with none left', () => {
    const g = pickerGroups(CAT, LIST);
    expect(matchScore(CAT.get('ROD'), 'ROD', 'ro')).toBe(4);
    expect(matchScore(CAT.get('SOULS'), 'SOULS', 'sou')).toBe(3);
    expect(matchScore(CAT.get('ROD'), 'ROD', 'magician')).toBe(2);
    expect(bestMatch(CAT, g, LIST, [], 'ro')).toBe('ROD');
    expect(bestMatch(CAT, g, LIST, ['ROD', 'ROD', 'ROD'], 'ro')).not.toBe('ROD');
    expect(bestMatch(CAT, g, LIST, [], 'blank')).toBe(BLANK);
    expect(bestMatch(CAT, g, LIST, [], '')).toBeNull();
  });
  it('adds to the hand up to 7 and copies left, and removes by position', () => {
    let s: FinderSnapshot = { ...DEFAULT_SNAPSHOT, hand: [] };
    for (let i = 0; i < 3; i++) { const a = addToHand(s, LIST, 'ROD', short); if ('error' in a) throw new Error(a.error); s = a.snap; }
    expect(addToHand(s, LIST, 'ROD', short)).toEqual({ error: 'No copies of Rod left in the deck.' });
    for (let i = 0; i < 4; i++) { const a = addToHand(s, LIST, BLANK, short); if ('error' in a) throw new Error(a.error); s = a.snap; }
    expect(s.hand).toHaveLength(7);
    expect(addToHand(s, LIST, 'DM', short)).toEqual({ error: 'Seven cards is the most this hand can hold.' });
    expect(removeFromHand(s, 0).hand).toEqual(['ROD', 'ROD', BLANK, BLANK, BLANK, BLANK]);
    expect(removeFromHand(s, 9)).toBe(s);
    expect([handSlots({ mode: 'first' }), handSlots({ mode: 'second' })]).toEqual([5, 6]);
  });
});

describe('card names in step text', () => {
  it('splits text so full and short names can be tapped, longest first', () => {
    const tok = cardTokens(CAT);
    expect(tok("Normal Summon Magician's Rod; add Circle.")).toEqual([
      { text: 'Normal Summon ' }, { text: "Magician's Rod", id: 'ROD' }, { text: '; add ' }, { text: 'Circle', id: 'CIRC' }, { text: '.' },
    ]);
    expect(tok('nothing here')).toEqual([{ text: 'nothing here' }]);
  });
});
