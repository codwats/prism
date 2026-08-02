/**
 * PRISM Decklist Parser
 * Parses MTGO/Moxfield format decklists into structured card data
 */

// Basic land names for special handling
const BASIC_LANDS = [
  'island', 'mountain', 'plains', 'forest', 'swamp', 'wastes',
  'snow-covered island', 'snow-covered mountain', 'snow-covered plains',
  'snow-covered forest', 'snow-covered swamp'
];

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
  const cardName = stripPrintingSuffix(match[2].trim());

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
 * Cards under a `Commander` header are flagged isCommander (unbounded count) —
 * the parsed text is the sole commander authority (#147).
 * @param {string} decklist - The full decklist text
 * @returns {Object} Result with cards array, errors, and excludedLines
 *   (verbatim lines of non-included sections, headers included, so rewrites
 *   can preserve sideboard/maybeboard text)
 */
export function parseDecklist(decklist) {
  const lines = decklist.split('\n');
  const cards = [];
  const errors = [];
  const excludedLines = [];

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
      excludedLines.push(trimmedLine);
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
      excludedLines.push(trimmedLine);
      continue;
    }
    if (upperLine.startsWith('DECK') || upperLine === 'MAINBOARD' || upperLine === 'MAINBOARD:') {
      currentSection = 'main';
      continue;
    }

    // Keep cards from sections we don't want out of the deck, but preserve
    // their text verbatim so a rewrite can re-emit them.
    if (!includeSections.has(currentSection)) {
      if (trimmedLine) excludedLines.push(trimmedLine);
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

    // Flag if this card is in the commander section
    if (currentSection === 'commander') {
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
    excludedLines,
    totalCards: cards.reduce((sum, card) => sum + card.quantity, 0),
    uniqueCards: cards.length
  };
}

/**
 * Serialize cards to decklist text with a Commander/Deck section structure.
 * The Commander section is the lossless carrier for N commander flags (#147);
 * it is omitted when no card is flagged.
 * @param {Array} cards - Card objects ({ name, quantity, isCommander })
 * @returns {string}
 */
export function cardsToDecklistText(cards) {
  const line = (c) => `${c.quantity} ${c.name}`;
  const commanders = (cards || []).filter(c => c.isCommander);
  const rest = (cards || []).filter(c => !c.isCommander);
  if (commanders.length === 0) return rest.map(line).join('\n');
  return [
    'Commander',
    ...commanders.map(line),
    '',
    'Deck',
    ...rest.map(line)
  ].join('\n');
}

/**
 * Rewrite a decklist's Commander section so the flagged set is exactly
 * `names` (#147 field→text sync). A name matching an existing line keeps its
 * quantity and moves into the section, never duplicated; an unmatched name is
 * added as a qty-1 card; every other card is unflagged. Unparseable lines and
 * excluded-section blocks (sideboard/maybeboard) are re-emitted verbatim.
 * ponytail: comments and formatting are normalized away — same as the Edit
 * re-open flatten has always done; preserve-in-place line surgery if it hurts.
 * @param {string} text - Current decklist text
 * @param {string[]} names - Commander names (order preserved in the section)
 * @returns {string}
 */
export function rewriteDecklistCommanders(text, names) {
  const parsed = parseDecklist(text);
  const wanted = names.map(n => n.trim()).filter(Boolean);
  const cards = parsed.cards.map(c => ({ ...c, isCommander: false }));

  const commanders = [];
  for (const name of wanted) {
    const norm = normalizeCardName(name);
    const idx = cards.findIndex(c => normalizeCardName(c.name) === norm);
    if (idx >= 0) {
      const [hit] = cards.splice(idx, 1);
      commanders.push({ ...hit, isCommander: true });
    } else {
      commanders.push({ name, quantity: 1, isCommander: true, isBasicLand: isBasicLand(name) });
    }
  }

  const parts = [cardsToDecklistText([...commanders, ...cards])];
  if (parsed.errors.length > 0) {
    parts.push(parsed.errors.map(e => e.content).join('\n'));
  }
  if (parsed.excludedLines.length > 0) {
    parts.push(parsed.excludedLines.join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * Normalize a card name for comparison purposes.
 * Strips back-face names from DFCs and split cards (e.g., "Dusk // Dawn" → "dusk").
 * @param {string} cardName - The card name to normalize
 * @returns {string} Normalized (lowercase, front-face only) card name
 */
export function normalizeCardName(cardName) {
  // Strip printing suffixes here too so decks stored before the parser
  // stripped them still dedup against clean names across decks.
  return stripPrintingSuffix(cardName.split(' // ')[0].trim()).toLowerCase();
}

/**
 * Strip set-code/collector-number/foil suffixes that some export formats
 * append, e.g. "Sol Ring (C21) 263" or "Sol Ring (C21) 263 *F*". Without
 * this, the same card pasted from different export flavors never dedups
 * across decks. Real card names with parentheses (e.g. un-set names like
 * "B.F.M. (Big Furry Monster)") are safe: the pattern only matches a short
 * alphanumeric set code, optionally followed by a collector number.
 * @param {string} name
 * @returns {string}
 */
export function stripPrintingSuffix(name) {
  return name
    .replace(/\s+\*[A-Za-z]+\*$/, '')                       // foil/etch markers: *F*, *E*
    .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[A-Za-z0-9★†-]+)?$/, '') // (SET) [collector]
    .trim();
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
