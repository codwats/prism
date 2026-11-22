/**
 * Deck import: Moxfield/Archidekt URL import, file upload, JSON import.
 */

import { state } from '../core/state.js';
import { showError, showSuccess } from '../core/notifications.js';
import { logToSupabase } from '../modules/supabase-client.js';
import { savePrism, setCurrentPrism } from '../modules/storage.js';
import { buildPrismFromJson } from '../modules/prism-import.js';
import { toDecklistText } from '../modules/moxfield.js';
import { resolveDeckSource } from '../modules/deck-source.js';
import { extractCubeCobraId, fetchCube, cubeTags, cubeToPacks, packsToPrismJson } from '../modules/cubecobra.js';
import { MAX_STRIPE_SLOTS, isConstructedDeck } from '../modules/processor.js';
import { escapeHtml } from '../core/utils.js';
import {
  initColorSwatches,
  syncCommanderFieldsFromText,
  commanderRefs,
  setDeckFormat,
} from './deck-form.js';
import { renderAll } from './init.js';

// ============================================================================
// File Upload
// ============================================================================

/**
 * Clear a file input's selection so choosing the same file again re-fires
 * `change`. Never assign `.files` (getter-only on some elements — a throw here
 * must not abort the caller's flow), so set `.value` and swallow failures.
 */
export function resetFileInput(input) {
  if (!input) return;
  try {
    input.value = '';
  } catch {
    // Element doesn't support clearing; same-file re-selection won't refire,
    // but the surrounding flow must not break over it.
  }
}

export function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    // An import still in flight must not overwrite the uploaded list
    cancelDeckUrlImport();
    if (state.elements.deckList) state.elements.deckList.value = content;
    // The list no longer comes from the imported URL
    if (state.deckFormMode === 'edit') state.editSourceUrl = null;
    else state.addSourceUrl = null;
    // Programmatic .value writes fire no change event — sync fields explicitly
    syncCommanderFieldsFromText(commanderRefs());

    if (state.deckFormMode !== 'edit' && state.elements.deckName && !state.elements.deckName.value) {
      const nameWithoutExt = file.name.replace(/\.(txt|dec|dek|mwDeck)$/i, '');
      state.elements.deckName.value = nameWithoutExt;
    }

    showSuccess(`Loaded ${file.name}`);
  };

  reader.onerror = () => showError('Failed to read file. Please try again.');
  reader.readAsText(file);
  // Clear the selection so re-uploading the same file (e.g. after hand-editing
  // the textarea) fires another change event. FileReader keeps its own
  // reference to `file`, so clearing now doesn't abort the read.
  resetFileInput(e.target);
}

// ============================================================================
// CubeCobra Import (#196)
// ============================================================================

let loadedCube = null;
let cubeLoadGeneration = 0; // a response from an older load is ignored

function resetLoadedCube() {
  const els = state.elements;
  loadedCube = null;
  if (els.cubeTags) { els.cubeTags.hidden = true; els.cubeTags.innerHTML = ''; }
  if (els.cubeCapacity) els.cubeCapacity.hidden = true;
  if (els.btnCreateCube) els.btnCreateCube.disabled = true;
}

export function openCubeDialog() {
  const els = state.elements;
  cubeLoadGeneration++;
  resetLoadedCube();
  if (els.cubeUrl) els.cubeUrl.value = '';
  if (els.cubeError) els.cubeError.hidden = true;
  if (els.btnLoadCube) els.btnLoadCube.loading = false;
  els.cubeDialog?.setAttribute('open', '');
}

function showCubeError(message) {
  if (!state.elements.cubeError) return;
  state.elements.cubeError.textContent = message;
  state.elements.cubeError.hidden = false;
}

function tickedCubeTags() {
  return [...(state.elements.cubeTags?.querySelectorAll('wa-checkbox') || [])]
    .filter(box => box.checked)
    .map(box => box.dataset.tag);
}

export function updateCubeCapacity() {
  const els = state.elements;
  const ticked = tickedCubeTags().length;
  const over = ticked > MAX_STRIPE_SLOTS;
  if (els.cubeCapacity) {
    els.cubeCapacity.textContent = over
      ? `${ticked} packs ticked; a PRISM holds ${MAX_STRIPE_SLOTS}. Untick ${ticked - MAX_STRIPE_SLOTS} to continue.`
      : `${ticked} of ${MAX_STRIPE_SLOTS} stripe slots used.`;
    els.cubeCapacity.style.color = over ? 'var(--wa-color-danger-text)' : '';
    els.cubeCapacity.hidden = false;
  }
  if (els.btnCreateCube) els.btnCreateCube.disabled = ticked === 0 || over;
}

export function setAllCubeTags(checked) {
  state.elements.cubeTags?.querySelectorAll('wa-checkbox').forEach(box => { box.checked = checked; });
  // Setting .checked fires no change event
  updateCubeCapacity();
}

export async function handleLoadCube() {
  const els = state.elements;
  const cubeId = extractCubeCobraId(els.cubeUrl?.value);
  const generation = ++cubeLoadGeneration;
  resetLoadedCube();
  if (els.cubeError) els.cubeError.hidden = true;
  if (!cubeId) {
    showCubeError('Paste a CubeCobra cube URL or cube id.');
    return;
  }

  if (els.btnLoadCube) els.btnLoadCube.loading = true;
  try {
    const cube = await fetchCube(cubeId);
    if (generation !== cubeLoadGeneration) return;
    const tags = cubeTags(cube);
    if (tags.length === 0) throw new Error('This cube has no tagged cards. Tag each card with its pack on CubeCobra first.');
    loadedCube = cube;
    els.cubeTags.innerHTML = `<div class="wa-split">
        <span class="wa-caption-m">Tags that are packs in <strong>${escapeHtml(cube.name || cubeId)}</strong>:</span>
        <div class="wa-cluster wa-gap-2xs">
          <wa-button type="button" data-cube-tags-check="true" size="s" appearance="plain">Check all</wa-button>
          <wa-button type="button" data-cube-tags-check="false" size="s" appearance="plain">Uncheck all</wa-button>
        </div>
      </div>`
      + tags.map(({ tag, count }) =>
        `<wa-checkbox checked data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} (${count} card${count === 1 ? '' : 's'})</wa-checkbox>`
      ).join('');
    els.cubeTags.hidden = false;
    updateCubeCapacity();
  } catch (err) {
    if (generation !== cubeLoadGeneration) return;
    console.error('Cube import error:', err);
    logToSupabase('error', 'cube_import_failed', { error: err.message });
    resetLoadedCube();
    showCubeError(err.message || 'Failed to load cube.');
  } finally {
    // A newer load owns the spinner
    if (generation === cubeLoadGeneration && els.btnLoadCube) els.btnLoadCube.loading = false;
  }
}

export function handleCreateCubePrism() {
  if (!loadedCube) return;
  try {
    const { packs, skipped } = cubeToPacks(loadedCube, tickedCubeTags());
    const newPrism = buildPrismFromJson(packsToPrismJson(loadedCube.name, packs), { preserveId: false });

    savePrism(newPrism);
    setCurrentPrism(newPrism.id);
    state.currentPrism = newPrism;
    initColorSwatches();
    renderAll();
    state.elements.cubeDialog?.removeAttribute('open');

    logToSupabase('info', 'cube_import', { name: newPrism.name, deckCount: newPrism.decks.length, skipped });
    const skippedNote = skipped > 0 ? ` Skipped ${skipped} card${skipped === 1 ? '' : 's'} with no ticked tag.` : '';
    showSuccess(`Imported "${newPrism.name}" with ${newPrism.decks.length} pack${newPrism.decks.length === 1 ? '' : 's'}.${skippedNote}`);
  } catch (err) {
    console.error('Cube import error:', err);
    showCubeError(err.message || 'Failed to import cube.');
  }
}

// ============================================================================
// JSON Import
// ============================================================================

export function handleJsonImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const jsonData = JSON.parse(event.target.result);
      const newPrism = buildPrismFromJson(jsonData);

      savePrism(newPrism);
      setCurrentPrism(newPrism.id);
      state.currentPrism = newPrism;

      initColorSwatches();
      renderAll();

      const groupCount = newPrism.splitGroups.length;
      logToSupabase('info', 'json_import', { name: newPrism.name, deckCount: newPrism.decks.length, splitGroupCount: groupCount });
      const suffix = groupCount > 0 ? ` (${groupCount} split group${groupCount === 1 ? '' : 's'})` : '';
      showSuccess(`Imported "${newPrism.name}" with ${newPrism.decks.length} decks${suffix}.`);
    } catch (err) {
      console.error('JSON import error:', err);
      logToSupabase('error', 'json_import_failed', { error: err.message });
      showError(err.message || 'Failed to parse JSON file. Please check the format.');
    }
  };

  reader.onerror = () => showError('Failed to read file. Please try again.');
  reader.readAsText(file);
  resetFileInput(e.target);
}

// ============================================================================
// Deck URL Import (Moxfield / Archidekt / DeckCheck / Commander Template)
// ============================================================================

let importGeneration = 0; // a response from an older import or form session is ignored

/** Drop any in-flight import: a new form session, a reset or a file upload supersedes it. */
export function cancelDeckUrlImport() {
  importGeneration++;
  if (state.elements?.btnImportDeckUrl) state.elements.btnImportDeckUrl.loading = false;
  if (state.elements?.btnRefreshSource) state.elements.btnRefreshSource.loading = false;
}

/**
 * Fill the deck form from a deck URL. Add mode fills name, bracket and list
 * and leaves the URL pending in state.addSourceUrl; edit mode replaces only
 * the list and leaves it in state.editSourceUrl. Each save reads only its
 * own (#377). Also the edit form's "Refresh from saved link", passing
 * deck.sourceUrl.
 */
export async function handleDeckUrlImport(urlOrId = state.elements.deckUrl?.value?.trim(), btn = state.elements.btnImportDeckUrl) {
  if (!urlOrId) {
    showImportError('Please enter a deck URL.');
    return;
  }

  hideImportMessages();
  // Supersede any import in flight, spinner included (Refresh over Import)
  cancelDeckUrlImport();
  const generation = importGeneration;
  const editing = state.deckFormMode === 'edit';
  if (btn) btn.loading = true;

  try {
    const { serviceName, deckData } = await resolveDeckSource(urlOrId);
    if (generation !== importGeneration) return;

    if (!editing) {
      if (state.elements.deckName) state.elements.deckName.value = deckData.name || '';
      if (deckData.bracket && state.elements.deckBracket) state.elements.deckBracket.value = String(deckData.bracket);
    }
    if (state.elements.deckList) state.elements.deckList.value = toDecklistText(deckData);
    if (editing) state.editSourceUrl = deckData.sourceUrl || null;
    else state.addSourceUrl = deckData.sourceUrl || null;
    // Commander fields auto-fill from the text's Commander section (#147)
    syncCommanderFieldsFromText(commanderRefs());
    // A deck with no commander is Constructed (#29); its importer kept the Sideboard
    setDeckFormat(isConstructedDeck(deckData) ? 'constructed' : 'commander');

    if (!editing) logToSupabase('info', 'url_import', { service: serviceName, name: deckData.name, cardCount: deckData.cards.length });
    showImportSuccess(editing
      ? `Imported "${deckData.name}" from ${serviceName} (${deckData.cards.length} cards). Review and select "Save changes" to update.`
      : `Imported "${deckData.name}" from ${serviceName} (${deckData.cards.length} cards). Review the form and select "Add deck" to save.`);

    if (state.elements.deckUrl) state.elements.deckUrl.value = '';
  } catch (err) {
    if (generation !== importGeneration) return;
    console.error('Deck import error:', err);
    if (!editing) logToSupabase('error', 'url_import_failed', { error: err.message });
    showImportError(err.message || 'Failed to import deck.');
  } finally {
    if (btn && generation === importGeneration) btn.loading = false;
  }
}

// ============================================================================
// Import message helpers
// ============================================================================

function showImportError(message) {
  if (state.elements.deckUrlError) { state.elements.deckUrlError.textContent = message; state.elements.deckUrlError.hidden = false; }
  if (state.elements.deckUrlSuccess) state.elements.deckUrlSuccess.hidden = true;
}

function showImportSuccess(message) {
  if (state.elements.deckUrlSuccess) { state.elements.deckUrlSuccess.textContent = message; state.elements.deckUrlSuccess.hidden = false; }
  if (state.elements.deckUrlError) state.elements.deckUrlError.hidden = true;
}

export function hideImportMessages() {
  if (state.elements?.deckUrlError) state.elements.deckUrlError.hidden = true;
  if (state.elements?.deckUrlSuccess) state.elements.deckUrlSuccess.hidden = true;
}
