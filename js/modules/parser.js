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
 * Only includes cards from maindeck and commander sections, plus the
 * sideboard (flagged isSideboard) when `keepSideboard` is set: a Constructed
 * deck's sideboard shares its deck box (#29); a Commander deck's is a maybe pile.
 * Cards under a `Commander` header are flagged isCommander (unbounded count) —
 * the parsed text is the sole commander authority (#147).
 * @param {string} decklist - The full decklist text
 * @param {{ keepSideboard?: boolean }} [options]
 * @returns {Object} Result with cards array, errors, and excludedLines
 *   (verbatim lines of non-included sections, headers included, so rewrites
 *   can preserve sideboard/maybeboard text)
 */
export function parseDecklist(decklist, { keepSideboard = false } = {}) {
  const lines = decklist.split('\n');
  const cards = [];
  const errors = [];
  const excludedLines = [];

  // Track which section we're in: 'main', 'sideboard', 'commander', 'companion', 'maybeboard'
  let currentSection = 'main';

  // Sections whose cards we want to include
  const includeSections = new Set(['main', 'commander', 'companion', ...(keepSideboard ? ['sideboard'] : [])]);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmedLine = line.trim();
    const upperLine = trimmedLine.toUpperCase();

    // Check for section headers. MTGO's `SB: 2 Duress` is a header and a card.
    if (upperLine.startsWith('SB:')) {
      currentSection = 'sideboard';
      line = trimmedLine.slice(3);
      if (!keepSideboard) {
        excludedLines.push(trimmedLine);
        continue;
      }
      if (!line.trim()) continue;
    } else if (upperLine.startsWith('SIDEBOARD')) {
      currentSection = 'sideboard';
      if (!keepSideboard) excludedLines.push(trimmedLine);
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
    if (currentSection === 'sideboard') result.isSideboard = true;

    // Main and sideboard copies of one card stay separate rows (the text and
    // export keep the split); processCards sums them for marking.
    const normalizedName = result.name.toLowerCase().trim();
    const existingCard = cards.find(c => c.name.toLowerCase().trim() === normalizedName
      && !!c.isSideboard === !!result.isSideboard);
    if (existingCard) {
      // Same section twice = separate printings (e.g. Archidekt basics per set): sum them.
      // Commander also listed in Deck = one card: flag it, don't double-count.
      if (!!result.isCommander === !!existingCard.isCommander) {
        existingCard.quantity += result.quantity;
      } else if (result.isCommander) {
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
 * it is omitted when no card is flagged. A trailing Sideboard section carries
 * isSideboard rows (#29).
 * @param {Array} cards - Card objects ({ name, quantity, isCommander, isSideboard? })
 * @returns {string}
 */
export function cardsToDecklistText(cards) {
  const line = (c) => `${c.quantity} ${c.name}`;
  const side = (cards || []).filter(c => c.isSideboard);
  const commanders = (cards || []).filter(c => c.isCommander && !c.isSideboard);
  const rest = (cards || []).filter(c => !c.isCommander && !c.isSideboard);
  const sections = [];
  if (commanders.length > 0) {
    sections.push(['Commander', ...commanders.map(line)]);
    if (rest.length > 0) sections.push(['Deck', ...rest.map(line)]);
  } else if (rest.length > 0) {
    sections.push(rest.map(line));
  }
  if (side.length > 0) sections.push(['Sideboard', ...side.map(line)]);
  return sections.map(s => s.join('\n')).join('\n\n');
}

/**
 * A deck's cards as one row per card (#29): a card's main and sideboard rows
 * share the deck's mark, so marking, removals and returns see their summed
 * copies. The first row's other fields win; the inputs are not mutated.
 * @param {Array} cards - a deck's card rows
 * @returns {Array}
 */
export function markingCards(cards) {
  const byName = new Map();
  for (const card of cards || []) {
    const key = normalizeCardName(card.name);
    const hit = byName.get(key);
    if (hit) hit.quantity += card.quantity || 1;
    else byName.set(key, { ...card, quantity: card.quantity || 1 });
  }
  return [...byName.values()];
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
