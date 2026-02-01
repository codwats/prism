/**
 * Delta Calculator
 * Calculates changes between two PRISM states
 */

import { ProcessedData, PrismDelta, CardChange, ProcessedCard } from './types';
import { getCardKey } from '../utils/normalizer';

/**
 * Calculates the delta between an old PRISM state and a new one
 *
 * @param oldData - Previous processed data (can be null for first run)
 * @param newData - New processed data
 * @returns Delta object with all changes
 */
export function calculateDelta(
  oldData: ProcessedData | null,
  newData: ProcessedData
): PrismDelta {
  // If no old data, everything is new
  if (!oldData) {
    return {
      changes: newData.cards.map(card => ({
        cardName: card.name,
        action: 'NEW' as const,
        oldMarkSummary: '',
        newMarkSummary: card.markSummary,
        physicalAction: `Mark new sleeve with: ${card.markSummary}`,
        oldSlots: [],
        newSlots: card.markSlots,
      })),
      summary: {
        newCards: newData.cards.length,
        updatedCards: 0,
        removedCards: 0,
      },
    };
  }

  // Build maps for comparison
  const oldCardMap = new Map<string, ProcessedCard>();
  oldData.cards.forEach(card => {
    oldCardMap.set(getCardKey(card.name), card);
  });

  const newCardMap = new Map<string, ProcessedCard>();
  newData.cards.forEach(card => {
    newCardMap.set(getCardKey(card.name), card);
  });

  const changes: CardChange[] = [];

  // Find new and updated cards
  for (const [cardKey, newCard] of newCardMap.entries()) {
    const oldCard = oldCardMap.get(cardKey);

    if (!oldCard) {
      // New card
      changes.push({
        cardName: newCard.name,
        action: 'NEW',
        oldMarkSummary: '',
        newMarkSummary: newCard.markSummary,
        physicalAction: `Mark new sleeve with: ${newCard.markSummary}`,
        oldSlots: [],
        newSlots: newCard.markSlots,
      });
    } else if (oldCard.markSummary !== newCard.markSummary) {
      // Updated card - marks changed
      const physicalAction = generateUpdateInstruction(oldCard, newCard);

      changes.push({
        cardName: newCard.name,
        action: 'UPDATE',
        oldMarkSummary: oldCard.markSummary,
        newMarkSummary: newCard.markSummary,
        physicalAction,
        oldSlots: oldCard.markSlots,
        newSlots: newCard.markSlots,
      });
    }
  }

  // Find removed cards
  for (const [cardKey, oldCard] of oldCardMap.entries()) {
    if (!newCardMap.has(cardKey)) {
      changes.push({
        cardName: oldCard.name,
        action: 'REMOVE',
        oldMarkSummary: oldCard.markSummary,
        newMarkSummary: '',
        physicalAction: 'Card no longer in any deck - remove from collection',
        oldSlots: oldCard.markSlots,
        newSlots: [],
      });
    }
  }

  // Sort changes: NEW first, then UPDATE, then REMOVE
  changes.sort((a, b) => {
    const order = { NEW: 0, UPDATE: 1, REMOVE: 2 };
    if (a.action !== b.action) {
      return order[a.action] - order[b.action];
    }
    return a.cardName.localeCompare(b.cardName);
  });

  // Calculate summary
  const summary = {
    newCards: changes.filter(c => c.action === 'NEW').length,
    updatedCards: changes.filter(c => c.action === 'UPDATE').length,
    removedCards: changes.filter(c => c.action === 'REMOVE').length,
  };

  return {
    changes,
    summary,
  };
}

/**
 * Generates human-readable instruction for updating a card's marks
 *
 * @param oldCard - Previous card state
 * @param newCard - New card state
 * @returns Instruction string
 */
function generateUpdateInstruction(oldCard: ProcessedCard, newCard: ProcessedCard): string {
  const oldSlotMap = new Map(oldCard.markSlots.map(s => [s.position, s]));
  const newSlotMap = new Map(newCard.markSlots.map(s => [s.position, s]));

  const added: string[] = [];
  const removed: string[] = [];

  // Find added slots
  for (const [pos, slot] of newSlotMap.entries()) {
    if (!oldSlotMap.has(pos)) {
      added.push(`${slot.color} in slot ${pos}`);
    }
  }

  // Find removed slots
  for (const [pos, slot] of oldSlotMap.entries()) {
    if (!newSlotMap.has(pos)) {
      removed.push(`${slot.color} from slot ${pos}`);
    }
  }

  const instructions: string[] = [];
  if (added.length > 0) {
    instructions.push(`Add: ${added.join(', ')}`);
  }
  if (removed.length > 0) {
    instructions.push(`Remove: ${removed.join(', ')}`);
  }

  return instructions.join(' | ') || 'No physical changes needed';
}
