/**
 * Event listener setup and card preview handlers.
 */

import { state } from '../core/state.js';
import { downloadCSV, downloadJSON, openPrintableGuide, downloadUndoneTxt, copyUndoneToClipboard } from '../modules/export.js';
import { wireCardPreview, refreshOpenPreview } from '../modules/card-preview.js';
import {
  handleDeckFormSubmit,
  resetDeckForm,
  updateColorSwatchSelection,
  checkColorWarning,
  handlePrismNameChange,
  syncCommanderFieldsFromText,
  applyCommanderFieldsToText,
  handleTwoCommandersToggle,
  setDeckFormat,
  commanderRefs,
  openAddDeckDialog,
  closeDeckDialog,
  endDeckFormSession,
  handleChangeSlot,
} from './deck-form.js';
import { handleFileUpload, handleJsonImport, handleDeckUrlImport, openCubeDialog, handleLoadCube, updateCubeCapacity, setAllCubeTags, handleCreateCubePrism } from './deck-import.js';
import { handleDeleteConfirm, handleNewPrism, handleSplitConfirm, handleEditGroupConfirm, handleClearAllRemoved } from './deck-list.js';
import { renderResults, syncMarkingPrereq } from './results.js';
import { dismissMarkingPrereq } from '../core/marking-prereq.js';
import { openScryMode } from './scry-mode.js';
import { renderOverlapMatrix } from './analysis.js';
import { debounce, clickItemsOnKeyboardSelect, rowImageName } from '../core/utils.js';
import { updatePreferences, getCurrentPrism, savePrism } from '../modules/storage.js';
import { renderAll } from './init.js';
import { logToSupabase } from '../modules/supabase-client.js';

// ============================================================================
// Event Listeners
// ============================================================================

// Rename in place: the PRISM menu gives way to the name input until it loses focus.
function startRename() {
  const { prismName, prismOverflow } = state.elements;
  if (!prismName || !prismOverflow) return;
  prismName.value = state.currentPrism.name;
  prismOverflow.hidden = true;
  prismName.hidden = false;
  // After the menu closes, which hands focus back to its trigger
  setTimeout(() => {
    prismName.focus();
    prismName.select?.();
  });
}

function endRename() {
  const { prismName, prismOverflow } = state.elements;
  if (!prismName || prismName.hidden) return;
  prismName.hidden = true;
  prismOverflow.hidden = false;
  // Title text and the switch list both show the new name
  renderAll();
}

export function setupEventListeners() {
  // PRISM name change (each keystroke saves; Rename shows the input in place)
  if (state.elements.prismName) {
    state.elements.prismName.addEventListener('input', handlePrismNameChange);
    state.elements.prismName.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      // Else this Enter also activates the trigger it hands focus to and reopens the menu
      e.preventDefault();
      endRename();
      // Keyboard finish only: a click elsewhere keeps focus where it landed
      state.elements.prismOverflow?.querySelector('[slot="trigger"]')?.focus();
    });
    state.elements.prismName.addEventListener('focusout', endRename);
  }
  state.elements.btnRenamePrism?.addEventListener('click', startRename);
  if (state.elements.prismOverflow) clickItemsOnKeyboardSelect(state.elements.prismOverflow);

  // Deck form (#450): one form, Add or Edit by state.deckFormMode
  if (state.elements.deckForm) {
    state.elements.deckForm.addEventListener('submit', handleDeckFormSubmit);
  }

  if (state.elements.btnResetForm) {
    state.elements.btnResetForm.addEventListener('click', resetDeckForm);
  }
  state.elements.btnOpenAddDeck?.addEventListener('click', openAddDeckDialog);
  state.elements.btnCancelDeckForm?.addEventListener('click', closeDeckDialog);
  // Escape or the close button: drop whatever the session left pending.
  // wa-hide bubbles from components inside the form, so check the target.
  state.elements.deckDialog?.addEventListener('wa-hide', (e) => {
    if (e.target === state.elements.deckDialog) endDeckFormSession();
  });
  state.elements.btnChangeSlot?.addEventListener('click', handleChangeSlot);

  // Commander fields <-> decklist text sync (#147)
  const refs = commanderRefs();
  refs.textarea?.addEventListener('change', () => syncCommanderFieldsFromText(refs));
  refs.field1?.addEventListener('change', () => applyCommanderFieldsToText(refs));
  refs.field2?.addEventListener('change', () => applyCommanderFieldsToText(refs));
  refs.toggle?.addEventListener('change', () => handleTwoCommandersToggle(refs));
  state.elements.deckFormat?.addEventListener('change', () => setDeckFormat(state.elements.deckFormat.value));

  // Dedicated commander copies — per-PRISM synced setting; write path per #145
  // (flag + its own merge timestamp + prism.updatedAt, mirroring mark-toggle)
  // A checkbox item in the PRISM menu: the dropdown toggles `checked` itself
  // before wa-select, and stays open so the new state shows.
  if (state.elements.dedicatedCommanderToggle) {
    state.elements.prismOverflow?.addEventListener('wa-select', (e) => {
      if (e.detail.item !== state.elements.dedicatedCommanderToggle) return;
      e.preventDefault();
      const now = new Date().toISOString();
      state.currentPrism.useDedicatedCommanderCopies = !!e.detail.item.checked;
      state.currentPrism.useDedicatedCommanderCopiesUpdatedAt = now;
      state.currentPrism.updatedAt = now;
      savePrism(state.currentPrism);
      renderAll();
    });
  }

  // Color picker change
  if (state.elements.deckColor) {
    state.elements.deckColor.addEventListener('input', () => {
      updateColorSwatchSelection();
      checkColorWarning();
    });
  }

  // File upload: the button opens the hidden native file input
  if (state.elements.deckFileInput) {
    state.elements.deckFileInput.addEventListener('change', handleFileUpload);
    state.elements.btnDeckFile?.addEventListener('click', () => state.elements.deckFileInput.click());
  }

  // JSON import (wa-file-input handles its own UI); close the dialog once a file is chosen
  if (state.elements.prismJsonInput) {
    state.elements.prismJsonInput.addEventListener('change', (e) => {
      handleJsonImport(e);
      state.elements.importDialog?.removeAttribute('open');
    });
  }

  state.elements.btnComparePrisms?.addEventListener('click', () => {
    window.location.href = 'compare-prisms.html';
  });

  // Import backup dialog (opened from the PRISM menu)
  if (state.elements.btnImportBackup) {
    state.elements.btnImportBackup.addEventListener('click', () => {
      state.elements.importDialog?.setAttribute('open', '');
    });
  }
  if (state.elements.btnCancelImport) {
    state.elements.btnCancelImport.addEventListener('click', () => {
      state.elements.importDialog?.removeAttribute('open');
    });
  }

  // CubeCobra import (#196)
  state.elements.btnImportCube?.addEventListener('click', openCubeDialog);
  state.elements.btnLoadCube?.addEventListener('click', handleLoadCube);
  state.elements.cubeUrl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLoadCube();
    }
  });
  state.elements.cubeTags?.addEventListener('change', updateCubeCapacity);
  // The button is re-rendered with each loaded cube, so delegate
  state.elements.cubeTags?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cube-tags-check]');
    if (btn) setAllCubeTags(btn.dataset.cubeTagsCheck === 'true');
  });
  state.elements.btnCreateCube?.addEventListener('click', handleCreateCubePrism);
  state.elements.btnCancelCube?.addEventListener('click', () => {
    state.elements.cubeDialog?.removeAttribute('open');
  });

  // Deck URL import (Moxfield / Archidekt / DeckCheck / Commander Template)
  state.elements.btnImportDeckUrl?.addEventListener('click', () => handleDeckUrlImport());
  state.elements.btnRefreshSource?.addEventListener('click', () => {
    const deck = state.currentPrism.decks.find((d) => d.id === state.deckToEdit);
    if (deck?.sourceUrl) handleDeckUrlImport(deck.sourceUrl, state.elements.btnRefreshSource);
  });
  // Enter imports instead of submitting the form
  state.elements.deckUrl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDeckUrlImport();
    }
  });

  state.elements.markingPrereqDismiss?.addEventListener('click', () => {
    dismissMarkingPrereq(state.currentPrism.id);
    syncMarkingPrereq();
  });

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
  // Filters: every entry is a wa-dropdown-item, so mouse and keyboard both
  // land here. Checkbox items toggle `checked` before wa-select;
  // preventDefault keeps the menu open so the new state shows.
  if (state.elements.deckFilterDropdown) {
    state.elements.deckFilterDropdown.addEventListener('wa-select', (e) => {
      const item = e.detail?.item;
      if (!item) return;
      e.preventDefault();
      if (item === state.elements.undoneFilter) {
        updatePreferences({ undoneOnly: !!item.checked });
      } else if (item.id === 'deck-filter-clear') {
        state.selectedDeckIds.clear();
      } else if (item.dataset.deckId) {
        if (item.checked) state.selectedDeckIds.add(item.dataset.deckId);
        else state.selectedDeckIds.delete(item.dataset.deckId);
      }
      renderResults();
    });
  }

  // Navigation button
  if (state.elements.btnGoToDecks) {
    state.elements.btnGoToDecks.addEventListener('click', () => {
      state.elements.mainTabs.active = 'decks';
    });
  }

  // Export buttons — each logs an 'export' funnel event (GA + app_logs)
  const exportDropdown = document.getElementById('export-dropdown');
  if (exportDropdown) clickItemsOnKeyboardSelect(exportDropdown);
  if (state.elements.btnExportCSV) {
    state.elements.btnExportCSV.addEventListener('click', () => {
      downloadCSV(state.currentPrism);
      logToSupabase('info', 'export', { format: 'csv' });
    });
  }
  if (state.elements.btnExportJSON) {
    state.elements.btnExportJSON.addEventListener('click', () => {
      downloadJSON(state.currentPrism);
      logToSupabase('info', 'export', { format: 'json' });
    });
  }
  if (state.elements.btnPrintGuide) {
    state.elements.btnPrintGuide.addEventListener('click', async () => {
      if (!openPrintableGuide(state.currentPrism)) {
        const { showError } = await import('../core/notifications.js');
        showError('Could not open the printable guide. Please allow popups for this site and try again.');
        return;
      }
      logToSupabase('info', 'export', { format: 'print' });
    });
  }
  if (state.elements.btnDownloadUndone) {
    state.elements.btnDownloadUndone.addEventListener('click', () => {
      downloadUndoneTxt(state.currentPrism);
      logToSupabase('info', 'export', { format: 'undone_txt' });
    });
  }
  if (state.elements.btnCopyUndone) {
    state.elements.btnCopyUndone.addEventListener('click', async () => {
      const count = await copyUndoneToClipboard(state.currentPrism);
      logToSupabase('info', 'export', { format: 'undone_copy' });
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
      // Name the PRISM being left behind so the recovery route is concrete.
      if (state.elements.newPrismCurrentName) {
        const name = state.currentPrism?.name?.trim();
        state.elements.newPrismCurrentName.textContent = name || 'Your current PRISM';
      }
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

  // Clear-all stale marks confirmation
  if (state.elements.btnCancelClearAllRemoved) {
    state.elements.btnCancelClearAllRemoved.addEventListener('click', () => {
      state.elements.clearAllRemovedDialog.removeAttribute('open');
    });
  }
  if (state.elements.btnConfirmClearAllRemoved) {
    state.elements.btnConfirmClearAllRemoved.addEventListener('click', handleClearAllRemoved);
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

  // Settings drawer (injected by layout.js) — refresh build surfaces when a
  // stripe setting changes there. The drawer itself persists the preference.
  window.addEventListener('prism-settings-changed', (e) => {
    const setting = e.detail?.setting;
    if (setting === 'stripeStartCorner') {
      state.currentPrism = getCurrentPrism();
      renderAll();
    } else if (setting === 'stripeNumbersMode') {
      renderResults({ preserveRows: true });
      refreshOpenPreview();
    }
  });

  // Overlap matrix — build content the first time the accordion is opened
  if (state.elements.overlapMatrixContainer) {
    state.elements.overlapMatrixContainer.addEventListener('wa-after-show', renderOverlapMatrix);
  }

  // Card preview handlers (event delegation on results table).
  // Desktop: hover to show / leave to hide. Mobile (≤768px): tap a card name
  // to open, tap outside to dismiss — there is no mouseleave on touch.
  if (state.elements.resultsTbody) {
    // A batch sub-row previews only its batch's marks, never the card's union
    wireCardPreview(state.elements.resultsTbody, (name, cell) => {
      // Cells carry rowImageName: a card's name, a token row's token:<oracleId> (#412)
      const card = [...(state.processedCards || []), ...(state.tokenRows || [])].find(c => rowImageName(c) === name);
      const batchKey = cell.dataset.batchKey || cell.closest('tr.batch-subrow')?.dataset.cardKey;
      return (batchKey && card?.batches?.find(b => b.key === batchKey)?.stripes) || card?.stripes || [];
    });
  }
}
