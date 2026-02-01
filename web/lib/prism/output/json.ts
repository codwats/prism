/**
 * JSON Output Generator
 * Generates JSON file for programmatic use and future re-import
 */

import { ProcessedData, PrismExport } from '../core/types';

/**
 * Generates JSON export from processed data
 *
 * @param data - Processed deck data
 * @returns JSON export object
 */
export function generateJSON(data: ProcessedData): PrismExport {
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    decks: data.decks.map(deck => ({
      id: deck.id,
      name: deck.name,
      commander: deck.commander,
      bracket: deck.bracket,
      assignedColor: deck.assignedColor,
      cardCount: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
    })),
    cards: data.cards.map(card => ({
      name: card.name,
      totalDecks: card.totalDecks,
      deckIds: card.deckIds,
      markSlots: card.markSlots,
    })),
    colorPalette: data.colorPalette,
  };
}

