// Group parity: the DM Azamina deck file, restricted to one group of cards, walked in lockstep
// with the reference restricted to the same cards. Tasks 10–16 each add a group; a group is done
// when every situation here shows no differences beyond ACCEPTED.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../../utils/trainer';
import { compileDeck } from '../deck/compile';
import { validateDeckFile, type CardFacts } from '../deck/schema';
import { createEngine, type Engine } from '../engine';
import { withoutAccepted } from './acceptedDiffs';
import { loadReference, type RefCard, type RefCfg, type RefEngine } from './loadReference';
import { formatDiffs, lockstep, reducedDeck } from './lockstep';
import { FIELDS, oppField } from './situations';

export const G1 = ['DM', 'ASH', 'DROLL', 'FUWA', 'MAXX'];
export const G2 = [...G1, 'ROD', 'CIRC', 'CURT', 'TALI', 'SSRV'];
export const G3 = [...G2, 'SOULS', 'SERV', 'IOC', 'PREP'];
export const G4 = [...G3, 'SARC', 'FSIL', 'DMG', 'DMBM', 'GAND'];
export const G5 = [...G4, 'DIA', 'WANT', 'DECE', 'HALL', 'ILIA', 'RCIE'];
export const G6 = [...G5, 'GAZE', 'SPOLY', 'DRAG', 'MOC', 'DMOD', 'MUD', 'CHOR', 'GAR'];
export const G7 = [...G6, 'BAR', 'CANG', 'MASQ', 'SHEEP', 'SPLK', 'FANCY', 'CHARM'];

export interface GroupOpts { first: number; second: number; seed: number }

/**
 * The group's situations: `o.first` going-first hands of 5 and `o.second` going-second hands of 6
 * (against Task 2's 13 opponent fields in turn), drawn from the group's Main Deck only.
 */
export function groupSituations(ref: RefEngine, cards: RefCard[], ids: string[], o: GroupOpts): { id: string; cfg: RefCfg }[] {
  const full = reducedDeck(ref, cards, ids);
  const pool0 = Object.entries(full.deck).flatMap(([id, n]) => Array<string>(n).fill(id));
  const draw = (rng: () => number, size: number): Pick<RefCfg, 'hand' | 'deck'> => {
    const pool = [...pool0];
    const hand: Record<string, number> = {};
    for (let i = 0; i < size && pool.length; i++) {
      const [id] = pool.splice(Math.floor(rng() * pool.length), 1);
      hand[id] = (hand[id] ?? 0) + 1;
    }
    const deck = { ...full.deck };
    for (const [id, n] of Object.entries(hand)) deck[id] -= n;
    return { hand, deck };
  };
  const out: { id: string; cfg: RefCfg }[] = [];
  const pad = (n: number) => String(n).padStart(3, '0');
  let rng = mulberry32(o.seed);
  for (let i = 0; i < o.first; i++) out.push({ id: `first-${pad(i + 1)}`, cfg: { mode: 'first', ...draw(rng, 5), extra: { ...full.extra } } });
  rng = mulberry32(o.seed + 1000);
  for (let i = 0; i < o.second; i++) {
    out.push({ id: `second-${pad(i + 1)}`, cfg: { mode: 'second', ...draw(rng, 6), extra: { ...full.extra }, opp: oppField(FIELDS[i % FIELDS.length]) } });
  }
  return out;
}

const FILES = '../deck/files/';
const readJson = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(FILES + name, import.meta.url)), 'utf8'));

/** The DM Azamina deck file with its shared staples file, validated, and its card facts. Read when called (the files arrive in Task 10). */
function loadDeckFiles(): { ok: true; engine: Engine } | { ok: false; errors: string } {
  const r = validateDeckFile(readJson('dm-azamina.json'), { staples: readJson('staples.json') });
  if (!r.ok) return { ok: false, errors: r.errors.map((e) => `${e.card ?? '-'} ${e.field}: ${e.message}`).join('\n') };
  const facts = [...(readJson('dm-azamina.cards.json') as CardFacts[]), ...(readJson('staples.cards.json') as CardFacts[])];
  return { ok: true, engine: createEngine(compileDeck(r.file, facts)) };
}

export function groupParity(name: string, ids: string[], o: GroupOpts): void {
  describe(`group parity: ${name}`, () => {
    const { engine: ref, cards } = loadReference();
    const sits = groupSituations(ref, cards, ids, o);
    let loaded: ReturnType<typeof loadDeckFiles>;
    beforeAll(() => { loaded = loadDeckFiles(); });

    it('the deck file is valid', () => { expect(loaded.ok ? '' : loaded.errors).toBe(''); });

    for (const sit of sits) {
      it(sit.id, () => {
        if (!loaded.ok) throw new Error('the deck file is not valid');
        const diffs = withoutAccepted(lockstep(ref, loaded.engine, sit.cfg, { id: sit.id, width: 40, depth: 26 }));
        expect(formatDiffs(diffs)).toBe('');
      });
    }
  });
}
