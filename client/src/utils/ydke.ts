// YDKE URL codec — the community-standard deck link used by EDOPro / YGOPRODECK
// and accepted by the Konami Card Database deck editor (via the deck-transfer
// browser extension). Format: ydke://<main>!<extra>!<side>! where each section
// is base64 of the passcodes encoded as little-endian uint32 values.

function passcodesToBase64(passcodes: number[]): string {
  const bytes = new Uint8Array(passcodes.length * 4);
  const view = new DataView(bytes.buffer);
  passcodes.forEach((p, i) => view.setUint32(i * 4, p, true /* little-endian */));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Build a `ydke://` deck URL from per-copy passcode arrays. */
export function buildYdke(main: number[], extra: number[], side: number[]): string {
  return `ydke://${passcodesToBase64(main)}!${passcodesToBase64(extra)}!${passcodesToBase64(side)}!`;
}

export interface DeckRow { passcode: number; count: number }
export interface YdkeDeck { main: DeckRow[]; extra: DeckRow[]; side: DeckRow[] }

const SECTION_LIMITS = { main: 60, extra: 15, side: 15 } as const;

function base64ToPasscodes(b64: string, section: keyof typeof SECTION_LIMITS): number[] {
  let binary: string;
  try {
    // Tolerate URL-safe base64 (- and _) as some sites emit it.
    binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new Error(`The ${section} section of this YDKE code isn't valid base64.`);
  }
  if (binary.length % 4 !== 0) {
    throw new Error(`The ${section} section of this YDKE code doesn't hold whole card passcodes.`);
  }
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const out: number[] = [];
  for (let i = 0; i < binary.length; i += 4) out.push(view.getUint32(i, true /* little-endian */));
  if (out.length > SECTION_LIMITS[section]) {
    throw new Error(`The ${section} deck has ${out.length} cards; the most allowed is ${SECTION_LIMITS[section]}.`);
  }
  return out;
}

export const groupPasscodes = (passcodes: number[]): DeckRow[] => {
  const counts = new Map<number, number>();
  for (const p of passcodes) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts].map(([passcode, count]) => ({ passcode, count }));
};

/** Parse a `ydke://main!extra!side!` deck URL into counted rows. The inverse of `buildYdke`. */
export function parseYdke(code: string): YdkeDeck {
  const trimmed = code.trim();
  if (!trimmed.toLowerCase().startsWith('ydke://')) {
    throw new Error('A YDKE code starts with ydke://');
  }
  const [main = '', extra = '', side = ''] = trimmed.slice('ydke://'.length).split('!');
  return {
    main: groupPasscodes(base64ToPasscodes(main, 'main')),
    extra: groupPasscodes(base64ToPasscodes(extra, 'extra')),
    side: groupPasscodes(base64ToPasscodes(side, 'side')),
  };
}

// Konami Card Database "My Deck" — decks saved here (while logged into a
// Konami ID) sync into Neuron, and public decks can be imported in-game by
// Master Duel.
export const KONAMI_MY_DECK_URL = 'https://www.db.yugioh-card.com/yugiohdb/member_deck.action?request_locale=en';

/**
 * Konami DB auto-import deep link. The Deck Transfer extension
 * (DawnbrandBots/deck-transfer-for-master-duel) watches member_deck.action for
 * a `#storm-access=` hash carrying the YDKE payload (scheme stripped,
 * URL-encoded) and walks My Decks → new deck → editor, pre-filling the list so
 * the user only names the deck and saves. Same mechanism as YGOPRODECK's
 * one-button import. Requires the user to already be logged in; the extension
 * carries the hash through its own redirects.
 */
export function buildKonamiDeepLink(main: number[], extra: number[], side: number[]): string {
  const payload = buildYdke(main, extra, side).slice('ydke://'.length);
  return `${KONAMI_MY_DECK_URL}#storm-access=${encodeURIComponent(payload)}`;
}
