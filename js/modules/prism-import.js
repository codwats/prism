/**
 * Build a PRISM from an exported/backup JSON payload. Shared by the build
 * page's Import backup dialog (replaces the current PRISM) and the profile
 * page's Restore from backup dialog (imports as a new PRISM).
 */

import { createPrism, createDeck } from './processor.js';

/**
 * Validate and construct a PRISM object from parsed backup JSON.
 * @param {Object} jsonData - Parsed JSON (either `{ prism: {...} }` or the prism itself)
 * @param {Object} [options]
 * @param {boolean} [options.preserveId=true] - Keep the backup's prism id
 *   (overwrites any existing PRISM with that id). Pass false to always create
 *   a new PRISM alongside existing ones.
 * @returns {Object} A saveable PRISM
 * @throws on invalid format or empty deck list
 */
export function buildPrismFromJson(jsonData, { preserveId = true } = {}) {
  let prismData = null;
  if (jsonData.prism && jsonData.prism.decks) {
    prismData = jsonData.prism;
  } else if (jsonData.decks && Array.isArray(jsonData.decks)) {
    prismData = jsonData;
  } else {
    throw new Error('Invalid PRISM JSON format. Expected decks array.');
  }

  if (!prismData.decks || prismData.decks.length === 0) {
    throw new Error('No decks found in the imported file.');
  }

  // Untrusted file: clamp colors to strict hex before they reach
  // style="background-color: ${color}" in render code. Invalid → grey fallback.
  const validHex = (c) => (/^#[0-9A-Fa-f]{6}$/.test(c) ? c : '#888888');

  const newPrism = createPrism(prismData.name || 'Imported PRISM');
  if (preserveId) newPrism.id = prismData.id || newPrism.id;
  newPrism.createdAt = prismData.createdAt || newPrism.createdAt;
  newPrism.updatedAt = new Date().toISOString();
  newPrism.markedCards = prismData.markedCards || [];
  newPrism.removedCards = (prismData.removedCards || []).map(removed => ({
    ...removed,
    deckColor: validHex(removed.deckColor),
  }));

  for (const deck of prismData.decks) {
    const deckCards = deck.cards || [];
    const newDeck = createDeck({
      id: deck.id,
      name: deck.name,
      commander: deck.commander,
      bracket: deck.bracket,
      color: validHex(deck.color),
      stripePosition: deck.stripePosition,
      splitGroupId: deck.splitGroupId || null,
      cards: deckCards,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      cardsUpdatedAt: deck.cardsUpdatedAt
    });
    newPrism.decks.push(newDeck);
  }

  const deckIds = new Set(newPrism.decks.map(d => d.id));
  newPrism.splitGroups = (prismData.splitGroups || [])
    .map(group => {
      const explicit = (group.childDeckIds || []).filter(id => deckIds.has(id));
      const childDeckIds = explicit.length > 0
        ? explicit
        : newPrism.decks.filter(d => d.splitGroupId === group.id).map(d => d.id);
      if (childDeckIds.length === 0) return null;
      return {
        id: group.id,
        name: group.name,
        sideAPosition: group.sideAPosition,
        sideAColor: validHex(group.sideAColor),
        splitStyle: group.splitStyle || 'stripes',
        childDeckIds,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      };
    })
    .filter(Boolean);

  const validGroupIds = new Set(newPrism.splitGroups.map(g => g.id));
  for (const deck of newPrism.decks) {
    if (deck.splitGroupId && !validGroupIds.has(deck.splitGroupId)) {
      deck.splitGroupId = null;
    }
  }

  return newPrism;
}
