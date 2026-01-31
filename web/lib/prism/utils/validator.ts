/**
 * Input Validator
 * Validates user input for decks
 */

import { DeckInput, ValidationResult } from '../core/types';

/**
 * Validates a deck name
 *
 * @param name - Deck name
 * @returns Validation result
 */
export function validateDeckName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name || !name.trim()) {
    errors.push('Deck name cannot be empty');
  }

  if (name.length > 100) {
    errors.push('Deck name is too long (max 100 characters)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a commander name
 *
 * @param commander - Commander name
 * @returns Validation result
 */
export function validateCommander(commander: string): ValidationResult {
  const errors: string[] = [];

  if (!commander || !commander.trim()) {
    errors.push('Commander name cannot be empty');
  }

  if (commander.length > 100) {
    errors.push('Commander name is too long (max 100 characters)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a bracket level
 *
 * @param bracket - Bracket level (should be 1-4)
 * @returns Validation result
 */
export function validateBracket(bracket: number): ValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(bracket)) {
    errors.push('Bracket must be a whole number');
  }

  if (bracket < 1 || bracket > 4) {
    errors.push('Bracket must be between 1 and 4');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a complete deck input
 *
 * @param deck - Deck input data
 * @returns Validation result
 */
export function validateDeckInput(deck: DeckInput): ValidationResult {
  const errors: string[] = [];

  const nameValidation = validateDeckName(deck.name);
  errors.push(...nameValidation.errors);

  const commanderValidation = validateCommander(deck.commander);
  errors.push(...commanderValidation.errors);

  const bracketValidation = validateBracket(deck.bracket);
  errors.push(...bracketValidation.errors);

  if (!deck.decklist || !deck.decklist.trim()) {
    errors.push('Decklist cannot be empty');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates the number of decks
 *
 * @param count - Number of decks
 * @returns Validation result
 */
export function validateDeckCount(count: number): ValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(count)) {
    errors.push('Number of decks must be a whole number');
  }

  if (count < 1) {
    errors.push('Must process at least 1 deck');
  }

  if (count > 10) {
    errors.push('Cannot process more than 10 decks (color palette limit)');
  }

  if (count === 1) {
    errors.push('Note: Only 1 deck provided. Comparison requires 2+ decks for maximum value.');
  }

  return {
    isValid: errors.length === 0,
    errors: errors.filter(e => !e.startsWith('Note:')), // Notes are warnings, not errors
  };
}
