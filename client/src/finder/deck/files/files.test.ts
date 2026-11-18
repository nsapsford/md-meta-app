import { describe, expect, it } from 'vitest';
import cardData from '../../__harness__/reference/card-data.json';
import { loadReference } from '../../__harness__/loadReference';
import { compileDeck } from '../compile';
import { validateDeckFile, type CardFacts, type DeckFile } from '../schema';
import dmFile from './dm-azamina.json';
import dmFacts from './dm-azamina.cards.json';
import staples from './staples.json';
import staplesFacts from './staples.cards.json';

const facts = [...dmFacts, ...staplesFacts] as CardFacts[];
const cards = [...(dmFile.cards as DeckFile['cards']), ...(staples.cards as DeckFile['cards'])];

describe('the DM Azamina deck files', () => {
  it('every card has facts and the reference name', () => {
    const { engine } = loadReference();
    const refNames = new Set((cardData as { name: string }[]).map((c) => c.name));
    for (const c of cards) {
      const f = facts.find((x) => x.passcode === c.passcodes[0]);
      expect(f, c.id).toBeDefined();
      expect(refNames.has(engine.NAMES[c.id]), c.id).toBe(true);
      expect(f!.name, c.id).toBe(engine.NAMES[c.id]);
    }
  });

  it('validates', () => {
    expect(validateDeckFile(dmFile, { staples }).ok).toBe(true);
  });

  it('compiles, with the hand traps held and only Ash Normal Summoned', () => {
    const r = validateDeckFile(dmFile, { staples });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const deck = compileDeck(r.file, facts);
    const p = (id: string) => deck.props[deck.ix[id]];
    expect(['ASH', 'DROLL', 'FUWA', 'MAXX'].map((id) => [p(id).heldValue, p(id).discardValue, p(id).normalSummon]))
      .toEqual([[1, 5, true], [0.9, 5, false], [0.8, 5, false], [0.8, 5, false]]);
    expect([p('DM').sub, p('DM').lv, p('DM').heldValue]).toEqual(['Normal', 7, 0]);
  });
});
