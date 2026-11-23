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
  {
    id: 'branded-dracotail',
    name: 'Branded Dracotail',
    main: [
      14558128, 14558127, 94145021, 94145022, 42141493, 23434538, 48130397,
      7375867, 68468459, 55273560, 95515789, 84192580, 59438930, 59438931, 25311006, 75003700, 73819701, 1498449,
      70871153, 25451383, 44362883, 6153210, 32548318, 29948294, 30271097, 5431722,
    ],
  },
];
