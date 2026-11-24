// Test driver for compiled decks: collect the moves a deck offers, run one, look at the result.
// Test code only.

import { compileDeck, type CompiledDeck } from '../../deck/compile';
import { createStateOps } from '../state';
import type { CardId, Mon, Move, State, Tags, ZoneName } from '../types';
import { TOY_FACTS, TOY_FILE, toyCfg } from './toyDeck';
import type { CardFacts, DeckFile } from '../../deck/schema';

export interface Driver {
  deck: CompiledDeck;
  state(hand: Record<CardId, number>): State;
  moves(s: State): Move[];
  mainKeys(s: State): string[];
  pendKeys(s: State): string[];
  run(s: State, key: string, negated?: boolean): State;
  summonForTest(s: State, id: CardId): State;
  count(s: State, zone: ZoneName, id: CardId): number;
  handSize(s: State): number;
  lastText(s: State): string;
}

export function driver(file: DeckFile = TOY_FILE, facts: CardFacts[] = TOY_FACTS): Driver {
  const deck = compileDeck(file, facts);
  const so = createStateOps(deck.ids.length, deck.nOpt, deck.nFlags);
  const collect = (s: State, gen: (s: State, push: (k: string, t: Tags, run: Move['run'], neg?: boolean) => void) => void): Move[] => {
    const out: Move[] = [];
    gen(s, (k, tags, run, neg = true) => { out.push({ k, tags, run, neg }); });
    return out;
  };
  const moves = (s: State) => (s.pend.length ? collect(s, deck.genPending) : collect(s, deck.genMain));
  return {
    deck,
    state: (hand) => so.newState(toyCfg(hand), deck.ix),
    moves,
    mainKeys: (s) => collect(s, deck.genMain).map((m) => m.k),
    pendKeys: (s) => collect(s, deck.genPending).map((m) => m.k),
    run(s, key, negated = false) {
      const all = moves(s);
      const m = all.find((x) => x.k === key);
      if (!m) throw new Error(`no move ${key}; offered: ${all.map((x) => x.k).join(', ')}`);
      return m.run(s, negated);
    },
    summonForTest(s, id) {
      const n = so.clone(s);
      const i = deck.ix[id];
      so.W(n, 'hand')[i]--;
      const m: Mon = { id: i, nm: i, emz: false, noEff: false, uses: 0, lvl: deck.props[i].lv ?? 0, marks: 0, uid: n.uid++ };
      n.mons.push(m);
      n.summons++;
      deck.onPlace(n, m, false);
      return n;
    },
    count: (s, zone, id) => s[zone][deck.ix[id]],
    handSize: (s) => s.hand.reduce((a, b) => a + b, 0),
    lastText: (s) => s.log[s.log.length - 1].text,
  };
}
