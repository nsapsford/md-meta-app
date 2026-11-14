/**
 * Master Duel Meta (tournament data) and Untapped (ladder data) name the same archetypes
 * differently. Untapped's names are the ladder view's identity; this maps MDM's names
 * onto them so tournament power, thumbnails and card art can be attached to the right deck.
 */

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** MDM name -> Untapped name. Only unambiguous renames belong here. */
const MDM_TO_UNTAPPED: Record<string, string> = {
  'elfnote kewl tune': 'Kewl Tune',
  'magistus fairy tail': 'Fairy Tail',
  resonators: 'Resonator',
  synchrons: 'Syncron',
  heros: 'Hero',
  'snake-eye yummy': 'Snake Eyes Yummy',
  'mitsurugi yummy': 'Yummy Mitsurugi',
};

/**
 * MDM publishes "<X> Engine" rows that add up every deck running the engine (Elfnote
 * Engine, Yummy Engine, ...). They are not decks, and the same games are already counted
 * under the archetypes themselves, so they are left out of the ladder tier list.
 */
export function isEngineAggregate(name: string): boolean {
  return /\sengine$/i.test(name.trim());
}

/** The Untapped archetype name an MDM deck name refers to (itself when there is no rename). */
export function toUntappedName(mdmName: string): string {
  return MDM_TO_UNTAPPED[key(mdmName)] ?? mdmName;
}

/** Lookup key that treats an MDM name and its Untapped counterpart as the same deck. */
export function deckKey(name: string): string {
  return key(toUntappedName(name));
}

/** URL-safe id for a deck that only exists on Untapped. */
export function slugId(name: string): string {
  return `ladder-${key(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
