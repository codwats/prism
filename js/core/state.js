/**
 * Shared mutable state for the PRISM build page.
 * ES modules are singletons — every `import { state }` gets the same reference.
 */

export const state = {
  currentPrism: null,
  deckToDelete: null,
  deckToEdit: null,
  elements: null,
  sortState: { column: 'deckCount', direction: 'desc' },
  selectedDeckIds: new Set(),
  processedCards: [],  // Cache of last processCards() result for hover preview
};
