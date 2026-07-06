# Duel Companion — Phase 1: Archetype Dossiers + Duel Mode

**Date:** 2026-07-06
**Status:** Approved design, pre-implementation

## Problem

The app surfaces meta data (tier lists, matchups, trends) but doesn't actively make its user a better pilot. The user's identified weak spots are **in-game decisions**, **opponent knowledge**, and **learning from games** — not deck building. The app should serve as a **live second screen during duels** and support **post-game review**.

## Solution overview

A phased "Duel Companion":

- **Phase 1 (this spec):** AI-generated archetype dossiers — grounded in the app's existing Untapped decklist data and local card DB — with a personal-notes layer, surfaced in a glance-optimized Duel Mode screen.
- **Phase 2 (later spec):** review loop — loss-reason tags on logged games, "what I'd do differently" notes filed to dossiers, loss-pattern analytics. Phase 1's schema accommodates it; no Phase 2 code is built now.

## Existing foundations

- Archetype names: `server/src/services/tierListService.ts`, `matchupBlendService.ts` (Untapped data in DB). Dossiers must key off these same names.
- Local card DB: `server/src/services/ygoprodeckService.ts` + card routes (card texts, thumbnails).
- Saved decks: `server/src/routes/decks.ts` (My Decks).
- Game log: `server/src/routes/personalGames.ts` — `deck_played, opponent_deck, result, went_first, notes, played_at`.
- Test pattern: vitest (`server/src/services/deckCodecService.test.ts`).
- No existing LLM integration; Anthropic SDK and `ANTHROPIC_API_KEY` in `server/src/config.ts` are new additions.

## Design

### 1. Data model

**`dossiers`** (new table):

- `kind`: `'opponent'` (how to beat an archetype) or `'pilot'` (how to play a deck).
- Opponent dossiers keyed by `archetype` name matching tier-list/matchup deck names. Pilot dossiers keyed by `deck_id` (FK to saved decks) so lines are generated from the exact list; flagged stale when that deck is edited.
- **Versioned:** each regeneration inserts a new version row. The app serves the latest completed version. Failed/invalid generations never replace a good version. A history view can show how advice changed as the meta moved.
- Columns: kind, archetype (nullable), deck_id (nullable), version, content JSON, model, generated_at, status.
- Content JSON has a fixed schema:
  - *Opponent:* overview, key starter cards, choke points (what to negate and when), typical end boards, outs/play-arounds.
  - *Pilot:* the above plus combo lines, playing-under-interruption guidance, matchup-specific tips.
  - Card names in content resolve against the local card DB for thumbnails.

**`dossier_notes`** (new table):

- user_id, archetype or deck ref, note text, created_at.
- `category`: `negate-priority` | `play-around` | `combo-line` | `general` — notes render inline in the matching dossier section.
- Nullable `game_id` column reserved for Phase 2 (review notes linking back to a logged game); unused in Phase 1.

### 2. Generation pipeline

New `server/src/services/dossierService.ts` using the Anthropic SDK, model `claude-sonnet-5`. `ANTHROPIC_API_KEY` added to server config.

- **Grounded prompts:** the archetype's top decklists from existing Untapped data plus actual card texts from the local card DB. Pilot prompts use the user's exact saved list.
- Output is structured JSON validated against the content schema. Invalid output → generation recorded as failed; the previous version remains current.
- **Triggers:** admin action bulk-generates top-tier archetypes; on-demand generation for others; dossiers flagged stale when tier-list sync shows meta movement, or (pilot) when the underlying deck changes.
- Dossiers are always served from the DB. Never generated per-request.

### 3. Duel Mode UI

New `client/src/pages/DuelMode.tsx`, mobile-first (used as an Android second screen beside the duel).

- **Session start:** pick your deck once; persisted for the session.
- **Mid-duel:** large archetype picker — recent/frequent opponents from My Games history surface first, with search fallback.
- **Dossier view:** glance-optimized (big text, high contrast, minimal scrolling). Two tabs: **"Answer them"** (opponent dossier) and **"Your lines"** (pilot dossier including matchup tips). Categorized personal notes render inline in both.
- **Duel end:** one-tap result logging pre-fills a My Games entry (deck, opponent archetype, timestamp) — two taps total instead of a form.

### 4. Error handling

- Generation failures (API error, invalid JSON) are recorded on the version row; current dossier is untouched; admin UI shows the failure.
- Duel Mode with no dossier for a picked archetype: show an "on-demand generate" action and any personal notes that exist.
- Missing API key: generation endpoints return a clear configuration error; read paths are unaffected.

## Testing

- Vitest unit tests: content-schema validation, prompt builder, generation flow with a mocked Anthropic client (follow `deckCodecService.test.ts` pattern).
- UI verified in browser preview at mobile viewport: picker flow, dossier rendering with thumbnails, inline notes, one-tap logging creating a `personal_games` row.

## Out of scope (Phase 2)

Loss-reason tags, "what I'd do differently" capture, loss-pattern analytics, dossier-note-from-game linking UI.
