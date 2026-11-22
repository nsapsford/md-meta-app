// Card data for the Line Finder, from the source the server syncs from (db.ygoprodeck.com).
// Requests carry passcodes only (or, for the index, only the Master Duel format filter).
//
//   node client/scripts/finder-card-data.mjs <deck-file-id>
//       rewrites src/finder/deck/files/<deck-file-id>.cards.json: one entry per card of that
//       file, keyed by the card's first passcode, in the file's card order.
//   node client/scripts/finder-card-data.mjs --passcodes <p1,p2,...> --out <file>
//       writes the facts of those passcodes to <file> (same format).
//   node client/scripts/finder-card-data.mjs --artworks <file,...>
//       adds every official passcode (alternate artworks) to each card's passcodes in those files.
//   node client/scripts/finder-card-data.mjs --index
//       rewrites src/finder/data/card-index.txt (the artifact's format) from every Master Duel
//       card. What a card does on your turn (its interruption) is kept from the current index by
//       name; new cards start with none.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'finder');
const FILES = join(ROOT, 'deck', 'files');
const INDEX = join(ROOT, 'data', 'card-index.txt');

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'card-data-script' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** The API's cards for `passcodes`, keyed by every passcode (alternate artworks included). */
async function fetchCards(passcodes) {
  const by = new Map();
  for (let i = 0; i < passcodes.length; i += 50) {
    const ids = passcodes.slice(i, i + 50).join(',');
    const j = await getJson(`${API}?id=${ids}`);
    for (const c of j.data ?? []) {
      by.set(c.id, c);
      for (const im of c.card_images ?? []) by.set(im.id, c);
    }
  }
  return by;
}

const isLink = (c) => /Link/.test(c.type);
const toFacts = (passcode, c) => ({
  passcode, name: c.name, type: c.type, race: c.race ?? null, attr: c.attribute ?? null,
  level: isLink(c) ? null : c.level ?? null, link: isLink(c) ? c.linkval ?? null : null,
  atk: c.atk ?? null, def: isLink(c) ? null : c.def ?? null, text: c.desc ?? '',
});

async function factsFor(passcodes) {
  const by = await fetchCards([...new Set(passcodes)]);
  return passcodes.map((p) => {
    const c = by.get(p);
    if (!c) throw new Error(`passcode ${p} is not in the card database`);
    return toFacts(p, c);
  });
}

const write = (file, data) => { writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); console.log(`${file}: ${data.length} cards`); };

async function deckFacts(id) {
  const deck = JSON.parse(readFileSync(join(FILES, `${id}.json`), 'utf8'));
  write(join(FILES, `${id}.cards.json`), await factsFor(deck.cards.map((c) => c.passcodes[0])));
}

// Every `"passcodes": [...]` list in a file under files/ gets each of the card's official
// passcodes (alternate artworks included). The ids already there stay first, in their order, so
// facts keyed by the first passcode and the reference's ids keep matching. Only the lists change;
// the rest of the file keeps its formatting.
async function artworks(name) {
  const file = join(FILES, `${name}.json`);
  const text = readFileSync(file, 'utf8');
  const re = /"passcodes":\s*\[([^\]]*)\]/g;
  const lists = [...text.matchAll(re)].map((m) => m[1].split(',').map((s) => +s.trim()).filter(Boolean));
  // Asked by id, the API answers with that one artwork only; asked by exact name, with every
  // artwork. So: ids → names (public card names, nothing else is sent), then names → all ids.
  const byId = await fetchCards([...new Set(lists.flat())]);
  const names = [...new Set([...byId.values()].map((c) => c.name))];
  const byName = new Map();
  for (let i = 0; i < names.length; i += 20) {
    const j = await getJson(`${API}?name=${names.slice(i, i + 20).map(encodeURIComponent).join('|')}`);
    for (const c of j.data ?? []) byName.set(c.name, c);
  }
  const by = new Map([...byId].map(([p, c]) => [p, byName.get(c.name) ?? c]));
  let added = 0;
  const out = text.replace(re, (_, inner) => {
    const have = inner.split(',').map((s) => +s.trim()).filter(Boolean);
    const all = [...have];
    for (const p of have) {
      const c = by.get(p);
      if (!c) throw new Error(`passcode ${p} is not in the card database`);
      for (const id of [c.id, ...(c.card_images ?? []).map((im) => im.id)].sort((a, b) => a - b)) if (!all.includes(id)) { all.push(id); added++; }
    }
    return `"passcodes": [${all.join(', ')}]`;
  });
  writeFileSync(file, out);
  console.log(`${file}: ${lists.length} cards, ${added} passcodes added`);
}

const KINDS = [/Fusion/, /Synchro/, /XYZ/, /Link/];

async function index() {
  const old = readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n').split('\n===\n');
  const meta = JSON.parse(old[0]);
  const intrOf = new Map();
  for (const r of old[1].split('\n')) { const f = r.split('\t'); if (f.length >= 7) intrOf.set(f[0], +f[6]); }
  for (const r of old[2].split('\n')) { const f = r.split('\t'); if (f.length >= 3) intrOf.set(f[0], +f[1]); }
  const ix = (list, v) => { if (v == null) return 0; let i = list.indexOf(v); if (i < 0) { list.push(v); i = list.length - 1; } return i; };
  const j = await getJson(`${API}?format=${encodeURIComponent('master duel')}`);
  const cards = (j.data ?? []).filter((c) => !/token|skill/i.test(c.frameType ?? '')).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const mons = [], sts = [];
  for (const c of cards) {
    const intr = intrOf.get(c.name) ?? 0;
    if (/Monster/.test(c.type)) {
      const kind = Math.max(0, KINDS.findIndex((re) => re.test(c.type)) + 1);
      mons.push([c.name, c.atk ?? 0, c.def ?? 0, ix(meta.attrs, c.attribute), ix(meta.races, c.race), kind, intr].join('\t'));
    } else sts.push([c.name, intr, /Spell/.test(c.type) ? 'S' : 'T'].join('\t'));
  }
  writeFileSync(INDEX, [JSON.stringify(meta), mons.join('\n'), sts.join('\n')].join('\n===\n') + '\n');
  console.log(`${INDEX}: ${mons.length} monsters, ${sts.length} Spells/Traps`);
}

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (args[0] === '--index') await index();
else if (opt('--artworks')) for (const n of opt('--artworks').split(',')) await artworks(n.trim());
else if (opt('--passcodes')) {
  const out = opt('--out');
  if (!out) throw new Error('--passcodes needs --out <file>');
  write(out, await factsFor(opt('--passcodes').split(',').map((s) => +s.trim()).filter(Boolean)));
} else if (args[0] && !args[0].startsWith('--')) await deckFacts(args[0]);
else {
  console.error('usage: finder-card-data.mjs <deck-file-id> | --passcodes <list> --out <file> | --artworks <file,...> | --index');
  process.exit(1);
}
