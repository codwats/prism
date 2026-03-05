/**
 * PRISM Archidekt Integration
 * Handles importing decks from Archidekt URLs
 */

/**
 * Extract deck ID from an Archidekt URL or raw ID
 * @param {string} input - Archidekt URL or deck ID
 * @returns {string|null} The deck ID or null if invalid
 */
export function extractArchidektId(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Handle full URL: https://archidekt.com/decks/123456/deck-name
  const urlMatch = trimmed.match(/archidekt\.com\/decks\/(\d+)/);
  if (urlMatch) return urlMatch[1];

  // Handle direct numeric ID
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Fetch deck data from Archidekt via Netlify Edge Function
 * @param {string} deckId - The Archidekt deck ID
 * @returns {Promise<Object>} The deck data
 */
export async function fetchArchidektDeck(deckId) {
  const response = await fetch('/api/archidekt-edge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch deck: ${response.status}`);
  }

  return response.json();
}

/**
 * Transform Archidekt deck data to PRISM format
 * @param {Object} archidektDeck - Raw Archidekt API response
 * @returns {Object} PRISM-compatible deck data
 */
export function transformArchidektDeck(archidektDeck) {
  const cards = [];
  let commander = null;

  // Process cards from the deck
  if (archidektDeck.cards && Array.isArray(archidektDeck.cards)) {
    for (const cardEntry of archidektDeck.cards) {
      const card = cardEntry.card;
      const quantity = cardEntry.quantity || 1;
      const categories = cardEntry.categories || [];

      // Check if commander
      const isCommander = categories.some(cat =>
        cat.toLowerCase().includes('commander') ||
        cat.toLowerCase().includes('partner')
      );

      if (isCommander && !commander) {
        commander = card.oracleCard?.name || card.name;
      }

      const isBasicLand = isBasicLandCard(card);

      cards.push({
        name: card.oracleCard?.name || card.name,
        quantity,
        isCommander,
        isBasicLand
      });
    }
  }

  return {
    name: archidektDeck.name || 'Imported Deck',
    commander,
    format: archidektDeck.format?.name || 'commander',
    cards,
    source: 'archidekt',
    sourceUrl: `https://archidekt.com/decks/${archidektDeck.id}`,
    sourceId: String(archidektDeck.id)
  };
}

/**
 * Check if a card is a basic land
 * @param {Object} card - Archidekt card object
 * @returns {boolean}
 */
function isBasicLandCard(card) {
  if (!card) return false;

  // Check type line for basic land
  const typeLine = (card.oracleCard?.type || card.type || '').toLowerCase();
  if (typeLine.includes('basic') && typeLine.includes('land')) {
    return true;
  }

  // Check by name for basic lands
  const basicLandNames = [
    'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
    'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
    'snow-covered mountain', 'snow-covered forest'
  ];
  const cardName = (card.oracleCard?.name || card.name || '').toLowerCase();
  return basicLandNames.includes(cardName);
}

/**
 * Import a deck from Archidekt URL
 * @param {string} urlOrId - Archidekt URL or deck ID
 * @returns {Promise<Object>} Transformed deck data ready for PRISM
 */
export async function importFromArchidekt(urlOrId) {
  const deckId = extractArchidektId(urlOrId);
  if (!deckId) {
    throw new Error('Invalid Archidekt URL or deck ID');
  }

  const archidektDeck = await fetchArchidektDeck(deckId);
  return transformArchidektDeck(archidektDeck);
}
