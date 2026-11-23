# Adding a deck to the Line Finder

The Line Finder's engine knows no cards. Each deck is a JSON file in `client/src/finder/deck/files/`
written in the words of `docs/finder/vocabulary.md`, with the cards' facts in a file beside it. This
note is for whoever writes the next one. The two existing files are the worked examples:
`dm-azamina.json` (Synchro and Link lines, a reference engine to match) and `branded-dracotail.json`
(Fusion from many places, summon locks, End Phase value, no reference).

## The steps

1. **Get the list.** The deck's Main and Extra Deck passcodes and copies (a YDKE string or a saved
   deck). Write them down by card: this is the list the checks use (see `__harness__/dracotail.ts`).
2. **Get the card facts.** From `client/`:
   - write a first `files/<id>.json` with each card's `id`, `passcodes` (the first one is the facts
     key), `short`, and `"vocab": 1`, `"uses": ["staples"]` if it plays shared staples;
   - `node scripts/finder-card-data.mjs <id>` writes `files/<id>.cards.json` (name, type, Type,
     Attribute, Level, ATK/DEF and text) from db.ygoprodeck.com, which gets only passcodes;
   - `node scripts/finder-card-data.mjs --artworks <id>` adds every artwork's passcode to each card,
     so a saved deck that uses an alternate artwork still matches. Re-run it whenever the file is
     rewritten.
3. **Read every card's text in the facts file** and list what the vocabulary cannot say yet. Add a
   word only for that list (see "The vocabulary rule" below).
4. **Write the file group by group**, from the card text, not from memory:
   - an effect for every effect usable in your own Main Phase (`from`, `limit`, `cond`, `cost`,
     `choose`, `do`, `tags` for what can answer it, `ledger.effect` numbered as the card prints its
     effects, step `text`);
   - triggers (`trigger`, `mandatory`, `immediate`, `queueFirst`, `followUp` for "then you can");
   - `extraDeck` rules for every Fusion, Synchro and Link monster;
   - `summonLocks` for "you cannot Special Summon ... except ...";
   - `boardValue` for every effect that matters after your turn, `when: "oppTurn"` or
     `"endPhase"`, on the DM file's scale: 1.0 a negate, 0.9 strong removal, 0.5-0.6 a conditional
     disruption, 0.1-0.3 minor value. An effect that is once per turn by name counts one copy
     (`extraCopies`, or an `any` around a zone count);
   - `endOfTurn.setOrder` for the Traps and Quick-Play Spells worth Setting, `heldValue` for hand
     traps, `discardValue` for what you would rather discard.
   After each group, write `files/<id>.effects.test.ts` cases: for every effect, the smallest state
   where it applies, the move run and the zones checked against the text (what moved where, what was
   summoned, which once-per-turn is spent), and one case where its condition fails and the move is
   absent.
5. **Register it.** Add a row to `client/src/finder/deck/manifest.ts` (id, name, every Main Deck
   passcode of the file and its shared files; `match.test.ts` checks the row against the files).
   `registry.ts` finds the file by name and needs no change.
6. **Run the ledger check.** A `__harness__/<id>.ledger.parity.test.ts` like
   `dracotail.ledger.parity.test.ts`: a few hundred seeded hands, going first and going second
   against the opponent fields, solved at `PIN` with `strict`, no move throwing, and every best line
   through the server's ledger checker with no error. A ledger error is a deck-file mistake until
   shown otherwise. Run it with `npx vitest run --config vitest.finder.config.ts <id>`.
7. **Produce a hands report** like `__harness__/hands.report.test.ts` (`npm run finder:hands`): a
   dozen hands, one built around each starter, solved at the real settings, written to
   `docs/finder/<id>-hands.md`. Read it for anything plainly wrong, fix the file, re-run 6 and 7,
   then give it to the player to try in Master Duel. Board values are tuned from what comes back.
8. **Run everything** in `client/`: `npm test`, `npm run test:parity`, `npx tsc -b`,
   `npm run build`.

## The vocabulary rule

When a card needs something the words cannot say, add a **general** word to
`client/src/finder/deck/vocabulary.ts`, named for what it does ("Fusion Summon from these places",
"sent to the GY as material"), never a check for a particular card. Each new word gets a unit test
on the toy deck (`deck/words.test.ts`, `deck/words.fusion.test.ts`) and a row in
`docs/finder/vocabulary.md`; a default-suite test fails when a registered word has no row.
`noCardKnowledge.test.ts` fails if any card name, id, short name or passcode from any deck file
appears in the engine, the compiler, the worker, the model or the Finder's components.
`VOCAB_VERSION` changes only when an existing word's meaning changes, never for added words or
optional arguments.

The order of cards and effects in a file must not change any result: moves are ordered by
(`order` hint, move key) and cards are numbered by sorted id.

## Shipping

Deck files are bundled into the client. The web version gets a new deck on deploy; **a new deck
reaches Android only through an app update.**

## Known divergences in DM Azamina

Recorded here so the next author does not rediscover them.

- **Dark Magician of Destruction's procedure (`dmod`).** Its material pick is `fromField` with
  `distinct`, the filter applied first. The reference engine skips any copy of a card that is not
  the first on the field, even when the first copy fails the Level 6 check. The two differ only with
  two copies of a monster at different current Levels; no situation reaches it.
- **Dark Magician of Destruction's Special Summon (`dmod-ss`)** is an immediate effect with an empty
  `do`: its only job is to spend the shared `dmodSS` limit when DMOD is Special Summoned from the
  Extra Deck (the reference's `afterExtraSummon`). That turns off the `dmod` procedure, The Gaze of
  Timaeus into DMOD and Super Polymerization into DMOD for the rest of the turn.
- **Master of Chaos checks DARK by printed Attribute.** Its cost picks the first DARK monster on
  the field by the card's printed Attribute (`attribute`), not by an Attribute it has there. A
  monster whose Attribute was changed on the field would be judged by its printed one. Known and
  left as the reference does it.
