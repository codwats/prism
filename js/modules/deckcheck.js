/**
 * PRISM DeckCheck Integration
 * Handles importing decks from DeckCheck URLs (deckcheck.co/docs/api#get-deck)
 */

/**
 * Extract a DeckCheck deck URL. Bare IDs aren't accepted: they look like
 * Moxfield IDs, so only the deckcheck.co URL says which site it is.
 * @param {string} input - DeckCheck deckview/decklist/builder URL
 * @returns {string|null} The canonical decklist URL or null if invalid
 */
export function extractDeckCheckUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().match(/deckcheck\.co\/app\/(?:deckview|decklist|builder)\/([A-Za-z0-9_-]+)/);
  return match ? `https://deckcheck.co/app/decklist/${match[1]}` : null;
}

/**
 * Fetch deck data from DeckCheck via Netlify Edge Function
 * @param {string} deckUrl - DeckCheck decklist URL
 * @returns {Promise<Object>} The deck data
 */
export async function fetchDeckCheckDeck(deckUrl) {
  const response = await fetch('/api/deckcheck-edge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckUrl })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch deck: ${response.status}`);
  }

  return response.json();
}

/**
 * Transform DeckCheck deck data to PRISM format. Only the commanders and
 * mainboard boards count; sideboard and considering are out of the deck.
 * @param {Object} deckCheckDeck - Raw DeckCheck API response
 * @returns {Object} PRISM-compatible deck data
 */
export function transformDeckCheckDeck(deckCheckDeck) {
  const cards = [];
  const boards = deckCheckDeck.boards || {};

  for (const entry of Object.values(boards.commanders?.cards || {})) {
    cards.push({ name: entry.card.name, quantity: entry.quantity || 1, isCommander: true, isBasicLand: false });
  }

  for (const entry of Object.values(boards.mainboard?.cards || {})) {
    const typeLine = (entry.card.typeLine || '').toLowerCase();
    cards.push({
      name: entry.card.name,
      quantity: entry.quantity || 1,
      isCommander: false,
      isBasicLand: typeLine.includes('basic') && typeLine.includes('land')
    });
  }

  return {
    name: deckCheckDeck.name || 'Imported Deck',
    format: deckCheckDeck.format || 'commander',
    bracket: deckCheckDeck.bracket ?? null,
    cards,
    source: 'deckcheck',
    sourceUrl: deckCheckDeck.publicUrl || null,
    sourceId: deckCheckDeck.publicId || null
  };
}

/**
 * Import a deck from a DeckCheck URL
 * @param {string} url - DeckCheck deck URL
 * @returns {Promise<Object>} Transformed deck data ready for PRISM
 */
export async function importFromDeckCheck(url) {
  const deckUrl = extractDeckCheckUrl(url);
  if (!deckUrl) {
    throw new Error('Invalid DeckCheck URL');
  }

  const deckCheckDeck = await fetchDeckCheckDeck(deckUrl);
  return transformDeckCheckDeck(deckCheckDeck);
}
