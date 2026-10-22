/**
 * Deck import: Moxfield/Archidekt URL import, file upload, JSON import.
 */

import { state } from '../core/state.js';
import { showError, showSuccess } from '../core/notifications.js';
import { logToSupabase } from '../modules/supabase-client.js';
import { savePrism, setCurrentPrism } from '../modules/storage.js';
import { buildPrismFromJson } from '../modules/prism-import.js';
import { importFromMoxfield, toDecklistText, extractMoxfieldId } from '../modules/moxfield.js';
import { importFromArchidekt, extractArchidektId } from '../modules/archidekt.js';
import { extractCubeCobraId, fetchCube, cubeTags, cubeToPacks, packsToPrismJson } from '../modules/cubecobra.js';
import { MAX_STRIPE_SLOTS } from '../modules/processor.js';
import { escapeHtml } from '../core/utils.js';
import {
  initColorSwatches,
  syncCommanderFieldsFromText,
  addCommanderRefs,
  editCommanderRefs,
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
    if (state.elements.deckList) state.elements.deckList.value = content;
    // Programmatic .value writes fire no change event — sync fields explicitly
    syncCommanderFieldsFromText(addCommanderRefs());

    if (state.elements.deckName && !state.elements.deckName.value) {
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

export function handleEditFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    if (state.elements.editDeckList) state.elements.editDeckList.value = content;
    syncCommanderFieldsFromText(editCommanderRefs());
    showSuccess(`Loaded ${file.name}`);
  };

  reader.onerror = () => showError('Failed to read file. Please try again.');
  reader.readAsText(file);
  resetFileInput(e.target);
}

// ============================================================================
// CubeCobra Import (#196)
// ============================================================================

let loadedCube = null;

export function openCubeDialog() {
  const els = state.elements;
  loadedCube = null;
  if (els.cubeUrl) els.cubeUrl.value = '';
  if (els.cubeError) els.cubeError.hidden = true;
  if (els.cubeTags) { els.cubeTags.hidden = true; els.cubeTags.innerHTML = ''; }
  if (els.cubeCapacity) els.cubeCapacity.hidden = true;
  if (els.btnCreateCube) els.btnCreateCube.disabled = true;
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
  if (els.cubeError) els.cubeError.hidden = true;
  if (!cubeId) {
    showCubeError('Paste a CubeCobra cube URL or cube id.');
    return;
  }

  if (els.btnLoadCube) els.btnLoadCube.loading = true;
  try {
    const cube = await fetchCube(cubeId);
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
    console.error('Cube import error:', err);
    logToSupabase('error', 'cube_import_failed', { error: err.message });
    loadedCube = null;
    if (els.cubeTags) els.cubeTags.hidden = true;
    if (els.cubeCapacity) els.cubeCapacity.hidden = true;
    if (els.btnCreateCube) els.btnCreateCube.disabled = true;
    showCubeError(err.message || 'Failed to load cube.');
  } finally {
    if (els.btnLoadCube) els.btnLoadCube.loading = false;
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
// Moxfield / Archidekt URL Import
// ============================================================================

/**
 * Detect a deck URL/ID's source and fetch it. Shared by the add-deck and
 * edit-deck URL importers so the detection rules stay in one place.
 * @returns {Promise<{serviceName: string, deckData: Object}>}
 * @throws if the source can't be detected.
 */
async function resolveDeckSource(urlOrId) {
  if (urlOrId.includes('archidekt.com') || extractArchidektId(urlOrId)) {
    if (urlOrId.includes('archidekt.com') || /^\d+$/.test(urlOrId)) {
      return { serviceName: 'Archidekt', deckData: await importFromArchidekt(urlOrId) };
    }
    return { serviceName: 'Moxfield', deckData: await importFromMoxfield(urlOrId) };
  }
  if (urlOrId.includes('moxfield.com') || extractMoxfieldId(urlOrId)) {
    return { serviceName: 'Moxfield', deckData: await importFromMoxfield(urlOrId) };
  }
  throw new Error('Could not detect deck source. Please use a Moxfield or Archidekt URL.');
}

export async function handleMoxfieldImport() {
  const urlOrId = state.elements.moxfieldUrl?.value?.trim();
  if (!urlOrId) {
    showMoxfieldError('Please enter a deck URL.');
    return;
  }

  hideMoxfieldMessages();
  const btn = state.elements.btnImportMoxfield;
  if (btn) btn.loading = true;

  try {
    const { serviceName, deckData } = await resolveDeckSource(urlOrId);

    if (state.elements.deckName) state.elements.deckName.value = deckData.name || '';
    if (state.elements.deckList) state.elements.deckList.value = toDecklistText(deckData);
    // Commander fields auto-fill from the text's Commander section (#147)
    syncCommanderFieldsFromText(addCommanderRefs());

    logToSupabase('info', 'url_import', { service: serviceName, name: deckData.name, cardCount: deckData.cards.length });
    showMoxfieldSuccess(`Imported "${deckData.name}" from ${serviceName} (${deckData.cards.length} cards). Review the form and click "Add Deck" to save.`);

    if (state.elements.moxfieldUrl) state.elements.moxfieldUrl.value = '';
    if (state.elements.moxfieldImportSection) state.elements.moxfieldImportSection.open = false;

  } catch (err) {
    console.error('Deck import error:', err);
    logToSupabase('error', 'url_import_failed', { error: err.message });
    showMoxfieldError(err.message || 'Failed to import deck.');
  } finally {
    if (btn) btn.loading = false;
  }
}

// Edit dialog URL import
export async function handleEditUrlImport() {
  const urlOrId = state.elements.editImportUrl?.value?.trim();
  if (!urlOrId) {
    showEditImportError('Please enter a deck URL.');
    return;
  }

  hideEditImportMessages();
  const btn = state.elements.btnEditImportUrl;
  if (btn) btn.loading = true;

  try {
    const { serviceName, deckData } = await resolveDeckSource(urlOrId);

    if (state.elements.editDeckList) state.elements.editDeckList.value = toDecklistText(deckData);
    syncCommanderFieldsFromText(editCommanderRefs());

    showEditImportSuccess(`Imported "${deckData.name}" from ${serviceName} (${deckData.cards.length} cards). Review and click "Save Changes" to update.`);

    if (state.elements.editImportUrl) state.elements.editImportUrl.value = '';
    if (state.elements.editImportSection) state.elements.editImportSection.open = false;

  } catch (err) {
    console.error('Edit deck import error:', err);
    showEditImportError(err.message || 'Failed to import deck.');
  } finally {
    if (btn) btn.loading = false;
  }
}

// ============================================================================
// Import message helpers
// ============================================================================

function showMoxfieldError(message) {
  if (state.elements.moxfieldError) { state.elements.moxfieldError.textContent = message; state.elements.moxfieldError.hidden = false; }
  if (state.elements.moxfieldSuccess) state.elements.moxfieldSuccess.hidden = true;
}

function showMoxfieldSuccess(message) {
  if (state.elements.moxfieldSuccess) { state.elements.moxfieldSuccess.textContent = message; state.elements.moxfieldSuccess.hidden = false; }
  if (state.elements.moxfieldError) state.elements.moxfieldError.hidden = true;
}

function hideMoxfieldMessages() {
  if (state.elements.moxfieldError) state.elements.moxfieldError.hidden = true;
  if (state.elements.moxfieldSuccess) state.elements.moxfieldSuccess.hidden = true;
}

function showEditImportError(message) {
  if (state.elements.editImportError) { state.elements.editImportError.textContent = message; state.elements.editImportError.hidden = false; }
  if (state.elements.editImportSuccess) state.elements.editImportSuccess.hidden = true;
}

function showEditImportSuccess(message) {
  if (state.elements.editImportSuccess) { state.elements.editImportSuccess.textContent = message; state.elements.editImportSuccess.hidden = false; }
  if (state.elements.editImportError) state.elements.editImportError.hidden = true;
}

export function hideEditImportMessages() {
  if (state.elements.editImportError) state.elements.editImportError.hidden = true;
  if (state.elements.editImportSuccess) state.elements.editImportSuccess.hidden = true;
}
