# Neuron Import/Export Integration — Design

**Date:** 2026-06-07
**Status:** Approved design, pending implementation plan
**Feature:** Bridge decks between MD Meta and the official Konami Yu-Gi-Oh! Neuron app (`jp.konami.YugiohOcgSupports`), in **both directions, as co-equal workstreams**.

## Goal

Let users move decks **into** MD Meta (to score/analyze) and **out toward** Neuron, with the most seamless mobile gesture possible on Android (Capacitor). Import and export get equal design investment; each gets a *primary* channel plus a guaranteed *fallback*.

## What Neuron actually does (verified against the Play Store listing, 2026-05-25)

- **Camera card recognition** reads **physical card faces** — "scan and read up to 20 Yu-Gi-Oh! Cards at a time." This is for registering decks from real cards, **not** for reading a deck-*list* screenshot or a grid of web thumbnails.
- **Decks live in the Yu-Gi-Oh! TCG Card Database** (`db.yugioh-card.com`); "public deck lists" are **searchable and shareable on the web**. A shared Neuron deck produces a **public DB deck URL**.
- This is the **OCG/TCG (paper)** app, not Master Duel. Card *identity* maps fine (name/passcode), but the card pool & banlist differ from Master Duel — flagged, not a blocker.

### Consequences (corrections vs. earlier draft)
- A rendered recipe **image will not reliably feed Neuron's camera** (which expects real cards). That export path is dropped.
- **There is no reliable automated channel to write a deck *into* Neuron.** Neuron ingests via its camera (physical cards) or via a deck authored inside a logged-in Konami account. Export therefore aims for *fewest-friction-possible*, not full automation — see Export below, including a spike on the one ambitious option.
- **New structured channel:** the Konami Card Database deck URL is a far more reliable bridge than OCR and becomes the **primary import path**.

## Approach summary

- **A (interchange core):** `.ydk` / passcode deck code as the canonical format. Reliable because `cards.id` **is** the Konami passcode — a pure DB join.
- **Import primary — Konami DB URL:** parse a shared `db.yugioh-card.com` deck page into card IDs → resolve. Structured, not OCR.
- **Import fallback — image OCR:** screenshot / physical-card photo → OCR → confidence-gated confirm.
- **Export primary (spike-gated) — Konami DB deck-editor pre-fill:** since Neuron decks live in the same DB, test whether the official deck builder can be opened pre-seeded via URL. If viable, this is the closest thing to true Neuron round-trip.
- **Export floor (guaranteed) — ecosystem + guided rebuild:** `.ydk`/share-sheet, human-readable recipe image to Photos, per-card "search in Konami DB" deep links, and launch-Neuron to finish.
- **Share-target (D):** Android Share intent is the single front door for import — auto-routes URL / image / text.
- **QR codec (C):** deferred; Neuron exposes no QR deck import. Keep for our own app-to-app sharing later.

## Phase 0 — feasibility spikes (must run before committing dependent phases)

1. **Konami DB deck URL (import primary):** confirm the deck-page URL format, that public decks are fetchable server-side, the card identifiers present on the page, and the **Konami card-id → passcode** mapping (see Card-ID mapping below).
2. **Konami DB deck-editor pre-fill (export primary):** determine whether the official deck builder accepts a pre-seeded deck via URL params / any documented entry point. If not feasible, export relies on the floor channels only.
3. **Neuron launch intent:** confirm MD Meta can launch `jp.konami.YugiohOcgSupports` via an Android package intent (graceful fallback: "deck saved — open Neuron to continue").

## Architecture — units (each one job, independently testable)

| Unit | Location | Responsibility | Depends on |
|---|---|---|---|
| `deckCodecService` | `server/src/services/deckCodecService.ts` | `{main,extra,side}` passcodes ⇄ `.ydk` text; passcode↔name resolution; confidence-ranked fuzzy resolve for OCR | `cards` table, `dbHelpers` |
| `konamiDbService` | `server/src/services/konamiDbService.ts` | Fetch + parse `db.yugioh-card.com` deck pages → card IDs; build DB search/editor deep links | `cards` table, `dbHelpers`, axios |
| `deckIO` route | `server/src/routes/deckIO.ts` | HTTP: `/parse-ydk`, `/export-ydk`, `/resolve`, `/ocr-resolve`, `/parse-neuron-url`, `/export-links`, `user_decks` CRUD | `deckCodecService`, `konamiDbService` |
| `deckIO` API client | `client/src/api/deckIO.ts` | Typed fetch wrappers | `api/client.ts` |
| `DeckImportExport` | `client/src/components/decks/DeckImportExport.tsx` | Import/Export modal: URL, paste, image; export options; native vs web branch | `useIsNative`, deckIO API |
| `OcrConfirm` | `client/src/components/decks/OcrConfirm.tsx` | Confidence-gated review: surfaces only uncertain/unresolved cards | deckIO API |
| `deckShare` util | `client/src/utils/deckShare.ts` | Capacitor Share/Clipboard/Filesystem/Camera + launch-app wrappers, web fallbacks | Capacitor plugins |
| `MyDecks` page | `client/src/pages/MyDecks.tsx` | Saved-deck library (list/load/delete) | deckIO API |

Route registered in `server/src/index.ts` via `app.use('/api/decks-io', deckIORouter)` (sibling to `/api/decks`).

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
Deterministic because `cards.id` = passcode. Parser tolerates missing `!side`, blank lines, `#comment` lines; rejects non-numeric tokens with line context.

### Card-ID mapping (needed for the Konami DB channel)
Konami DB deck pages identify cards by Konami's internal **card id (cid)**, distinct from the 8-digit passcode that `cards.id` holds. YGOPRODeck exposes `misc_info[].konami_id`. **Spike 1 confirms** whether to add a `cards.konami_id` column (populated during the existing card sync in `syncService.ts`) to map DB cid → passcode. If konami_id is unavailable/unreliable, fall back to name matching from the DB page text.

### `user_decks` table (append to `server/src/db/schema.sql`)
Mirrors `personal_games` conventions: epoch-int timestamps, raw SQL, no `user_id` (single-user app). **Stores passcodes, not names** — names drift, passcode is the stable key.
```sql
CREATE TABLE IF NOT EXISTS user_decks (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  archetype   TEXT,
  main_json   TEXT NOT NULL,   -- JSON: [{passcode, count}]
  extra_json  TEXT,
  side_json   TEXT,
  source      TEXT,            -- 'manual' | 'ydk' | 'neuron-url' | 'ocr'
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```
CRUD: `GET /api/decks-io/saved`, `POST /saved`, `PUT /saved/:id`, `DELETE /saved/:id`.

## Card resolution (reliability backbone)
- **Passcode→name:** `SELECT id, name, image_small_url, type FROM cards WHERE id = ANY($1)`.
- **Konami cid→passcode:** via `cards.konami_id` (Spike 1) or name fallback.
- **Name→passcode (exact):** `LOWER(name)` match — same pattern as `decks.ts:133-135`.
- **Name→passcode (fuzzy, OCR):** reuse word-split `LIKE` ranking from `decks.ts:84-93`, return **ranked candidates + confidence score**.
- Anything unresolved is returned in an explicit `unresolved[]` array — **never silently dropped**.

## Import flows (co-equal workstream)

### Entry: Android Share-Target (single front door)
> In Neuron / any app: **Share** the deck → pick **MD Meta** → done.
- Share target for **URL, text, and images** (AndroidManifest `intent-filter` for `SEND` / `SEND_MULTIPLE`, mime `text/*` and `image/*`), handled in `client/src/App.tsx`.
- Auto-routes: **Konami DB URL → `/parse-neuron-url`**, **`.ydk`/text → `/parse-ydk`**, **image → OCR**.

### Primary: Konami DB deck URL
- Server fetches & parses the public deck page → card ids → resolve → builder (+ optional Save). Structured and reliable.

### Fallback: image OCR (confidence-gated)
- Screenshot or physical-card photo → OCR (ML Kit on-device; web fallback = server OCR) → high-confidence matches auto-accepted; `OcrConfirm` surfaces **only** uncertain matches + `unresolved[]` ("Review 2 of 40"). Never auto-commit a low-confidence guess.

### Secondary: paste / file
- Paste `.ydk`/deck-code or pick a `.ydk` file → `/parse-ydk`. Serves the wider ecosystem (YGOPRODeck, EDOPro).

## Export flows (co-equal workstream)

### Primary (spike-gated): Konami DB deck-editor pre-fill
- If Spike 2 is positive, "Send to Neuron" opens the Konami DB deck builder pre-seeded with the deck, where the user saves it into their account → it then appears in Neuron. Closest achievable to true round-trip.

### Floor (guaranteed regardless of spikes): ecosystem + guided rebuild
- **`.ydk` / deck-code** via share sheet (`@capacitor/share`) / clipboard / file — one tap, full ecosystem interop.
- **Human-readable recipe image** (card grid from `image_small_url` via `<canvas>`) saved to Photos — a reference for rebuilding, *not* claimed as Neuron-camera input.
- **Per-card "search in Konami DB" deep links** for guided manual rebuild in Neuron.
- **Launch Neuron** (Spike 3) so the user lands in the app to finish; graceful fallback message if launch unsupported.

Export honestly cannot fully automate writing into Neuron; the spec maximizes the achievable and states the limit plainly in-UI.

## Error handling (explicit, never silent)
- Unresolved cards always surfaced via the `ErrorBanner` pattern with count + names; partial import allowed.
- Konami DB fetch failures (network, page-format change, private deck) return a clear actionable error; OCR fallback offered.
- Native-only APIs (camera/share/filesystem/launch) gated by `useIsNative`; web fallbacks = `<input type=file>`, clipboard, file download, plain links — nothing throws in-browser.

## Phasing
1. **A-core + persistence:** `deckCodecService`, `/parse-ydk` `/export-ydk` `/resolve`, paste/file import + `.ydk`/share/clipboard export, `user_decks` + `MyDecks`. Fully usable both directions via the ecosystem, zero external-site risk.
2. **Phase 0 spikes**, then **Konami DB import** (`konamiDbService`, `/parse-neuron-url`, cid mapping) and **Konami DB export pre-fill** if Spike 2 positive.
3. **Share-target + OCR fallback import**; **recipe-image + Konami-search links + launch-Neuron export**.
4. **Deferred:** QR codec (Approach C) + app-to-app QR sharing.

## Testing
- `deckCodecService` is pure logic → Vitest units: round-trip `encode(decode(x))==x`, fuzzy ranking/confidence, malformed `.ydk`. Matches existing `client/src/test/*.test.ts`.
- `konamiDbService` parser tested against saved deck-page HTML fixtures (no live network in tests).
- Route tests for resolve / `unresolved[]` / CRUD / `parse-neuron-url` paths.
- `OcrConfirm` tested with fixture OCR strings (high- and low-confidence).

## New dependencies
`@capacitor/camera`, `@capacitor/share`, `@capacitor/filesystem`, `@capacitor/clipboard`; `@capacitor-mlkit/text-recognition` (OCR phase). AndroidManifest: camera permission, `SEND`/`SEND_MULTIPLE` intent-filters, and `<queries>` for the Neuron package (launch intent). `capacitor.config.ts`: plugin config as needed.

## Out of scope
- QR encode/decode (Approach C) and Neuron-QR reverse engineering.
- Multi-user / auth (app is single-user).
- Fully automating Neuron's internal deck creation (not feasible — no public ingest API).
