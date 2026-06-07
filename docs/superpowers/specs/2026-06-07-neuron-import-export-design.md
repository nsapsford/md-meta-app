# Neuron Import/Export Integration — Design

**Date:** 2026-06-07
**Status:** Approved design, pending implementation plan
**Feature:** Bridge decks between MD Meta and the official Konami Yu-Gi-Oh! Neuron app, in both directions.

## Goal

Let users move decks **into** MD Meta (to score/analyze) and **out to** Neuron, with the most seamless mobile gesture possible on Android (Capacitor).

### Hard constraint that shapes everything
Neuron has **no text/`.ydk` import** and emits **no public deep links or deck codes**. Its only machine-readable surfaces are **QR codes** and **deck-recipe images**, both consumed through Neuron's own camera. Therefore:
- **Import** can be seamless (we control the receiving side).
- **Export to Neuron cannot be zero-step** — it must end with Neuron's own "read deck from image" action. "Seamless export" means *fewest possible steps*, not full automation.

## Chosen approach: B-on-A, with share-target promoted to first-class

- **A (interchange core):** `.ydk` / passcode-based deck code as the canonical format. Reliable because `cards.id` **is** the Konami passcode — encoding/decoding is a pure DB join.
- **B (Neuron-facing bridge):** OCR of deck-recipe images (import) + rendered deck-recipe image (export). The only realistic path into Neuron.
- **D (share-target):** Android Share intent is the **primary import entry point** (not a later bonus) — it removes the most friction.
- **C (QR codec):** Deferred. Neuron's QR payload is proprietary/undocumented; reverse-engineering is fragile. Revisit later, reusing the same route, and use QR for our *own* app-to-app sharing where we own the format.

## Architecture — units (each one job, independently testable)

| Unit | Location | Responsibility | Depends on |
|---|---|---|---|
| `deckCodecService` | `server/src/services/deckCodecService.ts` | `{main,extra,side}` passcodes ⇄ `.ydk` text; passcode↔name resolution; confidence-ranked fuzzy resolve for OCR | `cards` table, `dbHelpers` |
| `deckIO` route | `server/src/routes/deckIO.ts` | HTTP: `/parse-ydk`, `/export-ydk`, `/resolve`, `/ocr-resolve`, and `user_decks` CRUD | `deckCodecService` |
| `deckIO` API client | `client/src/api/deckIO.ts` | Typed fetch wrappers | `api/client.ts` |
| `DeckImportExport` | `client/src/components/decks/DeckImportExport.tsx` | Import/Export modal: paste, image, export; native vs web branch | `useIsNative`, deckIO API |
| `OcrConfirm` | `client/src/components/decks/OcrConfirm.tsx` | Confidence-gated review: surfaces only uncertain/unresolved cards | deckIO API |
| `deckShare` util | `client/src/utils/deckShare.ts` | Capacitor Share/Clipboard/Filesystem/Camera wrappers + web fallbacks | Capacitor plugins |
| `MyDecks` page | `client/src/pages/MyDecks.tsx` | Saved-deck library (list/load/delete) | deckIO API |

Route registered in `server/src/index.ts` via `app.use('/api/decks-io', deckIORouter)` (sibling to existing `/api/decks`).

## Data model

### `.ydk` format (EDOPro standard)
```
#created by MD Meta
#main
<passcode, one line per copy>
#extra
<...>
!side
<...>
```
Deterministic because `cards.id` = passcode. Parser tolerates missing `!side`, blank lines, and `#comment` lines; rejects non-numeric tokens with line context.

### `user_decks` table (append to `server/src/db/schema.sql`)
Mirrors `personal_games` conventions: epoch-int timestamps, raw SQL, no `user_id` (single-user app). **Stores passcodes, not names** — names are display-only and drift; passcode is the stable key.
```sql
CREATE TABLE IF NOT EXISTS user_decks (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  archetype   TEXT,
  main_json   TEXT NOT NULL,   -- JSON: [{passcode, count}]
  extra_json  TEXT,
  side_json   TEXT,
  source      TEXT,            -- 'manual' | 'ydk' | 'ocr' | 'image'
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```
CRUD: `GET /api/decks-io/saved`, `POST /saved`, `PUT /saved/:id`, `DELETE /saved/:id`.

## Card resolution (reliability backbone)
- **Passcode→name:** `SELECT id, name, image_small_url, type FROM cards WHERE id = ANY($1)`.
- **Name→passcode (exact):** `LOWER(name)` match — same pattern as `decks.ts:133-135`.
- **Name→passcode (fuzzy, OCR):** reuse word-split `LIKE` ranking from `decks.ts:84-93`, return **ranked candidates + a confidence score**.
- Anything unresolved is returned in an explicit `unresolved[]` array — **never silently dropped**.

## Seamless UX flows

### Import — primary path: Android Share-Target
> In Neuron / Master Duel / any app: **Share** the deck image → pick **MD Meta** → done.

- App registers as share target for **images and text** (AndroidManifest `intent-filter` for `SEND` / `SEND_MULTIPLE`, mime `image/*` and `text/*`), handled via `App.addListener('appUrlOpen')` / intent payload in `client/src/App.tsx`.
- Auto-routes by payload: **image → OCR**, **text/`.ydk` → parse**.
- Screenshot → share is the universal fallback when an app has no Share button.

### Import — OCR is confidence-gated
- High-confidence matches auto-accepted; `OcrConfirm` surfaces **only** uncertain matches + `unresolved[]` ("Review 2 of 40"). Never auto-commit a low-confidence guess.

### Import — secondary path: paste / file
- Paste `.ydk`/deck-code or pick a `.ydk` file → `/parse-ydk` → builder (+ optional Save). Serves the non-Neuron ecosystem (YGOPRODeck, EDOPro).

### Export — "Send to Neuron" (one tap)
> Tap **Send to Neuron** → app renders the deck-recipe image (card grid from `image_small_url` via `<canvas>`), saves it to Photos (`@capacitor/filesystem`), **and launches Neuron** (Android package intent) → user finishes with Neuron's "read deck from image".

- The trailing Neuron step is unavoidable (we cannot write into Neuron).

### Export — ecosystem path
- Same action's share sheet (`@capacitor/share`) / clipboard sends `.ydk` text or file in one tap for non-Neuron tools.

## Error handling (explicit, never silent)
- Unresolved cards always surfaced via the `ErrorBanner` pattern with count + names; partial import allowed.
- Native-only APIs (camera/share/filesystem) gated by `useIsNative`; web fallbacks = `<input type=file>`, clipboard, file download — nothing throws in-browser.
- Image export uses card images already in the DB; OCR import is the only inherently uncertain step, hence the confirm gate.

## Phasing (reordered for seamlessness)
1. **A-core + persistence:** `deckCodecService`, `/parse-ydk` `/export-ydk` `/resolve`, paste-import + copy/share-export, `user_decks` + `MyDecks`. Fully usable, zero OCR risk.
2. **Share-target + OCR import:** AndroidManifest intent-filters, share routing in `App.tsx`, camera/file → OCR → confidence-gated `OcrConfirm`.
3. **Export image + Send to Neuron:** recipe-image `<canvas>`, save to Photos, launch-Neuron intent.
4. **Deferred (out of scope):** QR codec (Approach C) + app-to-app QR sharing.

## Testing
- `deckCodecService` is pure logic → Vitest units: round-trip `encode(decode(x))==x`, fuzzy ranking/confidence, malformed `.ydk`. Matches existing `client/src/test/*.test.ts`.
- Route tests for resolve / `unresolved[]` / CRUD paths.
- `OcrConfirm` tested with fixture OCR strings (high- and low-confidence).

## New dependencies
`@capacitor/camera`, `@capacitor/share`, `@capacitor/filesystem`, `@capacitor/clipboard` (Phase 1–3); `@capacitor-mlkit/text-recognition` (Phase 2). AndroidManifest: camera permission + `SEND`/`SEND_MULTIPLE` intent-filters. `capacitor.config.ts`: plugin config as needed.

## Out of scope
- QR encode/decode (Approach C) and Neuron-QR reverse engineering.
- Multi-user / auth (app is single-user).
- Automating Neuron's internal import action (technically impossible).
