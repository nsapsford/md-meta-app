// Prompts for the line generator. The same deck grounding and output format
// are used whether the server calls a model API or the user pastes the
// prompt into Claude Code / claude.ai and imports the answer.
import type { CheckIssue, DeckCard, DeckContext, GeneratedLine } from './types.js';

function cardLine(c: DeckCard): string {
  const stats: string[] = [c.type];
  if (c.linkRating != null) stats.push(`Link-${c.linkRating}`);
  else if (c.level != null) stats.push(`${/XYZ|Xyz/.test(c.type) ? 'Rank' : 'Level'} ${c.level}`);
  if (c.attribute) stats.push(c.attribute);
  if (c.race) stats.push(c.race);
  const ban = c.banStatus ? ` [Master Duel: ${c.banStatus}]` : '';
  return `### ${c.name} ×${c.copies}${ban}\n(${stats.join(' · ')})\n${c.text.trim()}`;
}

export function formatDeck(ctx: DeckContext): string {
  const mainCount = ctx.main.reduce((n, c) => n + c.copies, 0);
  return [
    `## Main Deck (${mainCount} cards)`,
    ...ctx.main.map(cardLine),
    `## Extra Deck (${ctx.extra.length} cards). These are the ONLY Extra Deck monsters available`,
    ...ctx.extra.map(cardLine),
  ].join('\n\n');
}

export const PLAN_FORMAT = `Each line is a JSON object:
{
  "name": "short label, e.g. \\"1-card: Magician's Rod → Dragoon + Baronne\\"",
  "starters": [["Card A"], ["Card B", "Card C"]],   // cards needed in the opening hand. Each inner list is ONE card slot; list interchangeable cards in the same slot.
  "freeCards": 0,                                     // extra unspecified cards the line needs in hand (e.g. something to discard)
  "steps": [
    {
      "text": "Normal Summon Magician's Rod; its effect adds Dark Magical Circle.",   // what you'd tell a player, one action per step
      "summons":     [{ "card": "Magician's Rod", "method": "normal" }],
      "activations": [{ "card": "Magician's Rod", "effect": 1 }],
      "moves":       [{ "card": "Dark Magical Circle", "from": "deck", "to": "hand" }],
      "branches":    [{ "interruption": "Ash Blossom & Joyous Spring", "response": "what to do instead from here, and the board you end on" }]
    }
  ],
  "endBoard": ["Card on field", "..."],                // every card you control at the end of the turn
  "endBoardText": "what the board does: the interruptions it gives you",
  "notes": "anything the player must know (restrictions, what not to do)"
}

Plan rules (a program replays every line on a card ledger, so these must be exact):
- Use card names EXACTLY as written in the deck list. Only cards from this deck exist (plus tokens). Never invent cards; never use an Extra Deck monster that isn't listed.
- Zones: "hand", "deck", "extra", "field", "gy", "banished".
- "summons": method is one of normal, tribute, special, link, xyz, synchro, fusion, ritual. Give "from" when a monster isn't summoned from the hand or Extra Deck (e.g. "deck", "gy", "banished"). List "materials" for Link/Xyz/Synchro/Fusion and tributes; they leave the field automatically (to the GY, or set "materialsTo", e.g. "deck" when they are shuffled in). If materials come from somewhere other than your field, set "materialsFrom" (e.g. "gy").
- "activations": every card effect or Spell/Trap you activate. "effect" is the effect's number in the card text, counting from 1 in reading order. A Spell/Trap activated from the hand moves to the field or GY automatically.
- "moves": every OTHER change of zone — searches (deck→hand), sends, discards and costs (hand→gy), banishes, cards placed on top of the deck (→deck). Do NOT add moves for the summoned monster, its materials, or the activated Spell/Trap itself.
- Use "*" for an unspecified card in hand (e.g. discarding "any card"), and "?" for an unknown card drawn by an effect.
- Respect every once-per-turn clause, "You can only activate 1 … per turn", summon restrictions and "cannot activate its effects this turn" clauses in the card text.
- One Normal Summon per turn unless a card grants another.`;

const RULES = `You are an expert Yu-Gi-Oh! Master Duel combo player and judge. You write combo lines for this exact deck, going first, assuming the opponent does nothing unless a branch says otherwise. Each line should reach the strongest end board the starters can make with these cards, using as few resources as possible so extenders are left over to play through interruptions.

Before writing each line, track the game state step by step (hand, field, GY, banished, once-per-turn effects used, Normal Summon used). Read each card's full text and check every condition, cost and restriction. If a step isn't legal under the card text, don't write it — find another way or end the line earlier.`;

function interruptionsLine(ctx: DeckContext): string {
  return `Interruptions to plan for (most played in the current Master Duel meta): ${ctx.metaInterruptions.join(', ')}. For each line, add branches on the steps where the most likely of these would hit, with the best response and the board you still end on.`;
}

export function buildOpenersPrompt(ctx: DeckContext, max = 8): string {
  return [
    RULES,
    `Deck: "${ctx.deckName}"${ctx.archetype ? ` (${ctx.archetype})` : ''}.`,
    formatDeck(ctx),
    `List the opening hands this deck most often plays a full combo from: single-card starters first, then common 2-card combinations. At most ${max}, most common first.`,
    'Respond with ONLY JSON: {"openers": [{"starters": [["Card A"], ["Card B", "Card C"]], "freeCards": 0, "goal": "the end board this opener aims for"}]}',
  ].join('\n\n');
}

export function buildLinePrompt(ctx: DeckContext, opener: { starters: string[][]; freeCards?: number; goal?: string }): string {
  return [
    RULES,
    `Deck: "${ctx.deckName}"${ctx.archetype ? ` (${ctx.archetype})` : ''}.`,
    formatDeck(ctx),
    interruptionsLine(ctx),
    `Write the best line for this opener: ${JSON.stringify(opener.starters)}${opener.freeCards ? ` plus ${opener.freeCards} other card(s)` : ''}${opener.goal ? `. Target: ${opener.goal}` : ''}.`,
    PLAN_FORMAT,
    'Respond with ONLY JSON: {"line": { ...one line... }}',
  ].join('\n\n');
}

export function buildRepairPrompt(ctx: DeckContext, line: GeneratedLine, issues: CheckIssue[]): string {
  return [
    RULES,
    formatDeck(ctx),
    'This line failed checks against the card text and a card ledger:',
    JSON.stringify(line, null, 1),
    'Problems found:',
    issues.map((i) => `- ${i.step ? `Step ${i.step}: ` : ''}${i.message}`).join('\n'),
    'Fix every problem. If a step can\'t be made legal, change the route or end the line earlier with a smaller board; never keep an illegal step. Keep the same starters unless they are the problem.',
    PLAN_FORMAT,
    'Inside text values, write quotes as single quotes, never double quotes. Respond with ONLY the JSON, inside one ```json code block: {"line": { ...the corrected line... }}',
  ].join('\n\n');
}

export function buildCritiquePrompt(ctx: DeckContext, line: GeneratedLine): string {
  return [
    'You are a strict Yu-Gi-Oh! judge. Check this combo line against the full card text below, step by step, as if you were resolving it in Master Duel. Look for: conditions not met, costs not paid, once-per-turn effects reused, summon restrictions broken, cards that aren\'t where the line says, wrong materials, missed-timing problems ("When … you can" vs "If … you can"), effects that can\'t be activated that turn, and end boards that don\'t follow. Also flag a clearly better end board from the same starters, as a warning.',
    formatDeck(ctx),
    'Line:',
    JSON.stringify(line, null, 1),
    'Respond with ONLY JSON: {"issues": [{"step": 3, "severity": "error", "message": "..."}]}. "error" = the line is illegal or won\'t work as written; "warning" = worth a look. Return {"issues": []} if it is correct.',
  ].join('\n\n');
}

/** One self-contained prompt to paste into Claude Code or claude.ai (no API key needed). */
export function buildPastePrompt(ctx: DeckContext, max = 8): string {
  return [
    RULES,
    `Deck: "${ctx.deckName}"${ctx.archetype ? ` (${ctx.archetype})` : ''}.`,
    formatDeck(ctx),
    interruptionsLine(ctx),
    `Task: work out the opening hands this deck most often combos from (single-card starters first, then common 2-card hands; at most ${max}), and write the best line for each.`,
    PLAN_FORMAT,
    'When you have written all lines, re-check each one step by step against the card text as a strict judge and fix anything illegal before answering.',
    'Inside text values, write quotes as single quotes (e.g. Maxx \'C\'), never double quotes.',
    'Respond with ONLY the JSON, inside one ```json code block (no other commentary): {"lines": [ ...lines... ]}',
  ].join('\n\n');
}

// ── Parsing model output ──

export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const text = (fenced ? fenced[1] : raw).trim()
    .replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'"); // phone keyboards / rich text
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error('No JSON found in the response');
  const opener = text[start];
  const end = text.lastIndexOf(opener === '{' ? '}' : ']');
  const body = text.slice(start, end + 1);
  let first: Error;
  try {
    return JSON.parse(body);
  } catch (e) {
    first = e as Error;
  }
  // Copying JSON out of a rendered chat drops the backslash in \" (Markdown
  // treats it as an escape), leaving bare quotes inside strings. Try a quick
  // heuristic pass, then a repair driven by the parser's own error positions.
  try { return JSON.parse(escapeInnerQuotes(body)); } catch { /* next */ }
  try { return parseRepairingQuotes(body); } catch { /* report the original */ }
  const pos = Number(/position (\d+)/.exec(first.message)?.[1]);
  const near = Number.isFinite(pos)
    ? ` Near: …${body.slice(Math.max(0, pos - 40), pos)}⟦here⟧${body.slice(pos, pos + 25)}…`
    : '';
  // "importer v3" lets a screenshot show which parser produced the error.
  throw new Error(`${first.message} (importer v3, quote repair also failed).${near}`);
}

/**
 * Repeatedly parse; when the parser stops at position p, the culprit is
 * almost always a bare quote that ended a string early, i.e. the last
 * unescaped quote before p. Escape it and try again.
 */
export function parseRepairingQuotes(body: string, maxFixes = 400): unknown {
  let s = body;
  for (let i = 0; i <= maxFixes; i++) {
    try {
      return JSON.parse(s);
    } catch (e) {
      const m = /position (\d+)/.exec((e as Error).message);
      if (!m || i === maxFixes) throw e;
      let q = Number(m[1]) - 1;
      while (q >= 0 && !(s[q] === '"' && s[q - 1] !== '\\')) q--;
      if (q <= 0) throw e;
      s = `${s.slice(0, q)}\\${s.slice(q)}`;
    }
  }
  throw new Error('unreachable');
}

/**
 * Re-escape double quotes that sit inside a JSON string. A quote is taken as
 * the end of a string only when the next non-space character could follow a
 * string (, : } ]); anything else (e.g. `Maxx "C" (or`) is part of the text.
 */
/** Is s[j] (the first non-space char after a quote) structural JSON rather than prose? */
function closesString(s: string, j: number): boolean {
  const c = s[j];
  if (c === '}' || c === ']' || c === ':') return true;
  if (c !== ',') return false;
  // After a real comma comes another value; in prose ("add "X", then …") a word follows.
  let k = j + 1;
  while (k < s.length && /\s/.test(s[k])) k++;
  return k >= s.length || /["{[\d-]/.test(s[k]) || /^(true|false|null)\b/.test(s.slice(k, k + 5));
}

export function escapeInnerQuotes(s: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '\\') { out += ch + (s[i + 1] ?? ''); i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j >= s.length || closesString(s, j)) { inString = false; out += ch; }
      else out += '\\"';
      continue;
    }
    out += ch;
  }
  return out;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isArr = Array.isArray;

/** Structural check of one line; returns a normalised line or an error. */
export function parseGeneratedLine(v: unknown): { ok: true; line: GeneratedLine } | { ok: false; error: string } {
  if (!v || typeof v !== 'object') return { ok: false, error: 'line must be an object' };
  const o = v as Record<string, any>;
  if (!isStr(o.name)) return { ok: false, error: 'line needs a name' };
  if (!isArr(o.starters) || !o.starters.every((s: unknown) => isArr(s) && (s as unknown[]).every(isStr))) {
    return { ok: false, error: `"${o.name}": starters must be a list of card-name lists` };
  }
  if (!isArr(o.steps) || o.steps.length === 0) return { ok: false, error: `"${o.name}": needs steps` };
  const steps = [];
  for (const s of o.steps) {
    if (!s || typeof s !== 'object' || !isStr(s.text)) return { ok: false, error: `"${o.name}": every step needs text` };
    const list = (x: unknown) => (isArr(x) ? x.filter((e) => e && typeof e === 'object') : []);
    steps.push({
      text: String(s.text).trim(),
      activations: list(s.activations).filter((a: any) => isStr(a.card)).map((a: any) => ({
        card: a.card, ...(Number.isInteger(a.effect) ? { effect: a.effect } : {}), ...(isStr(a.from) ? { from: a.from } : {}),
      })),
      summons: list(s.summons).filter((m: any) => isStr(m.card) && isStr(m.method)).map((m: any) => ({
        card: m.card, method: m.method, ...(isStr(m.from) ? { from: m.from } : {}),
        ...(isArr(m.materials) ? { materials: m.materials.filter(isStr) } : {}),
        ...(isStr(m.materialsFrom) ? { materialsFrom: m.materialsFrom } : {}),
        ...(isStr(m.materialsTo) ? { materialsTo: m.materialsTo } : {}),
      })),
      moves: list(s.moves).filter((m: any) => isStr(m.card) && isStr(m.from) && isStr(m.to)).map((m: any) => ({ card: m.card, from: m.from, to: m.to })),
      branches: list(s.branches).filter((b: any) => isStr(b.interruption) && isStr(b.response))
        .map((b: any) => ({ interruption: String(b.interruption).trim(), response: String(b.response).trim() })),
    });
  }
  return {
    ok: true,
    line: {
      name: String(o.name).trim(),
      starters: o.starters.map((s: string[]) => s.map((n) => n.trim())),
      freeCards: Number.isInteger(o.freeCards) && o.freeCards > 0 ? o.freeCards : 0,
      steps,
      endBoard: isArr(o.endBoard) ? o.endBoard.filter(isStr) : [],
      endBoardText: isStr(o.endBoardText) ? o.endBoardText.trim() : undefined,
      notes: isStr(o.notes) ? o.notes.trim() : undefined,
    },
  };
}
