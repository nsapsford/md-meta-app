// Which saved decks a deck file can solve, light enough to import from the trainer page (the
// deck files themselves load only when the Finder opens). `main` is every passcode of every
// Main Deck card the file knows, its shared files included.
//
// This is DATA, not solver code: it holds passcodes, so noCardKnowledge.test.ts does not scan it.
// match.test.ts checks every row against the deck files; update a row when a file's cards change.

export interface ManifestRow { id: string; name: string; main: number[] }

export const DECK_MANIFEST: ManifestRow[] = [
  {
    id: 'dm-azamina',
    name: 'Dark Magician Azamina',
    main: [
      14558128, 14558127, 94145021, 94145022, 42141493, 23434538, 48130397, 36996508, 46986414, 46986415, 46986416, 46986417, 46986418, 46986419, 46986420, 46986421, 7084129, 47222536, 41350417,
      71440209, 23020408, 97631303, 88570003, 12266229, 96729612, 79791878, 78679226, 2501624, 342673,
      2333466, 72270339, 80845034, 66328392, 94845588, 22283204,
    ],
  },
];
