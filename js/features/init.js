/**
 * App initialization: getElements, init, renderAll, renderPrismHeader.
 */

import { state } from '../core/state.js';
import { getLogicalDeckCount } from '../core/utils.js';
import { createPrism } from '../modules/processor.js';
import { getCurrentPrism, savePrism, setCurrentPrism } from '../modules/storage.js';
import { initAuth, setupAuthListeners } from '../modules/auth.js';
import { initColorSwatches } from './deck-form.js';
import { renderDecksList } from './deck-list.js';
import { renderResults, updateRemovedFilterBadge } from './results.js';
import { renderExport } from './export-view.js';
import { setupEventListeners } from './events.js';

// ============================================================================
// Element references
// ============================================================================

function getElements() {
  return {
    // PRISM name
    prismName: document.getElementById('prism-name'),
    deckCountTag: document.getElementById('deck-count-tag'),

    // Tabs
    mainTabs: document.getElementById('main-tabs'),

    // Deck form
    deckForm: document.getElementById('deck-form'),
    deckName: document.getElementById('deck-name'),
    deckCommander: document.getElementById('deck-commander'),
    deckBracket: document.getElementById('deck-bracket'),
    deckColor: document.getElementById('deck-color'),
    deckList: document.getElementById('deck-list'),
    deckFileInput: document.getElementById('deck-file-input'),
    colorSwatches: document.getElementById('color-swatches'),
    colorWarning: document.getElementById('color-warning'),
    parseErrors: document.getElementById('parse-errors'),
    btnResetForm: document.getElementById('btn-reset-form'),

    // Moxfield import
    moxfieldUrl: document.getElementById('moxfield-url'),
    btnImportMoxfield: document.getElementById('btn-import-moxfield'),
    moxfieldError: document.getElementById('moxfield-error'),
    moxfieldSuccess: document.getElementById('moxfield-success'),
    moxfieldImportSection: document.getElementById('moxfield-import-section'),

    // Decks list
    decksList: document.getElementById('decks-list'),
    reorderCard: document.getElementById('reorder-card'),

    // Results
    overlapMatrixContainer: document.getElementById('overlap-matrix-container'),
    overlapMatrix: document.getElementById('overlap-matrix'),
    resultsStats: document.getElementById('results-stats'),
    statTotal: document.getElementById('stat-total'),
    statShared: document.getElementById('stat-shared'),
    resultsFilter: document.getElementById('results-filter'),
    resultsSearch: document.getElementById('results-search'),
    showAllSlots: document.getElementById('show-all-slots'),
    deckFilterDropdown: document.getElementById('deck-filter-dropdown'),
    deckFilterMenu: document.getElementById('deck-filter-menu'),
    resultsTbody: document.getElementById('results-tbody'),
    noResults: document.getElementById('no-results'),
    btnGoToDecks: document.getElementById('btn-go-to-decks'),

    // Export
    deckLegend: document.getElementById('deck-legend'),
    noDecksLegend: document.getElementById('no-decks-legend'),
    stripeReorderList: document.getElementById('stripe-reorder-list'),
    btnExportCSV: document.getElementById('btn-export-csv'),
    btnExportJSON: document.getElementById('btn-export-json'),
    btnPrintGuide: document.getElementById('btn-print-guide'),
    prismJsonInput: document.getElementById('prism-json-input'),

    // Dialogs
    deleteDialog: document.getElementById('delete-dialog'),
    deleteDeckName: document.getElementById('delete-deck-name'),
    btnCancelDelete: document.getElementById('btn-cancel-delete'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),

    newPrismDialog: document.getElementById('new-prism-dialog'),
    btnNewPrism: document.getElementById('btn-new-prism'),
    btnCancelNew: document.getElementById('btn-cancel-new'),
    btnConfirmNew: document.getElementById('btn-confirm-new'),

    // Edit dialog
    editDialog: document.getElementById('edit-dialog'),
    editDeckForm: document.getElementById('edit-deck-form'),
    editDeckId: document.getElementById('edit-deck-id'),
    editDeckName: document.getElementById('edit-deck-name'),
    editDeckCommander: document.getElementById('edit-deck-commander'),
    editDeckBracket: document.getElementById('edit-deck-bracket'),
    editDeckColor: document.getElementById('edit-deck-color'),
    editDeckList: document.getElementById('edit-deck-list'),
    editDeckFileInput: document.getElementById('edit-deck-file-input'),
    editParseErrors: document.getElementById('edit-parse-errors'),
    btnCancelEdit: document.getElementById('btn-cancel-edit'),
    btnConfirmEdit: document.getElementById('btn-confirm-edit'),

    // Edit dialog URL import
    editImportSection: document.getElementById('edit-import-section'),
    editImportUrl: document.getElementById('edit-import-url'),
    btnEditImportUrl: document.getElementById('btn-edit-import-url'),
    editImportError: document.getElementById('edit-import-error'),
    editImportSuccess: document.getElementById('edit-import-success'),

    // Split dialog
    splitDialog: document.getElementById('split-dialog'),
    splitDeckId: document.getElementById('split-deck-id'),
    splitDeckName: document.getElementById('split-deck-name'),
    splitCount: document.getElementById('split-count'),
    btnCancelSplit: document.getElementById('btn-cancel-split'),
    btnConfirmSplit: document.getElementById('btn-confirm-split'),
  };
}

// ============================================================================
// Initialization
// ============================================================================

export async function init() {
  console.log('PRISM: Initializing...');

  // Wait a tick for Web Awesome components to upgrade
  await new Promise(resolve => setTimeout(resolve, 100));

  // Initialize auth
  await initAuth();
  setupAuthListeners();

  // Get element references
  state.elements = getElements();

  // Verify critical elements exist
  if (!state.elements.deckForm) {
    console.error('PRISM: Could not find deck form element');
    return;
  }

  // Load or create PRISM
  state.currentPrism = getCurrentPrism();
  if (!state.currentPrism) {
    state.currentPrism = createPrism();
    savePrism(state.currentPrism);
    setCurrentPrism(state.currentPrism.id);
  }

  // Initialize UI
  initColorSwatches();
  renderAll();

  // Set up event listeners
  setupEventListeners();

  console.log('PRISM: Initialization complete');
}

// ============================================================================
// Render orchestration
// ============================================================================

export function renderAll() {
  renderPrismHeader();
  renderDecksList();
  renderResults();
  renderExport();
  updateRemovedFilterBadge();
}

function renderPrismHeader() {
  if (state.elements.prismName) {
    state.elements.prismName.value = state.currentPrism.name;
  }
  if (state.elements.deckCountTag) {
    const logicalCount = getLogicalDeckCount(state.currentPrism);
    state.elements.deckCountTag.textContent = `${logicalCount}/32 decks`;

    // Update tag variant based on count
    if (logicalCount >= 32) {
      state.elements.deckCountTag.variant = 'warning';
    } else if (logicalCount >= 20) {
      state.elements.deckCountTag.variant = 'neutral';
    } else {
      state.elements.deckCountTag.variant = 'success';
    }
  }
}
