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
