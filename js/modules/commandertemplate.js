/**
 * PRISM Commander Template Integration (#493)
 * Imports decks from commandertemplate.com URLs. The site has no API, so the
 * edge proxy reads the deck page and returns the finished deck
 * (netlify/edge-functions/lib/commandertemplate-page.js).
 */

import { importError } from './import-error.js';

/**
 * Extract a Commander Template deck URL. Bare IDs aren't accepted: a UUID says
 * nothing about the site.
 * @param {string} input - commandertemplate.com/decks/<uuid> URL
 * @returns {string|null} The canonical deck URL or null if invalid
 */
export function extractCommanderTemplateUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().match(/^https?:\/\/(?:www\.)?commandertemplate\.com\/decks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
  return match ? `https://commandertemplate.com/decks/${match[1].toLowerCase()}` : null;
}

/**
 * Import a deck from a Commander Template URL
 * @param {string} url - Commander Template deck URL
 * @returns {Promise<Object>} Deck data ready for PRISM
 */
export async function importFromCommanderTemplate(url) {
  const deckUrl = extractCommanderTemplateUrl(url);
  if (!deckUrl) throw new Error('Invalid Commander Template URL');

  const response = await fetch('/api/commandertemplate-edge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckUrl })
  });
  if (!response.ok) throw await importError(response);

  const { name, bracket, cards } = await response.json();
  return { name: name || 'Imported Deck', format: 'commander', bracket, cards, source: 'commandertemplate', sourceUrl: deckUrl };
}
