# Line Finder inside the Line Trainer

**Date:** 2026-11-15
**Status:** Draft, waiting for approval. Reviewed once by an independent builder check; its questions are answered in the text.
**Builds on:** `2026-11-06-line-trainer-design.md`, `2026-11-06-line-generator-design.md`

## What this is and why

The user has a standalone tool, the "DM Azamina Line Finder" (a claude.ai artifact, <https://claude.ai/artifact/4aaPVKK4r7tTCeSTYHbsL6>). You tap in the hand you drew and it searches for the best line, shows the steps, the end board and what that board does on the opponent's turn. It is used **mid-duel**, as a second screen, to plan the opening hand.

The app's Line Trainer already has a way to get lines: the "Generate lines" panel, where an AI writes lines and a card ledger flags impossible steps. Those lines are unverified drafts. The Line Finder is a real search over modelled card effects, so its lines are better.

This project puts the Line Finder into the Line Trainer page, in place of the "Generate lines" panel, working as it does today. It also changes how decks are supported: today every card effect is hand-written code for one deck. After this project a deck is a **data file**, and adding a deck needs no change to the solver.

## What the user decided

These are the user's decisions, in their words or confirmed by them.

1. Port the tool to native React in the app. No iframe.
2. Support more than one deck. Each deck's cards and combos are described as data. Avoiding code for new decks is a **hard requirement**.
3. Go straight to the data-driven version. Do not ship the unchanged solver as a first step.
4. The user hands over a decklist; Claude writes that deck's data file. The user does not fill in effects in a screen.
5. The finder replaces the "Generate lines" panel in the Line Trainer.
6. First version plans **your turn only** and lists what the board does on the opponent's turn, as today. Stepping through the opponent's turn comes later, and the design must leave room for it.
7. The second deck is the user's Branded Dracotail list (Appendix A).
8. Use is mid-duel: pull it up, enter the hand, get the line.
9. DM Azamina lines must be **at least as good** as today's, not identical. For the same situation the new best line scores the same as today's or higher, and may be a different line when it is equal or better.

Decision 9 settles what kind of engine this is. The reference's results depend on things that are not card rules: ties are broken by the order moves happen to be written in, moves that hit an internal error are silently skipped, and some options are pruned by judgement. The new engine does **not** have to copy that order or those quirks, and the order of entries in a deck file must not change the result.

## Starting point

### The artifact

One HTML file, 16,643 lines:

| Part | Size | What it is |
|---|---|---|
| Styles and markup | about 500 lines | Two columns: setup on the left, lines on the right. A view switch on phones. |
| Deck list (`card-data`) | 1 line of JSON | The deck's cards with counts, stats and full text. |
| Card index (`card-index`) | about 12,800 lines | Name and stats of every card, used to name the opponent's cards. |
| Engine (`engine`) | about 1,880 lines | The solver. Its header says it also runs under Node, and it exports through `module.exports`. |
| Page logic (`app`) | about 1,450 lines | Inputs, workers, rendering, export. |

The engine models 40 named cards of one deck (Dark Magician / Azamina). It searches Main Phase 1 lines with a beam search that repeats with a wider beam until time runs out (2.5 s by default, about 6 s for "Search deeper"). It scores the end position: going first by what the board can do on the opponent's turn, going second by damage and removal.

Deck knowledge is spread across the engine. All of it has to move into the deck file:

- card ids and short names (`NAMES`, `SHORT`);
- card groups used by searches (`DM_ST`, `SARC_ADD`, and others);
- every move a card can make (`gen`, about 615 lines), including which hand traps can answer each move (tags such as `ash`, `droll`, `field`);
- triggered effects that resolve afterwards (`genPending`, `afterExtraSummon`);
- which Extra Deck monsters can be made from which materials (Fusion recipes, Synchro level and conditions, the `LINKS` table);
- which move keys a floodgate blocks (`EXTRA_KEY`, `SPELL_KEY`);
- which cards are cheapest to discard (`pickFodder`);
- which cards to Set at end of turn and in what order (`finalize`, `gazeLive`);
- what each end-board card is worth on the opponent's turn, with a label and conditions (`interruptions`, `HANDTRAPS`);
- pruning choices made by judgement inside `gen`, for example "only Ash is worth Normal Summoning" among the hand traps, and how many discard options to try.

The search, the state, battle maths, replaying "what has happened", and robustness testing look deck-neutral.

The opponent's hand traps are a separate case. The nine the user can play around (Ash, Imperm, Veiler, Droll, Nibiru, Belle, Fuwalos, Purulia, Maxx "C") are written into the engine by name: when each can be used, Nibiru's fifth summon, Droll's lock, the Mulcharmy draw and End Phase rules, and the user's own cards that answer them (`kindEligible`, `interrupt`, `protectionFor`, `evaluate`, `INTR_LABEL`). They are the opponent's cards and are the same for every deck.

### The app

The work starts from `origin/master` (v1.4.0). The checkout on the user's machine was 9 commits behind on 2026-11-15 and has uncommitted changes in `server/`; do not build on it as it is.

- Line Trainer page at `/trainer` (`client/src/pages/LineTrainer.tsx`), tabs Drill, Lines, Coverage, keyed to a saved deck.
- "Generate lines" is a button in `LineLibrary.tsx` that opens `GeneratePanel.tsx`.
- Lines are stored per saved deck (`combo_lines`). `source` already allows `'solver'`.
- `POST /api/lines/import-generated/:deckId` accepts `{"lines": [GeneratedLine]}` (`server/src/services/lineGen/types.ts`), runs the ledger checker and saves drafts. It currently saves them with source `'ai-draft'`.
- The artifact's "Line Trainer JSON" button already produces `GeneratedLine` JSON.
- The client has no Web Workers yet. Client and server are separate npm packages.
- A saved deck is lists of `{passcode, count}` for Main and Extra Deck. Card names, stats and images come from the server (`POST /decks-io/resolve`, `/cards/search`).
- Data cached on the device expires after 7 days, and saved decks are cached only while the "Enable Local Caching" setting is on (`client/src/queries/persister.ts`).

## Goals

1. A **Finder** in the Line Trainer that does what the artifact does today for the DM Azamina deck (the list of behaviours is below).
2. A solver with **no knowledge of any card**. Everything about a deck comes from its data file.
3. Two deck files: DM Azamina and Branded Dracotail.
4. A found line can be saved into the Line Trainer library in one tap, to drill later.
5. The finder works with the server asleep, for a deck it has been opened with before on that device (details under "Working with the server asleep").

## Non-goals

- Stepping through the opponent's turn or the End Phase. First version scores them, as today.
- Reading a screenshot of the hand. See "The one thing that will not work the same".
- Using a real rules engine (`ocgcore-wasm`) for the search. See "Route not taken".
- Decks other than the two above.
- An in-app editor for deck files.
- Changes to drills, coverage or scheduling.

## Anti-goals

Any of these makes the project a failure even if it runs.

- Deck-specific code: a card name or passcode anywhere in the solver.
- DM Azamina lines that are worse than the artifact's for the same hand.
- A finder that needs the server awake mid-duel. Production sleeps when idle and takes a long time to wake.
- A search that freezes the page while it runs.
- A deck file that is silently wrong. If a card is not understood, the page says so.

## Design

### Where it lives

- A fourth tab in the Line Trainer: **Finder**. It can be opened directly with `/trainer?tab=finder`.
- Duel Mode gets a "Find a line" link to that tab for the deck being played.
- In the Lines tab, the "Generate lines" button becomes "Find lines" and opens the Finder **when the deck has a deck file**. For a deck with no deck file the AI panel stays as it is, as a fallback, because it is that deck's only source of lines.
- The artifact's "Line Trainer JSON" button becomes **Save to my lines**. It sends the same `GeneratedLine` JSON to the existing import endpoint, so the line arrives as a draft with its ledger check. The endpoint needs a small change so these are saved with source `'solver'` and a generator name of "Line Finder". "Copy" (plain text) stays.

### What the Finder does

Same as the artifact, restyled with the app's own components and colours and laid out phone-first. The artifact is the reference for behaviour and layout.

Inputs:

- going first or going second;
- your hand, by tapping cards from the deck, up to 7, including blanks for cards the line should not rely on;
- hand traps to play around (Ash, Imperm, Veiler, Droll, Nibiru, Belle, Fuwalos, Purulia, Maxx "C");
- what you can't see: the size of their hand and what an unnamed Set card is assumed to do;
- draw effects already live on you this turn;
- their field when going second: LP, monsters and Spell/Traps, each with what it does on your turn (negate kinds, removal, floodgates), uses, and protection flags;
- what has happened so far this turn. Steps up to there are locked and the lines continue from that position, with undo and "start the turn over".

Outputs:

- up to three lines as tabs, with badges, and a "safest" lethal line when there is one;
- the trade-off when a draw effect is live: the best board for each number of cards given away;
- steps with a stepper, the end board, and "What it does on their turn";
- testing against the chosen hand traps: the banner naming the line that holds up best, the worst case, and the branch view for "what you do instead";
- "Search deeper";
- card text on tap, and "How it decides".

State is remembered per saved deck on the device.

### Working with the server asleep

Production sleeps when idle, and a duel will not wait for it. The Finder must not depend on any server call to find a line.

- **Card facts travel with the deck file.** Each deck file carries the stats, types and full text of its own cards, filled in by a script from the card database when the file is written. The solver and the card-text view never ask the server.
- **The last list is remembered.** The Finder keeps the saved deck's list (passcodes and counts) on the device each time it loads, whatever the "Enable Local Caching" setting says, and uses that copy while the server is unreachable. A deck never opened in the Finder on that device still needs the server once.
- **The opponent's cards.** The client ships a name, type and ATK/DEF index of all cards, as the artifact does, loaded only when the Finder opens. A script regenerates it from the card database; a stale index only means the newest cards are entered by hand. Entering an unknown monster by hand always works.
- **Saving a line** needs the server. If it is unreachable the page says so and the line stays on screen to save later.

### The one thing that will not work the same

The artifact's Screenshot button asks Claude to read the hand from a screenshot. It works through a feature of claude.ai that the app does not have. In the first version the button is absent, which is what the artifact itself does when that feature is unavailable. Reading screenshots through the server's own model key is a possible follow-up.

### The solver

- Lives in the client, written in TypeScript, and runs in a Web Worker.
- Two parts: an **engine** (state, move execution, search, scoring, opponent policy, replay, robustness, plan export) and a **deck compiler** that turns a deck file into the moves and values the engine uses.
- The deck file is compiled once when the deck is opened. The search then runs compiled functions, not an interpreter, so it is not slower than hand-written code by more than a small factor.
- Rule: when a card needs something the vocabulary cannot say, add a **general** word to the vocabulary, named for what it does. Never add a check for a particular card.
- **The opponent's hand traps follow the same rule.** The engine implements each mechanism under a name for what it does (negate a search, lock searches after the first, draw when you Special Summon, wipe the board at the fifth summon, and so on). One shared data file, used by every deck, says which card has which mechanism and what to call it on screen. Adding a hand trap that works like an existing one is a data change. A hand trap with a new mechanism needs engine work once. No card name appears in the engine.

### The deck file

One JSON file per deck family, kept in the client and bundled with it. Files may share definitions for staples that many decks play (hand traps, Super Polymerization). Files are validated against a schema when loaded, with errors that name the card and field.

A deck file has to be able to say everything in the list under "Starting point". In outline:

- **Cards**: passcodes (including alternate passcodes for the same card), a short name, and a discard value. Stats, types and text are filled in by script from the card database and kept in the file (or a generated file beside it).
- **Search hints**: the pruning choices the reference makes by judgement, such as cards not worth Normal Summoning.
- **Groups**: named lists or filters of cards, for searches.
- **Effects** per card: where the card must be, the once-per-turn limit, what must be true, the cost, what the player chooses from, what happens, what a negate leaves behind, which kinds of interruption can answer it, and the step text.
- **Triggers**: effects that follow a summon or a move to another zone.
- **Extra Deck rules**: materials for each Fusion, Synchro, Xyz and Link monster, and where materials may come from and go to.
- **End of turn**: which cards to Set and in what order.
- **Board value**: for each card or combination left at the end of the turn, a label, a value and a condition, marked with when it applies (opponent's turn, End Phase).
- **Version** of the vocabulary the file was written for.

An example to show the intent. The exact shape is the builder's to settle.

```json
{
  "id": "ROD",
  "passcodes": [7084129],
  "short": "Rod",
  "effects": [
    {
      "key": "rod-search",
      "when": "normalSummoned",
      "limit": "oncePerTurn",
      "answeredBy": ["ash", "droll", "monsterNegateOnField"],
      "choose": { "from": "deck", "group": "spellTrapListingDarkMagician" },
      "do": [{ "move": "chosen", "to": "hand" }],
      "text": "Rod: add {chosen}."
    }
  ]
}
```

### Matching a saved deck to a deck file

The Line Trainer works on saved decks, and the user changes lists. A deck file describes a pool of cards, not one exact list.

- The Finder is offered for a saved deck when a deck file knows at least half of its different Main Deck cards. If several files qualify, the one that knows the most wins.
- Counts come from the saved deck.
- A card the file does not know is treated as a blank, as the artifact treats unknown cards. The page lists those cards so the user knows.

### Room for the opponent's turn later

The first version stops at the end of your turn. To avoid redoing files and engine later:

- the engine state records whose turn it is and the phase, even though only your Main Phase is played;
- every effect in a deck file is marked with when it can be used;
- a board-value entry can carry, beside its label and value, the full definition of the effect it stands for. The first version reads only the label, value and condition. A later version can play the effect out and drop the fixed value;
- the "What it does on their turn" list is where stepping through will attach in the page.

### The two decks

- **DM Azamina**: the artifact's list and 40 cards, re-expressed as a deck file.
- **Branded Dracotail**: Appendix A. 37 different cards, 5 shared with DM Azamina. It needs Fusion as a general mechanic (materials from hand, field and Deck, and banishing from the GY), effects that trigger when a card is used as material, and many board-value entries for End Phase and opponent's-turn effects.

## How we know it works

1. **DM Azamina is at least as good as today.** The artifact's engine and deck list are saved in the repo as a test fixture and run under Node. A fixed set of situations is run through both engines with the search limited by beam width, not by the clock, so results repeat. The set: at least 200 going-first hands drawn with a fixed seed, at least 50 going-second situations with opponent fields, each hand trap setting, live draw effects, and mid-turn continuations. For every situation the new engine's best line must score the same as the reference's best line or higher. A lower score is a failure to fix; a situation that cannot be fixed is listed for the user, never hidden. A higher score is not accepted on trust, because it can also mean the new engine allowed a move it should not have. Every situation where the new engine scores higher is listed, its line is run through the ledger checker, and the list is given to the user with the two lines side by side.
2. **No card knowledge in the engine.** A test fails if any card name, short id or passcode from any deck file appears in the engine's source.
3. **Lines are possible.** For both decks, lines found for a few hundred seeded hands are run through the existing ledger checker. No errors allowed.
4. **Branded Dracotail has no reference.** Beyond check 3, a short list of hands with the line found for each is given to the user to judge and to try in Master Duel. Expect rounds of tuning of its board values.
5. **Speed.** The beam doubles each round, so a slower engine finishes fewer rounds in the same 2.5 s and can return a worse line in real use even when it matches at equal width. Two measures on the same machine: the new engine explores at least 90% as many positions per second as the reference (a test); and a benchmark script runs the situation set at the real 2.5 s budget through both engines and reports every situation where the new engine scored lower. That report is read by a person, not gated in CI, because timing varies.
6. **The page.** Checked in a phone-sized viewport and on desktop: each input, each output, saving a line, a deck with unknown cards, a deck with no deck file, and the server unreachable.

## Route not taken: a real rules engine for the search

The existing designs plan `ocgcore-wasm` for a later phase. It was considered here because it already knows every card, which would mean no effect files at all.

Facts checked on 2026-11-15:

- `ocgcore-wasm` 0.1.6 is an MIT-licensed wrapper, about 1 MB of WebAssembly, last published October 2026.
- The engine it wraps, `edo9300/ygopro-core`, is under the GNU Affero GPL v3 or later. The card scripts it needs (`ProjectIgnis/CardScripts`) have no licence file.
- Its interface has no way to copy or save a duel in progress. A search would have to replay each position from the start.

Why it is not used for the search now:

- "Works as it does today" means matching the current solver's lines. A different engine would not.
- Speed is unproven, and without deck knowledge to prune it the number of legal moves at each step is much larger.
- Shipping AGPL code and unlicensed scripts inside the app is a licensing question the user has not been asked to take on.
- End boards would still need per-deck values.

It stays a good fit for its planned role: a checker that replays a found line under real rules. That would be the strongest check for a deck like Branded Dracotail and can be added later without changing this design.

## Risks

- **The vocabulary does not fit a card.** Expected to happen. The answer is a new general word. If the new engine stays below the reference for some DM Azamina situations, they are reported.
- **Size.** This is the largest feature in the app so far. Getting DM Azamina to match or beat the reference on every situation is the long part.
- **Branded Dracotail quality.** More of its strength is in End Phase and opponent's-turn effects, which are fixed values in the first version. Its lines are only as good as those values.
- **A new deck on Android needs an app update**, because deck files ship inside the app. The web version gets it on deploy.

## Build order

Each step ends in something that can be tested.

1. Save the artifact's engine and deck list as a fixture; build the harness that runs it under Node and records results for the situation set.
2. Engine and deck compiler, with the schema.
3. DM Azamina deck file, until check 1 passes.
4. Finder tab, worker, saving lines, the "Find lines" button, the Duel Mode link.
5. Branded Dracotail deck file, its checks, and the hands for the user to judge.
6. A short "how to add a deck" note for whoever writes the next deck file.

## Calls made by Claude, not the user

- The Finder is a tab in the Line Trainer with a link from Duel Mode.
- The AI "Generate lines" panel stays as a fallback for decks with no deck file.
- Screenshot reading is left out of the first version.
- Deck files are bundled in the client, not served by the API.
- The solver runs in the client in a Web Worker.
- Deck files describe a card pool; unknown cards are blanks; the Finder is offered at half coverage or more.
- The opponent's hand traps: mechanisms in the engine under general names, card names in one shared data file.
- Deck files carry their own cards' stats and text; the Finder remembers the last list per deck; a card index for the opponent's cards ships with the client.
- The speed floor of 90% of the reference's positions per second, plus an equal-time benchmark report.
- `ocgcore-wasm` is not used for the search.
- The design document is not committed yet, because the local checkout is behind `origin/master`.

## Left to the builder

- The exact vocabulary and schema of the deck file.
- File layout in the client, and where the cross-package ledger test lives.
- How deck files share staple definitions.
- Component breakdown and styling of the Finder, following the app's existing trainer components.
- How the reference engine's search is pinned to a beam width in the harness (it accepts `width` and `maxWidth` options).

## Appendix A: Branded Dracotail list

`ydke://YmcBf2JnAUqlWUBUveKA68j3gCvI94AryPeAPuLcAD7i3AA674UBFhoSwNYaEsDjXSxBY10sQU1B4MCNQeDAjUHgwJErQQFRK0EBUStBAU0d3gENWZmBDVmZgRR3RYAUd0WAFHdFgBxaDkEd1uEAXdbhAF3W4QBHjeCAYPspAL6410A+uNdAN6l8AFdad4CXWneAob5yAF55s0BeebNAarhUgA=!Lk53AojmOgV3nqECHQo0AN0vfAHwchADRnVTBMYmAwLGJgMCswdbBerWkQT+kNEEtxP6Ad1ArARcvzEE!!`

Main Deck (41):

| Copies | Passcode | Card |
|---|---|---|
| 2 | 94145021 | Droll & Lock Bird |
| 1 | 23434538 | Maxx "C" |
| 1 | 59438930 | Ghost Ogre & Snow Rabbit |
| 3 | 14558127 | Ash Blossom & Joyous Spring |
| 2 | 7375867 | Dracotail Mululu |
| 1 | 68468459 | Fallen of Albaz |
| 2 | 55273560 | Incredible Ecclesia, the Virtuous |
| 2 | 95515789 | Blazing Cartesia, the Virtuous |
| 3 | 42141493 | Mulcharmy Fuwalos |
| 3 | 84192580 | Mulcharmy Purulia |
| 1 | 75003700 | Dracotail Lukias |
| 2 | 73819701 | Fallen of the White Dragon |
| 3 | 1498449 | Dracotail Faimena |
| 1 | 70871153 | Dracotail Urgula |
| 3 | 25451383 | Albion the Shrouded Dragon |
| 1 | 25311006 | Triple Tactics Talent |
| 1 | 44362883 | Branded Fusion |
| 2 | 6153210 | Ketu Dracotail |
| 1 | 32548318 | Rahu Dracotail |
| 2 | 48130397 | Super Polymerization |
| 1 | 29948294 | Branded in High Spirits |
| 2 | 30271097 | The Fallen & The Virtuous |
| 1 | 5431722 | Dracotail Flame |

Extra Deck (15):

| Copies | Passcode | Card |
|---|---|---|
| 1 | 41373230 | Titaniklad the Ash Dragon |
| 1 | 87746184 | Albion the Branded Dragon |
| 1 | 44146295 | Mirrorjade the Iceblade Dragon |
| 1 | 3410461 | Alba-Lenatus the Abyss Dragon |
| 1 | 24915933 | Granguignol the Dusk Dragon |
| 1 | 51409648 | Rindbrumm the Striking Dragon |
| 1 | 72578374 | Khaos Starsource Dragon |
| 2 | 33760966 | Dracotail Arthalion |
| 1 | 89851827 | Secreterion Dragon |
| 1 | 76666602 | The Dragon that Devours the Dogma |
| 1 | 80843006 | Mixousia the Confounder |
| 1 | 33166263 | Hyperinvoked Aeon |
| 1 | 78397661 | Ecclesia and the Dark Dragon |
| 1 | 70369116 | Predaplant Verte Anaconda |

Names came from the old local card database, except Mixousia the Confounder and Hyperinvoked Aeon, which were missing from it and were looked up on YGOPRODeck. Whether the production card database has those two was not checked.
