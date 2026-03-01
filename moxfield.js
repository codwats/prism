/**
 * PRISM Moxfield Integration
 * Handles importing decks from Moxfield URLs
 */

/**
 * Extract deck ID from a Moxfield URL or raw ID
 * @param {string} input - Moxfield URL or deck ID
 * @returns {string|null} The deck ID or null if invalid
 */
export function extractMoxfieldId(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Handle full URL: https://www.moxfield.com/decks/abc123xyz
  const urlMatch = trimmed.match(/moxfield\.com\/decks\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];

  // Handle direct ID (alphanumeric with underscores/hyphens)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Fetch deck data from Moxfield via Netlify function proxy
 * @param {string} publicId - The Moxfield deck ID
 * @returns {Promise<Object>} The deck data
 */
export async function fetchMoxfieldDeck(publicId) {
  const response = await fetch('/.netlify/functions/moxfield', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch deck: ${response.status}`);
  }

  return response.json();
}

/**
 * Transform Moxfield deck data to PRISM format
 * @param {Object} moxfieldDeck - Raw Moxfield API response
 * @returns {Object} PRISM-compatible deck data
 */
export function transformMoxfieldDeck(moxfieldDeck) {
  const cards = [];
  let commander = null;

  // Process commanders first
  if (moxfieldDeck.boards?.commanders?.cards) {
    for (const [cardName, cardData] of Object.entries(moxfieldDeck.boards.commanders.cards)) {
      // Use first commander as the deck's commander
      if (!commander) {
        commander = cardData.card.name;
      }
      cards.push({
        name: cardData.card.name,
        quantity: cardData.quantity || 1,
        isCommander: true,
        isBasicLand: false
      });
    }
  }

  // Process mainboard
  if (moxfieldDeck.boards?.mainboard?.cards) {
    for (const [cardName, cardData] of Object.entries(moxfieldDeck.boards.mainboard.cards)) {
      const card = cardData.card;
      const isBasicLand = isBasicLandCard(card);

      cards.push({
        name: card.name,
        quantity: cardData.quantity || 1,
        isCommander: false,
        isBasicLand
      });
    }
  }

  // Process companions (add to mainboard)
  if (moxfieldDeck.boards?.companions?.cards) {
    for (const [cardName, cardData] of Object.entries(moxfieldDeck.boards.companions.cards)) {
      cards.push({
        name: cardData.card.name,
        quantity: cardData.quantity || 1,
        isCommander: false,
        isBasicLand: false
      });
    }
  }

  return {
    name: moxfieldDeck.name || 'Imported Deck',
    commander,
    format: moxfieldDeck.format || 'commander',
    cards,
    source: 'moxfield',
    sourceUrl: moxfieldDeck.publicUrl || null,
    sourceId: moxfieldDeck.publicId || null
  };
}

/**
 * Check if a card is a basic land
 * @param {Object} card - Moxfield card object
 * @returns {boolean}
 */
function isBasicLandCard(card) {
  if (!card) return false;

  // Check type line for basic land
  const typeLine = (card.type_line || card.type || '').toLowerCase();
  if (typeLine.includes('basic') && typeLine.includes('land')) {
    return true;
  }

  // Check by name for basic lands (including snow basics)
  const basicLandNames = [
    'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
    'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
    'snow-covered mountain', 'snow-covered forest'
  ];
  const cardName = (card.name || '').toLowerCase();
  return basicLandNames.includes(cardName);
}

/**
 * Import a deck from Moxfield URL
 * @param {string} urlOrId - Moxfield URL or deck ID
 * @returns {Promise<Object>} Transformed deck data ready for PRISM
 */
export async function importFromMoxfield(urlOrId) {
  const publicId = extractMoxfieldId(urlOrId);
  if (!publicId) {
    throw new Error('Invalid Moxfield URL or deck ID');
  }

  const moxfieldDeck = await fetchMoxfieldDeck(publicId);
  return transformMoxfieldDeck(moxfieldDeck);
}

/**
 * Convert PRISM deck data to decklist text format
 * @param {Object} deckData - Transformed deck data
 * @returns {string} Decklist in text format
 */
export function toDecklistText(deckData) {
  return deckData.cards
    .map(card => `${card.quantity} ${card.name}`)
    .join('\n');
}
