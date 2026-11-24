// Loading a deck file by id, with the shared files it `uses`, the card facts of both and the
// hand-trap data. Every file in files/ is its own lazily-loaded chunk. The facts of a file
// `x.json` are in `x.cards.json`. Nothing here knows a card.

import type { CardFacts, HandTrapFile } from './schema';

const FILES = import.meta.glob<{ default: unknown }>('./files/*.json');
const HAND_TRAPS = './files/hand-traps.json';

export interface LoadedDeck { file: unknown; shared: Record<string, unknown>; facts: CardFacts[]; traps: HandTrapFile }

async function json(name: string): Promise<unknown> {
  const load = FILES[`./files/${name}.json`];
  if (!load) throw new Error(`no deck file "${name}"`);
  return (await load()).default;
}

/** The deck file `fileId` and what it needs; `traps` are for the page, the worker gets the rest. */
export async function loadDeck(fileId: string): Promise<LoadedDeck> {
  const [file, traps] = await Promise.all([json(fileId), FILES[HAND_TRAPS]().then((m) => m.default as HandTrapFile)]);
  const uses = (file as { uses?: unknown }).uses;
  const names = Array.isArray(uses) ? uses.filter((u): u is string => typeof u === 'string') : [];
  const [sharedFiles, factLists] = await Promise.all([
    Promise.all(names.map(json)),
    Promise.all([...names, fileId].map((n) => json(`${n}.cards`) as Promise<CardFacts[]>)),
  ]);
  const shared: Record<string, unknown> = {};
  names.forEach((n, i) => { shared[n] = sharedFiles[i]; });
  return { file, shared, facts: factLists.flat(), traps };
}
