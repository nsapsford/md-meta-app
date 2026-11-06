# Line Trainer — Phase 1: learn your deck's lines

**Date:** 2026-11-06
**Status:** Approved direction (trainer first, real-rules simulator later)

## Problem

The user wants to learn their own deck's combo lines as close to optimally as possible, inside the app, while playing only in Master Duel (Android + Windows). The app's only line content today is the AI pilot dossier: free-text, unverified `comboLines` that are likely to contain illegal or suboptimal sequences. Nothing in the app drills recall or the decisions that matter: *which* line to play from a given hand, and *how to continue* after a hand trap.

## Scope

Phase 1 is a structured line library plus drills. It verifies **recall and line selection**, not rules legality; legality comes from the user verifying lines (in Master Duel, a guide, or an external solver) and marking them verified. Phase 2 (separate spec) embeds a real rules engine (`ocgcore-wasm`) so lines can be played out and verified in-app.

## Design

### Data model

**`combo_lines`** — one row per line, keyed to a saved deck.

- `deck_id` (FK `user_decks`, cascade), `name`, `rank` (lower = better end board; decides the "correct" line when several are playable), `status` (`draft` | `verified`), `source` (`manual` | `ai-draft` | `guide` | `solver`), `end_board` (text), timestamps.
- `starters_json`: list of **slots**; each slot is a list of acceptable passcodes. `[[A, B], [C]]` = "(A or B) and C in hand". A hand satisfies the line if distinct hand cards can be assigned to every slot.
- `steps_json`: ordered `{ id, text, branches: [{ id, interruption, response }] }`. A branch is "if the opponent uses *interruption* on this step, do *response*". `id`s are stable client-generated strings so drill history survives edits.

**`drill_reviews`** — spaced-repetition state per drill item: `item_key` (PK), `deck_id`, `ease`, `interval_days`, `reps`, `lapses`, `due_at`, `last_grade`, `updated_at`.

- Item keys: `line:<lineId>` (recall a whole line) and `branch:<lineId>:<branchId>` (recall the response to an interruption).
- An item with no row is new and due now. Deleting a line deletes its review rows.

The app is single-user today (no `user_id` on decks, games or notes); these tables follow that.

### Scheduling

SM-2-style, four self-grades. `again` resets reps, counts a lapse, lowers ease by 0.2 (floor 1.3) and is due in 10 minutes. `hard` multiplies the interval by 1.2 (min 1 day) and lowers ease 0.15. `good` gives 1 day, then 3 days, then interval × ease. `easy` is good × 1.3 and raises ease 0.15. Computed server-side so phone and PC share one schedule.

### Drills (client, `/trainer`)

1. **Opening hand drill.** Draws a real random hand from the saved main deck (5 cards going first, 6 going second). The user picks which line to play, or "no line". Correct = the best-ranked playable line. A playable but worse-ranked pick is shown as such. Then the line's steps are revealed one at a time for self-checked recall, and a final grade updates `line:<id>`. A hand with no stored line offers "add a line for this hand" with the hand prefilled as starters, so coverage gaps get filled from real draws.
2. **Interruption drill.** Shows a line's steps up to a branch point and the interruption, hides the response, then the user self-grades. Updates `branch:<lineId>:<branchId>`.
3. **Due review.** Runs due items of both kinds, oldest due first.

Drills use verified lines only by default; a toggle includes drafts, which are badged "unverified".

### Coverage

A Monte-Carlo estimate (20,000 seeded draws, 5 or 6 cards) from the saved list:

- how often any stored line is playable;
- for each line, how often it is playable and how often it is the **best** playable line.

This tells the user which lines to learn first and how often they open nothing they know.

### Line sources

- Manual entry. Starters are picked by tapping cards from the deck.
- Steps and branches are free text, with hand-trap suggestions for the interruption field.
- "Import AI drafts" turns the latest pilot dossier's `comboLines` into `draft` lines with no starters. They are excluded from the opening-hand drill until starters are set and are always marked unverified.

### API

`/api/lines`:

- `GET ?deck_id=`, `POST`, `PUT /:id`, `DELETE /:id`
- `POST /import-ai/:deckId`
- `GET /reviews?deck_id=`, `POST /reviews { deck_id, item_key, grade }`

Payload validation lives in `comboLineService.ts`; scheduling lives in `srsService.ts`. Both are pure and unit-tested.

## Testing

- Server (vitest): line payload validation, scheduling transitions.
- Client (vitest): slot matching (including duplicate copies and overlapping slots), best-line choice, seeded hand draws, coverage maths against exact hypergeometric values.
- UI: checked in a mobile viewport against mocked API responses.

## Out of scope

- Rules-legal play-out — Phase 2, using `ocgcore-wasm`.
- Importing solver replays.
- Going-second board-breaking lines as a separate drill type; they work today as ordinary lines with a "going second" naming convention.
