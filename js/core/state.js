/**
 * Shared mutable state for the PRISM build page.
 * ES modules are singletons — every `import { state }` gets the same reference.
 */

export const state = {
  currentPrism: null,
  deckToDelete: null,
  deckToEdit: null,
  // The one deck form's mode (#450): 'add' or 'edit' (deckToEdit set)
  deckFormMode: 'add',
  elements: null,
  sortState: { column: 'deckCount', direction: 'desc' },
  selectedDeckIds: new Set(),
  selectedTypes: new Set(),  // Mark sleeves Type filter (#538): main types ticked in Filters
  processedCards: [],  // Cache of last processCards() result for hover preview
  tokenRows: [],       // Last Tokens view rows (#412), kept out of processedCards and its counts
  // URL a URL import just filled the add / edit form from; the save writes it to deck.sourceUrl (#377)
  addSourceUrl: null,
  editSourceUrl: null,
};
