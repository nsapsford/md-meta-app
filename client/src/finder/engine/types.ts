export type CardId = string;
export type ZoneName = 'hand' | 'deck' | 'extra' | 'gy' | 'ban';

export interface OppCard {
  uid: string | number;
  kind: 'mon' | 'st';
  name: string;
  atk?: number;
  def?: number;
  pos?: 'atk' | 'def' | 'set';
  attr?: string;
  race?: string;
  ext?: boolean;
  faceDown?: boolean;
  noDestroy?: boolean;
  noTarget?: boolean;
  intr?: string | null;
}

export interface Cfg {
  mode: 'first' | 'second';
  hand: Record<CardId, number>;
  deck: Record<CardId, number>;
  extra: Record<CardId, number>;
  opp?: { lp: number; mons: OppCard[]; st: OppCard[] };
  drawFx?: number;
  drawPenalty?: number;
  base?: string[];
}

export interface Mon { id: number; nm: number; emz: boolean; noEff: boolean; uses: number; lvl: number; marks: number; uid: number }
export interface ST { id: number; up: boolean; now: boolean; endSet?: boolean }

export interface Tags {
  deckTouch?: boolean; deckAdd?: boolean; fieldMon?: boolean; handMon?: boolean; gy?: boolean;
  spell?: boolean; trap?: boolean; noResp?: boolean; inherent?: boolean; removal?: boolean; dig?: boolean; marks?: number;
}

export interface StepRec {
  text: string; tags: Tags; seq: unknown[] | null; ns: number; xs: number; summonsAfter: number;
  interrupted: string | null; pre: State | null; act: Move | null; fD: boolean; fH: boolean; fS: boolean; draws: number; ev?: boolean;
}

export interface Move { k: string; tags: Tags; neg: boolean; run(s: State, negated: boolean): State }

export interface Interruption {
  kind: string; src: 'hand' | 'board'; label: string; uid?: OppCard['uid'];
  cardKind?: 'mon' | 'st'; monster?: boolean; param?: number; force?: boolean;
}

export interface StepView {
  tags: Tags; canNeg: boolean; summonsAfter: number; summoned: boolean; oppCount: number;
  oppPresent: OppCard['uid'][]; interrupted?: string | null; ev?: boolean;
}

export type TurnEvent =
  | { t: 'lose'; id: CardId; to: 'hand' | 'gy' | 'ban'; by?: string }
  | { t: 'gain'; id: CardId; replace?: boolean }
  | { t: 'oppAdd'; mon: Partial<OppCard> };

/** An opponent card as held in the state: the caller's card plus a numeric id for hashing. */
export type OppCardState = OppCard & { ui: number };

/** The opponent's side. Copied on first write (see OW); k/k2 cache its hash. */
export interface OppState {
  mons: OppCardState[];
  st: OppCardState[];
  lp: number;
  lp0: number;
  k: number | null;
  k2: number;
}

export interface Pend { e: number; a?: number }

export interface State {
  mode: 'first' | 'second';
  turn: 'me' | 'opp';
  phase: 'main' | 'battle' | 'end';
  hand: Uint8Array; deck: Uint8Array; extra: Uint8Array; gy: Uint8Array; ban: Uint8Array;
  /** Bitmask of zones this state owns (may write in place); see W. */
  own: number;
  /** Cached zone hashes (0 = stale): hand, deck, extra, gy, ban. */
  k1: number; k2: number; k3: number; k4: number; k5: number;
  mons: Mon[];
  st: ST[];
  top: number[];
  opt: Uint32Array;
  flags: number;
  ns: boolean;
  spell: boolean;
  summons: number;
  lp: number;
  addLock: boolean;
  pend: Pend[];
  opp: OppState | null;
  /** True when this state owns its `opp` object (may write in place); see OW. */
  oppOwn: boolean;
  burn: number;
  removed: number;
  noDirect: boolean;
  log: StepRec[];
  uid: number;
  path: string[];
  spent: Record<number, unknown> | null;
  cur: StepRec | null;
  cDeckTouch: number;
  cDeckAdd: number;
  cFieldMon: number;
  drawFx: number;
  oppDraws: number;
  drawPenalty: number;
  opening: string[] | null;
}

export interface FinalBoard {
  hand: Uint8Array; deck: Uint8Array; extra: Uint8Array; gy: Uint8Array;
  mons: Mon[]; st: ST[]; opp: State['opp']; lp: number; noDirect: boolean; flags: number;
}
