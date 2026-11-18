/**
 * Copies a PRISM saves: per card, the copies each logical deck would need on
 * its own (a split group is one deck, its largest variant) minus the copies
 * the PRISM actually needs (`totalQuantity`, which already holds dedicated
 * commander copies and Separate sleeves). Basic lands are left out.
 */
import { normalizeCardName } from './parser.js';

/** @returns {Map<string, number>} card display name -> copies saved (only > 0) */
export function savedCopiesByCard(prism, processedCards) {
  const groupIds = new Set((prism.splitGroups || []).map((g) => g.id));
  const perLogical = new Map(); // normalized name -> Map(logical deck id -> copies)
  for (const deck of prism.decks || []) {
    const logicalId = groupIds.has(deck.splitGroupId) ? deck.splitGroupId : deck.id;
    const inDeck = new Map(); // a card's Separate sleeve rows are one deck's copies
    for (const card of deck.cards || []) {
      if (card.isBasicLand) continue;
      const key = normalizeCardName(card.name);
      inDeck.set(key, (inDeck.get(key) || 0) + (card.quantity || 1));
    }
    for (const [key, qty] of inDeck) {
      if (!perLogical.has(key)) perLogical.set(key, new Map());
      const decks = perLogical.get(key);
      decks.set(logicalId, Math.max(decks.get(logicalId) || 0, qty));
    }
  }
  const saved = new Map();
  for (const card of processedCards) {
    const decks = perLogical.get(card.normalizedName);
    if (!decks || card.isBasicLand) continue;
    const without = [...decks.values()].reduce((s, q) => s + q, 0);
    if (without > card.totalQuantity) saved.set(card.name, without - card.totalQuantity);
  }
  return saved;
}

/** Whole dollars with thousands separators: "$1,637". */
export const formatUsd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Σ copies saved × price; cards with no price add nothing. */
export function savedDollars(saved, priceOf) {
  let usd = 0;
  for (const [name, copies] of saved) usd += copies * (priceOf(name) || 0);
  return usd;
}
