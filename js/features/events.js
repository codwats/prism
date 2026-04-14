/**
 * Event listener setup and card preview handlers.
 */

import { state } from '../core/state.js';
import { downloadCSV, downloadJSON, openPrintableGuide, downloadUndoneTxt, copyUndoneToClipboard } from '../modules/export.js';
import { showPreview, hidePreview, updatePosition } from '../modules/card-preview.js';
import { handleDeckSubmit, resetDeckForm, updateColorSwatchSelection, checkColorWarning, handlePrismNameChange } from './deck-form.js';
import { handleFileUpload, handleJsonImport, handleMoxfieldImport, handleEditFileUpload, handleEditUrlImport } from './deck-import.js';
import { handleDeleteConfirm, handleEditConfirm, handleNewPrism, handleSplitConfirm } from './deck-list.js';
import { renderResults } from './results.js';
import { updatePreferences } from '../modules/storage.js';
import { renderAll } from './init.js';

// ============================================================================
// Event Listeners
// ============================================================================

export function setupEventListeners() {
  // PRISM name change
  if (state.elements.prismName) {
    state.elements.prismName.addEventListener('wa-input', handlePrismNameChange);
    state.elements.prismName.addEventListener('input', handlePrismNameChange);
  }

  // Deck form submission
  if (state.elements.deckForm) {
    state.elements.deckForm.addEventListener('submit', handleDeckSubmit);
  }

  if (state.elements.btnResetForm) {
    state.elements.btnResetForm.addEventListener('click', resetDeckForm);
  }

  // Color picker change
  if (state.elements.deckColor) {
    state.elements.deckColor.addEventListener('input', () => {
      updateColorSwatchSelection();
      checkColorWarning();
    });
  }

  // File upload (wa-file-input handles its own UI)
  if (state.elements.deckFileInput) {
    state.elements.deckFileInput.addEventListener('change', handleFileUpload);
  }

  // JSON import (wa-file-input handles its own UI)
  if (state.elements.prismJsonInput) {
    state.elements.prismJsonInput.addEventListener('change', handleJsonImport);
  }

  // Moxfield import
  if (state.elements.btnImportMoxfield) {
    state.elements.btnImportMoxfield.addEventListener('click', handleMoxfieldImport);
  }
  if (state.elements.moxfieldUrl) {
    // Also allow pressing Enter to import
    state.elements.moxfieldUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleMoxfieldImport();
      }
    });
  }

  // Results filter - use 'change' event for wa-radio-group
  if (state.elements.resultsFilter) {
    state.elements.resultsFilter.addEventListener('change', renderResults);
  }
  if (state.elements.resultsSearch) {
    state.elements.resultsSearch.addEventListener('input', renderResults);
  }
  if (state.elements.showAllSlots) {
    state.elements.showAllSlots.addEventListener('change', renderResults);
  }

  // Navigation button
  if (state.elements.btnGoToDecks) {
    state.elements.btnGoToDecks.addEventListener('click', () => {
      state.elements.mainTabs.active = 'decks';
    });
  }

  // Export buttons
  if (state.elements.btnExportCSV) {
    state.elements.btnExportCSV.addEventListener('click', () => downloadCSV(state.currentPrism));
  }
  if (state.elements.btnExportJSON) {
    state.elements.btnExportJSON.addEventListener('click', () => downloadJSON(state.currentPrism));
  }
  if (state.elements.btnPrintGuide) {
    state.elements.btnPrintGuide.addEventListener('click', () => openPrintableGuide(state.currentPrism));
  }
  if (state.elements.btnDownloadUndone) {
    state.elements.btnDownloadUndone.addEventListener('click', () => downloadUndoneTxt(state.currentPrism));
  }
  if (state.elements.btnCopyUndone) {
    state.elements.btnCopyUndone.addEventListener('click', async () => {
      const count = await copyUndoneToClipboard(state.currentPrism);
      const { showSuccess } = await import('../core/notifications.js');
      showSuccess(`Copied ${count} undone card${count === 1 ? '' : 's'} to clipboard`);
    });
  }

  // Delete dialog
  if (state.elements.btnCancelDelete) {
    state.elements.btnCancelDelete.addEventListener('click', () => {
      state.elements.deleteDialog.open = false;
    });
  }
  if (state.elements.btnConfirmDelete) {
    state.elements.btnConfirmDelete.addEventListener('click', handleDeleteConfirm);
  }

  // New PRISM dialog
  if (state.elements.btnNewPrism) {
    state.elements.btnNewPrism.addEventListener('click', () => {
      state.elements.newPrismDialog.open = true;
    });
  }
  if (state.elements.btnCancelNew) {
    state.elements.btnCancelNew.addEventListener('click', () => {
      state.elements.newPrismDialog.open = false;
    });
  }
  if (state.elements.btnConfirmNew) {
    state.elements.btnConfirmNew.addEventListener('click', handleNewPrism);
  }

  // Edit dialog
  if (state.elements.btnCancelEdit) {
    state.elements.btnCancelEdit.addEventListener('click', () => {
      state.elements.editDialog.open = false;
    });
  }
  if (state.elements.btnConfirmEdit) {
    state.elements.btnConfirmEdit.addEventListener('click', handleEditConfirm);
  }

  // Edit dialog file upload (wa-file-input handles its own UI)
  if (state.elements.editDeckFileInput) {
    state.elements.editDeckFileInput.addEventListener('change', handleEditFileUpload);
  }

  // Edit dialog URL import
  if (state.elements.btnEditImportUrl) {
    state.elements.btnEditImportUrl.addEventListener('click', handleEditUrlImport);
  }
  if (state.elements.editImportUrl) {
    state.elements.editImportUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEditUrlImport();
      }
    });
  }

  // Split dialog
  if (state.elements.btnCancelSplit) {
    state.elements.btnCancelSplit.addEventListener('click', () => {
      state.elements.splitDialog.open = false;
    });
  }
  if (state.elements.btnConfirmSplit) {
    state.elements.btnConfirmSplit.addEventListener('click', handleSplitConfirm);
  }

  // Stripe starting corner preference
  if (state.elements.stripeStartCorner) {
    state.elements.stripeStartCorner.addEventListener('wa-change', (e) => {
      updatePreferences({ stripeStartCorner: e.target.value });
      renderAll();
    });
  }

  // Card preview hover handlers (event delegation on results table)
  if (state.elements.resultsTbody) {
    state.elements.resultsTbody.addEventListener('mouseenter', handleCardPreviewShow, true);
    state.elements.resultsTbody.addEventListener('mouseleave', handleCardPreviewHide, true);
    state.elements.resultsTbody.addEventListener('mousemove', handleCardPreviewMove);
  }
}

// ============================================================================
// Card preview handlers
// ============================================================================

function handleCardPreviewShow(e) {
  const cell = e.target.closest('.card-name-cell');
  if (!cell) return;

  const cardName = cell.dataset.cardName;
  if (!cardName) return;

  // Look up full stripe data from processed cards (includes markType, dotIndex, etc.)
  const card = (state.processedCards || []).find(c => c.name === cardName);
  const stripes = card ? card.stripes : [];

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
