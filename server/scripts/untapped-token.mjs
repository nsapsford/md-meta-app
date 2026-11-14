// Prints the Untapped Companion's YGOM refresh token from this PC's secure store
// (Windows Credential Manager / macOS Keychain / libsecret), for use as UNTAPPED_REFRESH_TOKEN.
//
//   cd server && npm install && node scripts/untapped-token.mjs
//
// Nothing is sent anywhere. The token goes to stdout only; paste it straight into the Render
// dashboard and nowhere else (not chat, not git, not a file in the repo).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let keytar;
try {
  keytar = require('keytar');
} catch (e) {
  console.error('keytar is not installed or failed to load: ' + e.message);
  console.error('Run "npm install" in the server folder first.');
  process.exit(1);
}

const entries = await keytar.findCredentials('Untapped Companion');
if (!entries.length) {
  console.error('No "Untapped Companion" login found on this machine.');
  console.error('Open the Untapped Companion, log in, then run this again.');
  process.exit(1);
}

let ygom;
try {
  ygom = JSON.parse(entries[0].password).ygomOAuthAccessToken;
} catch {
  /* handled below */
}
if (!ygom) {
  console.error('Found a Companion login, but no Yu-Gi-Oh! Master Duel (YGOM) token in it.');
  console.error('Open the Companion, switch to Master Duel and log in there, then run this again.');
  process.exit(1);
}
if (!ygom.refreshToken) {
  console.error('The stored YGOM login has no refresh token.');
  if (ygom.accessToken) console.error('It only has an access token, which expires within hours, so it is not worth setting.');
  process.exit(1);
}

console.error('Refresh token (copy the line below, nothing else):');
console.log(ygom.refreshToken);
