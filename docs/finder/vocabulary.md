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

Fusion rules take `more`, a filter for their "1+" materials: beside one material per slot, any number more (up to the pick's `max`), each matching it; and the relation `differentAttr` (every material a different Attribute).

Summon locks (`summonLocks`, top level): each is `{ flag, allow?, all? }`. While the flag is set (by `setFlag`), only monsters matching `allow` (none if it is absent) can be Special Summoned from the Extra Deck; with `all`, from anywhere. The engine respects it for every Extra Deck summon: Fusion picks, Synchro and Link Summons, and an effect's `summon` words.

Synchro and Link rules take `thenIf`, a material filter: their `then` effect is queued only when at least one material (read where it was) matches it.

Effect fields: `followUp: true` is part of another effect's resolution ("then you can ..."): it is never a move of its own and runs only when an effect `queue`s it (declining it is offered unless it is `mandatory`). `queueFirst` (a trigger) queues it at the front of the pending list instead of the back. Card fields: `materialAttribute: "any"` (see the condition). Fusion rules take `uses`, a filter: the Fusion Monster gets one use of its counted effect per material matching it. A field filter (`fromField`, `control`, `has` in `field`) reads each monster where it is (its name and Level there).

Text: `{as}` the chosen card's name; `{as?text|other}` text (`$` for the name) when the choice was made; `{as@zone?text|other}` text when the choice came from that zone (hand, deck, extra, gy, ban, field, opp); `{as.atk}` the chosen card's ATK; `{zone}` where the first choice came from.

The deck file's own `endOfTurn.setOrder` is kept as written and may place shared cards; a shared file's entries it does not list follow.

Board value (`boardValue`): entries with `when: "endPhase"` are scored like the others and listed last, under an "In the End Phase" heading. A monster on the final board with no entry of its own is worth
min(0.2, ATK / 15000). A monster's board-value entry must name it by `card` or `group` inside a
`control` word in its `on` (at any depth) for its default value to be replaced.

Effect fields beside the words: `tags` are the move's tags (what floodgates and protections
read); `stepTags` adds tags to the recorded step only (what the opponent's responses read), and
`stepMarks` adds marks to it the same way.
`mandatory: true` on a trigger offers declining it only when it has no move to make (none, or the
floodgates dropped them); otherwise declining is always offered. `immediate: true` on a trigger
means it is not queued: when its event happens (its limit free, its card where `from` says, its
conditions true) its `do` runs at once inside the step that set it off, with no move of its own,
and its `text` (if not empty) is added to that step's text after a space. It takes no `choose`,
`cost` or `onNegated`. An effect with
`activates: "spell"` sets "a Spell was activated this turn" only when its card is in the hand or
on the field (a Spell's effect in the GY does not). A bare activation (a card that stays on the
field, with no `cost`, `choose`, `do`, `onNegated` or `ledger.effect`) writes no activation to the
ledger: only a hand-to-field move when played from the hand, and nothing for a Set copy turned
face-up (an activation with no effect number draws the Line Trainer's "which effect" warning). In `text` and `negText`, `{as}` is a chosen
card's short name, `{zone}` where the first choice came from, and `{as?text|other}` is `text`
(with `$` for the chosen card's short name) when the choice `as` was made, else `other` (which may
be left out with its `|`).

`lineNote` on an effect is a note for the line's reader, put on the effect's step when it is not
negated (an exported line's step carries it).

Protections (`protections`): each is one of your cards that answers an opponent's interruption,
tried in `order`. `card` is the card that answers; `where` (conditions) must hold before the step,
and `consume`'s words see `card` as `self` on the field (a monster, else a Set copy first). They
run outside any step: they record no ledger entry and set off no trigger. `covers.marks` limits it
to steps with one of those marks, `covers.monsterOnly` to interruptions by a monster,
`covers.inResponseOnly` to interruptions that respond to an activation (not `lockDeckAdds`,
`wipeAtSummons`, `pop`, `negSummon`, `force`). `limit` names a once-per-turn slot it uses.
`destroysSource: true` destroys the interrupting card when it is on their field. `stepNote` is the
note an exported step carries while the protection is ready (its `where` and `marks` hold).

Card fields beside the words: `notFusionMaterial: true` keeps the card out of every Fusion pick ("Cannot be used as Fusion Material"); `generic: true` marks a card many decks play (a hand trap, a generic Spell), which does not identify the deck when a saved list is matched (a list must hold one of the file's own, non-generic Main Deck cards). `fieldName` is the name a monster has on your field and `gyName`
the name a card has in your GY (what `named`, `summonedNamed` and `namesPresent` see there).
`listOrder` (a number, lower first; cards without one come after, by id) is the order in which a
pick that walks a zone (`fromZone`, `otherHandCard`) lists its cards: it decides what `first`
takes, how `cheapest` breaks ties, and the order of a `subsets` choice's names in a step's text.
A file may also have a top-level `listOrder` map (card id to number) whose entries win over the
cards' own `listOrder`, a later file's over an earlier one's (the deck file comes last): a deck orders
the cards of a shared file it uses there.

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
| `all` | condition | list of conditions (≥ 1) | Every nested condition is true. |
| `materialAttribute` | condition | list of Attributes (≥ 1) | As material (or a cost by Attribute): this card's Attribute is one of them; one of your monsters whose card has `materialAttribute: "any"` counts as each. |
| `level` | condition | `{ atLeast?, atMost? }` | This card's Level (one of your monsters: its current Level) is within atLeast..atMost. |
| `usesLeft` | condition | none, or a number ≥ 1 | This monster has a use (or that many uses) of its counted effect left (uses come from its Fusion rule's `uses`). |
| `inZone` | condition | `zone[]` (≥ 1) | This card is in one of the zones (`field`: one of your monsters or Spells/Traps; a known top card is in the Deck). A Fusion material is where it comes from. |
| `inGroup` | condition | group | This card's name (on your field: its name there; in the GY: its GY name) is one of the group's cards. |
| `oppHasMoreMonsters` | condition | none | The opponent controls more monsters than you do. |
| `atk` | condition | `{ atLeast?, atMost? }` | This monster's printed ATK (an opponent's monster: as their field gives it) is within atLeast..atMost. |
| `def` | condition | `{ atLeast?, atMost? }` | The same for DEF. |
| `sameRaceAs` | condition | choice | This card's monster Type is the chosen card's. |
| `tuner` | condition | none | This card is a Tuner monster. |
| `attribute` | condition | list of Attributes (≥ 1) | This card's Attribute is one of them. |
| `race` | condition | list of monster Types (≥ 1) | This card's monster Type is one of them. |
| `frame` | condition | list of `Normal\|Effect\|Ritual\|Fusion\|Synchro\|Xyz\|Link` (≥ 1) | This card is a monster of one of those kinds. Every opponent's monster counts as an Effect Monster here (while `extraDeckMonster` reads its `ext` flag). |
| `extraDeckMonster` | condition | none | This card is a Fusion, Synchro, Xyz or Link monster. |
| `named` | condition | card | This card's name is that card (on your field: its name there; in the GY: its GY name). |
| `cardKind` | condition | `(monster\|spell\|trap)[]` (≥ 1) | This card is a Monster, Spell or Trap card of one of the given kinds (an opponent's Spell/Trap counts as either). |
| `uniqueName` | condition | none | No other chosen card (another material) has this card's name (its name on the field, its GY name in the GY). |
| `chosen` | condition | `{ as: choice, zone?, filter?: condition }` | The named choice was made (an optional one may be skipped), and if given came from the zone and matches the filter (which sees the chosen card as this card). |
| `knownTop` | condition | `{ atLeast?, atMost? }` | The number of known cards on top of the Deck is within atLeast..atMost. |
| `namesPresent` | condition | `{ names: card[] (≥ 1), inGy?: card[], atLeast?, atMost? }` | The number of the given names on your field (a monster by its name there) or in your GY (a card by its GY name; only the names listed in `inGy`, if given) is within atLeast (default 1)..atMost. |
| `fromZone` | pick | `{ zone, group? \| filter? \| cards?: [card], eachCopy?, plus?: what }` | Each distinct card (of the group or filter, if given) in the zone, in list order; `cards`: only the cards listed, in the order listed: that order (not the cards' list order) decides the order of the moves and so which of equal-scored positions the search keeps (not on the field); `eachCopy`: once per copy; `plus`: counting the cards of an earlier choice as already there (an effect that moves them there first). |
| `fusionMaterials` | pick | `{ either?, join?, oppPrefix?, pool?, of?, count?, max?, withSelf?, notSelf? }` | Each set of your monsters (`either`: also the opponent's face-up monsters) that can make a Fusion Monster in your Extra Deck by the deck's Fusion rules; its name joins the members with `join` (default " + "), an opponent's monster as `oppPrefix` + its name. `pool`: the materials come from these places instead: `self` (this card, wherever it is), `field`, `hand`, `deck`, `gy`, `oppField`; one from the hand, Deck or GY is named with "(hand)", "(Deck)" or "(GY)", each different set once. `of`: only Fusion Monsters matching this filter (it sees the monster in the Extra Deck); `count`: exactly that many materials; `max` (default 3): the most materials for a rule with `more`; `withSelf`: every set includes this card; `notSelf`: this card is not a material (a cost sends it). A summon lock leaves out the Fusion Monsters it forbids. |
| `fusionMonster` | pick | `{ of: what }` | Each Fusion Monster the chosen `fusionMaterials` set can make. |
| `fromField` | pick | `{ group? \| filter?, kind?: mon\|st, faceUp?, distinct? }` | Each card you control on the field; `distinct`: each card id once (the first on the field). |
| `otherHandCard` | pick | none, or `{ group? \| filter? }` | Each distinct card in hand other than this one (another copy of it counts). |
| `cheapest` | pick | `{ of: pick, n? }` | Only the n (default 1) choices of the nested pick with the lowest discard value. |
| `first` | pick | `{ of: pick, n? }` | Only the first n (default 1) choices of the nested pick (a zone pick lists cards in list order). |
| `subsets` | pick | `{ of: pick, min, max, join? }` | Each set of min..max choices of the nested pick, the same cards from the same places once; its name joins the members with `join` (default " and "). |
| `oppCard` | pick | none, or `opp` | Each of the opponent's matching cards. |
| `union` | pick | list of picks (≥ 1) | Each choice of each nested pick, in order. |
| `onlyIf` | pick | `{ if: conditions (≥ 1), of: pick }` | The nested pick's choices while every condition holds (they may read earlier choices), else none. |
| `fromTop` | pick | `{ n, group? \| filter? }` | Each distinct card (of the group or filter, if given) among the top n known cards of the Deck. |
| `move` | action | `{ what, to: zone, from?: zone }` | Move a card to a zone. |
| `summon` | action | `{ what, from?: zone, noEff?, as?: card, mats?: what, matsTo?: gy\|ban\|deck }` | Special Summon a card, optionally with effects negated or under another name. With `mats`, the chosen cards go to `matsTo` (default the GY) first as the summon's materials: the ledger lists them on the summon (with `materialsTo`, and `materialsFrom: gy` for GY materials), not as moves; two or more going to the GY set off `monstersToGyTogether`. |
| `discard` | action | `{ what }` | Discard a card from the hand to the GY. |
| `discardCheapest` | action | `true` or a number | Discard the given number (default 1) of different cards from the hand with the lowest discard value (ties in list order). |
| `draw` | action | number ≥ 1 | Draw that many cards. |
| `setFromDeck` | action | `{ what }` | Set a Spell/Trap from the Deck to your field. |
| `faceUp` | action | `{ what }` | Turn a Set Spell/Trap face-up. |
| `placeOnTop` | action | `{ what }` | Place a card on top of the Deck. |
| `setOnField` | action | `{ what }` | Set a Spell/Trap from where it is (hand, Deck, GY or banishment) to your field. |
| `payLp` | action | number ≥ 1, or `"half"` | Pay that many Life Points, or half. |
| `gainLp` | action | number ≥ 1 | Gain that many Life Points. |
| `burn` | action | number ≥ 1, or `{ atkOf: what }` | Inflict that much damage to the opponent, or damage equal to a chosen card's ATK (an opponent's card: its own; list it before the card leaves). |
| `spendUse` | action | `{ what }` | One of your monsters spends a use of its counted effect. |
| `fusionSummon` | action | `{ what, mats: what, to?: gy\|deck\|ban }` | Fusion Summon the chosen Fusion Monster from the Extra Deck with the chosen materials: yours go to `to` (default the GY; the Deck is then shuffled), highest field index first, then the opponent's go to their GY as material. It gets one use per material matching its Fusion rule's `uses`. The ledger lists the materials on the summon (no moves for them); when they come from several places it lists those on the field (else those of the first material's zone, with `materialsFrom`) and writes the rest as moves. `ban` banishes them. The materials are Fusion material (`usedAsMaterial`); two or more going to the GY together set off `monstersToGyTogether`. |
| `oppRemove` | action | `{ what, how: destroy\|banish }` | Destroy or banish one of the opponent's cards. |
| `oppRemoveAll` | action | `{ how: destroy\|banish, kind?: mon\|st, faceUp?, destroyable? }` | Destroy or banish every one of the opponent's cards matching the description (it does not target: targetable does not apply). |
| `wipeField` | action | `{ banish?, spare?: condition, thenSummon?: what, noTriggers? }` | Destroy as many other cards on the field as possible: yours except this card and those matching `spare` (a filter), and every opponent card that can be destroyed (`banish`: banish them instead; `noTriggers`: your cards leave without setting off any trigger). Then Special Summon the `thenSummon` choice from where it is, its Level raised by the number destroyed. |
| `setFlag` | action | flag name (from `flags`) | Set the deck-defined state flag. |
| `queue` | action | effect key | Queue that effect as a pending trigger to resolve next. |
| `oppNegate` | action | `{ what }` | Negate the effects of one of the opponent's cards: it stops interrupting you and stays on their field. |
| `destroy` | action | `{ what }` | Destroy a chosen card: one of yours goes to the GY (with its triggers), one of the opponent's is destroyed. |
| `returnToHand` | action | `{ what }` | Return a chosen card to the hand: yours from where it is (an Extra Deck monster to the Extra Deck); the opponent's leaves their field (as a banish: no GY). |
| `noDirectAttacks` | action | none | You cannot attack directly for the rest of the turn. |
| `normalSummoned` | trigger | none | This card is Normal or Tribute Summoned. |
| `specialSummoned` | trigger | none, or `{ from?: zone }` | This card is Special Summoned. |
| `summoned` | trigger | none | This card is Normal, Tribute or Special Summoned. |
| `summonedNamed` | trigger | `{ name: card, special? }` | A monster whose name on the field is that card is summoned. |
| `leftField` | trigger | none, or `{ to?: zone, faceUp? }` | This card leaves the field (`faceUp`: only while face-up, or only while face-down). |
| `sentToGy` | trigger | none, or `{ from?: zone }` | This card is sent to the GY. |
| `oppMonsterToGy` | trigger | none | A monster the opponent controls is sent to the GY. |
| `usedAsMaterial` | trigger | none, or `{ method?: fusion }` | This card is sent to the GY as material for a Fusion Summon. |
| `monstersToGyTogether` | trigger | none, or a number ≥ 2 | Two (or that many) or more monsters are sent to the GY at the same time (a summon's materials). A GY effect listening for it needs its card in the GY before: a copy that went there in the same batch does not count. |
