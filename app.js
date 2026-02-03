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
  getColorScheme, 
  setColorScheme,
  getAllPrisms
} from './storage.js';
import { downloadCSV, downloadJSON, openPrintableGuide } from './export.js';

// ============================================================================
// State
// ============================================================================

let currentPrism = null;
let deckToDelete = null;

// ============================================================================
// DOM References
// ============================================================================

const elements = {
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
  colorSwatches: document.getElementById('color-swatches'),
  colorWarning: document.getElementById('color-warning'),
  parseErrors: document.getElementById('parse-errors'),
  btnResetForm: document.getElementById('btn-reset-form'),
  
  // Decks list
  decksList: document.getElementById('decks-list'),
  
  // Results
  resultsStats: document.getElementById('results-stats'),
  statTotal: document.getElementById('stat-total'),
  statShared: document.getElementById('stat-shared'),
  statUnique: document.getElementById('stat-unique'),
  resultsFilter: document.getElementById('results-filter'),
  resultsSearch: document.getElementById('results-search'),
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
  
  // Dialogs
  deleteDialog: document.getElementById('delete-dialog'),
  deleteDeckName: document.getElementById('delete-deck-name'),
  btnCancelDelete: document.getElementById('btn-cancel-delete'),
  btnConfirmDelete: document.getElementById('btn-confirm-delete'),
  
  newPrismDialog: document.getElementById('new-prism-dialog'),
  btnNewPrism: document.getElementById('btn-new-prism'),
  btnCancelNew: document.getElementById('btn-cancel-new'),
  btnConfirmNew: document.getElementById('btn-confirm-new'),
  
  // Color scheme
  colorSchemeDropdown: document.getElementById('color-scheme-dropdown')
};

// ============================================================================
// Initialization
// ============================================================================

function init() {
  // Load or create PRISM
  currentPrism = getCurrentPrism();
  if (!currentPrism) {
    currentPrism = createPrism();
    savePrism(currentPrism);
    setCurrentPrism(currentPrism.id);
  }
  
  // Initialize UI
  initColorScheme();
  initColorSwatches();
  renderAll();
  
  // Set up event listeners
  setupEventListeners();
}

function initColorScheme() {
  const scheme = getColorScheme();
  applyColorScheme(scheme);
  
  // Listen for system changes
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getColorScheme() === 'auto') {
      applyColorScheme('auto');
    }
  });
}

function applyColorScheme(scheme) {
  const isDark = scheme === 'dark' || 
    (scheme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('wa-dark', isDark);
}

function initColorSwatches() {
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
  elements.prismName.addEventListener('input', handlePrismNameChange);
  
  // Deck form submission
  elements.deckForm.addEventListener('submit', handleDeckSubmit);
  elements.btnResetForm.addEventListener('click', resetDeckForm);
  
  // Color picker change
  elements.deckColor.addEventListener('input', () => {
    updateColorSwatchSelection();
    checkColorWarning();
  });
  
  // Results filter
  elements.resultsFilter.addEventListener('wa-change', renderResults);
  elements.resultsSearch.addEventListener('input', renderResults);
  
  // Navigation button
  elements.btnGoToDecks.addEventListener('click', () => {
    elements.mainTabs.active = 'decks';
  });
  
  // Export buttons
  elements.btnExportCSV.addEventListener('click', () => downloadCSV(currentPrism));
  elements.btnExportJSON.addEventListener('click', () => downloadJSON(currentPrism));
  elements.btnPrintGuide.addEventListener('click', () => openPrintableGuide(currentPrism));
  
  // Delete dialog
  elements.btnCancelDelete.addEventListener('click', () => {
    elements.deleteDialog.open = false;
  });
  elements.btnConfirmDelete.addEventListener('click', handleDeleteConfirm);
  
  // New PRISM dialog
  elements.btnNewPrism.addEventListener('click', () => {
    elements.newPrismDialog.open = true;
  });
  elements.btnCancelNew.addEventListener('click', () => {
    elements.newPrismDialog.open = false;
  });
  elements.btnConfirmNew.addEventListener('click', handleNewPrism);
  
  // Color scheme
  elements.colorSchemeDropdown.addEventListener('wa-select', (e) => {
    const scheme = e.detail.item.dataset.scheme;
    setColorScheme(scheme);
    applyColorScheme(scheme);
  });
  
  // Keyboard shortcut for theme toggle
  document.addEventListener('keydown', (e) => {
    if (e.key === '\\' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const current = getColorScheme();
      const next = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
      setColorScheme(next);
      applyColorScheme(next);
    }
  });
}

// ============================================================================
// Event Handlers
// ============================================================================

function handlePrismNameChange(e) {
  currentPrism.name = e.target.value || 'Untitled PRISM';
  currentPrism.updatedAt = new Date().toISOString();
  savePrism(currentPrism);
}

function handleDeckSubmit(e) {
  e.preventDefault();
  
  // Check deck limit
  if (currentPrism.decks.length >= 15) {
    showError('Maximum 15 decks per PRISM reached.');
    return;
  }
  
  const name = elements.deckName.value.trim();
  const commander = elements.deckCommander.value.trim();
  const bracket = elements.deckBracket.value;
  const color = elements.deckColor.value;
  const decklistText = elements.deckList.value;
  
  // Parse decklist
  const parseResult = parseDecklist(decklistText, commander);
  const validation = validateDecklist(parseResult);
  
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
  elements.prismName.value = currentPrism.name;
  elements.deckCountTag.textContent = `${currentPrism.decks.length}/15 decks`;
  
  // Update tag variant based on count
  if (currentPrism.decks.length >= 15) {
    elements.deckCountTag.variant = 'warning';
  } else if (currentPrism.decks.length >= 10) {
    elements.deckCountTag.variant = 'neutral';
  } else {
    elements.deckCountTag.variant = 'success';
  }
}

function renderDecksList() {
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
  
  // Add delete button listeners
  elements.decksList.querySelectorAll('.btn-delete-deck').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.deckId));
  });
}

function renderResults() {
  const processedCards = processCards(currentPrism);
  const overlap = calculateOverlap(currentPrism);
  
  // Update stats
  elements.statTotal.textContent = overlap.totalUniqueCards;
  elements.statShared.textContent = overlap.sharedCardCount;
  elements.statUnique.textContent = overlap.uniqueCardCount;
  
  // Show/hide based on deck count
  if (currentPrism.decks.length === 0) {
    elements.resultsStats.style.display = 'none';
    elements.noResults.style.display = 'flex';
    document.getElementById('results-table-container').style.display = 'none';
    document.querySelector('[id="results-filter"]').parentElement.style.display = 'none';
    return;
  }
  
  elements.resultsStats.style.display = '';
  elements.noResults.style.display = 'none';
  document.getElementById('results-table-container').style.display = '';
  document.querySelector('[id="results-filter"]').parentElement.style.display = '';
  
  // Apply filters
  const filter = elements.resultsFilter.value;
  const search = elements.resultsSearch.value.toLowerCase().trim();
  
  let filteredCards = processedCards;
  
  if (filter === 'shared') {
    filteredCards = filteredCards.filter(c => c.deckCount > 1);
  } else if (filter === 'unique') {
    filteredCards = filteredCards.filter(c => c.deckCount === 1);
  }
  
  if (search) {
    filteredCards = filteredCards.filter(c => 
      c.name.toLowerCase().includes(search)
    );
  }
  
  // Render table
  elements.resultsTbody.innerHTML = filteredCards.map(card => {
    const stripeIndicators = card.stripes.map(s => `
      <div 
        class="stripe-indicator" 
        style="background-color: ${s.color};" 
        title="Slot ${s.position}: ${escapeHtml(s.deckName)}"
      ></div>
    `).join('');
    
    const rowClass = card.deckCount > 1 ? 'shared-row' : '';
    const nameClass = card.isBasicLand ? 'basic-land' : '';
    
    return `
      <tr class="${rowClass}">
        <td class="${nameClass}">${escapeHtml(card.name)}${card.isBasicLand ? ' <span class="basic-tag">(Basic)</span>' : ''}</td>
        <td>${card.totalQuantity}</td>
        <td>${card.deckCount}</td>
        <td><div class="stripe-indicators">${stripeIndicators}</div></td>
      </tr>
    `;
  }).join('');
  
  if (filteredCards.length === 0 && processedCards.length > 0) {
    elements.resultsTbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--wa-color-neutral-text-subtle); padding: var(--wa-space-xl);">
          No cards match your filter.
        </td>
      </tr>
    `;
  }
}

function renderExport() {
  const sortedDecks = [...currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);
  
  // Deck legend
  if (sortedDecks.length === 0) {
    elements.deckLegend.style.display = 'none';
    elements.noDecksLegend.style.display = '';
    elements.stripeReorderList.innerHTML = `
      <p style="color: var(--wa-color-neutral-text-subtle);">Add decks to reorder stripe positions.</p>
    `;
    return;
  }
  
  elements.deckLegend.style.display = '';
  elements.noDecksLegend.style.display = 'none';
  
  elements.deckLegend.innerHTML = sortedDecks.map(deck => `
    <div class="wa-cluster wa-gap-xs wa-align-items-center">
      <div class="deck-color-indicator small" style="background-color: ${deck.color};"></div>
      <span><strong>Slot ${deck.stripePosition}:</strong> ${escapeHtml(deck.name)}</span>
    </div>
  `).join('');
  
  // Stripe reorder list
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

// ============================================================================
// Form Helpers
// ============================================================================

function resetDeckForm() {
  elements.deckForm.reset();
  elements.deckBracket.value = '2';
  
  // Set next available color
  const nextColor = getNextColor(currentPrism);
  elements.deckColor.value = nextColor;
  updateColorSwatchSelection();
  
  hideParseErrors();
  hideColorWarning();
}

function checkColorWarning() {
  const color = elements.deckColor.value;
  const existingDeck = isColorUsed(currentPrism, color);
  
  if (existingDeck) {
    showColorWarning(`This color is already used by "${existingDeck.name}".`);
  } else {
    hideColorWarning();
  }
}

function showColorWarning(message) {
  elements.colorWarning.querySelector('span').textContent = message;
  elements.colorWarning.style.display = 'flex';
}

function hideColorWarning() {
  elements.colorWarning.style.display = 'none';
}

function showParseErrors(errors) {
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
  elements.parseErrors.style.display = 'none';
  elements.parseErrors.innerHTML = '';
}

// ============================================================================
// Notifications
// ============================================================================

function showError(message) {
  // For now, use alert. Could replace with toast component later.
  alert(message);
}

function showSuccess(message) {
  // Could implement toast notifications here
  console.log('Success:', message);
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

document.addEventListener('DOMContentLoaded', init);
