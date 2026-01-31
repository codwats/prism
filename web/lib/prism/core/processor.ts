/**
 * Card Processor
 * Deduplicates cards across decks and generates marking instructions
 */

import {
  Deck,
  ProcessedCard,
  ProcessedData,
  Statistics,
  MarkSlot,
  COLOR_PALETTE,
} from './types.js';
import { getCardKey } from '../utils/normalizer.js';

/**
 * Assigns colors to decks based on entry order
 * Preserves existing color assignments when loading from JSON
 *
 * @param decks - Array of decks
 * @returns Map of deck ID to color
 */
export function assignColors(decks: Deck[]): Record<string, string> {
  const colorPalette: Record<string, string> = {};
  const usedColors = new Set<string>();

  // First pass: preserve existing color assignments
  decks.forEach(deck => {
    if (deck.assignedColor) {
      colorPalette[deck.id] = deck.assignedColor;
      usedColors.add(deck.assignedColor);
    }
  });

  // Second pass: assign colors to new decks
  let colorIndex = 0;
  decks.forEach(deck => {
    if (!deck.assignedColor) {
      // Find next available color
      while (colorIndex < COLOR_PALETTE.length && usedColors.has(COLOR_PALETTE[colorIndex])) {
        colorIndex++;
      }

      if (colorIndex >= COLOR_PALETTE.length) {
        throw new Error(`Too many decks (${decks.length}). Maximum is ${COLOR_PALETTE.length}`);
      }

      colorPalette[deck.id] = COLOR_PALETTE[colorIndex];
      deck.assignedColor = COLOR_PALETTE[colorIndex];
      usedColors.add(COLOR_PALETTE[colorIndex]);
      colorIndex++;
    }
  });

  return colorPalette;
}

/**
 * Processes all decks and generates card marking data
 *
 * @param decks - Array of decks to process
 * @returns Processed data with deduplicated cards and statistics
 */
export function processDecks(decks: Deck[]): ProcessedData {
  // Assign colors to decks
  const colorPalette = assignColors(decks);

  // Build card index (card name -> deck IDs)
  const cardIndex = new Map<string, Set<string>>();

  for (const deck of decks) {
    for (const card of deck.cards) {
      const cardKey = getCardKey(card.name);

      if (!cardIndex.has(cardKey)) {
        cardIndex.set(cardKey, new Set());
      }

      cardIndex.get(cardKey)!.add(deck.id);
    }
  }

  // Build processed cards with mark slot information
  const processedCards: ProcessedCard[] = [];

  for (const [cardKey, deckIds] of cardIndex.entries()) {
    // Get the canonical card name (from first occurrence)
    const firstDeck = decks.find(d => deckIds.has(d.id))!;
    const cardName = firstDeck.cards.find(c => getCardKey(c.name) === cardKey)!.name;

    // Build mark slots
    // IMPORTANT: Each deck has a FIXED global position (deck index + 1)
    // This allows users to visually scan one stripe position to see all cards for that deck
    const markSlots: MarkSlot[] = [];
    const colors: string[] = [];

    // Calculate max quantity needed (important for basic lands)
    let maxQuantity = 1; // Default for singleton cards

    // Iterate through ALL decks in order to maintain fixed positions
    decks.forEach((deck, deckIndex) => {
      if (deckIds.has(deck.id)) {
        // Find this card in the deck to get its quantity
        const cardInDeck = deck.cards.find(c => getCardKey(c.name) === cardKey);
        if (cardInDeck && cardInDeck.quantity > maxQuantity) {
          maxQuantity = cardInDeck.quantity;
        }

        const slot: MarkSlot = {
          position: deckIndex + 1, // Global position! Deck 0 = position 1, etc.
          color: deck.assignedColor,
          deckName: deck.name,
          deckId: deck.id,
          bracket: deck.bracket,
        };

        markSlots.push(slot);
        colors.push(deck.assignedColor);
      }
    });

    processedCards.push({
      name: cardName,
      totalDecks: deckIds.size,
      deckIds: Array.from(deckIds),
      markSlots,
      markSummary: colors.join(', '),
      maxQuantity,
    });
  }

  // Sort cards: most shared first, then alphabetically
  processedCards.sort((a, b) => {
    if (a.totalDecks !== b.totalDecks) {
      return b.totalDecks - a.totalDecks; // Descending by deck count
    }
    return a.name.localeCompare(b.name); // Alphabetically
  });

  // Calculate statistics
  const stats = calculateStatistics(decks, processedCards);

  return {
    decks,
    cards: processedCards,
    colorPalette,
    stats,
  };
}

/**
 * Calculates summary statistics
 *
 * @param decks - All decks
 * @param cards - Processed cards
 * @returns Statistics object
 */
function calculateStatistics(decks: Deck[], cards: ProcessedCard[]): Statistics {
  const totalDecks = decks.length;
  const totalUniqueCards = cards.length;

  const totalCardSlots = decks.reduce((sum, deck) => {
    return sum + deck.cards.reduce((cardSum, card) => cardSum + card.quantity, 0);
  }, 0);

  const sharedCards = cards.filter(c => c.totalDecks > 1).length;

  // Find top 5 most shared cards
  const mostShared = cards
    .filter(c => c.totalDecks > 1)
    .slice(0, 5)
    .map(c => ({
      name: c.name,
      count: c.totalDecks,
      decks: c.markSlots.map(slot => slot.deckName),
    }));

  return {
    totalDecks,
    totalUniqueCards,
    totalCardSlots,
    sharedCards,
    mostSharedCards: mostShared,
  };
}
