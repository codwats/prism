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
  getColorName
} from './processor.js';
import { 
  getCurrentPrism, 
  setCurrentPrism, 
  savePrism,
  getAllPrisms
} from './storage.js';
import { downloadCSV, downloadJSON, openPrintableGuide } from './export.js';

// ============================================================================
// State
// ============================================================================

let currentPrism = null;
let deckToDelete = null;
let deckToEdit = null;
let elements = null;
let sortState = { column: 'deckCount', direction: 'desc' }; // Default: most shared first

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
    btnUploadFile: document.getElementById('btn-upload-file'),
    fileNameDisplay: document.getElementById('file-name-display'),
    colorSwatches: document.getElementById('color-swatches'),
    colorWarning: document.getElementById('color-warning'),
    parseErrors: document.getElementById('parse-errors'),
    btnResetForm: document.getElementById('btn-reset-form'),
    
    // Decks list
    decksList: document.getElementById('decks-list'),
    reorderCard: document.getElementById('reorder-card'),
    
    // Results
    resultsStats: document.getElementById('results-stats'),
    statTotal: document.getElementById('stat-total'),
    statShared: document.getElementById('stat-shared'),
    resultsFilter: document.getElementById('results-filter'),
    resultsSearch: document.getElementById('results-search'),
    showAllSlots: document.getElementById('show-all-slots'),
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
    btnImportJson: document.getElementById('btn-import-json'),
    prismJsonInput: document.getElementById('prism-json-input'),
    importStatus: document.getElementById('import-status'),
    
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
    btnEditUploadFile: document.getElementById('btn-edit-upload-file'),
    editFileNameDisplay: document.getElementById('edit-file-name-display'),
    editParseErrors: document.getElementById('edit-parse-errors'),
    btnCancelEdit: document.getElementById('btn-cancel-edit'),
    btnConfirmEdit: document.getElementById('btn-confirm-edit')
  };
}

async function init() {
  console.log('PRISM: Initializing...');
  
  // Wait a tick for Web Awesome components to upgrade
  await new Promise(resolve => setTimeout(resolve, 100));
  
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

  // File upload
  if (elements.btnUploadFile) {
    elements.btnUploadFile.addEventListener('click', () => {
      elements.deckFileInput?.click();
    });
  }
  if (elements.deckFileInput) {
    elements.deckFileInput.addEventListener('change', handleFileUpload);
  }

  // JSON import
  if (elements.btnImportJson) {
    elements.btnImportJson.addEventListener('click', () => {
      elements.prismJsonInput?.click();
    });
  }
  if (elements.prismJsonInput) {
    elements.prismJsonInput.addEventListener('change', handleJsonImport);
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

  // Edit dialog file upload
  if (elements.btnEditUploadFile) {
    elements.btnEditUploadFile.addEventListener('click', () => {
      elements.editDeckFileInput?.click();
    });
  }
  if (elements.editDeckFileInput) {
    elements.editDeckFileInput.addEventListener('change', handleEditFileUpload);
  }
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

  // Check deck limit
  if (currentPrism.decks.length >= 32) {
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
  savePrism(currentPrism);
  
  console.log('PRISM: Deck added:', deck.name);
  
  // Reset form and re-render
  resetDeckForm();
  renderAll();
  
  // Show success feedback
  showSuccess(`Added "${name}" with ${parseResult.uniqueCards} cards.`);
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

  elements.editDialog.open = true;
}

function handleEditConfirm() {
  if (!deckToEdit) return;

  const deck = currentPrism.decks.find(d => d.id === deckToEdit);
  if (!deck) return;

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

  // Update deck
  deck.name = name;
  deck.commander = commander;
  deck.bracket = parseInt(bracket, 10);
  deck.color = color;
  deck.cards = parseResult.cards;
  deck.updatedAt = new Date().toISOString();

  // Update PRISM timestamp
  currentPrism.updatedAt = new Date().toISOString();

  // Save and close
  savePrism(currentPrism);
  deckToEdit = null;
  elements.editDialog.open = false;

  renderAll();
  showSuccess(`Updated "${name}" with ${parseResult.uniqueCards} cards.`);
}

function handleDeleteConfirm() {
  if (!deckToDelete) return;
  
  currentPrism = removeDeckFromPrism(currentPrism, deckToDelete);
  savePrism(currentPrism);
  
  deckToDelete = null;
  elements.deleteDialog.open = false;
  
  renderAll();
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

  // Show file name
  if (elements.fileNameDisplay) {
    elements.fileNameDisplay.textContent = file.name;
  }

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

  // Show file name
  if (elements.editFileNameDisplay) {
    elements.editFileNameDisplay.textContent = file.name;
  }

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

  // Reset file input so same file can be selected again
  e.target.value = '';
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

      // Update status
      if (elements.importStatus) {
        elements.importStatus.textContent = `Imported: ${file.name}`;
      }

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
  e.target.value = '';
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
}

function renderPrismHeader() {
  if (elements.prismName) {
    elements.prismName.value = currentPrism.name;
  }
  if (elements.deckCountTag) {
    elements.deckCountTag.textContent = `${currentPrism.decks.length}/32 decks`;

    // Update tag variant based on count
    if (currentPrism.decks.length >= 32) {
      elements.deckCountTag.variant = 'warning';
    } else if (currentPrism.decks.length >= 20) {
      elements.deckCountTag.variant = 'neutral';
    } else {
      elements.deckCountTag.variant = 'success';
    }
  }
}

function renderDecksList() {
  if (!elements.decksList) return;
  
  const sortedDecks = [...currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);
  
  if (sortedDecks.length === 0) {
    elements.decksList.innerHTML = `
      <div class="wa-stack wa-gap-m wa-align-items-center" style="padding: var(--wa-space-xl); text-align: center;">
        <wa-icon name="layer-group" style="font-size: 2.5rem; color: var(--wa-color-neutral-text-subtle);"></wa-icon>
        <p style="color: var(--wa-color-neutral-text-subtle);">No decks added yet. Add your first deck below!</p>
      </div>
    `;
    return;
  }
  
  elements.decksList.innerHTML = sortedDecks.map(deck => `
    <wa-card class="deck-card" data-deck-id="${deck.id}">
      <div class="wa-split wa-align-items-center">
        <div class="wa-cluster wa-gap-m wa-align-items-center">
          <div class="deck-color-indicator" style="background-color: ${deck.color};" title="${getColorName(deck.color)}"></div>
          <div class="wa-stack wa-gap-2xs">
            <div class="wa-cluster wa-gap-s wa-align-items-center">
              <span class="wa-heading-m">${escapeHtml(deck.name)}</span>
              <wa-tag size="small" variant="neutral">Slot ${deck.stripePosition}</wa-tag>
              <wa-tag size="small" variant="neutral">Bracket ${deck.bracket}</wa-tag>
            </div>
            <div class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">
              ${escapeHtml(deck.commander)} • ${deck.cards.length} cards
            </div>
          </div>
        </div>
        <div class="wa-cluster wa-gap-xs">
          <wa-button
            appearance="plain"
            variant="neutral"
            size="small"
            class="btn-edit-deck"
            data-deck-id="${deck.id}"
            title="Edit deck"
          >
            <wa-icon name="pen-to-square"></wa-icon>
          </wa-button>
          <wa-button
            appearance="plain"
            variant="neutral"
            size="small"
            class="btn-delete-deck"
            data-deck-id="${deck.id}"
            title="Delete deck"
          >
            <wa-icon name="trash"></wa-icon>
          </wa-button>
        </div>
      </div>
    </wa-card>
  `).join('');

  // Add edit button listeners
  elements.decksList.querySelectorAll('.btn-edit-deck').forEach(btn => {
    btn.addEventListener('click', () => handleEditClick(btn.dataset.deckId));
  });

  // Add delete button listeners
  elements.decksList.querySelectorAll('.btn-delete-deck').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.deckId));
  });
}

function renderResults() {
  const processedCards = processCards(currentPrism);
  const overlap = calculateOverlap(currentPrism);

  // Update stats
  if (elements.statTotal) elements.statTotal.textContent = overlap.totalUniqueCards;
  if (elements.statShared) elements.statShared.textContent = overlap.sharedCardCount;

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
  } else {
    displayCards = filteredCards;
  }

  if (search) {
    displayCards = displayCards.filter(c =>
      c.name.toLowerCase().includes(search)
    );
  }

  // Apply sorting
  displayCards = sortCards(displayCards, sortState.column, sortState.direction);

  // Render table header with sort indicators
  renderResultsHeader();

  // Render table body
  if (!elements.resultsTbody) return;

  const showAllSlots = elements.showAllSlots?.checked || false;
  const totalDecks = currentPrism?.decks?.length || 0;

  elements.resultsTbody.innerHTML = displayCards.map(card => {
    let stripeIndicators;

    if (showAllSlots && totalDecks > 0) {
      // Show all slots with empty placeholders
      const stripeMap = new Map(card.stripes.map(s => [s.position, s]));
      stripeIndicators = '';
      for (let i = 1; i <= totalDecks; i++) {
        const stripe = stripeMap.get(i);
        if (stripe) {
          stripeIndicators += `
            <div
              class="stripe-indicator"
              style="background-color: ${stripe.color};"
              title="Slot ${stripe.position}: ${escapeHtml(stripe.deckName)}"
            ></div>`;
        } else {
          stripeIndicators += `
            <div
              class="stripe-indicator stripe-empty"
              title="Slot ${i}: Empty"
            ></div>`;
        }
      }
    } else {
      // Show only filled slots (default)
      stripeIndicators = card.stripes.map(s => `
        <div
          class="stripe-indicator"
          style="background-color: ${s.color};"
          title="Slot ${s.position}: ${escapeHtml(s.deckName)}"
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

    return `
      <tr class="${rowClass} ${markedClass}" data-card-key="${escapeHtml(cardKey)}">
        <td class="${nameClass}">${escapeHtml(card.name)}${basicTag}</td>${copiesCell}
        <td><div class="stripe-indicators">${stripeIndicators}</div></td>
        <td style="text-align: center;">
          <wa-checkbox class="mark-checkbox" ${isMarked ? 'checked' : ''}></wa-checkbox>
        </td>
      </tr>
    `;
  }).join('');

  // Add event listeners for checkboxes
  elements.resultsTbody.querySelectorAll('.mark-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleMarkToggle);
  });

  const colspan = filter === 'basics-by-deck' ? 4 : 3;
  if (displayCards.length === 0 && processedCards.length > 0) {
    elements.resultsTbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" style="text-align: center; color: var(--wa-color-neutral-text-subtle); padding: var(--wa-space-xl);">
          No cards match your filter.
        </td>
      </tr>
    `;
  }
}

function sortCards(cards, column, direction) {
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
        comparison = a.deckCount - b.deckCount;
        // Secondary sort by name for same deck count
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
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

  thead.innerHTML = `
    <tr>
      <th class="sortable ${getSortedClass('name')}" data-sort="name">
        Card Name
        <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
      </th>${copiesHeader}
      <th>Stripes</th>
      <th style="width: 60px; text-align: center;">Done</th>
    </tr>
  `;

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
    elements.deckLegend.innerHTML = sortedDecks.map(deck => `
      <div class="wa-cluster wa-gap-xs wa-align-items-center">
        <div class="deck-color-indicator small" style="background-color: ${deck.color};"></div>
        <span><strong>Slot ${deck.stripePosition}:</strong> ${escapeHtml(deck.name)}</span>
      </div>
    `).join('');
  }
  
  // Stripe reorder list
  if (elements.stripeReorderList) {
    elements.stripeReorderList.innerHTML = sortedDecks.map((deck, index) => `
      <div class="reorder-item wa-split wa-align-items-center" data-deck-id="${deck.id}">
        <div class="wa-cluster wa-gap-s wa-align-items-center">
          <div class="deck-color-indicator" style="background-color: ${deck.color};"></div>
          <span><strong>Slot ${deck.stripePosition}:</strong> ${escapeHtml(deck.name)}</span>
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
    `).join('');
    
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
  if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = '';
  if (elements.deckFileInput) elements.deckFileInput.value = '';

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
  // Create toast element using Web Awesome's wa-callout as toast
  const toast = document.createElement('wa-callout');
  toast.variant = variant;
  toast.closable = true;
  toast.duration = 5000;
  toast.innerHTML = `
    <wa-icon slot="icon" name="${icon}"></wa-icon>
    ${message}
  `;

  // Style it as a floating toast
  toast.style.cssText = `
    position: fixed;
    bottom: var(--wa-space-xl);
    right: var(--wa-space-xl);
    max-width: 400px;
    z-index: 9999;
    animation: slideInUp 0.3s ease;
  `;

  document.body.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.style.animation = 'slideOutDown 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);

  // Remove on close
  toast.addEventListener('wa-hide', () => toast.remove());
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
