/**
 * Deck list rendering, edit/delete/split handlers, removed cards, mark toggle.
 */

import { state } from "../core/state.js";
import { showError, showSuccess } from "../core/notifications.js";
import { escapeHtml, debugLog, markSingleBatchDone, clickItemsOnKeyboardSelect } from "../core/utils.js";
import { parseDecklist, validateDecklist, cardsToDecklistText, normalizeCardName, markingCards } from "../modules/parser.js";
import {
  processCards,
  commanderNames,
  removeDeckFromPrism,
  moveStripeToPosition,
  getColorName,
  calculateRemovedCards,
  splitDeck,
  addSplitToGroup,
  unsplitGroup,
  removeSplitChild,
  formatSlotLabel,
  createPrism,
  isDotVariant,
  isNameTaken,
  nameTakenMessage,
  updateSplitGroupInPrism,
  applyCommanderFallback,
} from "../modules/processor.js";
import {
  trackRemovedCard,
  markTallies,
  unmarkCardsWithNewStripes as unmarkCardsWithNewStripesIn,
  clearReturnedRemovals,
  removalMark,
  trackStaleChildMarks,
  keepSeparateSleeves,
  openRemovals,
} from "../modules/swap.js";
import { savePrism, setCurrentPrism, recordUnmarkedCards, getPrism } from "../modules/storage.js";
import { trackEvent } from "../modules/supabase-client.js";
import { openMembershipDrawer } from "../modules/membership.js";
import { openDeckExportDialog } from "../modules/deck-export-panel.js";
import { deckSourceSite } from "../modules/deck-source.js";
import { canonicalizeCards } from "../modules/scryfall.js";
import {
  initColorSwatches,
  resetDeckForm,
  syncCommanderFieldsFromText,
  applyCommanderFieldsToText,
  commanderRefs,
  setDeckFormMode,
  closeDeckDialog,
  currentFormSession,
  updateColorSwatchSelection,
  checkColorWarning,
  showParseErrors,
  setDeckFormat,
  isConstructedForm,
} from "./deck-form.js";
import { renderAll } from "./init.js";
import { openStripeReorderDialog, openGroupReorderDialog } from "./stripe-reorder-dialog.js";
import { toggleWhatIfAnalysis } from "./analysis.js";
import { renderResults, updateRemovedFilterBadge, updateMarkedProgress } from "./results.js";

// ============================================================================
// Mark tally helpers (for marked cards regression fix)
// ============================================================================

export function getMarkTallies() {
  return markTallies(state.currentPrism);
}

// True if the two card lists differ in membership or quantity (order-insensitive).
function cardListChanged(oldCards, newCards) {
  if (oldCards.length !== newCards.length) return true;
  const toMap = (cards) => {
    const m = new Map();
    for (const c of cards) m.set(`${c.name.toLowerCase()}${c.isSideboard ? "|sb" : ""}`, c.quantity);
    return m;
  };
  const oldMap = toMap(oldCards);
  const newMap = toMap(newCards);
  if (oldMap.size !== newMap.size) return true;
  for (const [name, qty] of newMap) {
    if (oldMap.get(name) !== qty) return true;
  }
  return false;
}

export function unmarkCardsWithNewStripes(before, stillPainted) {
  return unmarkCardsWithNewStripesIn(state.currentPrism, before, stillPainted);
}

export function autoClearRemovedCards(newCards) {
  if (!state.currentPrism?.removedCards?.length || !newCards?.length) return 0;

  // normalizeCardName (not bare toLowerCase) so printing suffixes, back faces
  // and stray whitespace match the same way processCards dedups cards.
  const newByName = new Map(
    markingCards(newCards).map((c) => [normalizeCardName(c.name), c]),
  );

  const before = state.currentPrism.removedCards.length;
  state.currentPrism.removedCards = state.currentPrism.removedCards.filter((rc) => {
    const newCard = newByName.get(normalizeCardName(rc.cardName));
    if (!newCard) return true; // still absent — keep the row
    if (rc.stillInDeck) return true; // never left (#423): trackStaleChildMarks closes it
    // Quantity-decrease rows (#151) only clear once the quantity is fully
    // restored — otherwise the very save that created the row would clear it.
    // Legacy rows without quantity fields keep the present-in-list rule.
    if (rc.previousQuantity != null) return (newCard.quantity || 1) < rc.previousQuantity;
    return false; // present again — clear
  });

  return before - state.currentPrism.removedCards.length;
}

// ============================================================================
// Mark toggle
// ============================================================================

export function setCardMarked(cardKey, marked) {
  setCardsMarked([cardKey], marked);
}

/**
 * Mark or clear several row keys (plain, `|#b|` batch or pass keys) with one
 * tombstone write and one save. The per-row checkbox, SCRY-Mode and the bulk
 * actions all come through here, so every path writes the same keys.
 */
export function setCardsMarked(cardKeys, marked) {
  const prism = state.currentPrism;
  if (!prism || !cardKeys?.some(Boolean)) return;
  if (!prism.markedCards) prism.markedCards = [];

  const unmarkedKeys = [];
  let newlyMarked = false;
  for (const cardKey of cardKeys) {
    if (!cardKey) continue;
    const single = state.processedCards?.find((c) => c.name === cardKey && c.batches?.length === 1);
    const keys = single ? [cardKey, single.batches[0].key] : [cardKey];
    if (marked) {
      if (!prism.markedCards.includes(cardKey)) newlyMarked = true;
      if (single) {
        const done = markSingleBatchDone(prism.markedCards, cardKey, single.batches[0].key);
        prism.markedCards = done.markedCards;
        unmarkedKeys.push(...done.unmarkedKeys);
      } else if (!prism.markedCards.includes(cardKey)) {
        prism.markedCards.push(cardKey);
      }
    } else {
      prism.markedCards = prism.markedCards.filter((c) => !keys.includes(c));
      unmarkedKeys.push(...keys);
    }
  }
  // GA-only funnel step (visit → deck → first mark → export); too chatty
  // for app_logs rows. Once per action, so a bulk mark is one event.
  if (newlyMarked) trackEvent('card_marked');
  recordUnmarkedCards(prism.id, unmarkedKeys);

  const now = new Date().toISOString();
  prism.updatedAt = now;
  prism.markedCardsUpdatedAt = now;
  savePrism(prism);
}

export function handleMarkToggle(event) {
  // Delegated from the results tbody, so `currentTarget` is the tbody itself —
  // the checkbox has to come off the event target.
  const checkbox = event.target.closest(".mark-checkbox");
  const row = checkbox?.closest("tr");
  const cardKey = row?.dataset?.cardKey;

  if (!checkbox || !cardKey || !state.currentPrism) {
    console.warn("Mark toggle failed:", {
      cardKey,
      hasPrism: !!state.currentPrism,
    });
    return;
  }

  const isChecked = checkbox.checked;

  if (isChecked) {
    row.classList.add("marked-row");
  } else {
    row.classList.remove("marked-row");
  }

  setCardMarked(cardKey, isChecked);

  // Full re-render when: undone filter active (marked row must disappear) OR
  // sort is by "marked" column (row order needs to update) OR a batch sub-row
  // toggled (the derived parent roll-up checkbox must update).
  if (state.elements.undoneFilter?.checked || state.sortState?.column === 'marked' || row.classList.contains('batch-subrow')) {
    renderResults({ preserveRows: true });
  } else {
    updateMarkedProgress();
  }

  debugLog(
    "Card marked:",
    cardKey,
    "checked:",
    isChecked,
    "total marked:",
    state.currentPrism.markedCards.length,
  );
}

// ============================================================================
// Removed cards
// ============================================================================

export function handleClearRemoved(cardName, deckId) {
  if (!state.currentPrism || !state.currentPrism.removedCards) return;

  state.currentPrism.removedCards = state.currentPrism.removedCards.filter(
    (rc) =>
      !(
        rc.cardName.toLowerCase() === cardName.toLowerCase() &&
        rc.deckId === deckId
      ),
  );

  state.currentPrism.updatedAt = new Date().toISOString();
  savePrism(state.currentPrism);

  updateRemovedFilterBadge();
  renderResults({ preserveRows: true });
  showSuccess(`Cleared "${cardName}" from removed list.`);
}

/**
 * Open the confirm dialog for clearing every stale mark. Each row is paint
 * still on a sleeve, and the list cannot be rebuilt once dropped, so the bulk
 * path is gated the same way deck deletion is.
 */
export function handleClearAllRemovedClick() {
  if (!state.currentPrism || !state.currentPrism.removedCards?.length) return;

  const count = openRemovals(state.currentPrism).length;
  const { clearAllRemovedDialog, clearAllRemovedCount } = state.elements;
  if (!clearAllRemovedDialog) {
    // No dialog on this page — fall back to acting directly rather than
    // leaving the button dead.
    handleClearAllRemoved();
    return;
  }
  if (clearAllRemovedCount) {
    clearAllRemovedCount.textContent = `${count} ${count === 1 ? 'mark' : 'marks'}`;
  }
  clearAllRemovedDialog.setAttribute('open', '');
}

export function handleClearAllRemoved() {
  if (!state.currentPrism || !state.currentPrism.removedCards?.length) return;

  const count = openRemovals(state.currentPrism).length;
  state.currentPrism.removedCards = [];
  state.currentPrism.updatedAt = new Date().toISOString();
  savePrism(state.currentPrism);

  state.elements.clearAllRemovedDialog?.removeAttribute('open');
  updateRemovedFilterBadge();
  renderResults();
  showSuccess(`Cleared ${count} ${count === 1 ? 'mark' : 'marks'} from Marks to Clear.`);
}

// ============================================================================
// Edit / Delete / Split handlers
// ============================================================================

export function handleDeleteClick(deckId) {
  const deck = state.currentPrism.decks.find((d) => d.id === deckId);
  if (!deck) return;

  state.deckToDelete = deckId;
  state.elements.deleteDeckName.textContent = deck.name;
  state.elements.deleteDialog.setAttribute('open', '');
}

export function handleEditClick(deckId) {
  const deck = state.currentPrism.decks.find((d) => d.id === deckId);
  if (!deck) return;

  // Edit mode on the one deck form (#450): clears both pending sourceUrls
  setDeckFormMode("edit", deckId);
  resetDeckForm();

  if (state.elements.deckName) state.elements.deckName.value = deck.name;
  if (state.elements.deckBracket)
    state.elements.deckBracket.value = String(deck.bracket);
  if (state.elements.deckColor) state.elements.deckColor.value = deck.color;
  updateColorSwatchSelection();
  checkColorWarning();

  if (state.elements.deckList) {
    // Sections carry the commander flags through the textarea round-trip (#147)
    state.elements.deckList.value = cardsToDecklistText(deck.cards);
  }
  // Not stored (#29): a deck with no commander opens as Constructed
  setDeckFormat(deck.cards.some((c) => c.isCommander) ? "commander" : "constructed");
  syncCommanderFieldsFromText(commanderRefs());

  if (state.elements.deckListUpdated) {
    const ts = deck.cardsUpdatedAt || deck.createdAt;
    state.elements.deckListUpdated.textContent = ts
      ? `Deck list last edited: ${new Date(ts).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })}`
      : "";
  }

  state.elements.deckDialog?.setAttribute('open', '');
}

export async function handleEditConfirm() {
  if (!state.deckToEdit) return;

  const deck = state.currentPrism.decks.find((d) => d.id === state.deckToEdit);
  if (!deck) return;

  const beforeTallies = getMarkTallies();
  const beforeCards = processCards(state.currentPrism);
  const oldCards = [...deck.cards];

  // Fields → text once at save entry (idempotent) — see handleDeckSubmit
  applyCommanderFieldsToText(commanderRefs());

  const name = (state.elements.deckName?.value || "").trim();
  const commander = (state.elements.deckCommander?.value || "").trim();
  const constructed = isConstructedForm();
  const bracket = constructed ? "2" : state.elements.deckBracket?.value || "2";
  const color = state.elements.deckColor?.value || deck.color;
  const decklistText = state.elements.deckList?.value || "";

  if (!name) {
    showError("Please enter a deck name.");
    return;
  }
  if (!commander && !constructed) {
    showError("Please enter a commander name.");
    return;
  }
  if (!decklistText.trim()) {
    showError("Please paste a decklist.");
    return;
  }

  if (isNameTaken(state.currentPrism, name, { exceptDeckId: state.deckToEdit })) {
    showError(nameTakenMessage(name));
    return;
  }

  const parseResult = parseDecklist(decklistText, { keepSideboard: constructed });
  // Cancel during the Scryfall wait still saves this edit, but must not touch
  // the next form session (its source URL or its open dialog).
  const session = currentFormSession();
  const editSourceUrl = state.editSourceUrl;

  // Spinner for the Scryfall round-trip — the only network-bound wait here.
  const saveBtn = state.elements.btnSubmitDeck;
  saveBtn?.setAttribute("loading", "");
  try {
    await canonicalizeCards(parseResult.cards);
  } catch (err) {
    console.warn("Card canonicalization failed, using raw names:", err.message);
  } finally {
    saveBtn?.removeAttribute("loading");
  }

  const validation = validateDecklist(parseResult);

  if (parseResult.errors.length > 0) showParseErrors(parseResult.errors);

  if (!validation.isValid) {
    showError(validation.messages.join(" "));
    return;
  }

  const removedFromDeck = calculateRemovedCards(oldCards, parseResult.cards);

  if (!state.currentPrism.removedCards) state.currentPrism.removedCards = [];

  const now = new Date().toISOString();
  let removedCount = 0;

  for (const removedCard of removedFromDeck) {
    const mark = removalMark(state.currentPrism, beforeCards, deck, removedCard.name, removedCard.previousQuantity, removedCard.newQuantity);
    if (!mark) continue;
    const isNew = trackRemovedCard(state.currentPrism, {
      cardName: removedCard.name,
      deckId: deck.id,
      ...mark,
      removedAt: now,
      previousQuantity: removedCard.previousQuantity,
      isCommander: removedCard.isCommander,
      newQuantity: removedCard.newQuantity,
    });
    if (isNew) removedCount++;
  }

  keepSeparateSleeves(oldCards, parseResult.cards);
  const cardsChanged = cardListChanged(oldCards, parseResult.cards);

  deck.name = name;
  deck.bracket = parseInt(bracket, 10);
  deck.color = color;
  deck.cards = parseResult.cards;
  // A URL re-import repoints the source; a manual edit keeps it (#377)
  if (editSourceUrl) deck.sourceUrl = editSourceUrl;
  const current = session === currentFormSession();
  if (current) state.editSourceUrl = null;
  deck.updatedAt = now;
  if (cardsChanged) deck.cardsUpdatedAt = now;

  // A card back in this deck whose stale mark is still on the sleeve keeps
  // its done state (#307); the name-only auto-clear takes the rest.
  const stillPainted = clearReturnedRemovals(state.currentPrism, deck);
  const autoClearedCount = stillPainted.length + autoClearRemovedCards(parseResult.cards);

  const stalePainted = trackStaleChildMarks(state.currentPrism, beforeCards, now);
  const unmarkedKeys = unmarkCardsWithNewStripes(beforeTallies, [...stillPainted, ...stalePainted]);
  const unmarkedCount = unmarkedKeys.length;
  if (unmarkedKeys.length > 0) {
    recordUnmarkedCards(state.currentPrism.id, unmarkedKeys);
  }

  state.currentPrism.updatedAt = now;
  savePrism(state.currentPrism);
  if (current) {
    state.deckToEdit = null;
    closeDeckDialog();
  }

  renderAll();

  let message = `Updated "${name}" with ${parseResult.uniqueCards} cards.`;
  if (unmarkedCount > 0)
    message += ` ${unmarkedCount} card${unmarkedCount > 1 ? "s" : ""} unchecked (new marks needed).`;
  if (removedCount > 0)
    message += ` ${removedCount} card${removedCount > 1 ? "s" : ""} marked for removal.`;
  if (autoClearedCount > 0)
    message += ` ${autoClearedCount} card${autoClearedCount > 1 ? "s" : ""} auto-cleared from removed list.`;
  showSuccess(message);
}

export function handleDeleteConfirm() {
  if (!state.deckToDelete) return;

  const deck = state.currentPrism.decks.find(
    (d) => d.id === state.deckToDelete,
  );
  if (!deck) return;

  if (!state.currentPrism.removedCards) state.currentPrism.removedCards = [];

  const now = new Date().toISOString();
  let removedCount = 0;
  const beforeCards = deck.splitGroupId ? processCards(state.currentPrism) : [];

  for (const card of deck.cards) {
    const mark = removalMark(state.currentPrism, beforeCards, deck, card.name, card.quantity || 1, 0);
    if (!mark) continue;
    const isNew = trackRemovedCard(state.currentPrism, {
      cardName: card.name,
      deckId: deck.id,
      ...mark,
      removedAt: now,
      previousQuantity: card.quantity || 1,
      newQuantity: 0,
      isCommander: !!card.isCommander,
    });
    if (isNew) removedCount++;
  }

  const deckName = deck.name;
  const isSplitChild = !!deck.splitGroupId;
  if (isSplitChild) {
    state.currentPrism = removeSplitChild(
      state.currentPrism,
      state.deckToDelete,
    );
  } else {
    state.currentPrism = removeDeckFromPrism(
      state.currentPrism,
      state.deckToDelete,
    );
  }
  savePrism(state.currentPrism);

  // Drop the deleted deck from the Results deck filter — a stale ID there
  // matches no stripes and silently empties the whole table.
  state.selectedDeckIds.delete(state.deckToDelete);

  state.deckToDelete = null;
  state.elements.deleteDialog.removeAttribute('open');

  renderAll();

  if (removedCount > 0) {
    showSuccess(
      `Deleted "${deckName}". ${removedCount} card${removedCount > 1 ? "s" : ""} marked for removal.`,
    );
  }
}

export function handleSplitClick(deckId) {
  const deck = state.currentPrism.decks.find((d) => d.id === deckId);
  if (!deck) return;

  state.elements.splitDeckId.value = deckId;
  state.elements.splitDeckName.textContent = deck.name;
  state.elements.splitCount.value = "2";
  if (state.elements.splitStyle) {
    state.elements.splitStyle.value = "stripes";
  }
  if (state.elements.splitCount) {
    state.elements.splitCount.setAttribute('max', '8');
  }
  state.elements.splitDialog.setAttribute('open', '');
}

export function handleSplitConfirm() {
  const deckId = state.elements.splitDeckId.value;
  const count = parseInt(state.elements.splitCount.value) || 2;

  const splitStyle = state.elements.splitStyle?.value || 'stripes';
  const maxCount = splitStyle === 'dots' ? 2 : 8;

  if (count < 2 || count > maxCount) {
    showError(splitStyle === 'dots'
      ? "Dot groups support a maximum of 2 variants (one dot hole per card)."
      : "Split count must be between 2 and 8.");
    return;
  }
  let updatedPrism;
  try {
    updatedPrism = splitDeck(state.currentPrism, deckId, count, splitStyle);
  } catch (err) {
    showError(err.message);
    return;
  }
  state.currentPrism = updatedPrism;
  savePrism(state.currentPrism);

  state.elements.splitDialog.removeAttribute('open');
  renderAll();
  showSuccess(`Split into ${count} variants.`);
}

export function handleAddSplit(groupId) {
  let updatedPrism;
  try {
    updatedPrism = addSplitToGroup(state.currentPrism, groupId);
  } catch (err) {
    showError(err.message);
    return;
  }
  state.currentPrism = updatedPrism;
  savePrism(state.currentPrism);
  renderAll();

  const group = state.currentPrism.splitGroups.find((g) => g.id === groupId);
  if (group)
    showSuccess(
      `Added variant ${group.childDeckIds.length} to "${group.name}".`,
    );
}

export function handleUnsplit(groupId) {
  const group = state.currentPrism.splitGroups.find((g) => g.id === groupId);
  if (!group) return;

  const groupName = group.name;
  state.currentPrism = unsplitGroup(state.currentPrism, groupId);
  savePrism(state.currentPrism);
  renderAll();
  showSuccess(`Merged "${groupName}" back into a single deck.`);
}

export function handleEditGroupClick(groupId) {
  const group = state.currentPrism.splitGroups?.find((g) => g.id === groupId);
  if (!group) return;
  state.elements.editGroupId.value = groupId;
  state.elements.editGroupName.value = group.name;
  state.elements.editGroupColor.value = group.sideAColor;
  state.elements.editGroupDialog.setAttribute('open', '');
}

export function handleEditGroupConfirm() {
  const groupId = state.elements.editGroupId.value;
  const name = (state.elements.editGroupName?.value || '').trim();
  const color = state.elements.editGroupColor?.value || '';

  if (!name) {
    showError('Group name is required.');
    return;
  }

  if (isNameTaken(state.currentPrism, name, { exceptGroupId: groupId })) {
    showError(nameTakenMessage(name));
    return;
  }

  state.currentPrism = updateSplitGroupInPrism(state.currentPrism, groupId, {
    name,
    sideAColor: color.toUpperCase(),
  });
  savePrism(state.currentPrism);
  state.elements.editGroupDialog.removeAttribute('open');
  renderAll();
  showSuccess(`Updated group "${name}".`);
}

export function handleNewPrism() {
  savePrism(state.currentPrism);
  state.currentPrism = createPrism();
  savePrism(state.currentPrism);
  setCurrentPrism(state.currentPrism.id);

  state.elements.newPrismDialog.removeAttribute('open');

  resetDeckForm();
  initColorSwatches();
  renderAll();
  const createdId = state.currentPrism.id;
  // Let the create confirmation finish closing before opening another surface.
  state.elements.newPrismDialog.addEventListener('wa-after-hide', () => {
    openMembershipDrawer({ createdId });
  }, { once: true });
}

/**
 * Switch the active PRISM. The current one is saved first so nothing in
 * progress is lost, then the target is loaded from storage.
 * @param {string} prismId
 */
export function handleSwitchPrism(prismId) {
  if (!prismId || prismId === state.currentPrism?.id) return;

  const target = getPrism(prismId);
  if (!target) {
    showError('That PRISM could not be loaded.');
    return;
  }

  savePrism(state.currentPrism);
  setCurrentPrism(prismId);
  state.currentPrism = target;

  // Legacy scalar-commander decks are normalized once at page load; a PRISM
  // switched to at runtime never passed through that, so do it here too.
  let normalized = false;
  for (const deck of state.currentPrism.decks || []) {
    if (applyCommanderFallback(deck, deck.commander)) normalized = true;
  }
  if (normalized) savePrism(state.currentPrism);

  resetDeckForm();
  initColorSwatches();
  renderAll();
  showSuccess(`Switched to "${target.name}".`);
}

export function handleStripeReorder(deckId, direction) {
  // Dot variants own no slot (stripePosition null) — exclude them so the
  // neighbour-swap logic only ever targets decks with a real position.
  const sortedDecks = state.currentPrism.decks
    .filter((d) => typeof d.stripePosition === "number")
    .sort((a, b) => a.stripePosition - b.stripePosition);
  const currentIndex = sortedDecks.findIndex((d) => d.id === deckId);
  if (currentIndex === -1) return;

  const neighborIndex =
    direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (neighborIndex < 0 || neighborIndex >= sortedDecks.length) return;

  // Swap positions with the nearest occupied neighbor
  const targetPosition = sortedDecks[neighborIndex].stripePosition;
  const result = moveStripeToPosition(
    state.currentPrism,
    deckId,
    targetPosition,
  );
  state.currentPrism = result.prism;
  savePrism(state.currentPrism);
  renderAll();
}

export function handlePositionChange(deckId, newPosition) {
  const deck = state.currentPrism.decks.find((d) => d.id === deckId);
  if (!deck || deck.stripePosition === newPosition) return;

  const result = moveStripeToPosition(
    state.currentPrism,
    deckId,
    newPosition,
  );
  state.currentPrism = result.prism;
  savePrism(state.currentPrism);
  renderAll();

  if (result.swapped) {
    showSuccess(
      `Swapped ${deck.name} with ${result.swappedWithName}`,
    );
  } else {
    showSuccess(`Moved ${deck.name} to Slot ${newPosition}`);
  }
}

// ============================================================================
// Pool/Core count helpers
// ============================================================================

export function getDeckPoolCoreCounts(deck, processedCards) {
  // Batch-based (#146): a deck participates in every batch containing it, so
  // its pool + core equals its trusted decklist quantity for every card.
  let pool = 0;
  let core = 0;

  for (const card of processedCards) {
    for (const batch of card.batches || []) {
      if (!batch.participantIds.includes(deck.id)) continue;
      if (batch.isPool) pool += batch.copyCount;
      else core += batch.copyCount;
    }
  }

  return { pool, core };
}

// ============================================================================
// Render deck card + deck list
// ============================================================================

// Tooltip + icon button; ids are unique per deck/group so wa-tooltip can bind.
function iconButton(cls, idAttr, id, tip, label, icon) {
  return `
    <wa-button id="tip-${cls}-${id}" appearance="plain" variant="neutral" size="s"
      class="${cls}" ${idAttr}="${id}" aria-label="${label}">
      <wa-icon name="${icon}"></wa-icon>
    </wa-button>
    <wa-tooltip for="tip-${cls}-${id}">${tip}</wa-tooltip>
  `;
}

// A dot variant owns no slot, so its Move moves the whole group (same as the
// Edit form's Change). Everything else moves its own slot.
function getMoveButtonHtml(deck, isInGroup) {
  const group = isInGroup ? state.currentPrism.splitGroups?.find(g => g.id === deck.splitGroupId) : null;
  const name = escapeHtml(deck.name);
  if (isInGroup && group?.splitStyle === 'dots') {
    return iconButton("btn-move-group", "data-group-id", group.id,
      "Move group (dot variants share its slot)", `Move the group that ${name} belongs to`, "up-down-left-right");
  }
  return iconButton("btn-move-deck", "data-deck-id", deck.id,
    "Move to a different slot", `Move ${name} to a different slot`, "up-down-left-right");
}

// wa-dropdown-item (not wa-button): arrow keys and Enter work, and
// clickItemsOnKeyboardSelect turns a keyboard choice into the click that the
// btn-* listeners wait for.
function kebabItem(id, idAttr, cls, icon, label, site, variant) {
  return `
    <wa-dropdown-item class="${cls}" ${idAttr}="${id}"${site ? ` data-site="${site}"` : ""}${variant ? ` variant="${variant}"` : ""}>
      <wa-icon slot="icon" name="${icon}"></wa-icon>${label}
    </wa-dropdown-item>
  `;
}

function kebabTrigger(name) {
  return `
    <wa-button slot="trigger" appearance="plain" variant="neutral" size="s"
      aria-label="More actions for ${name}">
      <wa-icon name="ellipsis-vertical"></wa-icon>
    </wa-button>
  `;
}

// A deck imported by URL copies in its site's format; one with no source gets
// one item per site (#377).
function getDeckActionsKebabHtml(deck, isInGroup) {
  const id = deck.id;
  const item = (cls, icon, label, site, variant) => kebabItem(id, "data-deck-id", cls, icon, label, site, variant);
  return `
    <wa-dropdown class="deck-actions-kebab" placement="bottom-end">
      ${kebabTrigger(escapeHtml(deck.name))}
      ${state.currentPrism.decks.length >= 2 ? item("btn-what-if", "flask", "What if I remove this deck?") : ""}
      ${!isInGroup ? item("btn-split-deck", "code-branch", "Split into variants") : ""}
      ${deckSourceSite(deck.sourceUrl)
        ? item("btn-export-deck", "file-export", "Copy for Moxfield or Archidekt")
        : `${item("btn-export-deck", "file-export", "Copy for Moxfield", "moxfield")}
           ${item("btn-export-deck", "file-export", "Copy for Archidekt", "archidekt")}`}
      <wa-divider></wa-divider>
      ${item("btn-delete-deck", "trash", "Delete deck", null, "danger")}
    </wa-dropdown>
  `;
}

// Commander names, then counts; a deck with no commander has no leading separator
function deckMetaLine(deck, processedCards) {
  const counts = processedCards
    ? (({ pool, core }) => `${pool} pool • ${core} core`)(getDeckPoolCoreCounts(deck, processedCards))
    : `${deck.cards.length} cards`;
  return [commanderNames(deck).join(' / '), counts].filter(Boolean).join(' • ');
}

// One flat list row (#451 follow-up): swatch, name and actions on the first
// line at every width; slot and bracket tags and the meta line under the name.
function deckRowHtml({ color, nameTag, nameClass, name, tags, meta, actions }) {
  return `
      <div class="deck-row">
        <div class="deck-color-indicator" style="background-color: ${color};" title="${getColorName(color)}"></div>
        <${nameTag} class="${nameClass} deck-row-name">${name}</${nameTag}>
        ${actions ? `<div class="wa-cluster wa-gap-2xs deck-row-actions">${actions}</div>` : ""}
        <div class="deck-row-meta">
          <div class="wa-cluster wa-gap-xs">${tags}</div>
          <div class="wa-caption-m deck-row-sub">${meta}</div>
        </div>
      </div>`;
}

export function renderDeckCard(deck, showActions = true, processedCards = null) {
  const isInGroup = !!deck.splitGroupId;
  const isDot = isDotVariant(deck, state.currentPrism);
  const slotTagHtml = isDot
    ? `<wa-tag size="s" variant="brand">Dot variant</wa-tag>`
    : `<wa-tag size="s" variant="${isInGroup ? "brand" : "neutral"}">${formatSlotLabel(deck.stripePosition)}</wa-tag>`;

  return `
    <div class="deck-card-inner ${isInGroup ? "split-child-card" : ""}" data-deck-id="${deck.id}">
      ${deckRowHtml({
        color: deck.color,
        nameTag: isInGroup ? "h4" : "h3",
        nameClass: isInGroup ? "wa-heading-s" : "wa-heading-m",
        name: escapeHtml(deck.name),
        // A Constructed deck (no commander, #29) has no bracket to show
        tags: `${slotTagHtml}${deck.cards.some((c) => c.isCommander) ? `<wa-tag size="s" variant="neutral">Bracket ${deck.bracket}</wa-tag>` : ""}`,
        meta: escapeHtml(deckMetaLine(deck, processedCards)),
        actions: showActions
          ? `${iconButton("btn-edit-deck", "data-deck-id", deck.id, "Edit deck", `Edit ${escapeHtml(deck.name)}`, "pen-to-square")}
          ${getMoveButtonHtml(deck, isInGroup)}
          ${getDeckActionsKebabHtml(deck, isInGroup)}`
          : "",
      })}
      <div class="what-if-container" id="what-if-${deck.id}" style="display: none;"></div>
    </div>
  `;
}

export function renderDecksList() {
  if (!state.elements.decksList) return;

  const sortedDecks = [...state.currentPrism.decks].sort(
    (a, b) => a.stripePosition - b.stripePosition,
  );
  const splitGroups = state.currentPrism.splitGroups || [];
  const processed = sortedDecks.length > 0 ? processCards(state.currentPrism) : [];

  // The inline deck form under the list is the empty state (#450)
  state.elements.decksList.hidden = sortedDecks.length === 0;
  if (sortedDecks.length === 0) {
    state.elements.decksList.innerHTML = "";
    return;
  }

  const renderedGroupIds = new Set();
  const renderItems = [];

  for (const deck of sortedDecks) {
    if (!deck.splitGroupId) {
      renderItems.push({
        type: "standalone",
        deck,
        sortPosition: deck.stripePosition,
      });
    } else if (!renderedGroupIds.has(deck.splitGroupId)) {
      renderedGroupIds.add(deck.splitGroupId);
      const group = splitGroups.find((g) => g.id === deck.splitGroupId);
      if (group)
        renderItems.push({
          type: "group",
          group,
          sortPosition: group.sideAPosition,
        });
    }
  }

  renderItems.sort((a, b) => a.sortPosition - b.sortPosition);

  const htmlParts = renderItems.map((item) => {
    if (item.type === "standalone") {
      return `<div class="deck-card" data-deck-id="${item.deck.id}">${renderDeckCard(item.deck, true, processed)}</div>`;
    }
    const group = item.group;
    const children = group.childDeckIds
      .map((id) => state.currentPrism.decks.find((d) => d.id === id))
      .filter(Boolean);

    return `
      <div class="deck-card split-group-card" data-group-id="${group.id}">
        <div class="split-group-header">
          ${deckRowHtml({
            color: group.sideAColor,
            nameTag: "h3",
            nameClass: "wa-heading-m",
            name: escapeHtml(group.name),
            tags: `<wa-tag size="s" variant="neutral">${formatSlotLabel(group.sideAPosition, "a")}</wa-tag>
                  <wa-tag size="s" variant="brand" appearance="outlined">
                    <wa-icon name="code-branch" style="font-size: 0.8em;"></wa-icon>
                    ${children.length} variants
                  </wa-tag>
                  <wa-tag size="s" variant="${(group.splitStyle || 'stripes') === 'dots' ? 'success' : 'neutral'}" appearance="outlined">
                    <wa-icon name="${(group.splitStyle || 'stripes') === 'dots' ? 'ellipsis' : 'grip-lines'}" style="font-size: 0.8em;"></wa-icon>
                    ${(group.splitStyle || 'stripes') === 'dots' ? 'Dots' : 'Stripes'}
                  </wa-tag>`,
            meta: escapeHtml([children[0] ? commanderNames(children[0]).join(' / ') : "", "Split deck group"].filter(Boolean).join(' • ')),
            actions: `${iconButton("btn-edit-group", "data-group-id", group.id, "Edit group name and color", `Edit ${escapeHtml(group.name)} name and color`, "pen-to-square")}
              ${iconButton("btn-move-group", "data-group-id", group.id, "Move group to a different slot", `Move ${escapeHtml(group.name)} to a different slot`, "up-down-left-right")}
              <wa-dropdown class="deck-actions-kebab" placement="bottom-end">
                ${kebabTrigger(escapeHtml(group.name))}
                ${(group.splitStyle || 'stripes') === 'dots' && group.childDeckIds.length >= 2 ? "" : kebabItem(group.id, "data-group-id", "btn-add-split", "plus", "Add another variant")}
                ${kebabItem(group.id, "data-group-id", "btn-unsplit", "code-merge", "Merge back into one deck")}
              </wa-dropdown>`,
          })}
        </div>
        <div class="split-children">
          ${children.map((child) => renderDeckCard(child, true, processed)).join("")}
        </div>
      </div>
    `;
  });

  state.elements.decksList.innerHTML = htmlParts.join("");

  // Add event listeners
  state.elements.decksList.querySelectorAll(".btn-move-deck").forEach((btn) => {
    btn.addEventListener("click", () => openStripeReorderDialog(btn.dataset.deckId));
  });
  state.elements.decksList.querySelectorAll(".btn-move-group").forEach((btn) => {
    btn.addEventListener("click", () => openGroupReorderDialog(btn.dataset.groupId));
  });
  state.elements.decksList.querySelectorAll(".btn-edit-group").forEach((btn) => {
    btn.addEventListener("click", () => handleEditGroupClick(btn.dataset.groupId));
  });
  state.elements.decksList.querySelectorAll(".btn-export-deck").forEach((btn) => {
    btn.addEventListener("click", () => {
      const deck = state.currentPrism.decks.find((d) => d.id === btn.dataset.deckId);
      if (deck) openDeckExportDialog(deck, btn.dataset.site);
    });
  });
  state.elements.decksList.querySelectorAll(".btn-edit-deck").forEach((btn) => {
    btn.addEventListener("click", () => handleEditClick(btn.dataset.deckId));
  });
  state.elements.decksList
    .querySelectorAll(".btn-delete-deck")
    .forEach((btn) => {
      btn.addEventListener("click", () =>
        handleDeleteClick(btn.dataset.deckId),
      );
    });
  state.elements.decksList.querySelectorAll(".btn-what-if").forEach((btn) => {
    btn.addEventListener("click", () =>
      toggleWhatIfAnalysis(btn.dataset.deckId),
    );
  });
  state.elements.decksList
    .querySelectorAll(".btn-split-deck")
    .forEach((btn) => {
      btn.addEventListener("click", () => handleSplitClick(btn.dataset.deckId));
    });
  state.elements.decksList.querySelectorAll(".btn-add-split").forEach((btn) => {
    btn.addEventListener("click", () => handleAddSplit(btn.dataset.groupId));
  });
  state.elements.decksList.querySelectorAll(".btn-unsplit").forEach((btn) => {
    btn.addEventListener("click", () => handleUnsplit(btn.dataset.groupId));
  });
  state.elements.decksList.querySelectorAll(".deck-actions-kebab").forEach(clickItemsOnKeyboardSelect);
}
