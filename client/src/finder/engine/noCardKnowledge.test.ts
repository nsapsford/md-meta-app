// No card knowledge in the solver: no card name, deck-file card id, short name or passcode from
// any file under deck/files/ appears in the solver's source (Global Constraints). Directories that
// do not exist yet are skipped; tests and the toy deck (__toy__) are not scanned.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../', import.meta.url));   // client/src/
const FILES = join(SRC, 'finder/deck/files');

/** What the solver may not contain, relative to client/src. */
const SCAN_DIRS = ['finder/engine', 'finder/worker', 'finder/model', 'components/finder'];
const SCAN_FILES = ['finder/deck/schema.ts', 'finder/deck/vocabulary.ts', 'finder/deck/compile.ts', 'finder/deck/match.ts'];
const BANNED_WORDS = ['mulcharmy', 'maxx', 'nibiru', 'droll', 'ash blossom', 'impermanence', 'veiler'];

interface Known { names: Set<string>; ids: Set<string>; shorts: Set<string>; passcodes: Set<number> }

/** Every card the deck files know: deck files' cards, card-facts files and the hand-trap data. */
function knownCards(dir = FILES): Known {
  const k: Known = { names: new Set(), ids: new Set(), shorts: new Set(), passcodes: new Set() };
  const codes = (x: unknown) => { for (const p of Array.isArray(x) ? x : x == null ? [] : [x]) if (typeof p === 'number') k.passcodes.add(p); };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (Array.isArray(j)) for (const c of j) { if (c.name) k.names.add(c.name); codes(c.passcode); }   // card facts
    for (const c of j.cards ?? []) { k.ids.add(c.id); if (c.short) k.shorts.add(c.short); codes(c.passcodes); }   // deck files
    for (const t of j.traps ?? []) {   // hand-trap data
      for (const n of [t.name, t.label]) if (n) k.names.add(n);
      if (t.short) k.shorts.add(t.short);
      k.ids.add(t.id);
      codes(t.passcodes);
    }
  }
  return k;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Each piece of card knowledge in `text`, as a short description ([] when there is none). */
function findCardKnowledge(text: string, k: Known): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const n of k.names) if (lower.includes(n.toLowerCase())) out.push(`name "${n}"`);
  for (const w of BANNED_WORDS) if (lower.includes(w)) out.push(`word "${w}"`);
  const quoted = (s: string) => new RegExp(`(['"\`])${esc(s)}\\1`).test(text);
  for (const id of k.ids) if (quoted(id)) out.push(`id '${id}'`);
  for (const s of k.shorts) if (quoted(s)) out.push(`short name '${s}'`);
  for (const p of k.passcodes) if (new RegExp(`(?<![\\w.])${p}(?![\\w.])`).test(text)) out.push(`passcode ${p}`);
  return out;
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== '__toy__') walk(p); continue; }
      if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
    }
  };
  for (const d of SCAN_DIRS) if (existsSync(join(SRC, d))) walk(join(SRC, d));
  for (const f of SCAN_FILES) if (existsSync(join(SRC, f))) out.push(join(SRC, f));
  return out;
}

describe('no card knowledge in the solver', () => {
  const known = knownCards();

  it('knows the cards of every deck file', () => {
    expect(known.ids.has('DM') && known.ids.has('ash')).toBe(true);
    expect(known.names.has('Dark Magician')).toBe(true);
    expect(known.passcodes.size).toBeGreaterThan(40);
  });

  it('finds each kind of card knowledge', () => {
    const k: Known = { names: new Set(['Dark Magician']), ids: new Set(['DM']), shorts: new Set(['Curtain']), passcodes: new Set([36996508]) };
    expect(findCardKnowledge(`// the dark magician\nif (x === 'DM') f("Curtain", 36996508); // nibiru`, k)).toEqual(['name "Dark Magician"', 'word "nibiru"', "id 'DM'", "short name 'Curtain'", 'passcode 36996508']);
    expect(findCardKnowledge(`const DMx = 'DMG'; n = 369965080; dm = 1;`, k)).toEqual([]);
  });

  it('scans the engine and the compiler', () => {
    const files = sourceFiles();
    expect(files.some((f) => f.endsWith('vocabulary.ts')) && files.some((f) => f.endsWith('search.ts'))).toBe(true);
  });

  it('no solver source names a card', () => {
    const hits: string[] = [];
    for (const f of sourceFiles()) {
      const found = findCardKnowledge(readFileSync(f, 'utf8'), known);
      if (found.length) hits.push(`${f.slice(SRC.length)}: ${found.join(', ')}`);
    }
    expect(hits.join('\n')).toBe('');
  });
});
