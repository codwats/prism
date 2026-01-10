/**
 * PRISM Type Definitions
 * Personal Reference Index & Sleeve Marking
 */

/**
 * Represents a single Magic: The Gathering card in a decklist
 */
export interface Card {
  name: string;
  quantity: number;
}

/**
 * Represents a complete Commander deck
 */
export interface Deck {
  id: string;
  name: string;
  commander: string;
  bracket: number; // 1-4
  cards: Card[];
  assignedColor: string;
}

/**
 * Input data for a deck (before processing)
 */
export interface DeckInput {
  name: string;
  commander: string;
  bracket: number;
  decklist: string; // Raw text input
}

/**
 * Represents which decks contain a specific card
 */
export interface CardOccurrence {
  cardName: string;
  deckIds: string[];
  totalDecks: number;
}

/**
 * Information about a mark slot for a specific card
 */
export interface MarkSlot {
  position: number; // 1-10
  color: string;
  deckName: string;
  deckId: string;
  bracket: number;
}

/**
 * Complete information about a unique card across all decks
 */
export interface ProcessedCard {
  name: string;
  totalDecks: number;
  deckIds: string[];
  markSlots: MarkSlot[];
  markSummary: string; // e.g., "Red, Blue, Green"
}

/**
 * Complete processed data for all decks
 */
export interface ProcessedData {
  decks: Deck[];
  cards: ProcessedCard[];
  colorPalette: Record<string, string>; // deckId -> color
  stats: Statistics;
}

/**
 * Summary statistics for the collection
 */
export interface Statistics {
  totalDecks: number;
  totalUniqueCards: number;
  totalCardSlots: number; // Sum of all cards across all decks
  sharedCards: number; // Cards appearing in 2+ decks
  mostSharedCards: Array<{
    name: string;
    count: number;
    decks: string[];
  }>;
}

/**
 * JSON export format (for future re-import)
 */
export interface PrismExport {
  version: string;
  generatedAt: string;
  decks: Array<{
    id: string;
    name: string;
    commander: string;
    bracket: number;
    assignedColor: string;
    cardCount: number;
  }>;
  cards: Array<{
    name: string;
    totalDecks: number;
    deckIds: string[];
    markSlots: MarkSlot[];
  }>;
  colorPalette: Record<string, string>;
}

/**
 * Result of parsing a decklist
 */
export interface ParseResult {
  cards: Card[];
  errors: ParseError[];
  warnings: ParseWarning[];
}

/**
 * Error encountered during parsing
 */
export interface ParseError {
  line: number;
  text: string;
  reason: string;
}

/**
 * Warning encountered during parsing (non-fatal)
 */
export interface ParseWarning {
  line: number;
  text: string;
  message: string;
}

/**
 * Color palette for deck assignments
 */
export const COLOR_PALETTE = [
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Purple',
  'Orange',
  'Pink',
  'Black',
  'White',
  'Brown',
] as const;

export type DeckColor = typeof COLOR_PALETTE[number];

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Types of changes that can occur to a card
 */
export type ChangeAction = 'NEW' | 'UPDATE' | 'REMOVE';

/**
 * Represents a change to a card between two PRISM states
 */
export interface CardChange {
  cardName: string;
  action: ChangeAction;
  oldMarkSummary: string; // e.g., "Red, Blue"
  newMarkSummary: string; // e.g., "Red, Blue, Green"
  physicalAction: string; // Human-readable instruction
  oldSlots: MarkSlot[];
  newSlots: MarkSlot[];
}

/**
 * Delta between two PRISM states
 */
export interface PrismDelta {
  changes: CardChange[];
  summary: {
    newCards: number;
    updatedCards: number;
    removedCards: number;
  };
}
