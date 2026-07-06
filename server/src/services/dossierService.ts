export type DossierKind = 'opponent' | 'pilot';

export interface OpponentDossierContent {
  overview: string;
  keyStarters: string[];
  chokePoints: string[];
  typicalEndBoards: string[];
  playArounds: string[];
}

export interface PilotDossierContent extends OpponentDossierContent {
  comboLines: string[];
  underInterruption: string[];
  matchupTips: Array<{ opponent: string; tip: string }>;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);
}

export function validateOpponentContent(raw: unknown): raw is OpponentDossierContent {
  if (typeof raw !== 'object' || raw === null) return false;
  const c = raw as Record<string, unknown>;
  return (
    isNonEmptyString(c.overview) &&
    isStringArray(c.keyStarters) &&
    isStringArray(c.chokePoints) &&
    isStringArray(c.typicalEndBoards) &&
    isStringArray(c.playArounds)
  );
}

export function validatePilotContent(raw: unknown): raw is PilotDossierContent {
  if (!validateOpponentContent(raw)) return false;
  const c = raw as unknown as Record<string, unknown>;
  if (!isStringArray(c.comboLines) || !isStringArray(c.underInterruption)) return false;
  if (!Array.isArray(c.matchupTips) || c.matchupTips.length === 0) return false;
  return c.matchupTips.every(
    (t: unknown) =>
      typeof t === 'object' && t !== null &&
      isNonEmptyString((t as Record<string, unknown>).opponent) &&
      isNonEmptyString((t as Record<string, unknown>).tip)
  );
}

// Models sometimes wrap JSON output in a ```json fenced block despite being
// asked not to; strip that before parsing.
export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(trimmed);
}

export interface CardPoolEntry {
  name: string;
  desc: string | null;
  count: number;
}

const OPPONENT_SCHEMA_HINT = `{
  "overview": "2-3 sentence summary of the archetype's gameplan",
  "keyStarters": ["card name", "..."],
  "chokePoints": ["what to negate/interrupt and when, one per entry"],
  "typicalEndBoards": ["description of a common end board, one per entry"],
  "playArounds": ["how to play around or answer this deck, one per entry"]
}`;

const PILOT_SCHEMA_HINT = `{
  "overview": "...", "keyStarters": ["..."], "chokePoints": ["..."],
  "typicalEndBoards": ["..."], "playArounds": ["..."],
  "comboLines": ["standard combo line, one per entry"],
  "underInterruption": ["how to play the line under a common interruption, one per entry"],
  "matchupTips": [{"opponent": "archetype name", "tip": "matchup-specific tip"}]
}`;

function formatCardPool(pool: CardPoolEntry[]): string {
  return pool
    .map((c) => `- ${c.name} (used ${c.count}x)${c.desc ? `: ${c.desc.slice(0, 200)}` : ''}`)
    .join('\n');
}

export function buildOpponentPrompt(archetype: string, cardPool: CardPoolEntry[]): string {
  return [
    `You are a Yu-Gi-Oh! Master Duel coach. Write a scouting dossier for the "${archetype}" archetype so a player can beat it in real time, mid-duel.`,
    `Ground every claim in these cards actually played by the archetype (most-used first):`,
    formatCardPool(cardPool),
    `Respond with ONLY minified JSON matching this shape (no markdown fences, no commentary):`,
    OPPONENT_SCHEMA_HINT,
  ].join('\n\n');
}

export function buildPilotPrompt(deckName: string, archetype: string | null, cardPool: CardPoolEntry[]): string {
  return [
    `You are a Yu-Gi-Oh! Master Duel coach. Write a pilot guide for this exact deck ("${deckName}"${archetype ? `, a ${archetype} build` : ''}) so its owner plays it correctly mid-duel.`,
    `The deck's actual cards (most-used first):`,
    formatCardPool(cardPool),
    `Respond with ONLY minified JSON matching this shape (no markdown fences, no commentary):`,
    PILOT_SCHEMA_HINT,
  ].join('\n\n');
}
