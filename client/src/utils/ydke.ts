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
