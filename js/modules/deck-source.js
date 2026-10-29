/**
 * Which deckbuilding site a deck URL or ID names, and fetching that deck. The
 * one home of the detection rules: URL import (add + edit) and deck export
 * (#377) both go through here. DeckCheck is import-only: deckSourceSite
 * returns null for it, so its decks export like decks with no source.
 */

import { importFromMoxfield, extractMoxfieldId } from './moxfield.js';
import { importFromArchidekt, extractArchidektId } from './archidekt.js';
import { importFromDeckCheck, extractDeckCheckUrl } from './deckcheck.js';

/** @returns {'moxfield'|'archidekt'|null} */
export function deckSourceSite(urlOrId) {
  if (typeof urlOrId !== 'string') return null;
  if (urlOrId.includes('archidekt.com') || extractArchidektId(urlOrId)) {
    return urlOrId.includes('archidekt.com') || /^\d+$/.test(urlOrId) ? 'archidekt' : 'moxfield';
  }
  if (urlOrId.includes('moxfield.com') || extractMoxfieldId(urlOrId)) return 'moxfield';
  return null;
}

/**
 * Detect a deck URL/ID's source and fetch it.
 * @returns {Promise<{serviceName: string, deckData: Object}>}
 * @throws if the source can't be detected.
 */
export async function resolveDeckSource(urlOrId) {
  if (extractDeckCheckUrl(urlOrId)) return { serviceName: 'DeckCheck', deckData: await importFromDeckCheck(urlOrId) };
  const site = deckSourceSite(urlOrId);
  if (site === 'archidekt') return { serviceName: 'Archidekt', deckData: await importFromArchidekt(urlOrId) };
  if (site === 'moxfield') return { serviceName: 'Moxfield', deckData: await importFromMoxfield(urlOrId) };
  throw new Error('Could not detect deck source. Please use a Moxfield, Archidekt or DeckCheck URL.');
}
