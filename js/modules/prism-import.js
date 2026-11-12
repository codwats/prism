/**
 * Build a PRISM from an exported/backup JSON payload. Shared by the build
 * page's Import backup dialog (replaces the current PRISM) and the profile
 * page's Restore from backup dialog (imports as a new PRISM).
 */

import { createPrism, createDeck, applyCommanderFallback, generateId } from './processor.js';
import { normalizeCardName } from './parser.js';

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
  // Untrusted file (#435): ids reach data-* attributes, slots reach markup.
  // Valid ids stay exactly (markedCards batch keys embed deck ids); any other
  // id gets one fresh id per original value, so every reference follows it.
  const remapped = new Map();
  const safeId = (id) => {
    if (typeof id === 'string' && /^[\w-]+$/.test(id)) return id;
    if (id == null || id === '') return id;
    if (!remapped.has(id)) remapped.set(id, generateId());
    return remapped.get(id);
  };
  const validSlot = (n) => (Number.isInteger(n) && n >= 1 && n <= 48 ? n : undefined);

  const newPrism = createPrism(prismData.name || 'Imported PRISM');
  if (preserveId) newPrism.id = safeId(prismData.id) || newPrism.id;
  newPrism.createdAt = prismData.createdAt || newPrism.createdAt;
  newPrism.updatedAt = new Date().toISOString();
  newPrism.markedCards = prismData.markedCards || [];
  // Timestamp stays createPrism()'s `now`: restore is a user act happening
  // now, so the restored value wins the next cloud merge (#145).
  newPrism.useDedicatedCommanderCopies = prismData.useDedicatedCommanderCopies || false;
  newPrism.removedCards = (prismData.removedCards || []).map(removed => ({
    ...removed,
    deckId: safeId(removed.deckId),
    deckColor: validHex(removed.deckColor),
    ...(removed.splitGroup ? { splitGroup: {
      ...removed.splitGroup,
      id: safeId(removed.splitGroup.id),
      variants: (Array.isArray(removed.splitGroup.variants) ? removed.splitGroup.variants : [])
        .map(v => ({ ...v, id: safeId(v?.id) })),
    } } : {}),
  }));

  // Untrusted file: one row per card per deck with a numeric quantity, else
  // processCards double-stripes the card or derives a 0-copy batch (#425).
  // Repeated rows sum, as repeated decklist lines do (#413); any row's
  // commander flag or sleeve carries onto the merged row.
  const normalizeCards = (cards) => {
    const byName = new Map();
    for (const row of Array.isArray(cards) ? cards : []) {
      if (!row || typeof row.name !== 'string' || !row.name.trim()) continue;
      const n = Number(row.quantity);
      const quantity = Number.isInteger(n) && n > 0 ? n : 1;
      const key = normalizeCardName(row.name); // processCards' card identity
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...row, quantity });
        continue;
      }
      existing.quantity += quantity;
      if (row.isCommander) existing.isCommander = true;
      if (row.sleeve && !existing.sleeve) existing.sleeve = row.sleeve;
    }
    return [...byName.values()];
  };

  for (const deck of prismData.decks) {
    const deckCards = normalizeCards(deck.cards);
    const newDeck = createDeck({
      id: safeId(deck.id),
      name: deck.name,
      bracket: deck.bracket,
      color: validHex(deck.color),
      stripePosition: validSlot(deck.stripePosition),
      splitGroupId: safeId(deck.splitGroupId) || null,
      cards: deckCards,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      cardsUpdatedAt: deck.cardsUpdatedAt,
      sourceUrl: typeof deck.sourceUrl === 'string' ? deck.sourceUrl : null
    });
    // Backup flags win; a pre-#147 backup's commander scalar is the fallback
    applyCommanderFallback(newDeck, deck.commander);
    newPrism.decks.push(newDeck);
  }

  const deckIds = new Set(newPrism.decks.map(d => d.id));
  newPrism.splitGroups = (prismData.splitGroups || [])
    .map(group => {
      const groupId = safeId(group.id);
      const explicit = (group.childDeckIds || []).map(safeId).filter(id => deckIds.has(id));
      const childDeckIds = explicit.length > 0
        ? explicit
        : newPrism.decks.filter(d => d.splitGroupId === groupId).map(d => d.id);
      if (childDeckIds.length === 0) return null;
      return {
        id: groupId,
        name: group.name,
        sideAPosition: validSlot(group.sideAPosition),
        sideAColor: validHex(group.sideAColor),
        splitStyle: group.splitStyle || 'stripes',
        childDeckIds,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      };
    })
    .filter(Boolean);

  // Untrusted file: keep only Planned swaps shaped like queueSwap writes them,
  // on a deck that came with the backup.
  const isText = (v) => typeof v === 'string' && v.length > 0;
  const isDate = (v) => isText(v) && !Number.isNaN(Date.parse(v));
  newPrism.plannedSwaps = (Array.isArray(prismData.plannedSwaps) ? prismData.plannedSwaps : [])
    .filter(swap => swap && isText(swap.id) && isText(swap.incoming) && deckIds.has(safeId(swap.deckId)))
    .map(swap => ({
      id: safeId(swap.id),
      incoming: swap.incoming,
      deckId: safeId(swap.deckId),
      copies: Number.isInteger(swap.copies) && swap.copies > 0 ? swap.copies : 1,
      ...(isText(swap.outgoing) ? { outgoing: swap.outgoing } : {}),
      ...(isText(swap.note) ? { note: swap.note } : {}),
      createdAt: isDate(swap.createdAt) ? swap.createdAt : newPrism.updatedAt,
      updatedAt: isDate(swap.updatedAt) ? swap.updatedAt : newPrism.updatedAt
    }));

  const validGroupIds = new Set(newPrism.splitGroups.map(g => g.id));
  for (const deck of newPrism.decks) {
    if (deck.splitGroupId && !validGroupIds.has(deck.splitGroupId)) {
      deck.splitGroupId = null;
    }
  }

  return newPrism;
}
