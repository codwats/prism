/**
 * Event listener setup and card preview handlers.
 */

import { state } from '../core/state.js';
import { downloadCSV, downloadJSON, openPrintableGuide, downloadUndoneTxt, copyUndoneToClipboard } from '../modules/export.js';
import { showPreview, hidePreview, updatePosition, refreshOpenPreview } from '../modules/card-preview.js';
import { handleDeckSubmit, resetDeckForm, updateColorSwatchSelection, checkColorWarning, handlePrismNameChange } from './deck-form.js';
import { handleFileUpload, handleJsonImport, handleMoxfieldImport, handleEditFileUpload, handleEditUrlImport } from './deck-import.js';
import { handleDeleteConfirm, handleEditConfirm, handleNewPrism, handleSplitConfirm, handleEditGroupConfirm } from './deck-list.js';
import { renderResults } from './results.js';
import { openScryMode } from './scry-mode.js';
import { renderOverlapMatrix } from './analysis.js';
import { debounce } from '../core/utils.js';
import { updatePreferences, getPreferences, savePrism, setColorScheme } from '../modules/storage.js';
import { applyColorScheme } from '../modules/theme.js';
import { remapPrismForCorner } from '../modules/processor.js';
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

  // SCRY-Mode launch
  if (state.elements.btnScry) {
    state.elements.btnScry.addEventListener('click', openScryMode);
  }

  // Results filter - use 'change' event for wa-radio-group
  if (state.elements.resultsFilter) {
    state.elements.resultsFilter.addEventListener('change', () => {
      // Hide SCRY button in Removed view (removed rows have no Done semantics)
      if (state.elements.btnScry) {
        const filter = state.elements.resultsFilter.value;
        state.elements.btnScry.style.display = filter === 'removed' ? 'none' : '';
      }
      renderResults();
    });
  }
  if (state.elements.resultsSearch) {
    state.elements.resultsSearch.addEventListener('input', debounce(renderResults, 150));
  }
  if (state.elements.showAllSlots) {
    state.elements.showAllSlots.addEventListener('change', renderResults);
  }
  if (state.elements.undoneFilter) {
    state.elements.undoneFilter.addEventListener('change', () => {
      updatePreferences({ undoneOnly: state.elements.undoneFilter.checked });
      renderResults();
    });
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
    state.elements.btnPrintGuide.addEventListener('click', async () => {
      if (!openPrintableGuide(state.currentPrism)) {
        const { showError } = await import('../core/notifications.js');
        showError('Could not open the printable guide. Please allow popups for this site and try again.');
      }
    });
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
      state.elements.deleteDialog.removeAttribute('open');
    });
  }
  if (state.elements.btnConfirmDelete) {
    state.elements.btnConfirmDelete.addEventListener('click', handleDeleteConfirm);
  }

  // New PRISM dialog
  if (state.elements.btnNewPrism) {
    state.elements.btnNewPrism.addEventListener('click', () => {
      state.elements.newPrismDialog.setAttribute('open', '');
    });
  }
  if (state.elements.btnCancelNew) {
    state.elements.btnCancelNew.addEventListener('click', () => {
      state.elements.newPrismDialog.removeAttribute('open');
    });
  }
  if (state.elements.btnConfirmNew) {
    state.elements.btnConfirmNew.addEventListener('click', handleNewPrism);
  }

  // Edit dialog
  if (state.elements.btnCancelEdit) {
    state.elements.btnCancelEdit.addEventListener('click', () => {
      state.elements.editDialog.removeAttribute('open');
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

  // Edit group dialog
  if (state.elements.btnCancelEditGroup) {
    state.elements.btnCancelEditGroup.addEventListener('click', () => {
      state.elements.editGroupDialog.removeAttribute('open');
    });
  }
  if (state.elements.btnConfirmEditGroup) {
    state.elements.btnConfirmEditGroup.addEventListener('click', handleEditGroupConfirm);
  }

  // Split dialog
  if (state.elements.btnCancelSplit) {
    state.elements.btnCancelSplit.addEventListener('click', () => {
      state.elements.splitDialog.removeAttribute('open');
    });
  }
  if (state.elements.btnConfirmSplit) {
    state.elements.btnConfirmSplit.addEventListener('click', handleSplitConfirm);
  }
  // When style switches to dots, cap count at 2
  if (state.elements.splitStyle) {
    state.elements.splitStyle.addEventListener('change', () => {
      const isDots = state.elements.splitStyle.value === 'dots';
      if (state.elements.splitCount) {
        state.elements.splitCount.setAttribute('max', isDots ? '2' : '8');
        if (isDots) {
          const current = parseInt(state.elements.splitCount.value) || 2;
          if (current > 2) state.elements.splitCount.value = '2';
        }
      }
    });
  }

  // Stripe starting corner preference
  if (state.elements.stripeStartCorner) {
    state.elements.stripeStartCorner.addEventListener('change', (e) => {
      const pending = e.target.value;
      const applied = getPreferences().stripeStartCorner || 'top-right';
      const applyBtn = state.elements.stripeStartCornerApply;
      if (applyBtn) {
        if (pending !== applied) applyBtn.removeAttribute('disabled');
        else applyBtn.setAttribute('disabled', '');
      }
    });
  }

  if (state.elements.stripeStartCornerApply) {
    state.elements.stripeStartCornerApply.addEventListener('click', () => {
      const newCorner = state.elements.stripeStartCorner?.value;
      if (!newCorner) return;
      const currentCorner = getPreferences().stripeStartCorner || 'top-right';
      if (newCorner !== currentCorner && state.currentPrism) {
        state.currentPrism = remapPrismForCorner(state.currentPrism, currentCorner, newCorner);
        savePrism(state.currentPrism);
      }
      updatePreferences({ stripeStartCorner: newCorner });
      state.elements.stripeStartCornerApply.setAttribute('disabled', '');
      renderAll();
    });
  }

  // Show stripe position numbers preference (counting aid overlay).
  // Read at render time + re-render the visible surfaces immediately on change.
  if (state.elements.showStripePositionNumbers) {
    state.elements.showStripePositionNumbers.addEventListener('change', (e) => {
      updatePreferences({ showStripePositionNumbers: e.target.checked });
      renderResults();
      refreshOpenPreview();
    });
  }

  // Color scheme preference — persist and apply live
  if (state.elements.colorScheme) {
    state.elements.colorScheme.addEventListener('change', (e) => {
      setColorScheme(e.target.value);
      applyColorScheme(e.target.value);
    });
  }

  // Overlap matrix — build content the first time the accordion is opened
  if (state.elements.overlapMatrixContainer) {
    state.elements.overlapMatrixContainer.addEventListener('wa-after-show', renderOverlapMatrix);
  }

  // Card preview handlers (event delegation on results table).
  // Desktop: hover to show / leave to hide. Mobile (≤768px): tap a card name
  // to open, tap outside to dismiss — there is no mouseleave on touch.
  if (state.elements.resultsTbody) {
    state.elements.resultsTbody.addEventListener('mouseenter', handleCardPreviewShow, true);
    state.elements.resultsTbody.addEventListener('mouseleave', handleCardPreviewHide, true);
    state.elements.resultsTbody.addEventListener('mousemove', handleCardPreviewMove);
    state.elements.resultsTbody.addEventListener('click', handleCardPreviewTap);
    document.addEventListener('click', handleCardPreviewDismiss);
  }
}

// ============================================================================
// Card preview handlers
// ============================================================================

// Single source of truth for the tap-vs-hover split. Matches the 768px
// breakpoint custom.css uses for the rest of the mobile layout.
const previewIsMobile = () => window.matchMedia('(max-width: 768px)').matches;

function handleCardPreviewShow(e) {
  if (previewIsMobile()) return; // mobile opens on tap, not hover
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
  if (previewIsMobile()) return;
  const cell = e.target.closest('.card-name-cell');
  if (!cell) return;

  // Check if we're leaving to another element within the same cell
  const relatedTarget = e.relatedTarget;
  if (relatedTarget && cell.contains(relatedTarget)) return;

  hidePreview();
}

function handleCardPreviewMove(e) {
  if (previewIsMobile()) return;
  const cell = e.target.closest('.card-name-cell');
  if (!cell) return;

  updatePosition(e);
}

// Mobile tap-to-open: reuse the same state lookup as the hover path.
function handleCardPreviewTap(e) {
  if (!previewIsMobile()) return;
  const cell = e.target.closest('.card-name-cell');
  if (!cell) return;

  const cardName = cell.dataset.cardName;
  if (!cardName) return;

  const card = (state.processedCards || []).find(c => c.name === cardName);
  const stripes = card ? card.stripes : [];

  showPreview(cardName, stripes, e);
}

// Mobile dismiss: tap anywhere that isn't a card name or the open preview.
function handleCardPreviewDismiss(e) {
  if (!previewIsMobile()) return;
  if (e.target.closest('.card-name-cell')) return; // opening tap, handled above
  const tooltip = document.getElementById('card-preview-tooltip');
  if (!tooltip || tooltip.hidden || tooltip.contains(e.target)) return;
  hidePreview();
}
