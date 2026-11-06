// Shared types for the line generator: the deck context a model is grounded
// in, the structured line a model returns, and the issues verifiers report.

export interface DeckCard {
  passcode: number;
  name: string;
  type: string;            // e.g. "Effect Monster", "Synchro Monster", "Spell Card"
  text: string;            // full card text, never truncated
  level: number | null;    // level or rank
  linkRating: number | null;
  attribute: string | null;
  race: string | null;     // monster type ("Spellcaster") or spell/trap kind ("Quick-Play")
  copies: number;
  zone: 'main' | 'extra';
  banStatus?: string | null;
}

export interface DeckContext {
  deckName: string;
  archetype: string | null;
  main: DeckCard[];
  extra: DeckCard[];
  /** Hand traps most played in current top lists, most common first. */
  metaInterruptions: string[];
}

export type Zone = 'hand' | 'deck' | 'extra' | 'field' | 'gy' | 'banished';
export const ZONES: readonly Zone[] = ['hand', 'deck', 'extra', 'field', 'gy', 'banished'];

export type SummonMethod = 'normal' | 'tribute' | 'special' | 'link' | 'xyz' | 'synchro' | 'fusion' | 'ritual';

/** "*" = any other card in hand; "?" = an unknown drawn card. */
export const ANY_CARD = '*';
export const UNKNOWN_CARD = '?';

export interface PlanMove { card: string; from: Zone; to: Zone }
export interface PlanSummon {
  card: string;
  method: SummonMethod;
  from?: Zone;              // defaults: extra for link/xyz/synchro/fusion, hand otherwise
  materials?: string[];
  materialsFrom?: Zone;     // default field (e.g. gy for a card that fuses with monsters in the GY)
  materialsTo?: Zone;       // default gy (e.g. deck for "shuffle into the Deck as material")
}
export interface PlanActivation {
  card: string;
  /** 1-based index of the effect in the card text, in reading order. */
  effect?: number;
  from?: Zone;              // where the card is when activated; spells default to hand
}
export interface PlanBranch { interruption: string; response: string }
export interface PlanStep {
  text: string;
  activations?: PlanActivation[];
  summons?: PlanSummon[];
  moves?: PlanMove[];
  branches?: PlanBranch[];
}

/** One line as a model (or a person) writes it: display text plus a checkable plan. */
export interface GeneratedLine {
  name: string;
  /** Starter slots: each slot lists interchangeable cards; one card per slot must be in hand. */
  starters: string[][];
  /** Extra unspecified cards the line needs in hand (e.g. discard fodder). */
  freeCards?: number;
  steps: PlanStep[];
  endBoard: string[];
  endBoardText?: string;
  notes?: string;
}

export type Severity = 'error' | 'warning';
export interface CheckIssue {
  severity: Severity;
  step: number | null;      // 1-based step, or null for the whole line
  source: string;           // which verifier raised it: 'ledger' | 'critique' | 'engine'
  message: string;
}

export interface CheckReport {
  ok: boolean;              // no errors
  issues: CheckIssue[];
  verifiers: string[];      // which verifiers ran
}
