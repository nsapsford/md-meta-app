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
