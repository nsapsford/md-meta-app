# Deck file vocabulary

Every deck file (`client/src/finder/deck/files/*.json`) is written in these words and nothing
else. A word is an object with exactly one key, the word, whose value is its arguments, for
example `{ "move": { "what": "chosen", "to": "hand" } }` or `{ "draw": 2 }`.

The words live in `client/src/finder/deck/vocabulary.ts`. When a card needs something these
words cannot say, add a **general** word named for what it does (never a check for a
particular card): one `defineCond` / `definePick` / `defineAct` / `defineTrigger` call, and a
row here. A test fails if a registered word has no row.

Argument notation: `zone` is one of `hand`, `deck`, `extra`, `gy`, `ban`, `field`. `what` is
`self` or a name bound by the effect's `choose[].as`. `which` is at most one of `card`
(a card id), `group` (a group name) or `filter` (a condition evaluated per card); none means
any card. `?` marks an optional argument. `none` means the value is `true` or `{}`.
`opp` is `{ kind?: mon|st, faceUp?, targetable?, destroyable? }`.

"This card" in a condition is the effect's own card, a filter's candidate, or one material of an
Extra Deck rule (`mats`, fusion `slots`). For a material, the other materials are its chosen
cards. On your field a monster's name is its name there; an opponent's monster is read from its
own fields (never a Tuner; it counts as an Effect Monster); anywhere else, the printed card.

Extra Deck rules (`extraDeck`) are tried in (`order`, card id, method) order, whatever their order
in the file; `order` is an optional number (default 0), as on effects. That order is the order of
the Synchro and Link moves and of the Fusion options.

| Word | Kind | Arguments | Meaning |
| --- | --- | --- | --- |
| `has` | condition | `{ zone, which? }` | A zone holds at least one matching card. |
| `count` | condition | `{ zone, which?, atLeast?, atMost? }` | The number of matching cards in a zone is within atLeast..atMost. |
| `control` | condition | `{ which?, kind?: mon\|st, faceUp? }` | You control a matching card on the field. |
| `monsterZoneFree` | condition | none, or a number ≥ 1 | At least one (or that many) Main Monster Zones are free. |
| `stZoneFree` | condition | none, or a number ≥ 1 | At least one (or that many) Spell/Trap Zones are free. |
| `notUsed` | condition | effect key or shared limit name | That once-per-turn effect or shared limit has not been used this turn. |
| `flag` | condition | flag name (from `flags`) | The deck-defined state flag is set. |
| `addLockOff` | condition | none | You are not locked out of adding cards from the Deck to the hand. |
| `lpAbove` | condition | number | Your Life Points are above the number. |
| `oppHasTarget` | condition | none, or `opp` | The opponent has a matching card. |
| `spellActivatedThisTurn` | condition | none | You have activated a Spell this turn. |
| `not` | condition | condition | The nested condition is false. |
| `any` | condition | list of conditions (≥ 1) | At least one nested condition is true. |
| `tuner` | condition | none | This card is a Tuner monster. |
| `attribute` | condition | list of Attributes (≥ 1) | This card's Attribute is one of them. |
| `race` | condition | list of monster Types (≥ 1) | This card's monster Type is one of them. |
| `frame` | condition | list of `Normal\|Effect\|Ritual\|Fusion\|Synchro\|Xyz\|Link` (≥ 1) | This card is a monster of one of those kinds. Every opponent's monster counts as an Effect Monster here (while `extraDeckMonster` reads its `ext` flag). |
| `extraDeckMonster` | condition | none | This card is a Fusion, Synchro, Xyz or Link monster. |
| `named` | condition | card | This card's name is that card (on your field: its name there). |
| `uniqueName` | condition | none | No other chosen card (another material) has this card's name. |
| `fromZone` | pick | `{ zone, group \| filter }` | Each distinct card of the group or filter in the zone. |
| `fromField` | pick | `{ group? \| filter?, kind?: mon\|st, faceUp? }` | Each card you control on the field. |
| `otherHandCard` | pick | none, or `{ group? \| filter? }` | Each distinct card in hand other than this one (another copy of it counts). |
| `cheapest` | pick | `{ of: pick, n? }` | Only the n (default 1) choices of the nested pick with the lowest discard value. |
| `subsets` | pick | `{ of: pick, min, max }` | Each set of min..max choices of the nested pick. |
| `oppCard` | pick | none, or `opp` | Each of the opponent's matching cards. |
| `move` | action | `{ what, to: zone, from?: zone }` | Move a card to a zone. |
| `summon` | action | `{ what, from?: zone, noEff?, as?: card }` | Special Summon a card, optionally with effects negated or under another name. |
| `discard` | action | `{ what }` | Discard a card from the hand to the GY. |
| `draw` | action | number ≥ 1 | Draw that many cards. |
| `setFromDeck` | action | `{ what }` | Set a Spell/Trap from the Deck to your field. |
| `faceUp` | action | `{ what }` | Turn a Set Spell/Trap face-up. |
| `placeOnTop` | action | `{ what }` | Place a card on top of the Deck. |
| `payLp` | action | number ≥ 1, or `"half"` | Pay that many Life Points, or half. |
| `burn` | action | number ≥ 1 | Inflict that much damage to the opponent. |
| `oppRemove` | action | `{ what, how: destroy\|banish }` | Destroy or banish one of the opponent's cards. |
| `setFlag` | action | flag name (from `flags`) | Set the deck-defined state flag. |
| `queue` | action | effect key | Queue that effect as a pending trigger to resolve next. |
| `noDirectAttacks` | action | none | You cannot attack directly for the rest of the turn. |
| `normalSummoned` | trigger | none | This card is Normal or Tribute Summoned. |
| `specialSummoned` | trigger | none, or `{ from?: zone }` | This card is Special Summoned. |
| `summonedNamed` | trigger | `{ name: card, special? }` | A monster whose name on the field is that card is summoned. |
| `leftField` | trigger | none, or `{ to?: zone }` | This card leaves the field. |
| `sentToGy` | trigger | none, or `{ from?: zone }` | This card is sent to the GY. |
| `oppMonsterToGy` | trigger | none | A monster the opponent controls is sent to the GY. |
