/**
 * Deck import: Moxfield/Archidekt URL import, file upload, JSON import.
 */

import { state } from '../core/state.js';
import { showError, showSuccess } from '../core/notifications.js';
import { logToSupabase } from '../modules/supabase-client.js';
import { createDeck, createPrism } from '../modules/processor.js';
import { savePrism, setCurrentPrism } from '../modules/storage.js';
import { importFromMoxfield, toDecklistText, extractMoxfieldId } from '../modules/moxfield.js';
import { importFromArchidekt, extractArchidektId } from '../modules/archidekt.js';
import { initColorSwatches } from './deck-form.js';
import { renderAll } from './init.js';

// ============================================================================
// File Upload
// ============================================================================

export function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    if (state.elements.deckList) state.elements.deckList.value = content;

    if (state.elements.deckName && !state.elements.deckName.value) {
      const nameWithoutExt = file.name.replace(/\.(txt|dec|dek|mwDeck)$/i, '');
      state.elements.deckName.value = nameWithoutExt;
    }

    showSuccess(`Loaded ${file.name}`);
  };

  reader.onerror = () => showError('Failed to read file. Please try again.');
  reader.readAsText(file);
}

export function handleEditFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    if (state.elements.editDeckList) state.elements.editDeckList.value = content;
    showSuccess(`Loaded ${file.name}`);
  };

  reader.onerror = () => showError('Failed to read file. Please try again.');
  reader.readAsText(file);
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

      let prismData = null;
      if (jsonData.prism && jsonData.prism.decks) {
        prismData = jsonData.prism;
      } else if (jsonData.decks && Array.isArray(jsonData.decks)) {
        prismData = jsonData;
      } else {
        throw new Error('Invalid PRISM JSON format. Expected decks array.');
      }

      if (!prismData.decks || prismData.decks.length === 0) {
        throw new Error('No decks found in the imported file.');
      }

      const newPrism = createPrism(prismData.name || 'Imported PRISM');
      newPrism.id = prismData.id || newPrism.id;
      newPrism.createdAt = prismData.createdAt || newPrism.createdAt;
      newPrism.updatedAt = new Date().toISOString();
      newPrism.markedCards = prismData.markedCards || [];
      newPrism.removedCards = prismData.removedCards || [];

      for (const deck of prismData.decks) {
        const deckCards = deck.cards || [];
        const newDeck = createDeck({
          id: deck.id,
          name: deck.name,
          commander: deck.commander,
          bracket: deck.bracket,
          color: deck.color,
          stripePosition: deck.stripePosition,
          splitGroupId: deck.splitGroupId || null,
          cards: deckCards,
          createdAt: deck.createdAt,
          updatedAt: deck.updatedAt
        });
        newPrism.decks.push(newDeck);
      }

      const deckIds = new Set(newPrism.decks.map(d => d.id));
      newPrism.splitGroups = (prismData.splitGroups || [])
        .map(group => {
          const explicit = (group.childDeckIds || []).filter(id => deckIds.has(id));
          const childDeckIds = explicit.length > 0
            ? explicit
            : newPrism.decks.filter(d => d.splitGroupId === group.id).map(d => d.id);
          if (childDeckIds.length === 0) return null;
          return {
            id: group.id,
            name: group.name,
            sideAPosition: group.sideAPosition,
            sideAColor: group.sideAColor,
            splitStyle: group.splitStyle || 'stripes',
            childDeckIds,
            createdAt: group.createdAt,
            updatedAt: group.updatedAt
          };
        })
        .filter(Boolean);

      const validGroupIds = new Set(newPrism.splitGroups.map(g => g.id));
      for (const deck of newPrism.decks) {
        if (deck.splitGroupId && !validGroupIds.has(deck.splitGroupId)) {
          deck.splitGroupId = null;
        }
      }

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

  e.target.files = [];
}

// ============================================================================
// Moxfield / Archidekt URL Import
// ============================================================================

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

    if (state.elements.deckName) state.elements.deckName.value = deckData.name || '';
    if (state.elements.deckCommander) state.elements.deckCommander.value = deckData.commander || '';
    if (state.elements.deckList) state.elements.deckList.value = toDecklistText(deckData);

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

    if (state.elements.editDeckList) state.elements.editDeckList.value = toDecklistText(deckData);

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
