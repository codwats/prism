/**
 * Which deckbuilding site a deck URL or ID names, and fetching that deck. The
 * one home of the detection rules: URL import (add + edit) and deck export
 * (#377) both go through here. DeckCheck and Commander Template are import-only:
 * deckSourceSite returns null for them, so their decks export like decks with no source.
 */

import { importFromMoxfield, extractMoxfieldId } from './moxfield.js';
import { importFromArchidekt, extractArchidektId } from './archidekt.js';
import { importFromDeckCheck, extractDeckCheckUrl } from './deckcheck.js';
import { importFromCommanderTemplate, extractCommanderTemplateUrl } from './commandertemplate.js';

/** @returns {'moxfield'|'archidekt'|null} */
export function deckSourceSite(urlOrId) {
  if (typeof urlOrId !== 'string' || extractCommanderTemplateUrl(urlOrId)) return null;
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
  // First: its pattern is anchored, DeckCheck's is not and would match a deckcheck URL in a query.
  if (extractCommanderTemplateUrl(urlOrId)) return { serviceName: 'Commander Template', deckData: await importFromCommanderTemplate(urlOrId) };
  if (extractDeckCheckUrl(urlOrId)) return { serviceName: 'DeckCheck', deckData: await importFromDeckCheck(urlOrId) };
  const site = deckSourceSite(urlOrId);
  if (site === 'archidekt') return { serviceName: 'Archidekt', deckData: await importFromArchidekt(urlOrId) };
  if (site === 'moxfield') return { serviceName: 'Moxfield', deckData: await importFromMoxfield(urlOrId) };
  throw new Error('Could not detect deck source. Please use a Moxfield, Archidekt, DeckCheck or Commander Template URL.');
}
