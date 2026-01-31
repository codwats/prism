/**
 * Decklist Parser
 * Parses MTGO/Moxfield/Archidekt format decklists
 */

import { Card, ParseResult, ParseError, ParseWarning } from './types.js';
import { normalizeCardName } from '../utils/normalizer.js';

/**
 * Parses a decklist string into structured card data
 *
 * Format expected:
 * 1 Card Name
 * 12 Island
 * 1 Another Card
 *
 * Ignores:
 * - Empty lines
 * - Lines after "SIDEBOARD:"
 * - Lines starting with "//"
 *
 * @param decklist - Raw decklist text
 * @returns ParseResult with cards, errors, and warnings
 */
export function parseDecklist(decklist: string): ParseResult {
  const cards: Card[] = [];
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];
  const seenCards = new Set<string>();

  const lines = decklist.split('\n');
  let inSideboard = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    let line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      continue;
    }

    // Check for sideboard marker
    if (line.toUpperCase().startsWith('SIDEBOARD')) {
      inSideboard = true;
      continue;
    }

    // Ignore sideboard cards
    if (inSideboard) {
      continue;
    }

    // Skip comment lines
    if (line.startsWith('//')) {
      continue;
    }

    // Parse quantity and card name
    // Format: "1 Card Name" or "12 Island"
    const match = line.match(/^(\d+)\s+(.+)$/);

    if (!match) {
      errors.push({
        line: lineNumber,
        text: line,
        reason: 'Invalid format: Expected "quantity cardname" (e.g., "1 Sol Ring")',
      });
      continue;
    }

    const quantity = parseInt(match[1], 10);
    const rawCardName = match[2].trim();
    const cardName = normalizeCardName(rawCardName);

    if (!cardName) {
      errors.push({
        line: lineNumber,
        text: line,
        reason: 'Empty card name after parsing',
      });
      continue;
    }

    // Check for duplicate cards (Commander singleton violation)
    // Exception: Basic lands are allowed as multiples
    const normalizedLower = cardName.toLowerCase();
    const isBasicLand = ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'].includes(normalizedLower);

    if (seenCards.has(normalizedLower) && !isBasicLand) {
      warnings.push({
        line: lineNumber,
        text: line,
        message: `Duplicate card "${cardName}" (Commander is singleton format)`,
      });
    } else {
      seenCards.add(normalizedLower);
    }

    cards.push({
      name: cardName,
      quantity,
    });
  }

  return {
    cards,
    errors,
    warnings,
  };
}

/**
 * Validates that a parsed decklist has a reasonable number of cards
 * Commander decks should have exactly 100 cards
 *
 * @param cards - Parsed cards
 * @returns Validation message or null if valid
 */
export function validateDeckSize(cards: Card[]): string | null {
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);

  if (totalCards === 0) {
    return 'Deck is empty (0 cards)';
  }

  if (totalCards < 50) {
    return `Deck only has ${totalCards} cards (Commander decks should have 100)`;
  }

  if (totalCards > 150) {
    return `Deck has ${totalCards} cards (Commander decks should have 100)`;
  }

  if (totalCards !== 100) {
    return `Note: Deck has ${totalCards} cards (Commander format expects 100)`;
  }

  return null;
}
