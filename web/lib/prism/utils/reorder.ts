/**
 * Deck Reordering Utilities
 * Allows users to reorder decks to control stripe positions
 */

import { Deck } from '../core/types';
import { getCardKey } from './normalizer';

/**
 * Calculates the number of shared cards between two decks
 *
 * @param deck1 - First deck
 * @param deck2 - Second deck
 * @returns Number of cards shared between the decks
 */
export function calculateSharedCards(deck1: Deck, deck2: Deck): number {
  const deck1Cards = new Set(deck1.cards.map(c => getCardKey(c.name)));
  const deck2Cards = new Set(deck2.cards.map(c => getCardKey(c.name)));

  let sharedCount = 0;
  for (const cardKey of deck1Cards) {
    if (deck2Cards.has(cardKey)) {
      sharedCount++;
    }
  }

  return sharedCount;
}

/**
 * Orders decks by most shared cards (greedy algorithm)
 * Places decks with most card overlap next to each other
 *
 * @param decks - Array of decks to reorder
 * @returns Reordered array of decks
 */
export function orderDecksBySharing(decks: Deck[]): Deck[] {
  if (decks.length <= 1) {
    return [...decks];
  }

  // Build adjacency matrix of shared card counts
  const sharedMatrix: number[][] = [];
  for (let i = 0; i < decks.length; i++) {
    sharedMatrix[i] = [];
    for (let j = 0; j < decks.length; j++) {
      if (i === j) {
        sharedMatrix[i][j] = 0;
      } else {
        sharedMatrix[i][j] = calculateSharedCards(decks[i], decks[j]);
      }
    }
  }

  // Greedy algorithm: Start with first deck, then keep adding the deck
  // that shares the most cards with the current chain
  const ordered: Deck[] = [];
  const used = new Set<number>();

  // Start with the deck that has the most total shared cards
  let maxShared = 0;
  let startIndex = 0;
  for (let i = 0; i < decks.length; i++) {
    const totalShared = sharedMatrix[i].reduce((sum, count) => sum + count, 0);
    if (totalShared > maxShared) {
      maxShared = totalShared;
      startIndex = i;
    }
  }

  ordered.push(decks[startIndex]);
  used.add(startIndex);

  // Keep adding the deck that shares most with the last deck in the chain
  while (ordered.length < decks.length) {
    const lastDeckIndex = decks.indexOf(ordered[ordered.length - 1]);
    let maxSharedWithLast = -1;
    let nextDeckIndex = -1;

    for (let i = 0; i < decks.length; i++) {
      if (!used.has(i)) {
        if (sharedMatrix[lastDeckIndex][i] > maxSharedWithLast) {
          maxSharedWithLast = sharedMatrix[lastDeckIndex][i];
          nextDeckIndex = i;
        }
      }
    }

    if (nextDeckIndex !== -1) {
      ordered.push(decks[nextDeckIndex]);
      used.add(nextDeckIndex);
    }
  }

  return ordered;
}

/**
 * Manually reorder decks by indices
 *
 * @param decks - Array of decks
 * @param newOrder - Array of indices representing the new order (0-based)
 * @returns Reordered array of decks
 */
export function reorderDecks(decks: Deck[], newOrder: number[]): Deck[] {
  if (newOrder.length !== decks.length) {
    throw new Error('New order must include all deck indices');
  }

  const seen = new Set<number>();
  for (const idx of newOrder) {
    if (idx < 0 || idx >= decks.length) {
      throw new Error(`Invalid index: ${idx}`);
    }
    if (seen.has(idx)) {
      throw new Error(`Duplicate index: ${idx}`);
    }
    seen.add(idx);
  }

  return newOrder.map(idx => decks[idx]);
}
