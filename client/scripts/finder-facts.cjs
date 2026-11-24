// Writes the card facts files next to the finder's deck files, converted from the reference's
// card data (src/finder/__harness__/reference/card-data.json):
//   pass_ -> passcode, dfn -> def, desc -> text; a Link Monster's `level` (its rating) -> link.
// For each deck file in src/finder/deck/files/*.json (not *.cards.json), <name>.cards.json holds
// one entry per card of that file, found by the reference name of its id (the reference's NAMES)
// and keyed by the card's first passcode (the deck file may list printings the reference lacks).
// Re-run after adding cards: node client/scripts/finder-facts.cjs

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'finder');
const dir = path.join(root, 'deck', 'files');
const ref = require(path.join(root, '__harness__', 'reference', 'engine.cjs'));
const data = require(path.join(root, '__harness__', 'reference', 'card-data.json'));
const byName = new Map(data.map((c) => [c.name, c]));

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('.cards.json')).sort()) {
  const deck = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const facts = deck.cards.map((card) => {
    const name = ref.NAMES[card.id];
    const c = name && byName.get(name);
    if (!c) throw new Error(`${f}: ${card.id} is not in the reference's card data`);
    const link = /Link/.test(c.type);
    return {
      passcode: card.passcodes[0], name: c.name, type: c.type, race: c.race ?? null, attr: c.attr ?? null,
      level: link ? null : c.level ?? null, link: link ? c.level ?? null : null,
      atk: c.atk ?? null, def: c.dfn ?? null, text: c.desc,
    };
  });
  const out = path.join(dir, f.replace(/\.json$/, '.cards.json'));
  fs.writeFileSync(out, JSON.stringify(facts, null, 2) + '\n');
  console.log(`${path.basename(out)}: ${facts.length} cards`);
}
