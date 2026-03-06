/**
 * PRISM Main Application
 * Handles UI interactions, state management, and rendering
 */

import { parseDecklist, validateDecklist } from './parser.js';
import {
  createDeck,
  createPrism,
  processCards,
  calculateOverlap,
  getNextStripePosition,
  getNextColor,
  isColorUsed,
  addDeckToPrism,
  removeDeckFromPrism,
  reorderStripes,
  DEFAULT_COLORS,
  getColorName,
  calculateRemovedCards,
  isCardInOtherDecks,
  splitDeck,
  addSplitToGroup,
  unsplitGroup,
  removeSplitChild,
  formatSlotLabel,
} from './processor.js';
import { 
  getCurrentPrism, 
  setCurrentPrism, 
  savePrism,
  getAllPrisms
} from './storage.js';
import { downloadCSV, downloadJSON, openPrintableGuide } from './export.js';
import { showPreview, hidePreview, updatePosition } from './card-preview.js';
import { initAuth, setupAuthListeners } from './auth.js';
import { prefetchCards } from './scryfall.js';
import { importFromMoxfield, toDecklistText, extractMoxfieldId } from './moxfield.js';
import { importFromArchidekt, extractArchidektId } from './archidekt.js';

// ============================================================================
// State
// ============================================================================

let currentPrism = null;
let deckToDelete = null;
let deckToEdit = null;
let elements = null;
let sortState = { column: 'deckCount', direction: 'desc' }; // Default: most shared first
let selectedDeckIds = new Set(); // For deck filter dropdown

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the "logical" deck count: standalone decks + split groups (each group = 1 deck).
 * Used for the 32-deck cap and header display.
 */
function getLogicalDeckCount(prism) {
  const standalone = prism.decks.filter(d => !d.splitGroupId).length;
  const groups = (prism.splitGroups || []).length;
  return standalone + groups;
}

// ============================================================================
// Initialization
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

async function init() {
  console.log('PRISM: Initializing...');

  // Wait a tick for Web Awesome components to upgrade
  await new Promise(resolve => setTimeout(resolve, 100));

  // Initialize auth
  await initAuth();
  setupAuthListeners();

  // Get element references
  elements = getElements();
  
  // Verify critical elements exist
  if (!elements.deckForm) {
    console.error('PRISM: Could not find deck form element');
    return;
  }
  
  // Load or create PRISM
  currentPrism = getCurrentPrism();
  if (!currentPrism) {
    currentPrism = createPrism();
    savePrism(currentPrism);
    setCurrentPrism(currentPrism.id);
  }
  
  // Initialize UI
  initColorSwatches();
  renderAll();
  
  // Set up event listeners
  setupEventListeners();
  
  console.log('PRISM: Initialization complete');
}

function initColorSwatches() {
  if (!elements.colorSwatches) return;
  
  elements.colorSwatches.innerHTML = '';
  
  DEFAULT_COLORS.forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = getColorName(color);
    swatch.dataset.color = color;
    
    swatch.addEventListener('click', () => {
      elements.deckColor.value = color;
      updateColorSwatchSelection();
      checkColorWarning();
    });
    
    elements.colorSwatches.appendChild(swatch);
  });
  
  // Set initial color
  const nextColor = getNextColor(currentPrism);
  elements.deckColor.value = nextColor;
  updateColorSwatchSelection();
}

function updateColorSwatchSelection() {
  const selectedColor = elements.deckColor.value.toUpperCase();
  
  elements.colorSwatches.querySelectorAll('.color-swatch').forEach(swatch => {
    const isSelected = swatch.dataset.color.toUpperCase() === selectedColor;
    swatch.classList.toggle('selected', isSelected);
  });
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // PRISM name change
  if (elements.prismName) {
    elements.prismName.addEventListener('wa-input', handlePrismNameChange);
    elements.prismName.addEventListener('input', handlePrismNameChange);
  }
  
  // Deck form submission - use both submit event and button click as fallback
  if (elements.deckForm) {
    elements.deckForm.addEventListener('submit', handleDeckSubmit);
    
    // Also add click handler to the submit button as backup
    const submitBtn = elements.deckForm.querySelector('wa-button[type="submit"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleDeckSubmit(e);
      });
    }
  }
  
  if (elements.btnResetForm) {
    elements.btnResetForm.addEventListener('click', resetDeckForm);
  }
  
  // Color picker change
  if (elements.deckColor) {
    elements.deckColor.addEventListener('input', () => {
      updateColorSwatchSelection();
      checkColorWarning();
    });
  }

  // File upload (wa-file-input handles its own UI)
  if (elements.deckFileInput) {
    elements.deckFileInput.addEventListener('change', handleFileUpload);
  }

  // JSON import (wa-file-input handles its own UI)
  if (elements.prismJsonInput) {
    elements.prismJsonInput.addEventListener('change', handleJsonImport);
  }

  // Moxfield import
  if (elements.btnImportMoxfield) {
    elements.btnImportMoxfield.addEventListener('click', handleMoxfieldImport);
  }
  if (elements.moxfieldUrl) {
    // Also allow pressing Enter to import
    elements.moxfieldUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleMoxfieldImport();
      }
    });
  }

  // Results filter - use 'change' event for wa-radio-group
  if (elements.resultsFilter) {
    elements.resultsFilter.addEventListener('change', renderResults);
  }
  if (elements.resultsSearch) {
    elements.resultsSearch.addEventListener('input', renderResults);
  }
  if (elements.showAllSlots) {
    elements.showAllSlots.addEventListener('change', renderResults);
  }

  // Navigation button
  if (elements.btnGoToDecks) {
    elements.btnGoToDecks.addEventListener('click', () => {
      elements.mainTabs.active = 'decks';
    });
  }
  
  // Export buttons
  if (elements.btnExportCSV) {
    elements.btnExportCSV.addEventListener('click', () => downloadCSV(currentPrism));
  }
  if (elements.btnExportJSON) {
    elements.btnExportJSON.addEventListener('click', () => downloadJSON(currentPrism));
  }
  if (elements.btnPrintGuide) {
    elements.btnPrintGuide.addEventListener('click', () => openPrintableGuide(currentPrism));
  }
  
  // Delete dialog
  if (elements.btnCancelDelete) {
    elements.btnCancelDelete.addEventListener('click', () => {
      elements.deleteDialog.open = false;
    });
  }
  if (elements.btnConfirmDelete) {
    elements.btnConfirmDelete.addEventListener('click', handleDeleteConfirm);
  }
  
  // New PRISM dialog
  if (elements.btnNewPrism) {
    elements.btnNewPrism.addEventListener('click', () => {
      elements.newPrismDialog.open = true;
    });
  }
  if (elements.btnCancelNew) {
    elements.btnCancelNew.addEventListener('click', () => {
      elements.newPrismDialog.open = false;
    });
  }
  if (elements.btnConfirmNew) {
    elements.btnConfirmNew.addEventListener('click', handleNewPrism);
  }

  // Edit dialog
  if (elements.btnCancelEdit) {
    elements.btnCancelEdit.addEventListener('click', () => {
      elements.editDialog.open = false;
    });
  }
  if (elements.btnConfirmEdit) {
    elements.btnConfirmEdit.addEventListener('click', handleEditConfirm);
  }

  // Edit dialog file upload (wa-file-input handles its own UI)
  if (elements.editDeckFileInput) {
    elements.editDeckFileInput.addEventListener('change', handleEditFileUpload);
  }

  // Edit dialog URL import
  if (elements.btnEditImportUrl) {
    elements.btnEditImportUrl.addEventListener('click', handleEditUrlImport);
  }
  if (elements.editImportUrl) {
    elements.editImportUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEditUrlImport();
      }
    });
  }

  // Split dialog
  if (elements.btnCancelSplit) {
    elements.btnCancelSplit.addEventListener('click', () => {
      elements.splitDialog.open = false;
    });
  }
  if (elements.btnConfirmSplit) {
    elements.btnConfirmSplit.addEventListener('click', handleSplitConfirm);
  }

  // Card preview hover handlers (event delegation on results table)
  if (elements.resultsTbody) {
    elements.resultsTbody.addEventListener('mouseenter', handleCardPreviewShow, true);
    elements.resultsTbody.addEventListener('mouseleave', handleCardPreviewHide, true);
    elements.resultsTbody.addEventListener('mousemove', handleCardPreviewMove);
  }
}

// Card preview handlers
function handleCardPreviewShow(e) {
  const cell = e.target.closest('.card-name-cell');
  if (!cell) return;

  const cardName = cell.dataset.cardName;
  const stripesJson = cell.dataset.stripes;

  if (!cardName) return;

  let stripes = [];
  try {
    stripes = JSON.parse(stripesJson || '[]');
  } catch (err) {
    console.warn('Failed to parse stripes data:', err);
  }

  showPreview(cardName, stripes, e);
}

function handleCardPreviewHide(e) {
  const cell = e.target.closest('.card-name-cell');
  if (!cell) return;

  // Check if we're leaving to another element within the same cell
  const relatedTarget = e.relatedTarget;
  if (relatedTarget && cell.contains(relatedTarget)) return;

  hidePreview();
}

function handleCardPreviewMove(e) {
  const cell = e.target.closest('.card-name-cell');
  if (!cell) return;

  updatePosition(e);
}

// ============================================================================
// Event Handlers
// ============================================================================

function handlePrismNameChange(e) {
  const value = e.target.value || 'Untitled PRISM';
  currentPrism.name = value;
  currentPrism.updatedAt = new Date().toISOString();
  savePrism(currentPrism);
}

function handleDeckSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  console.log('PRISM: Form submitted');

  // Check deck limit (split groups count as 1 logical deck)
  if (getLogicalDeckCount(currentPrism) >= 32) {
    showError('Maximum 32 decks per PRISM reached.');
    return;
  }

  // Get form values - for web components, access the native input in shadow DOM
  const getInputValue = (element) => {
    if (!element) return '';

    // For wa-input/wa-textarea, get value from the native input in shadow DOM
    const shadowInput = element.shadowRoot?.querySelector('input, textarea');
    if (shadowInput && shadowInput.value) {
      return String(shadowInput.value).trim();
    }

    // Fallback to direct .value property
    if (element.value !== undefined && element.value !== null && element.value !== '') {
      return String(element.value).trim();
    }

    return '';
  };

  const name = getInputValue(elements.deckName);
  const commander = getInputValue(elements.deckCommander);
  const bracket = elements.deckBracket?.value || '2';
  const color = elements.deckColor?.value || '#FF0000';
  const decklistText = getInputValue(elements.deckList);

  console.log('PRISM: Form values:', { name, commander, bracket, color, decklistLength: decklistText.length });
  
  // Basic validation
  if (!name) {
    showError('Please enter a deck name.');
    return;
  }
  if (!commander) {
    showError('Please enter a commander name.');
    return;
  }
  if (!decklistText.trim()) {
    showError('Please paste a decklist.');
    return;
  }
  
  // Parse decklist
  const parseResult = parseDecklist(decklistText, commander);
  const validation = validateDecklist(parseResult);
  
  console.log('PRISM: Parse result:', { cards: parseResult.cards.length, errors: parseResult.errors.length });
  
  // Show parse errors if any
  if (parseResult.errors.length > 0) {
    showParseErrors(parseResult.errors);
  } else {
    hideParseErrors();
  }
  
  // Check if valid
  if (!validation.isValid) {
    showError(validation.messages.join(' '));
    return;
  }
  
  // Check for duplicate deck name
  const existingDeck = currentPrism.decks.find(
    d => d.name.toLowerCase() === name.toLowerCase()
  );
  if (existingDeck) {
    showError(`A deck named "${name}" already exists.`);
    return;
  }
  
  // Create deck
  const deck = createDeck({
    name,
    commander,
    bracket,
    color,
    stripePosition: getNextStripePosition(currentPrism),
    cards: parseResult.cards
  });
  
  // Add to PRISM
  currentPrism = addDeckToPrism(currentPrism, deck);

  // Auto-clear any removed cards that are now back in a deck
  const autoClearedCount = autoClearRemovedCards(parseResult.cards);

  savePrism(currentPrism);

  console.log('PRISM: Deck added:', deck.name);

  // Reset form and re-render
  resetDeckForm();
  renderAll();

  // Show success feedback
  let message = `Added "${name}" with ${parseResult.uniqueCards} cards.`;
  if (autoClearedCount > 0) {
    message += ` ${autoClearedCount} card${autoClearedCount > 1 ? 's' : ''} auto-cleared from removed list.`;
  }
  showSuccess(message);
}

function handleDeleteClick(deckId) {
  const deck = currentPrism.decks.find(d => d.id === deckId);
  if (!deck) return;

  deckToDelete = deckId;
  elements.deleteDeckName.textContent = deck.name;
  elements.deleteDialog.open = true;
}

function handleEditClick(deckId) {
  const deck = currentPrism.decks.find(d => d.id === deckId);
  if (!deck) return;

  deckToEdit = deckId;

  // Populate form with deck data
  if (elements.editDeckId) elements.editDeckId.value = deck.id;
  if (elements.editDeckName) elements.editDeckName.value = deck.name;
  if (elements.editDeckCommander) elements.editDeckCommander.value = deck.commander;
  if (elements.editDeckBracket) elements.editDeckBracket.value = String(deck.bracket);
  if (elements.editDeckColor) elements.editDeckColor.value = deck.color;

  // Convert cards back to decklist text
  if (elements.editDeckList) {
    const decklistText = deck.cards
      .map(card => `${card.quantity} ${card.name}`)
      .join('\n');
    elements.editDeckList.value = decklistText;
  }

  // Hide any previous parse errors
  if (elements.editParseErrors) {
    elements.editParseErrors.style.display = 'none';
    elements.editParseErrors.innerHTML = '';
  }

  // Reset URL import section
  hideEditImportMessages();
  if (elements.editImportUrl) elements.editImportUrl.value = '';
  if (elements.editImportSection) elements.editImportSection.open = false;

  elements.editDialog.open = true;
}

function handleEditConfirm() {
  if (!deckToEdit) return;

  const deck = currentPrism.decks.find(d => d.id === deckToEdit);
  if (!deck) return;

  // Store old cards for comparison
  const oldCards = [...deck.cards];

  // Get form values
  const name = (elements.editDeckName?.value || '').trim();
  const commander = (elements.editDeckCommander?.value || '').trim();
  const bracket = elements.editDeckBracket?.value || '2';
  const color = elements.editDeckColor?.value || deck.color;
  const decklistText = elements.editDeckList?.value || '';

  // Basic validation
  if (!name) {
    showError('Please enter a deck name.');
    return;
  }
  if (!commander) {
    showError('Please enter a commander name.');
    return;
  }
  if (!decklistText.trim()) {
    showError('Please paste a decklist.');
    return;
  }

  // Check for duplicate deck name (excluding current deck)
  const existingDeck = currentPrism.decks.find(
    d => d.id !== deckToEdit && d.name.toLowerCase() === name.toLowerCase()
  );
  if (existingDeck) {
    showError(`A deck named "${name}" already exists.`);
    return;
  }

  // Parse decklist
  const parseResult = parseDecklist(decklistText, commander);
  const validation = validateDecklist(parseResult);

  // Show parse errors if any
  if (parseResult.errors.length > 0 && elements.editParseErrors) {
    elements.editParseErrors.style.display = '';
    elements.editParseErrors.innerHTML = `
      <wa-callout variant="warning">
        <strong>Some lines couldn't be parsed:</strong>
        <ul style="margin: 0.5em 0 0 1.5em; padding: 0;">
          ${parseResult.errors.slice(0, 5).map(e => `<li>Line ${e.lineNumber}: ${escapeHtml(e.content)}</li>`).join('')}
          ${parseResult.errors.length > 5 ? `<li>...and ${parseResult.errors.length - 5} more</li>` : ''}
        </ul>
      </wa-callout>
    `;
  }

  // Check if valid
  if (!validation.isValid) {
    showError(validation.messages.join(' '));
    return;
  }

  // Calculate removed cards BEFORE updating the deck
  const removedFromDeck = calculateRemovedCards(oldCards, parseResult.cards);

  // Initialize removedCards array if it doesn't exist
  if (!currentPrism.removedCards) {
    currentPrism.removedCards = [];
  }

  // Track cards that need their marks removed
  // Only add if the card is NOT in any other deck (otherwise the mark is still needed)
  const now = new Date().toISOString();
  let removedCount = 0;

  for (const removedCard of removedFromDeck) {
    // Check if this card is still in another deck
    if (!isCardInOtherDecks(currentPrism, removedCard.name, deckToEdit)) {
      // Card is completely removed from all decks - track it
      currentPrism.removedCards.push({
        cardName: removedCard.name,
        deckId: deck.id,
        deckName: deck.name,
        deckColor: deck.color,
        stripePosition: deck.stripePosition,
        removedAt: now
      });
      removedCount++;
    } else {
      // Card is still in other decks - just need to remove this deck's mark
      // Check if we already track this exact card+deck combination
      const alreadyTracked = currentPrism.removedCards.some(
        rc => rc.cardName.toLowerCase() === removedCard.name.toLowerCase() &&
              rc.deckId === deck.id
      );
      if (!alreadyTracked) {
        currentPrism.removedCards.push({
          cardName: removedCard.name,
          deckId: deck.id,
          deckName: deck.name,
          deckColor: deck.color,
          stripePosition: deck.stripePosition,
          removedAt: now
        });
        removedCount++;
      }
    }
  }

  // Auto-clear removed cards that are now back in the deck
  // (e.g. user pasted wrong list, then fixed it)
  const autoClearedCount = autoClearRemovedCards(parseResult.cards);

  // Update deck
  deck.name = name;
  deck.commander = commander;
  deck.bracket = parseInt(bracket, 10);
  deck.color = color;
  deck.cards = parseResult.cards;
  deck.updatedAt = now;

  // Update PRISM timestamp
  currentPrism.updatedAt = now;

  // Save and close
  savePrism(currentPrism);
  deckToEdit = null;
  elements.editDialog.open = false;

  renderAll();

  // Show success message with removed/cleared card info
  let message = `Updated "${name}" with ${parseResult.uniqueCards} cards.`;
  if (removedCount > 0) {
    message += ` ${removedCount} card${removedCount > 1 ? 's' : ''} marked for removal.`;
  }
  if (autoClearedCount > 0) {
    message += ` ${autoClearedCount} card${autoClearedCount > 1 ? 's' : ''} auto-cleared from removed list.`;
  }
  showSuccess(message);
}

function handleDeleteConfirm() {
  if (!deckToDelete) return;

  const deck = currentPrism.decks.find(d => d.id === deckToDelete);
  if (!deck) return;

  // Initialize removedCards array if it doesn't exist
  if (!currentPrism.removedCards) {
    currentPrism.removedCards = [];
  }

  // Track cards that need their marks removed
  const now = new Date().toISOString();
  let removedCount = 0;

  for (const card of deck.cards) {
    // Check if this card is in any OTHER deck (not the one being deleted)
    if (!isCardInOtherDecks(currentPrism, card.name, deckToDelete)) {
      // Card is only in this deck - track for complete removal
      currentPrism.removedCards.push({
        cardName: card.name,
        deckId: deck.id,
        deckName: deck.name,
        deckColor: deck.color,
        stripePosition: deck.stripePosition,
        removedAt: now
      });
      removedCount++;
    } else {
      // Card is in other decks - still need to remove this deck's mark
      const alreadyTracked = currentPrism.removedCards.some(
        rc => rc.cardName.toLowerCase() === card.name.toLowerCase() &&
              rc.deckId === deck.id
      );
      if (!alreadyTracked) {
        currentPrism.removedCards.push({
          cardName: card.name,
          deckId: deck.id,
          deckName: deck.name,
          deckColor: deck.color,
          stripePosition: deck.stripePosition,
          removedAt: now
        });
        removedCount++;
      }
    }
  }

  const deckName = deck.name;
  const isSplitChild = !!deck.splitGroupId;
  if (isSplitChild) {
    currentPrism = removeSplitChild(currentPrism, deckToDelete);
  } else {
    currentPrism = removeDeckFromPrism(currentPrism, deckToDelete);
  }
  savePrism(currentPrism);

  deckToDelete = null;
  elements.deleteDialog.open = false;

  renderAll();

  // Show message about removed cards
  if (removedCount > 0) {
    showSuccess(`Deleted "${deckName}". ${removedCount} card${removedCount > 1 ? 's' : ''} marked for removal.`);
  }
}

function handleSplitClick(deckId) {
  const deck = currentPrism.decks.find(d => d.id === deckId);
  if (!deck) return;

  elements.splitDeckId.value = deckId;
  elements.splitDeckName.textContent = deck.name;
  elements.splitCount.value = '2';
  elements.splitDialog.open = true;
}

function handleSplitConfirm() {
  const deckId = elements.splitDeckId.value;
  const count = parseInt(elements.splitCount.value) || 2;

  if (count < 2 || count > 8) {
    showError('Split count must be between 2 and 8.');
    return;
  }

  currentPrism = splitDeck(currentPrism, deckId, count);
  savePrism(currentPrism);

  elements.splitDialog.open = false;
  renderAll();
  showSuccess(`Split into ${count} variants.`);
}

function handleAddSplit(groupId) {
  currentPrism = addSplitToGroup(currentPrism, groupId);
  savePrism(currentPrism);
  renderAll();

  const group = currentPrism.splitGroups.find(g => g.id === groupId);
  if (group) {
    showSuccess(`Added variant ${group.childDeckIds.length} to "${group.name}".`);
  }
}

function handleUnsplit(groupId) {
  const group = currentPrism.splitGroups.find(g => g.id === groupId);
  if (!group) return;

  const groupName = group.name;
  currentPrism = unsplitGroup(currentPrism, groupId);
  savePrism(currentPrism);
  renderAll();
  showSuccess(`Merged "${groupName}" back into a single deck.`);
}

function handleNewPrism() {
  // Save current PRISM (already saved, but ensure it's up to date)
  savePrism(currentPrism);
  
  // Create new PRISM
  currentPrism = createPrism();
  savePrism(currentPrism);
  setCurrentPrism(currentPrism.id);
  
  elements.newPrismDialog.open = false;
  
  // Reset and re-render
  resetDeckForm();
  initColorSwatches();
  renderAll();
}

function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Read file content
  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    if (elements.deckList) {
      elements.deckList.value = content;
    }

    // Try to extract deck name from filename
    if (elements.deckName && !elements.deckName.value) {
      const nameWithoutExt = file.name.replace(/\.(txt|dec|dek|mwDeck)$/i, '');
      elements.deckName.value = nameWithoutExt;
    }

    showSuccess(`Loaded ${file.name}`);
  };

  reader.onerror = () => {
    showError('Failed to read file. Please try again.');
  };

  reader.readAsText(file);
}

function handleEditFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Read file content
  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    if (elements.editDeckList) {
      elements.editDeckList.value = content;
    }

    showSuccess(`Loaded ${file.name}`);
  };

  reader.onerror = () => {
    showError('Failed to read file. Please try again.');
  };

  reader.readAsText(file);
}

function handleJsonImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const jsonData = JSON.parse(event.target.result);

      // Validate the JSON structure
      let prismData = null;

      // Handle both export formats:
      // 1. Direct PRISM object with decks array
      // 2. Export format with { prism: { decks: [...] } }
      if (jsonData.prism && jsonData.prism.decks) {
        prismData = jsonData.prism;
      } else if (jsonData.decks && Array.isArray(jsonData.decks)) {
        prismData = jsonData;
      } else {
        throw new Error('Invalid PRISM JSON format. Expected decks array.');
      }

      // Validate decks
      if (!prismData.decks || prismData.decks.length === 0) {
        throw new Error('No decks found in the imported file.');
      }

      // Create new PRISM from imported data
      const newPrism = createPrism(prismData.name || 'Imported PRISM');
      newPrism.id = prismData.id || newPrism.id;
      newPrism.createdAt = prismData.createdAt || newPrism.createdAt;
      newPrism.updatedAt = new Date().toISOString();
      newPrism.markedCards = prismData.markedCards || [];
      newPrism.removedCards = prismData.removedCards || [];

      // Import each deck
      for (const deck of prismData.decks) {
        // Handle both full deck objects and export format (which may have cardCount instead of cards)
        const deckCards = deck.cards || [];

        const newDeck = createDeck({
          id: deck.id,
          name: deck.name,
          commander: deck.commander,
          bracket: deck.bracket,
          color: deck.color,
          stripePosition: deck.stripePosition,
          cards: deckCards,
          createdAt: deck.createdAt,
          updatedAt: deck.updatedAt
        });

        newPrism.decks.push(newDeck);
      }

      // Save and switch to imported PRISM
      savePrism(newPrism);
      setCurrentPrism(newPrism.id);
      currentPrism = newPrism;

      // Update UI
      initColorSwatches();
      renderAll();

      showSuccess(`Imported "${newPrism.name}" with ${newPrism.decks.length} decks.`);

    } catch (err) {
      console.error('JSON import error:', err);
      showError(err.message || 'Failed to parse JSON file. Please check the format.');
    }
  };

  reader.onerror = () => {
    showError('Failed to read file. Please try again.');
  };

  reader.readAsText(file);

  // Reset file input so same file can be selected again
  e.target.files = [];
}

async function handleMoxfieldImport() {
  const urlOrId = elements.moxfieldUrl?.value?.trim();
  if (!urlOrId) {
    showMoxfieldError('Please enter a deck URL.');
    return;
  }

  // Clear previous messages
  hideMoxfieldMessages();

  // Set loading state
  const btn = elements.btnImportMoxfield;
  if (btn) btn.loading = true;

  try {
    // Detect which service based on URL/input
    let deckData;
    let serviceName;

    if (urlOrId.includes('archidekt.com') || extractArchidektId(urlOrId)) {
      // Try Archidekt first if URL contains archidekt or is a numeric ID
      if (urlOrId.includes('archidekt.com') || /^\d+$/.test(urlOrId)) {
        serviceName = 'Archidekt';
        deckData = await importFromArchidekt(urlOrId);
      } else {
        serviceName = 'Moxfield';
        deckData = await importFromMoxfield(urlOrId);
      }
    } else if (urlOrId.includes('moxfield.com') || extractMoxfieldId(urlOrId)) {
      serviceName = 'Moxfield';
      deckData = await importFromMoxfield(urlOrId);
    } else {
      throw new Error('Could not detect deck source. Please use a Moxfield or Archidekt URL.');
    }

    // Fill in the deck form with imported data
    if (elements.deckName) {
      elements.deckName.value = deckData.name || '';
    }
    if (elements.deckCommander) {
      elements.deckCommander.value = deckData.commander || '';
    }
    if (elements.deckList) {
      elements.deckList.value = toDecklistText(deckData);
    }

    // Show success message
    showMoxfieldSuccess(`Imported "${deckData.name}" from ${serviceName} (${deckData.cards.length} cards). Review the form and click "Add Deck" to save.`);

    // Clear the URL input
    if (elements.moxfieldUrl) {
      elements.moxfieldUrl.value = '';
    }

    // Collapse the import section
    if (elements.moxfieldImportSection) {
      elements.moxfieldImportSection.open = false;
    }

  } catch (err) {
    console.error('Deck import error:', err);
    showMoxfieldError(err.message || 'Failed to import deck.');
  } finally {
    if (btn) btn.loading = false;
  }
}

function showMoxfieldError(message) {
  if (elements.moxfieldError) {
    elements.moxfieldError.textContent = message;
    elements.moxfieldError.hidden = false;
  }
  if (elements.moxfieldSuccess) {
    elements.moxfieldSuccess.hidden = true;
  }
}

function showMoxfieldSuccess(message) {
  if (elements.moxfieldSuccess) {
    elements.moxfieldSuccess.textContent = message;
    elements.moxfieldSuccess.hidden = false;
  }
  if (elements.moxfieldError) {
    elements.moxfieldError.hidden = true;
  }
}

function hideMoxfieldMessages() {
  if (elements.moxfieldError) elements.moxfieldError.hidden = true;
  if (elements.moxfieldSuccess) elements.moxfieldSuccess.hidden = true;
}

// Edit dialog URL import
async function handleEditUrlImport() {
  const urlOrId = elements.editImportUrl?.value?.trim();
  if (!urlOrId) {
    showEditImportError('Please enter a deck URL.');
    return;
  }

  hideEditImportMessages();

  const btn = elements.btnEditImportUrl;
  if (btn) btn.loading = true;

  try {
    let deckData;
    let serviceName;

    if (urlOrId.includes('archidekt.com') || extractArchidektId(urlOrId)) {
      if (urlOrId.includes('archidekt.com') || /^\d+$/.test(urlOrId)) {
        serviceName = 'Archidekt';
        deckData = await importFromArchidekt(urlOrId);
      } else {
        serviceName = 'Moxfield';
        deckData = await importFromMoxfield(urlOrId);
      }
    } else if (urlOrId.includes('moxfield.com') || extractMoxfieldId(urlOrId)) {
      serviceName = 'Moxfield';
      deckData = await importFromMoxfield(urlOrId);
    } else {
      throw new Error('Could not detect deck source. Please use a Moxfield or Archidekt URL.');
    }

    // Fill in the edit form - only update the decklist by default
    // Keep existing name/commander/color unless user changes them
    if (elements.editDeckList) {
      elements.editDeckList.value = toDecklistText(deckData);
    }

    showEditImportSuccess(`Imported "${deckData.name}" from ${serviceName} (${deckData.cards.length} cards). Review and click "Save Changes" to update.`);

    // Clear the URL input
    if (elements.editImportUrl) {
      elements.editImportUrl.value = '';
    }

    // Collapse the import section
    if (elements.editImportSection) {
      elements.editImportSection.open = false;
    }

  } catch (err) {
    console.error('Edit deck import error:', err);
    showEditImportError(err.message || 'Failed to import deck.');
  } finally {
    if (btn) btn.loading = false;
  }
}

function showEditImportError(message) {
  if (elements.editImportError) {
    elements.editImportError.textContent = message;
    elements.editImportError.hidden = false;
  }
  if (elements.editImportSuccess) {
    elements.editImportSuccess.hidden = true;
  }
}

function showEditImportSuccess(message) {
  if (elements.editImportSuccess) {
    elements.editImportSuccess.textContent = message;
    elements.editImportSuccess.hidden = false;
  }
  if (elements.editImportError) {
    elements.editImportError.hidden = true;
  }
}

function hideEditImportMessages() {
  if (elements.editImportError) elements.editImportError.hidden = true;
  if (elements.editImportSuccess) elements.editImportSuccess.hidden = true;
}

function handleStripeReorder(deckId, direction) {
  const currentIndex = currentPrism.decks.findIndex(d => d.id === deckId);
  if (currentIndex === -1) return;
  
  const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (newIndex < 0 || newIndex >= currentPrism.decks.length) return;
  
  // Create new order
  const deckIds = currentPrism.decks
    .sort((a, b) => a.stripePosition - b.stripePosition)
    .map(d => d.id);
  
  // Swap positions
  [deckIds[currentIndex], deckIds[newIndex]] = [deckIds[newIndex], deckIds[currentIndex]];
  
  // Apply new order
  currentPrism = reorderStripes(currentPrism, deckIds);
  savePrism(currentPrism);

  renderAll();
}

/**
 * Auto-clear cards from the removed list if they've been added back to a deck.
 * Call this after adding or editing a deck.
 * @param {Array} newCards - The cards in the newly added/updated deck
 * @returns {number} Number of cards auto-cleared
 */
function autoClearRemovedCards(newCards) {
  if (!currentPrism?.removedCards?.length || !newCards?.length) return 0;

  const newCardNames = new Set(
    newCards.map(c => c.name.toLowerCase().trim())
  );

  const before = currentPrism.removedCards.length;
  currentPrism.removedCards = currentPrism.removedCards.filter(
    rc => !newCardNames.has(rc.cardName.toLowerCase().trim())
  );

  return before - currentPrism.removedCards.length;
}

/**
 * Handle clearing a removed card entry (user has removed the physical mark)
 */
function handleClearRemoved(cardName, deckId) {
  if (!currentPrism || !currentPrism.removedCards) return;

  // Remove the entry from removedCards
  currentPrism.removedCards = currentPrism.removedCards.filter(
    rc => !(rc.cardName.toLowerCase() === cardName.toLowerCase() && rc.deckId === deckId)
  );

  currentPrism.updatedAt = new Date().toISOString();
  savePrism(currentPrism);

  // Update the removed filter button badge
  updateRemovedFilterBadge();

  renderResults();
  showSuccess(`Cleared "${cardName}" from removed list.`);
}

/**
 * Update the "Removed" filter button to show badge with count
 */
function updateRemovedFilterBadge() {
  const removedBtn = document.getElementById('removed-filter-btn');
  if (!removedBtn) return;

  const count = currentPrism?.removedCards?.length || 0;

  if (count > 0) {
    removedBtn.textContent = `Removed (${count})`;
    removedBtn.style.setProperty('--wa-color-surface', 'var(--wa-color-warning-surface-subtle)');
  } else {
    removedBtn.textContent = 'Removed';
    removedBtn.style.removeProperty('--wa-color-surface');
  }
}

/**
 * Handle marking a card as done
 */
function handleMarkToggle(event) {
  const checkbox = event.currentTarget; // Use currentTarget for the element the listener is on
  const row = checkbox.closest('tr');
  const cardKey = row?.dataset?.cardKey;

  if (!cardKey || !currentPrism) {
    console.warn('Mark toggle failed:', { cardKey, hasPrism: !!currentPrism });
    return;
  }

  // Initialize markedCards array if it doesn't exist
  if (!currentPrism.markedCards) {
    currentPrism.markedCards = [];
  }

  const isChecked = checkbox.checked;

  if (isChecked) {
    // Add to marked cards
    if (!currentPrism.markedCards.includes(cardKey)) {
      currentPrism.markedCards.push(cardKey);
    }
    row.classList.add('marked-row');
  } else {
    // Remove from marked cards
    currentPrism.markedCards = currentPrism.markedCards.filter(c => c !== cardKey);
    row.classList.remove('marked-row');
  }

  // Save to localStorage
  currentPrism.updatedAt = new Date().toISOString();
  savePrism(currentPrism);

  console.log('Card marked:', cardKey, 'checked:', isChecked, 'total marked:', currentPrism.markedCards.length);
}

// ============================================================================
// Rendering
// ============================================================================

function renderAll() {
  renderPrismHeader();
  renderDecksList();
  renderResults();
  renderExport();
  updateRemovedFilterBadge();
}

function renderPrismHeader() {
  if (elements.prismName) {
    elements.prismName.value = currentPrism.name;
  }
  if (elements.deckCountTag) {
    const logicalCount = getLogicalDeckCount(currentPrism);
    elements.deckCountTag.textContent = `${logicalCount}/32 decks`;

    // Update tag variant based on count
    if (logicalCount >= 32) {
      elements.deckCountTag.variant = 'warning';
    } else if (logicalCount >= 20) {
      elements.deckCountTag.variant = 'neutral';
    } else {
      elements.deckCountTag.variant = 'success';
    }
  }
}

function renderDeckCard(deck, showActions = true) {
  const slotLabel = formatSlotLabel(deck.stripePosition);
  const isInGroup = !!deck.splitGroupId;

  return `
    <div class="deck-card-inner ${isInGroup ? 'split-child-card' : ''}" data-deck-id="${deck.id}">
      <div class="wa-split wa-align-items-center">
        <div class="wa-cluster wa-gap-m wa-align-items-center">
          <div class="deck-color-indicator" style="background-color: ${deck.color};" title="${getColorName(deck.color)}"></div>
          <div class="wa-stack wa-gap-2xs">
            <div class="wa-cluster wa-gap-s wa-align-items-center">
              <span class="${isInGroup ? 'wa-heading-s' : 'wa-heading-m'}">${escapeHtml(deck.name)}</span>
              <wa-tag size="small" variant="${isInGroup ? 'brand' : 'neutral'}">${slotLabel}</wa-tag>
              <wa-tag size="small" variant="neutral">Bracket ${deck.bracket}</wa-tag>
            </div>
            <div class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">
              ${escapeHtml(deck.commander)} • ${deck.cards.length} cards
            </div>
          </div>
        </div>
        ${showActions ? `
        <div class="wa-cluster wa-gap-xs">
          ${currentPrism.decks.length >= 2 ? `
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-what-if" data-deck-id="${deck.id}" title="What if I remove this deck?">
            <wa-icon name="flask"></wa-icon>
          </wa-button>
          ` : ''}
          ${!isInGroup ? `
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-split-deck" data-deck-id="${deck.id}" title="Split into variants">
            <wa-icon name="code-branch"></wa-icon>
          </wa-button>
          ` : ''}
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-edit-deck" data-deck-id="${deck.id}" title="Edit deck">
            <wa-icon name="pen-to-square"></wa-icon>
          </wa-button>
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-delete-deck" data-deck-id="${deck.id}" title="Delete deck">
            <wa-icon name="trash"></wa-icon>
          </wa-button>
        </div>
        ` : ''}
      </div>
      <div class="what-if-container" id="what-if-${deck.id}" style="display: none;"></div>
    </div>
  `;
}

function renderDecksList() {
  if (!elements.decksList) return;

  const sortedDecks = [...currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);
  const splitGroups = currentPrism.splitGroups || [];

  if (sortedDecks.length === 0) {
    elements.decksList.innerHTML = `
      <div class="wa-stack wa-gap-m wa-align-items-center" style="padding: var(--wa-space-xl); text-align: center;">
        <wa-icon name="layer-group" style="font-size: 2.5rem; color: var(--wa-color-neutral-text-subtle);"></wa-icon>
        <p style="color: var(--wa-color-neutral-text-subtle);">No decks added yet. Add your first deck below!</p>
      </div>
    `;
    return;
  }

  // Separate standalone decks from split children
  const renderedGroupIds = new Set();
  const htmlParts = [];

  // Build a render order: standalone decks by position, split groups by their Side A position
  const renderItems = [];

  for (const deck of sortedDecks) {
    if (!deck.splitGroupId) {
      renderItems.push({ type: 'standalone', deck, sortPosition: deck.stripePosition });
    } else if (!renderedGroupIds.has(deck.splitGroupId)) {
      renderedGroupIds.add(deck.splitGroupId);
      const group = splitGroups.find(g => g.id === deck.splitGroupId);
      if (group) {
        renderItems.push({ type: 'group', group, sortPosition: group.sideAPosition });
      }
    }
  }

  renderItems.sort((a, b) => a.sortPosition - b.sortPosition);

  for (const item of renderItems) {
    if (item.type === 'standalone') {
      htmlParts.push(`
        <wa-card class="deck-card" data-deck-id="${item.deck.id}">
          ${renderDeckCard(item.deck)}
        </wa-card>
      `);
    } else {
      const group = item.group;
      const children = group.childDeckIds
        .map(id => currentPrism.decks.find(d => d.id === id))
        .filter(Boolean);

      htmlParts.push(`
        <wa-card class="deck-card split-group-card" data-group-id="${group.id}">
          <div class="split-group-header">
            <div class="wa-split wa-align-items-center">
              <div class="wa-cluster wa-gap-m wa-align-items-center">
                <div class="deck-color-indicator" style="background-color: ${group.sideAColor};" title="${getColorName(group.sideAColor)}"></div>
                <div class="wa-stack wa-gap-2xs">
                  <div class="wa-cluster wa-gap-s wa-align-items-center">
                    <span class="wa-heading-m">${escapeHtml(group.name)}</span>
                    <wa-tag size="small" variant="neutral">${formatSlotLabel(group.sideAPosition, 'a')}</wa-tag>
                    <wa-tag size="small" variant="brand" appearance="outlined">
                      <wa-icon name="code-branch" style="font-size: 0.8em;"></wa-icon>
                      ${children.length} variants
                    </wa-tag>
                  </div>
                  <div class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">
                    ${escapeHtml(children[0]?.commander || '')} • Split deck group
                  </div>
                </div>
              </div>
              <div class="wa-cluster wa-gap-xs">
                <wa-button appearance="plain" variant="neutral" size="small"
                  class="btn-add-split" data-group-id="${group.id}" title="Add another variant">
                  <wa-icon name="plus"></wa-icon>
                </wa-button>
                <wa-button appearance="plain" variant="neutral" size="small"
                  class="btn-unsplit" data-group-id="${group.id}" title="Merge back into one deck">
                  <wa-icon name="code-merge"></wa-icon>
                </wa-button>
              </div>
            </div>
          </div>
          <div class="split-children">
            ${children.map(child => renderDeckCard(child)).join('')}
          </div>
        </wa-card>
      `);
    }
  }

  elements.decksList.innerHTML = htmlParts.join('');

  // Add event listeners
  elements.decksList.querySelectorAll('.btn-edit-deck').forEach(btn => {
    btn.addEventListener('click', () => handleEditClick(btn.dataset.deckId));
  });
  elements.decksList.querySelectorAll('.btn-delete-deck').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.deckId));
  });
  elements.decksList.querySelectorAll('.btn-what-if').forEach(btn => {
    btn.addEventListener('click', () => toggleWhatIfAnalysis(btn.dataset.deckId));
  });
  elements.decksList.querySelectorAll('.btn-split-deck').forEach(btn => {
    btn.addEventListener('click', () => handleSplitClick(btn.dataset.deckId));
  });
  elements.decksList.querySelectorAll('.btn-add-split').forEach(btn => {
    btn.addEventListener('click', () => handleAddSplit(btn.dataset.groupId));
  });
  elements.decksList.querySelectorAll('.btn-unsplit').forEach(btn => {
    btn.addEventListener('click', () => handleUnsplit(btn.dataset.groupId));
  });
}

function renderResults() {
  const processedCards = processCards(currentPrism);
  const sharedCardCount = processedCards.filter(c => c.deckCount > 1).length;

  // Update stats
  if (elements.statTotal) elements.statTotal.textContent = processedCards.length;
  if (elements.statShared) elements.statShared.textContent = sharedCardCount;

  // Show/hide based on deck count
  if (currentPrism.decks.length === 0) {
    if (elements.resultsStats) elements.resultsStats.style.display = 'none';
    if (elements.noResults) elements.noResults.style.display = 'flex';
    const tableContainer = document.getElementById('results-table-container');
    if (tableContainer) tableContainer.style.display = 'none';
    const filterParent = elements.resultsFilter?.parentElement;
    if (filterParent) filterParent.style.display = 'none';
    return;
  }

  if (elements.resultsStats) elements.resultsStats.style.display = '';
  if (elements.noResults) elements.noResults.style.display = 'none';
  const tableContainer = document.getElementById('results-table-container');
  if (tableContainer) tableContainer.style.display = '';
  const filterParent = elements.resultsFilter?.parentElement;
  if (filterParent) filterParent.style.display = '';

  // Apply filters
  const filter = elements.resultsFilter?.value || 'all';
  const search = (elements.resultsSearch?.value || '').toLowerCase().trim();

  let filteredCards = [...processedCards];
  let displayCards = []; // What we'll actually render

  if (filter === 'shared') {
    filteredCards = filteredCards.filter(c => c.deckCount > 1);
    displayCards = filteredCards;
  } else if (filter === 'unique') {
    filteredCards = filteredCards.filter(c => c.deckCount === 1);
    displayCards = filteredCards;
  } else if (filter === 'basics-by-deck') {
    // Show only basic lands, split into per-deck rows
    displayCards = [];
    for (const card of filteredCards) {
      if (card.isBasicLand) {
        // Create a separate row for each deck this basic appears in
        for (const stripe of card.stripes) {
          // Find the quantity for this specific deck
          const deck = currentPrism.decks.find(d => d.id === stripe.deckId);
          const deckCard = deck?.cards.find(c => c.name.toLowerCase() === card.name.toLowerCase());
          const quantity = deckCard?.quantity || 1;

          displayCards.push({
            name: `${card.name} (${stripe.deckName})`,
            displayName: card.name,
            deckName: stripe.deckName,
            isBasicLand: true,
            isBasicByDeck: true,
            totalQuantity: quantity,
            deckCount: 1,
            stripes: [stripe]
          });
        }
      }
      // Non-basic cards are excluded from this view
    }
    // Sort by land type first, then by deck name
    displayCards.sort((a, b) => {
      const landCompare = a.displayName.localeCompare(b.displayName);
      if (landCompare !== 0) return landCompare;
      return a.deckName.localeCompare(b.deckName);
    });
  } else if (filter === 'removed') {
    // Show cards that have been removed from decks and need marks cleared
    displayCards = [];
    const removedCards = currentPrism.removedCards || [];

    for (const removed of removedCards) {
      displayCards.push({
        name: removed.cardName,
        isRemoved: true,
        removedDeckId: removed.deckId,
        removedDeckName: removed.deckName,
        removedDeckColor: removed.deckColor,
        removedStripePosition: removed.stripePosition,
        removedAt: removed.removedAt,
        deckCount: 0, // Not in any deck now (for this stripe)
        stripes: [{
          position: removed.stripePosition,
          color: removed.deckColor,
          deckName: removed.deckName,
          deckId: removed.deckId
        }]
      });
    }

    // Sort by removal date (most recent first), then by card name
    displayCards.sort((a, b) => {
      const dateCompare = new Date(b.removedAt) - new Date(a.removedAt);
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name);
    });
  } else {
    displayCards = filteredCards;
  }

  if (search) {
    displayCards = displayCards.filter(c =>
      c.name.toLowerCase().includes(search)
    );
  }

  // Apply deck filter (if any decks are selected)
  if (selectedDeckIds.size > 0) {
    displayCards = displayCards.filter(card => {
      // Check if any of the card's stripes match a selected deck
      return card.stripes.some(s => selectedDeckIds.has(s.deckId));
    });
  }

  // Render deck filter menu and overlap matrix
  renderDeckFilterMenu();
  renderOverlapMatrix();

  // Apply sorting
  displayCards = sortCards(displayCards, sortState.column, sortState.direction);

  // Render table header with sort indicators
  renderResultsHeader();

  // Render table body
  if (!elements.resultsTbody) return;

  const showAllSlots = elements.showAllSlots?.checked || false;
  const totalDecks = currentPrism?.decks?.length || 0;

  elements.resultsTbody.innerHTML = displayCards.map(card => {
    // Handle removed cards differently
    if (card.isRemoved) {
      const removedKey = `${card.name}|${card.removedDeckId}`;
      return `
        <tr class="removed-row" data-removed-key="${escapeHtml(removedKey)}">
          <td>${escapeHtml(card.name)}</td>
          <td>
            <div class="wa-cluster wa-gap-xs wa-align-items-center">
              <div
                class="stripe-indicator"
                style="background-color: ${card.removedDeckColor};"
                title="Remove from ${formatSlotLabel(card.removedStripePosition)}"
              ></div>
              <span class="removed-deck-label">Remove from ${escapeHtml(card.removedDeckName)}</span>
            </div>
          </td>
          <td style="text-align: center;">
            <wa-button
              appearance="plain"
              variant="neutral"
              size="small"
              class="btn-clear-removed"
              data-card-name="${escapeHtml(card.name)}"
              data-deck-id="${card.removedDeckId}"
              title="Mark as cleared"
            >
              <wa-icon name="check"></wa-icon>
            </wa-button>
          </td>
        </tr>
      `;
    }

    let stripeIndicators;

    if (showAllSlots && totalDecks > 0) {
      // Collect all used positions (deck positions + split group Side A positions)
      const allPositions = [...new Set([
        ...currentPrism.decks.map(d => d.stripePosition),
        ...(currentPrism.splitGroups || []).map(g => g.sideAPosition)
      ])].sort((a, b) => a - b);

      const stripeMap = new Map(card.stripes.map(s => [s.position, s]));
      stripeIndicators = '';
      for (const pos of allPositions) {
        const stripe = stripeMap.get(pos);
        if (stripe) {
          stripeIndicators += `
            <div
              class="stripe-indicator${stripe.side === 'b' ? ' stripe-side-b' : ''}"
              style="background-color: ${stripe.color};"
              title="${formatSlotLabel(stripe.position)}: ${escapeHtml(stripe.deckName)}"
            ></div>`;
        } else {
          stripeIndicators += `
            <div
              class="stripe-indicator stripe-empty"
              title="${formatSlotLabel(pos)}: Empty"
            ></div>`;
        }
      }
    } else {
      // Show only filled slots (default)
      stripeIndicators = card.stripes.map(s => `
        <div
          class="stripe-indicator${s.side === 'b' ? ' stripe-side-b' : ''}"
          style="background-color: ${s.color};"
          title="${formatSlotLabel(s.position)}: ${escapeHtml(s.deckName)}"
        ></div>
      `).join('');
    }

    const rowClass = card.deckCount > 1 ? 'shared-row' : '';
    const nameClass = card.isBasicLand ? 'basic-land' : '';
    const basicTag = card.isBasicLand && !card.isBasicByDeck ? ' <span class="basic-tag">(Basic)</span>' : '';
    const copiesCell = filter === 'basics-by-deck' ? `<td>${card.totalQuantity}</td>` : '';

    // Check if card is marked (use original card name for basics-by-deck entries)
    const cardKey = card.isBasicByDeck ? `${card.displayName}|${card.deckName}` : card.name;
    const isMarked = currentPrism.markedCards?.includes(cardKey) || false;
    const markedClass = isMarked ? 'marked-row' : '';

    // Prepare stripes data for preview (exclude position-only data for cleaner JSON)
    // Escape for use in HTML attribute (escape single quotes and ampersands)
    const stripesJson = JSON.stringify(card.stripes.map(s => ({
      position: s.position,
      color: s.color,
      deckName: s.deckName,
      side: s.side || 'a'
    }))).replace(/&/g, '&amp;').replace(/'/g, '&#39;');

    return `
      <tr class="${rowClass} ${markedClass}" data-card-key="${escapeHtml(cardKey)}">
        <td class="${nameClass} card-name-cell" data-card-name="${escapeHtml(card.name)}" data-stripes='${stripesJson}'>${escapeHtml(card.name)}${basicTag}</td>${copiesCell}
        <td><div class="stripe-indicators">${stripeIndicators}</div></td>
        <td style="text-align: center;">
          <input type="checkbox" class="mark-checkbox" ${isMarked ? 'checked' : ''}>
        </td>
      </tr>
    `;
  }).join('');

  // Add event listeners for checkboxes
  elements.resultsTbody.querySelectorAll('.mark-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleMarkToggle);
  });

  // Add event listeners for "Clear removed" buttons
  elements.resultsTbody.querySelectorAll('.btn-clear-removed').forEach(btn => {
    btn.addEventListener('click', () => {
      const cardName = btn.dataset.cardName;
      const deckId = btn.dataset.deckId;
      handleClearRemoved(cardName, deckId);
    });
  });

  const colspan = filter === 'basics-by-deck' ? 4 : 3;

  // Handle empty states
  if (displayCards.length === 0) {
    let emptyMessage = 'No cards match your filter.';

    if (filter === 'removed') {
      emptyMessage = 'No cards pending removal. Edit a deck to see cards that need marks cleared.';
    } else if (processedCards.length === 0) {
      return; // Don't show message if no cards exist at all
    }

    elements.resultsTbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" style="text-align: center; color: var(--wa-color-neutral-text-subtle); padding: var(--wa-space-xl);">
          ${emptyMessage}
        </td>
      </tr>
    `;
    return;
  }

  // Prefetch card images for visible cards (first 20 to avoid rate limiting)
  const cardNames = displayCards
    .slice(0, 20)
    .map(c => c.isBasicByDeck ? c.displayName : c.name)
    .filter(Boolean);
  if (cardNames.length > 0) {
    prefetchCards(cardNames).catch(() => {
      // Silently ignore prefetch errors
    });
  }
}

function sortCards(cards, column, direction) {
  // Pre-compute lookup for marked status
  const markedSet = column === 'marked' ? new Set(currentPrism?.markedCards || []) : null;

  return cards.sort((a, b) => {
    let comparison = 0;

    switch (column) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'copies':
        comparison = a.totalQuantity - b.totalQuantity;
        break;
      case 'deckCount':
        // Sort by deck count (most shared first by default)
        comparison = a.deckCount - b.deckCount;
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
      case 'marked': {
        const aKey = a.isBasicByDeck ? `${a.displayName}|${a.deckName}` : a.name;
        const bKey = b.isBasicByDeck ? `${b.displayName}|${b.deckName}` : b.name;
        const aMarked = markedSet.has(aKey) ? 1 : 0;
        const bMarked = markedSet.has(bKey) ? 1 : 0;
        comparison = aMarked - bMarked;
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
      }
      default:
        comparison = 0;
    }

    return direction === 'desc' ? -comparison : comparison;
  });
}

function renderResultsHeader() {
  const thead = document.querySelector('#results-table thead');
  if (!thead) return;

  const filter = elements.resultsFilter?.value || 'all';
  const showCopies = filter === 'basics-by-deck';
  const isRemovedFilter = filter === 'removed';

  const getSortIcon = (column) => {
    if (sortState.column !== column) return 'sort';
    return sortState.direction === 'asc' ? 'sort-up' : 'sort-down';
  };

  const getSortedClass = (column) => {
    return sortState.column === column ? 'sorted' : '';
  };

  const copiesHeader = showCopies ? `
      <th class="sortable ${getSortedClass('copies')}" data-sort="copies">
        Copies
        <wa-icon name="${getSortIcon('copies')}" class="sort-icon"></wa-icon>
      </th>` : '';

  // Different header for removed cards view
  if (isRemovedFilter) {
    thead.innerHTML = `
      <tr>
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card Name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>
        <th>Remove Mark From</th>
        <th style="width: 60px; text-align: center;">Clear</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card Name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>${copiesHeader}
        <th class="sortable ${getSortedClass('deckCount')}" data-sort="deckCount">
          Stripes
          <wa-icon name="${getSortIcon('deckCount')}" class="sort-icon"></wa-icon>
        </th>
        <th class="sortable ${getSortedClass('marked')}" data-sort="marked" style="width: 60px; text-align: center;">
          Done
          <wa-icon name="${getSortIcon('marked')}" class="sort-icon"></wa-icon>
        </th>
      </tr>
    `;
  }

  // Add click handlers for sortable columns
  thead.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      const defaultDirection = column === 'name' ? 'asc' : 'desc';

      if (sortState.column === column) {
        if (sortState.direction === defaultDirection) {
          // First click was default, toggle to opposite
          sortState.direction = defaultDirection === 'asc' ? 'desc' : 'asc';
        } else {
          // Already toggled, reset to default sort (deckCount desc)
          sortState.column = 'deckCount';
          sortState.direction = 'desc';
        }
      } else {
        // New column, set default direction for that column
        sortState.column = column;
        sortState.direction = defaultDirection;
      }
      renderResults();
    });
  });
}

function renderOverlapMatrix() {
  if (!elements.overlapMatrixContainer || !elements.overlapMatrix) return;

  // Need at least 2 decks for comparison
  if (currentPrism.decks.length < 2) {
    elements.overlapMatrixContainer.style.display = 'none';
    return;
  }

  elements.overlapMatrixContainer.style.display = '';

  const overlap = calculateOverlap(currentPrism);
  const decks = [...currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  // Build lookup map for pairwise overlap counts
  const overlapMap = {};
  for (const pair of overlap.pairwiseOverlap) {
    const key1 = `${pair.deck1}|${pair.deck2}`;
    const key2 = `${pair.deck2}|${pair.deck1}`;
    overlapMap[key1] = pair.overlapCount;
    overlapMap[key2] = pair.overlapCount;
  }

  // Find max overlap for color scaling
  const maxOverlap = Math.max(...overlap.pairwiseOverlap.map(p => p.overlapCount), 1);

  // Truncate deck names for column headers
  const truncate = (name, len = 12) => name.length > len ? name.slice(0, len) + '…' : name;

  // Build the table
  let html = `
    <table class="overlap-matrix-table">
      <thead>
        <tr>
          <th></th>
          ${decks.map(d => `
            <th title="${escapeHtml(d.name)}">
              <div class="overlap-header">
                <div class="deck-color-dot" style="background: ${d.color};"></div>
                <span>${escapeHtml(truncate(d.name))}</span>
              </div>
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${decks.map(rowDeck => `
          <tr>
            <th title="${escapeHtml(rowDeck.name)}">
              <div class="overlap-header">
                <div class="deck-color-dot" style="background: ${rowDeck.color};"></div>
                <span>${escapeHtml(truncate(rowDeck.name))}</span>
              </div>
            </th>
            ${decks.map(colDeck => {
              if (rowDeck.id === colDeck.id) {
                return `<td class="overlap-cell overlap-self">
                  <span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">${rowDeck.cards.length}</span>
                </td>`;
              }
              const count = overlapMap[`${rowDeck.name}|${colDeck.name}`] || 0;
              const intensity = count / maxOverlap;
              const bg = count > 0
                ? `rgba(var(--wa-color-brand-60-rgb, 99, 102, 241), ${0.1 + intensity * 0.5})`
                : 'transparent';
              return `<td class="overlap-cell${count > 0 ? ' overlap-has-value' : ''}"
                style="background: ${bg};"
                title="${escapeHtml(rowDeck.name)} & ${escapeHtml(colDeck.name)}: ${count} shared cards">
                <span>${count}</span>
              </td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  elements.overlapMatrix.innerHTML = html;
}

function toggleWhatIfAnalysis(deckId) {
  const container = document.getElementById(`what-if-${deckId}`);
  if (!container) return;

  if (container.style.display === 'none') {
    // Close any other open what-if panels
    document.querySelectorAll('.what-if-container').forEach(el => {
      el.style.display = 'none';
      el.innerHTML = '';
    });
    renderWhatIfAnalysis(deckId, container);
    container.style.display = '';
  } else {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function renderWhatIfAnalysis(deckId, container) {
  const deck = currentPrism.decks.find(d => d.id === deckId);
  if (!deck) return;

  const processedCards = processCards(currentPrism);

  // Normalize deck card names for lookup
  const deckCardNames = new Set(
    deck.cards.map(c => c.name.toLowerCase())
  );

  // Categorize cards in this deck
  const becomeMarkFree = []; // Cards that go from deckCount=2 to 1 (no longer need marks)
  const removedEntirely = []; // Cards unique to this deck (deckCount=1), lost entirely
  const stillShared = []; // Cards in 3+ decks, still need marks even after removal
  let totalMarksRemoved = 0;

  for (const card of processedCards) {
    if (!deckCardNames.has(card.name.toLowerCase())) continue;

    if (card.deckCount === 1) {
      removedEntirely.push(card);
    } else if (card.deckCount === 2) {
      becomeMarkFree.push(card);
      totalMarksRemoved++;
    } else {
      stillShared.push({ ...card, newDeckCount: card.deckCount - 1 });
      totalMarksRemoved++;
    }
  }

  // Sort by deck count descending (most shared first)
  becomeMarkFree.sort((a, b) => b.deckCount - a.deckCount || a.name.localeCompare(b.name));
  stillShared.sort((a, b) => b.deckCount - a.deckCount || a.name.localeCompare(b.name));

  const showAllMarkFree = becomeMarkFree.length <= 8;
  const showAllStillShared = stillShared.length <= 8;

  container.innerHTML = `
    <div class="what-if-panel">
      <div class="wa-cluster wa-gap-xs wa-align-items-center" style="margin-bottom: var(--wa-space-s);">
        <wa-icon name="flask" style="color: var(--wa-color-brand-text);"></wa-icon>
        <span class="wa-heading-s">What if you remove "${escapeHtml(deck.name)}"?</span>
      </div>

      <div class="what-if-stats">
        <div class="what-if-stat">
          <div class="stat-value" style="color: var(--wa-color-success-text);">${becomeMarkFree.length}</div>
          <div class="stat-label">Cards become CORE</div>
        </div>
        <div class="what-if-stat">
          <div class="stat-value" style="color: var(--wa-color-warning-text);">${stillShared.length}</div>
          <div class="stat-label">Still shared with others</div>
        </div>
        <div class="what-if-stat">
          <div class="stat-value" style="color: var(--wa-color-danger-text);">${removedEntirely.length}</div>
          <div class="stat-label">Unique cards lost</div>
        </div>
        <div class="what-if-stat">
          <div class="stat-value">${totalMarksRemoved}</div>
          <div class="stat-label">Stripe marks removed</div>
        </div>
      </div>

      ${becomeMarkFree.length > 0 ? `
        <div class="wa-stack wa-gap-xs" style="margin-bottom: var(--wa-space-m);">
          <span class="wa-caption-m" style="color: var(--wa-color-success-text);">
            <wa-icon name="circle-check" style="font-size: 0.9em;"></wa-icon>
            Cards that would become CORE (was in 2 decks, would drop to 1):
          </span>
          <ul class="what-if-card-list">
            ${becomeMarkFree.slice(0, showAllMarkFree ? undefined : 5).map(card => `
              <li>${escapeHtml(card.name)} <span style="color: var(--wa-color-neutral-text-subtle);">— was in ${card.deckCount} decks</span></li>
            `).join('')}
            ${!showAllMarkFree ? `<li style="color: var(--wa-color-neutral-text-subtle);">…and ${becomeMarkFree.length - 5} more</li>` : ''}
          </ul>
        </div>
      ` : ''}

      ${stillShared.length > 0 ? `
        <div class="wa-stack wa-gap-xs">
          <span class="wa-caption-m" style="color: var(--wa-color-warning-text);">
            <wa-icon name="triangle-exclamation" style="font-size: 0.9em;"></wa-icon>
            Cards still needing marks (shared with other decks):
          </span>
          <ul class="what-if-card-list">
            ${stillShared.slice(0, showAllStillShared ? undefined : 5).map(card => `
              <li>${escapeHtml(card.name)} <span style="color: var(--wa-color-neutral-text-subtle);">— ${card.deckCount} decks → ${card.newDeckCount}</span></li>
            `).join('')}
            ${!showAllStillShared ? `<li style="color: var(--wa-color-neutral-text-subtle);">…and ${stillShared.length - 5} more</li>` : ''}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

function renderDeckFilterMenu() {
  if (!elements.deckFilterMenu) return;

  const sortedDecks = [...currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  if (sortedDecks.length === 0) {
    elements.deckFilterMenu.innerHTML = '<wa-menu-item disabled>No decks added</wa-menu-item>';
    return;
  }

  // Build menu with checkboxes using native inputs for performance
  elements.deckFilterMenu.innerHTML = `
    <wa-menu-item class="deck-filter-clear" style="border-bottom: 1px solid var(--wa-color-neutral-stroke-subtle);">
      <wa-icon slot="start" name="xmark"></wa-icon>
      Clear All Filters
    </wa-menu-item>
    ${sortedDecks.map(deck => `
      <wa-menu-item class="deck-filter-item" data-deck-id="${deck.id}">
        <input type="checkbox" class="deck-filter-checkbox" data-deck-id="${deck.id}"
          ${selectedDeckIds.has(deck.id) ? 'checked' : ''}
          style="margin-right: 8px;">
        <div class="deck-color-indicator small" style="background-color: ${deck.color}; margin-right: 8px;"></div>
        ${escapeHtml(deck.name)}
      </wa-menu-item>
    `).join('')}
  `;

  // Add event listeners for checkboxes
  elements.deckFilterMenu.querySelectorAll('.deck-filter-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation(); // Prevent menu item click
      const deckId = checkbox.dataset.deckId;
      if (checkbox.checked) {
        selectedDeckIds.add(deckId);
      } else {
        selectedDeckIds.delete(deckId);
      }
      updateDeckFilterButtonLabel();
      renderResults();
    });
  });

  // Add clear all listener
  const clearBtn = elements.deckFilterMenu.querySelector('.deck-filter-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selectedDeckIds.clear();
      updateDeckFilterButtonLabel();
      renderResults();
    });
  }

  // Update button label to show how many filters active
  updateDeckFilterButtonLabel();
}

function updateDeckFilterButtonLabel() {
  const btn = elements.deckFilterDropdown?.querySelector('wa-button');
  if (!btn) return;

  if (selectedDeckIds.size === 0) {
    btn.innerHTML = '<wa-icon slot="start" name="filter"></wa-icon>Filter by Deck';
  } else {
    btn.innerHTML = `<wa-icon slot="start" name="filter"></wa-icon>Decks (${selectedDeckIds.size})`;
  }
}

function renderExport() {
  const sortedDecks = [...currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  // Show/hide reorder card based on deck count (needs 2+ decks to reorder)
  if (elements.reorderCard) {
    elements.reorderCard.style.display = sortedDecks.length >= 2 ? '' : 'none';
  }

  // Deck legend
  if (sortedDecks.length === 0) {
    if (elements.deckLegend) elements.deckLegend.style.display = 'none';
    if (elements.noDecksLegend) elements.noDecksLegend.style.display = '';
    if (elements.stripeReorderList) {
      elements.stripeReorderList.innerHTML = '';
    }
    return;
  }

  if (elements.deckLegend) elements.deckLegend.style.display = '';
  if (elements.noDecksLegend) elements.noDecksLegend.style.display = 'none';
  
  if (elements.deckLegend) {
    // Build legend items: standalone decks + split group headers with children
    const splitGroups = currentPrism.splitGroups || [];
    const renderedGroupIds = new Set();
    const legendItems = [];

    for (const deck of sortedDecks) {
      if (!deck.splitGroupId) {
        legendItems.push({ type: 'standalone', deck, sortPos: deck.stripePosition });
      } else if (!renderedGroupIds.has(deck.splitGroupId)) {
        renderedGroupIds.add(deck.splitGroupId);
        const group = splitGroups.find(g => g.id === deck.splitGroupId);
        if (group) legendItems.push({ type: 'group', group, sortPos: group.sideAPosition });
      }
    }
    legendItems.sort((a, b) => a.sortPos - b.sortPos);

    elements.deckLegend.innerHTML = legendItems.map(item => {
      if (item.type === 'standalone') {
        const slotLabel = formatSlotLabel(item.deck.stripePosition);
        return `
          <div class="wa-cluster wa-gap-xs wa-align-items-center">
            <div class="deck-color-indicator small" style="background-color: ${item.deck.color};"></div>
            <span><strong>${slotLabel}:</strong> ${escapeHtml(item.deck.name)}</span>
          </div>`;
      }
      const group = item.group;
      const children = group.childDeckIds.map(id => currentPrism.decks.find(d => d.id === id)).filter(Boolean);
      return `
        <div class="wa-stack wa-gap-2xs" style="width: 100%;">
          <div class="wa-cluster wa-gap-xs wa-align-items-center">
            <div class="deck-color-indicator small" style="background-color: ${group.sideAColor};"></div>
            <span><strong>${formatSlotLabel(group.sideAPosition, 'a')}:</strong> ${escapeHtml(group.name)} <span style="color:var(--wa-color-neutral-text-subtle);">(split group)</span></span>
          </div>
          ${children.map(child => `
            <div class="wa-cluster wa-gap-xs wa-align-items-center" style="padding-left: var(--wa-space-l);">
              <div class="deck-color-indicator small" style="background-color: ${child.color};"></div>
              <span><strong>${formatSlotLabel(child.stripePosition)}:</strong> ${escapeHtml(child.name)}</span>
            </div>
          `).join('')}
        </div>`;
    }).join('');
  }
  
  // Stripe reorder list
  if (elements.stripeReorderList) {
    elements.stripeReorderList.innerHTML = sortedDecks.map((deck, index) => {
      const slotLabel = formatSlotLabel(deck.stripePosition);
      return `
      <div class="reorder-item wa-split wa-align-items-center" data-deck-id="${deck.id}">
        <div class="wa-cluster wa-gap-s wa-align-items-center">
          <div class="deck-color-indicator" style="background-color: ${deck.color};"></div>
          <span><strong>${slotLabel}:</strong> ${escapeHtml(deck.name)}</span>
        </div>
        <div class="wa-cluster wa-gap-2xs">
          <wa-button 
            appearance="plain" 
            variant="neutral" 
            size="small"
            class="btn-move-up"
            data-deck-id="${deck.id}"
            ${index === 0 ? 'disabled' : ''}
            title="Move up"
          >
            <wa-icon name="chevron-up"></wa-icon>
          </wa-button>
          <wa-button 
            appearance="plain" 
            variant="neutral" 
            size="small"
            class="btn-move-down"
            data-deck-id="${deck.id}"
            ${index === sortedDecks.length - 1 ? 'disabled' : ''}
            title="Move down"
          >
            <wa-icon name="chevron-down"></wa-icon>
          </wa-button>
        </div>
      </div>
    `;
    }).join('');

    // Add reorder listeners
    elements.stripeReorderList.querySelectorAll('.btn-move-up').forEach(btn => {
      btn.addEventListener('click', () => handleStripeReorder(btn.dataset.deckId, 'up'));
    });
    elements.stripeReorderList.querySelectorAll('.btn-move-down').forEach(btn => {
      btn.addEventListener('click', () => handleStripeReorder(btn.dataset.deckId, 'down'));
    });
  }
}

// ============================================================================
// Form Helpers
// ============================================================================

function resetDeckForm() {
  // Reset form element
  if (elements.deckForm) {
    elements.deckForm.reset();
  }

  // Reset individual fields (Web Awesome components may need this)
  if (elements.deckName) elements.deckName.value = '';
  if (elements.deckCommander) elements.deckCommander.value = '';
  if (elements.deckBracket) elements.deckBracket.value = '2';
  if (elements.deckList) elements.deckList.value = '';
  if (elements.deckFileInput) elements.deckFileInput.files = [];

  // Set next available color
  const nextColor = getNextColor(currentPrism);
  if (elements.deckColor) elements.deckColor.value = nextColor;
  updateColorSwatchSelection();

  hideParseErrors();
  hideColorWarning();
}

function checkColorWarning() {
  const color = elements.deckColor?.value;
  if (!color) return;
  
  const existingDeck = isColorUsed(currentPrism, color);
  
  if (existingDeck) {
    showColorWarning(`This color is already used by "${existingDeck.name}".`);
  } else {
    hideColorWarning();
  }
}

function showColorWarning(message) {
  if (!elements.colorWarning) return;
  const span = elements.colorWarning.querySelector('span');
  if (span) span.textContent = message;
  elements.colorWarning.style.display = 'flex';
}

function hideColorWarning() {
  if (elements.colorWarning) {
    elements.colorWarning.style.display = 'none';
  }
}

function showParseErrors(errors) {
  if (!elements.parseErrors) return;
  elements.parseErrors.style.display = '';
  elements.parseErrors.innerHTML = `
    <wa-callout variant="warning">
      <strong>Some lines couldn't be parsed:</strong>
      <ul style="margin: 0.5em 0 0 1.5em; padding: 0;">
        ${errors.slice(0, 5).map(e => `<li>Line ${e.lineNumber}: ${escapeHtml(e.content)}</li>`).join('')}
        ${errors.length > 5 ? `<li>...and ${errors.length - 5} more</li>` : ''}
      </ul>
    </wa-callout>
  `;
}

function hideParseErrors() {
  if (elements.parseErrors) {
    elements.parseErrors.style.display = 'none';
    elements.parseErrors.innerHTML = '';
  }
}

// ============================================================================
// Notifications
// ============================================================================

function showError(message) {
  console.error('PRISM Error:', message);
  showToast(message, 'danger', 'circle-exclamation');
}

function showSuccess(message) {
  console.log('PRISM Success:', message);
  showToast(message, 'success', 'check-circle');
}

function showToast(message, variant = 'neutral', icon = 'info-circle') {
  const toastContainer = document.querySelector('#toast-container');
  if (toastContainer) {
    toastContainer.create(message, { variant, duration: 5000, icon });
  }
}

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Initialize
// ============================================================================

// Wait for DOM and then initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
