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
  const c = raw as Record<string, unknown>;
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
