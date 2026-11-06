# Line Generator: checked lines you only need to verify

**Date:** 2026-11-06
**Builds on:** `2026-11-06-line-trainer-design.md`

## Why the old AI lines were weak

- The pilot dossier only sent the Main Deck. The model never saw the Extra Deck, so it guessed Extra Deck monsters.
- Card text was cut to 200 characters, which dropped once-per-turn clauses and restrictions.
- Lines were one field among seven in a 2,048-token dossier, written as prose and split heuristically.

## Design

`server/src/services/lineGen/`:

| File | Role |
|---|---|
| `deckContext.ts` | Main + Extra Deck, full text, stats, copies, Master Duel ban status, and the most-played meta hand traps from `top_decks`. |
| `prompts.ts` | Opener, line, repair and critique prompts, plus one self-contained paste-in prompt. Lines come back as a structured **plan**: summons, activations (with effect numbers), moves between zones, and branches. |
| `ledgerChecker.ts` | Replays the plan on a card ledger (details below). Anything it can't judge is a warning, never an error. |
| `pipeline.ts` | Generate → ledger check → repair (≤2) → critique pass → repair → recheck. Verifiers implement `LineVerifier`. |
| `providers.ts` | Anthropic (`claude-opus-5-5`, streaming, server-side refusal fallback) or Gemini, when a key is configured. |
| `convert.ts` | Generated plan → Line Trainer line. The plan is kept in `combo_lines.plan_json` and the check report in `check_json`. |

The ledger checker flags:

- cards not in the deck;
- copies exceeded;
- cards used from a zone they aren't in;
- once-per-turn clauses parsed from card text;
- a second Normal Summon;
- Link, Xyz and Synchro materials, plus Fusion named materials;
- "except X monsters" summon locks;
- "cannot activate its effects this turn";
- end boards the steps don't build.

### Two ways to run it

1. **Paste-in (works on a Claude subscription).** A subscription can't be used by the app server (Anthropic's terms). The app builds the prompt; the user runs it in Claude Code or claude.ai and pastes the answer. The server parses it, ledger-checks it, saves drafts with flags, and returns a fix-up prompt for any line that failed. Fixed lines replace same-named drafts.
2. **Server-side**, when `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is set. It runs as a background job (admin token), with progress polling.

### Verification UX

- Each generated draft shows ✓ Checks passed, ⚠ to look at, or ✕ problems, and lists the issues.
- One tap marks a line verified (`PATCH /api/lines/:id/status`). "Needs a fix" opens the editor.
- Editing a line's starters or steps clears its checks.

## Ready for the rules engine

Plans are structured actions with card names and zones. An ocgcore-backed `LineVerifier` (via `ocgcore-wasm`) can replay `plan_json` and be added to the verifier list without changing callers or the stored data.

## Limits

The ledger is not a rules engine. It doesn't model chains, missing the timing, or most activation conditions. The critique pass (server-side) or Claude's own re-check (paste-in) covers some of that. Playing the line once in Master Duel is still the final check.
