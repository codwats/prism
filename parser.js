/**
 * PRISM Decklist Parser
 * Parses MTGO/Moxfield format decklists into structured card data
 */

// Basic land names for special handling
const BASIC_LANDS = ['island', 'mountain', 'plains', 'forest', 'swamp', 'wastes'];

/**
 * Check if a card name is a basic land
 * @param {string} cardName - The card name to check
 * @returns {boolean}
 */
export function isBasicLand(cardName) {
  return BASIC_LANDS.includes(cardName.toLowerCase().trim());
}

/**
 * Parse a single line of a decklist
 * @param {string} line - A single line from the decklist
 * @returns {Object|null} Parsed card object or null if invalid
 */
export function parseLine(line) {
  // Trim whitespace
  const trimmed = line.trim();

  // Skip empty lines
  if (!trimmed) return null;

  // Skip comments
  if (trimmed.startsWith('//')) return null;
  
  // Match pattern: <quantity> <card name>
  // Quantity is one or more digits, followed by space(s), then card name
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  
  if (!match) {
    // Could be a card name without quantity (assume 1)
    // But for strict parsing, we'll return an error indicator
    return { error: true, line: trimmed };
  }
  
  const quantity = parseInt(match[1], 10);
  const cardName = match[2].trim();
  
  if (quantity < 1 || !cardName) {
    return { error: true, line: trimmed };
  }
  
  return {
    name: cardName,
    quantity: quantity,
    isBasicLand: isBasicLand(cardName),
    isCommander: false // Will be set later based on deck commander
  };
}

/**
 * Parse a complete decklist string
 * Handles Moxfield/MTGO format with sections:
 *   Main deck cards
 *   Sideboard:
 *   sideboard cards
 *   Commander
 *   commander card
 * Only includes cards from maindeck and commander sections.
 * @param {string} decklist - The full decklist text
 * @param {string} commanderName - The commander's name for flagging
 * @returns {Object} Result with cards array and any errors
 */
export function parseDecklist(decklist, commanderName = '') {
  const lines = decklist.split('\n');
  const cards = [];
  const errors = [];

  const normalizedCommander = commanderName.toLowerCase().trim();

  // Track which section we're in: 'main', 'sideboard', 'commander', 'companion', 'maybeboard'
  let currentSection = 'main';

  // Sections whose cards we want to include
  const includeSections = new Set(['main', 'commander', 'companion']);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const upperLine = trimmedLine.toUpperCase();

    // Check for section headers
    if (upperLine.startsWith('SIDEBOARD') || upperLine === 'SB:' || upperLine.startsWith('SB:')) {
      currentSection = 'sideboard';
      continue;
    }
    if (upperLine.startsWith('COMMANDER')) {
      currentSection = 'commander';
      continue;
    }
    if (upperLine.startsWith('COMPANION')) {
      currentSection = 'companion';
      continue;
    }
    if (upperLine.startsWith('MAYBEBOARD') || upperLine.startsWith('CONSIDERING')) {
      currentSection = 'maybeboard';
      continue;
    }
    if (upperLine.startsWith('DECK') || upperLine === 'MAINBOARD' || upperLine === 'MAINBOARD:') {
      currentSection = 'main';
      continue;
    }

    // Skip cards in sections we don't want
    if (!includeSections.has(currentSection)) {
      continue;
    }

    const result = parseLine(line);

    // Null means skip (empty/comment)
    if (result === null) continue;

    // Check for parse errors
    if (result.error) {
      errors.push({
        lineNumber: i + 1,
        content: result.line,
        message: `Couldn't parse line: "${result.line}"`
      });
      continue;
    }

    // Flag if this is the commander (either by name match or by being in commander section)
    if (currentSection === 'commander') {
      result.isCommander = true;
    } else if (normalizedCommander && result.name.toLowerCase().trim() === normalizedCommander) {
      result.isCommander = true;
    }

    // Avoid duplicate cards (e.g. commander listed in both main and commander sections)
    const normalizedName = result.name.toLowerCase().trim();
    const existingCard = cards.find(c => c.name.toLowerCase().trim() === normalizedName);
    if (existingCard) {
      // If it's already in the list, just update commander flag if needed
      if (result.isCommander) {
        existingCard.isCommander = true;
      }
      continue;
    }

    cards.push(result);
  }

  return {
    cards,
    errors,
    totalCards: cards.reduce((sum, card) => sum + card.quantity, 0),
    uniqueCards: cards.length
  };
}

/**
 * Normalize a card name for comparison purposes
 * @param {string} cardName - The card name to normalize
 * @returns {string} Normalized (lowercase) card name
 */
export function normalizeCardName(cardName) {
  return cardName.toLowerCase().trim();
}

/**
 * Validate a decklist has minimum requirements
 * @param {Object} parseResult - Result from parseDecklist
 * @returns {Object} Validation result with isValid and messages
 */
export function validateDecklist(parseResult) {
  const messages = [];
  
  if (parseResult.cards.length === 0) {
    messages.push('No valid cards found in decklist');
  }
  
  if (parseResult.errors.length > 0) {
    messages.push(`${parseResult.errors.length} line(s) couldn't be parsed`);
  }
  
  // Commander deck should have ~100 cards, but we won't enforce strictly
  // Just warn if it seems off
  if (parseResult.totalCards < 10) {
    messages.push('Decklist seems very short (less than 10 cards)');
  }
  
  return {
    isValid: parseResult.cards.length > 0,
    messages,
    warnings: messages.filter(m => !m.includes('No valid cards'))
  };
}
