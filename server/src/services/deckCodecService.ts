import type { Pool } from '@neondatabase/serverless';
import { queryAll } from '../utils/dbHelpers.js';

export interface DeckPasscodes {
  main: number[];
  extra: number[];
  side: number[];
}

type Section = keyof DeckPasscodes;

export function parseYdk(text: string): DeckPasscodes {
  const deck: DeckPasscodes = { main: [], extra: [], side: [] };
  let section: Section | null = null;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line === '#main') { section = 'main'; continue; }
    if (line === '#extra') { section = 'extra'; continue; }
    if (line === '!side') { section = 'side'; continue; }
    if (line.startsWith('#') || line.startsWith('!')) continue; // other comments/sections

    if (section === null) continue; // tokens before any section header
    if (!/^\d+$/.test(line)) {
      throw new Error(`Invalid .ydk: non-numeric card id "${line}" on line ${i + 1}`);
    }
    deck[section].push(Number(line));
  }

  return deck;
}

export function buildYdk(deck: DeckPasscodes): string {
  const lines: string[] = ['#created by MD Meta', '#main'];
  for (const id of deck.main) lines.push(String(id));
  lines.push('#extra');
  for (const id of deck.extra) lines.push(String(id));
  lines.push('!side');
  for (const id of deck.side) lines.push(String(id));
  lines.push(''); // trailing newline
  return lines.join('\n');
}

export interface ResolvedCard {
  id: number;            // passcode
  name: string;
  type: string | null;
  image_small_url: string | null;
}

export interface ResolveResult {
  cards: ResolvedCard[];     // de-duplicated card info, in DB order
  unresolved: number[];      // passcodes with no matching card row
}

/** Map passcodes -> card info. Unknown passcodes returned in `unresolved`. */
export async function resolvePasscodes(pool: Pool, passcodes: number[]): Promise<ResolveResult> {
  const unique = [...new Set(passcodes)];
  if (unique.length === 0) return { cards: [], unresolved: [] };
  const rows = await queryAll<ResolvedCard>(pool,
    'SELECT id, name, type, image_small_url FROM cards WHERE id = ANY($1::int[])',
    [unique]
  );
  const found = new Set<number>(rows.map((r) => Number(r.id)));
  const unresolved = unique.filter((p) => !found.has(p));
  return { cards: rows, unresolved };
}

export interface NameResolveResult {
  resolved: Record<string, number>; // lowercased name -> passcode
  unresolved: string[];
}

/** Exact (case-insensitive) name -> passcode. */
export async function resolveNames(pool: Pool, names: string[]): Promise<NameResolveResult> {
  const unique = [...new Set(names.map((n) => n.toLowerCase()))];
  if (unique.length === 0) return { resolved: {}, unresolved: [] };
  const rows = await queryAll<{ id: number; name: string }>(pool,
    'SELECT id, name FROM cards WHERE LOWER(name) = ANY($1::text[])',
    [unique]
  );
  const resolved: Record<string, number> = {};
  for (const r of rows) resolved[r.name.toLowerCase()] = Number(r.id);
  const unresolved = unique.filter((n) => !(n in resolved));
  return { resolved, unresolved };
}
