# MD Board Scanner

A small Windows program that reads the opponent's field in Master Duel (PC) and copies
it to the clipboard for the DM Azamina Line Finder. It runs offline: every card's artwork
fingerprint is built into the program.

## Using it

1. Run `mdscan.exe` (from the `mdscan-latest` release). Keep Master Duel in windowed or
   borderless full screen; exclusive full screen can't be captured.
2. **F7, once per screen size.** In a duel, hover over the centre of four zones when asked
   (their leftmost and rightmost monster zones, then their leftmost and rightmost
   Spell/Trap zones) and press F8 at each. Optionally mark the corners of the card picture
   in the card detail panel (used by F9). Finally, with their field empty, press F8 once
   more so the program knows what empty zones look like. This is saved next to the program.
3. **F8** scans their field: names, Attack or Defense Position, face-down cards.
   **F9** adds whichever card Master Duel is showing in its detail panel: use it for any
   card F8 wasn't sure about. **F10** clears the F9 cards.
4. In the line finder, press **Ctrl+V**. Their field fills in, with a "Scanner not sure"
   note and one-tap alternatives on any card it couldn't confirm.

## How it identifies cards

Master Duel's field shows artwork, not names. Each zone is sampled at several card sizes
and orientations, with the perspective of the field taken from the four set-up points,
and compared with fingerprints of all 13,948 Master Duel cards (a DCT hash, a colour grid
and a contrast-normalised 16×16 image of both the illustration and the whole card).
A match is accepted only when it scores well and clearly beats the next-best card;
otherwise the card comes through as unsure, with the best guess.

On synthetic boards (real card images drawn in perspective, small, tinted and
JPEG-compressed), about 75–86% of field cards are named automatically with under 1% wrong,
and the detail panel (F9) reads 98%. Real Master Duel screenshots haven't been tested yet.

## Developing

```sh
# rebuild the fingerprint database from YGOPRODeck card data and card images
go run . build-db cardinfo.json images/ cards.db
# synthetic accuracy test
go run . selftest cards.db images/ 60
# scan a saved screenshot with a saved set-up
go run . scan cards.db mdscan-setup.json screenshot.png
# Windows build
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o mdscan.exe .
```

Card data and images: [YGOPRODeck](https://ygoprodeck.com/api-guide/).
