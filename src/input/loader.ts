/**
 * JSON Loader
 * Loads and validates existing PRISM JSON files
 */

import { promises as fs } from 'fs';
import { Deck, PrismExport } from '../core/types.js';

/**
 * Loads a PRISM JSON file and converts it back to Deck objects
 *
 * @param filepath - Path to JSON file
 * @returns Array of decks from the JSON file
 */
export async function loadPrismJSON(filepath: string): Promise<Deck[]> {
  const content = await fs.readFile(filepath, 'utf-8');
  const data: PrismExport = JSON.parse(content);

  // Validate version
  if (!data.version || data.version !== '1.0') {
    throw new Error(`Unsupported PRISM version: ${data.version}`);
  }

  // Convert export format back to Deck objects
  const decks: Deck[] = data.decks.map(deckInfo => {
    // Find all cards for this deck
    const deckCards = data.cards
      .filter(card => card.deckIds.includes(deckInfo.id))
      .map(card => ({
        name: card.name,
        quantity: 1, // We only track presence, not quantity
      }));

    return {
      id: deckInfo.id,
      name: deckInfo.name,
      commander: deckInfo.commander,
      bracket: deckInfo.bracket,
      cards: deckCards,
      assignedColor: deckInfo.assignedColor,
    };
  });

  return decks;
}

/**
 * Validates that a file exists and is a valid PRISM JSON file
 *
 * @param filepath - Path to check
 * @returns True if valid, error message otherwise
 */
export async function validatePrismJSON(filepath: string): Promise<string | null> {
  try {
    await fs.access(filepath);
  } catch {
    return 'File not found';
  }

  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(content);

    if (!data.version) {
      return 'Not a valid PRISM file (missing version)';
    }

    if (!data.decks || !Array.isArray(data.decks)) {
      return 'Not a valid PRISM file (missing decks)';
    }

    if (!data.cards || !Array.isArray(data.cards)) {
      return 'Not a valid PRISM file (missing cards)';
    }

    return null; // Valid
  } catch (error) {
    return `Invalid JSON: ${error}`;
  }
}
