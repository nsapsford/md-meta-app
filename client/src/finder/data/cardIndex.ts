// Every Master Duel card, for naming the cards on their field (card-index.txt, the artifact's
// format: a JSON header of lookup tables, then `===`, one monster per line, `===`, one Spell/Trap
// per line, fields tab-separated). Loaded on demand; written by scripts/finder-card-data.mjs --index.
//
// Monster line: name, ATK, DEF, attribute index, type index, kind index, interruption index.
// Spell/Trap line: name, interruption index, `S` or `T`.

export interface IndexCard {
  name: string; mon: boolean; atk?: number; def?: number; level?: number; attr?: string; race?: string;
  kind?: 'main' | 'fusion' | 'synchro' | 'xyz' | 'link'; st?: 'S' | 'T';
  /** What the card is assumed to do on your turn: a hand-trap data `boardOptions` kind, or ''. */
  intr?: string;
}
export type CardIndex = { all: IndexCard[]; by: Map<string, IndexCard> };

const KINDS = ['main', 'fusion', 'synchro', 'xyz', 'link'] as const;
/** The artifact's index names one interruption by its old word; the vocabulary's word for it. */
const INTR_ALIASES: Record<string, string> = { imperm: 'negFieldMon' };

export function parseCardIndex(text: string): CardIndex {
  const all: IndexCard[] = [];
  const by = new Map<string, IndexCard>();
  const parts = text.replace(/\r\n/g, '\n').split('\n===\n');
  if (parts.length < 3) return { all, by };
  const meta = JSON.parse(parts[0]) as { attrs: string[]; races: string[]; intrs: string[] };
  const intr = (i: string) => { const k = meta.intrs[+i] || ''; return INTR_ALIASES[k] ?? k; };
  for (const r of parts[1].split('\n')) {
    const f = r.split('\t');
    if (f.length < 7) continue;
    all.push({ name: f[0], mon: true, atk: +f[1], def: +f[2], attr: meta.attrs[+f[3]] || '?', race: meta.races[+f[4]] || '', kind: KINDS[+f[5]] || 'main', intr: intr(f[6]) });
  }
  for (const r of parts[2].split('\n')) {
    const f = r.split('\t');
    if (f.length < 3) continue;
    all.push({ name: f[0], mon: false, intr: intr(f[1]), st: f[2] === 'S' ? 'S' : 'T' });
  }
  for (const c of all) by.set(c.name.toLowerCase(), c);
  return { all, by };
}

let loading: Promise<CardIndex> | null = null;

/** The shipped index, fetched and parsed once. */
export function loadCardIndex(): Promise<CardIndex> {
  if (!loading) loading = import('./card-index.txt?raw').then((m) => parseCardIndex(m.default));
  return loading;
}

/**
 * Cards whose name contains `q` (case ignored): names starting with it first, then a word
 * starting with it, then anywhere; cards that interrupt before ones that do not; shorter names first.
 */
export function searchIndex(ix: CardIndex, q: string, limit: number): IndexCard[] {
  const lq = q.trim().toLowerCase();
  if (!lq) return [];
  const out: [number, number, number, IndexCard][] = [];
  for (const c of ix.all) {
    const lc = c.name.toLowerCase();
    const at = lc.indexOf(lq);
    if (at < 0) continue;
    const sc = at === 0 ? 0 : /[\s\-,:"']/.test(lc[at - 1]) ? 1 : 2;
    out.push([sc, c.intr ? 0 : 1, c.name.length, c]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return out.slice(0, limit).map((x) => x[3]);
}
