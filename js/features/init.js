/**
 * App initialization: getElements, init, renderAll, renderPrismHeader.
 */

import { state } from '../core/state.js';
import { getLogicalDeckCount, debugLog } from '../core/utils.js';
import { createPrism, getUsedPositions, MAX_STRIPE_SLOTS, applyCommanderFallback } from '../modules/processor.js';
import { getCurrentPrism, savePrism, setCurrentPrism, getPreferences, onSyncStatusChange, forceSyncCurrentPrism, getAllPrisms } from '../modules/storage.js';
import { initAuth, setupAuthListeners, getCurrentUser, onAuthChange } from '../modules/auth.js';
import { logToSupabase } from '../modules/supabase-client.js';
import { initColorSwatches } from './deck-form.js';
import { renderDecksList, handleSwitchPrism } from './deck-list.js';
import { setupStripeReorderDialog } from './stripe-reorder-dialog.js';
import { setupScryMode } from './scry-mode.js';
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
    deckCommander2: document.getElementById('deck-commander-2'),
    deckTwoCommanders: document.getElementById('deck-two-commanders'),
    deckBracket: document.getElementById('deck-bracket'),
    deckColor: document.getElementById('deck-color'),
    deckList: document.getElementById('deck-list'),
    deckFileInput: document.getElementById('deck-file-input'),
    dedicatedCommanderToggle: document.getElementById('dedicated-commander-copies'),
    colorSwatches: document.getElementById('color-swatches'),
    colorWarning: document.getElementById('color-warning'),
    parseErrors: document.getElementById('parse-errors'),
    btnAddDeck: document.getElementById('btn-add-deck'),
    btnResetForm: document.getElementById('btn-reset-form'),

    // Moxfield import
    moxfieldUrl: document.getElementById('moxfield-url'),
    btnImportMoxfield: document.getElementById('btn-import-moxfield'),
    moxfieldError: document.getElementById('moxfield-error'),
    moxfieldSuccess: document.getElementById('moxfield-success'),
    moxfieldImportSection: document.getElementById('moxfield-import-section'),

    // Decks list
    decksList: document.getElementById('decks-list'),

    // Results
    overlapMatrixContainer: document.getElementById('overlap-matrix-container'),
    overlapMatrix: document.getElementById('overlap-matrix'),
    resultsStats: document.getElementById('results-stats'),
    statTotal: document.getElementById('stat-total'),
    statShared: document.getElementById('stat-shared'),
    statMarked: document.getElementById('stat-marked'),
    markedProgress: document.getElementById('marked-progress'),
    resultsFilter: document.getElementById('results-filter'),
    resultsSearch: document.getElementById('results-search'),
    showAllSlots: document.getElementById('show-all-slots'),
    undoneFilter: document.getElementById('undone-filter'),
    deckFilterDropdown: document.getElementById('deck-filter-dropdown'),
    deckFilterMenu: document.getElementById('deck-filter-menu'),
    resultsTbody: document.getElementById('results-tbody'),
    noResults: document.getElementById('no-results'),
    btnGoToDecks: document.getElementById('btn-go-to-decks'),

    // Export (Legend + Export dropdowns in the Results toolbar)
    deckLegend: document.getElementById('deck-legend'),
    btnExportCSV: document.getElementById('btn-export-csv'),
    btnExportJSON: document.getElementById('btn-export-json'),
    btnPrintGuide: document.getElementById('btn-print-guide'),
    btnCopyUndone: document.getElementById('btn-copy-undone'),
    btnDownloadUndone: document.getElementById('btn-download-undone'),

    // Import backup dialog (opened from the ... overflow menu)
    btnImportBackup: document.getElementById('btn-import-backup'),
    importDialog: document.getElementById('import-dialog'),
    btnCancelImport: document.getElementById('btn-cancel-import'),
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
    newPrismCurrentName: document.getElementById('new-prism-current-name'),

    // PRISM switcher (injected into the ... overflow menu)
    prismOverflow: document.getElementById('prism-overflow'),
    prismSwitchDivider: document.getElementById('prism-switch-divider'),

    // Clear-all stale marks confirmation
    clearAllRemovedDialog: document.getElementById('clear-all-removed-dialog'),
    clearAllRemovedCount: document.getElementById('clear-all-removed-count'),
    btnCancelClearAllRemoved: document.getElementById('btn-cancel-clear-all-removed'),
    btnConfirmClearAllRemoved: document.getElementById('btn-confirm-clear-all-removed'),

    // Edit dialog
    editDialog: document.getElementById('edit-dialog'),
    editDeckForm: document.getElementById('edit-deck-form'),
    editDeckId: document.getElementById('edit-deck-id'),
    editDeckName: document.getElementById('edit-deck-name'),
    editDeckCommander: document.getElementById('edit-deck-commander'),
    editDeckCommander2: document.getElementById('edit-deck-commander-2'),
    editDeckTwoCommanders: document.getElementById('edit-deck-two-commanders'),
    editDeckBracket: document.getElementById('edit-deck-bracket'),
    editDeckColor: document.getElementById('edit-deck-color'),
    editDeckList: document.getElementById('edit-deck-list'),
    editDeckListUpdated: document.getElementById('edit-deck-list-updated'),
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

    // Edit group dialog
    editGroupDialog: document.getElementById('edit-group-dialog'),
    editGroupId: document.getElementById('edit-group-id'),
    editGroupName: document.getElementById('edit-group-name'),
    editGroupColor: document.getElementById('edit-group-color'),
    btnCancelEditGroup: document.getElementById('btn-cancel-edit-group'),
    btnConfirmEditGroup: document.getElementById('btn-confirm-edit-group'),

    // Split dialog
    splitDialog: document.getElementById('split-dialog'),
    splitDeckId: document.getElementById('split-deck-id'),
    splitDeckName: document.getElementById('split-deck-name'),
    splitCount: document.getElementById('split-count'),
    splitStyle: document.getElementById('split-style'),
    btnCancelSplit: document.getElementById('btn-cancel-split'),
    btnConfirmSplit: document.getElementById('btn-confirm-split'),

    // Stripe reorder dialog
    stripeReorderDialog: document.getElementById('stripe-reorder-dialog'),

    // SCRY-Mode
    btnScry: document.getElementById('btn-scry'),
    scryDialog: document.getElementById('scry-dialog'),
    scryContent: document.getElementById('scry-content'),
    scryProgress: document.getElementById('scry-progress'),
    btnScrySkip: document.getElementById('btn-scry-skip'),
    btnScryDone: document.getElementById('btn-scry-done'),

    // Sync status
    syncStatus: document.getElementById('sync-status'),
    btnSyncNow: document.getElementById('btn-sync-now'),
  };
}

// ============================================================================
// Initialization
// ============================================================================

export async function init() {
  debugLog('PRISM: Initializing...');

  // Wait a tick for Web Awesome components to upgrade
  await new Promise(resolve => setTimeout(resolve, 100));

  // Initialize auth — continue rendering local data even if auth/sync fails,
  // so the loading skeletons never stick
  try {
    await initAuth();
  } catch (err) {
    console.error('Auth init failed:', err);
  }
  setupAuthListeners();

  logToSupabase('info', 'app_loaded', { page: 'build', url: window.location.pathname });

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
  } else {
    // One-time #147 normalization: legacy form-added decks may carry only the
    // commander scalar with zero card flags. Idempotent, saves only on change;
    // the stale scalar is left in place, unread, and decays on its own.
    let normalized = false;
    for (const deck of state.currentPrism.decks || []) {
      if (applyCommanderFallback(deck, deck.commander)) normalized = true;
    }
    if (normalized) savePrism(state.currentPrism);
  }

  if (state.elements.undoneFilter) {
    state.elements.undoneFilter.checked = !!getPreferences().undoneOnly;
  }

  // Initialize UI
  initColorSwatches();
  renderAll();

  // Set up event listeners
  setupEventListeners();
  setupStripeReorderDialog();
  setupScryMode();
  setupSyncStatus();

  debugLog('PRISM: Initialization complete');
}

// ============================================================================
// Render orchestration
// ============================================================================

export function renderAll() {
  renderPrismHeader();
  // Per-PRISM toggle reflects the loaded/synced prism, not just user clicks
  if (state.elements.dedicatedCommanderToggle) {
    state.elements.dedicatedCommanderToggle.checked = !!state.currentPrism?.useDedicatedCommanderCopies;
  }
  renderDecksList();
  renderResults();
  renderExport();
  updateRemovedFilterBadge();
}

/**
 * Populate the ... overflow menu with one entry per stored PRISM.
 *
 * This is the only route back to a previous PRISM for a logged-out user —
 * profile.html lists PRISMs inside its logged-in block only — so without it
 * creating a new PRISM strands every deck and every mark record.
 */
function renderPrismSwitcher() {
  const { prismOverflow, prismSwitchDivider } = state.elements;
  if (!prismOverflow || !prismSwitchDivider) return;

  // Drop previously injected entries; everything from the divider down is static.
  prismOverflow
    .querySelectorAll('[data-prism-switch]')
    .forEach((el) => el.remove());

  const prisms = getAllPrisms();
  const currentId = state.currentPrism?.id;

  // A lone PRISM needs no switcher; the divider would then float above
  // "New PRISM" with nothing over it, so hide it too.
  const showSwitcher = prisms.length > 1;
  prismSwitchDivider.hidden = !showSwitcher;
  if (!showSwitcher) return;

  const label = document.createElement('span');
  label.dataset.prismSwitch = '';
  label.className = 'wa-caption-s';
  label.style.cssText =
    'display:block;padding:var(--wa-space-s) var(--wa-space-m) var(--wa-space-2xs);color:var(--wa-color-neutral-text-subtle);';
  label.textContent = 'Switch PRISM';
  prismOverflow.insertBefore(label, prismSwitchDivider);

  for (const prism of prisms) {
    const isCurrent = prism.id === currentId;
    const item = document.createElement('wa-dropdown-item');
    item.dataset.prismSwitch = '';
    item.dataset.prismId = prism.id;
    if (isCurrent) item.setAttribute('checked', '');

    const count = getLogicalDeckCount(prism);
    const icon = document.createElement('wa-icon');
    icon.setAttribute('slot', 'icon');
    icon.setAttribute('name', isCurrent ? 'circle-check' : 'gem');
    item.appendChild(icon);
    item.appendChild(
      document.createTextNode(
        `${prism.name || 'Untitled PRISM'} (${count} ${count === 1 ? 'deck' : 'decks'})`,
      ),
    );

    item.addEventListener('click', () => handleSwitchPrism(prism.id));
    prismOverflow.insertBefore(item, prismSwitchDivider);
  }
}

function renderPrismHeader() {
  if (state.elements.prismName) {
    state.elements.prismName.value = state.currentPrism.name;
  }
  renderPrismSwitcher();
  if (state.elements.deckCountTag) {
    const logicalCount = getLogicalDeckCount(state.currentPrism);
    state.elements.deckCountTag.textContent = `${logicalCount} ${logicalCount === 1 ? 'deck' : 'decks'}`;

    // Variant reflects physical slot fullness (capacity is 48 stripe slots),
    // not the logical deck count — dot variants pack 2 decks into one slot.
    const usedSlots = getUsedPositions(state.currentPrism).size;
    if (usedSlots >= MAX_STRIPE_SLOTS) {
      state.elements.deckCountTag.variant = 'warning';
    } else if (usedSlots >= 40) {
      state.elements.deckCountTag.variant = 'neutral';
    } else {
      state.elements.deckCountTag.variant = 'success';
    }
  }
}

// ============================================================================
// Sync status indicator
// ============================================================================

function setupSyncStatus() {
  const { syncStatus, btnSyncNow } = state.elements;
  if (!syncStatus || !btnSyncNow) return;

  // Visibility follows auth rather than a one-shot check here: auth can now
  // resolve after this runs (a CDN load that failed and was retried), and a
  // one-shot check would leave the sync controls hidden for the rest of the
  // session even once the user is known to be signed in (#199).
  const applyVisibility = (user) => {
    const display = user ? '' : 'none';
    syncStatus.style.display = display;
    btnSyncNow.style.display = display;
  };
  applyVisibility(getCurrentUser());
  onAuthChange(applyVisibility);

  let lastSyncedAt = null;
  let statusInterval = null;

  function updateStatusText() {
    if (!lastSyncedAt) return;
    const mins = Math.floor((Date.now() - lastSyncedAt) / 60000);
    if (mins < 1) {
      syncStatus.textContent = 'Synced just now';
    } else {
      syncStatus.textContent = `Synced ${mins}m ago`;
    }
  }

  onSyncStatusChange((status) => {
    clearInterval(statusInterval);
    if (status === 'syncing') {
      syncStatus.textContent = 'Syncing…';
      syncStatus.className = 'sync-status-indicator';
    } else if (status === 'synced') {
      lastSyncedAt = Date.now();
      updateStatusText();
      syncStatus.className = 'sync-status-indicator sync-status-ok';
      statusInterval = setInterval(updateStatusText, 60000);
    } else if (status === 'failed') {
      syncStatus.textContent = 'Sync failed — Retry';
      syncStatus.className = 'sync-status-indicator sync-status-failed';
    }
  });

  syncStatus.addEventListener('click', () => {
    if (syncStatus.classList.contains('sync-status-failed')) {
      forceSyncCurrentPrism();
    }
  });

  btnSyncNow.addEventListener('click', async () => {
    btnSyncNow.loading = true;
    try {
      await forceSyncCurrentPrism();
    } finally {
      btnSyncNow.loading = false;
    }
  });
}
