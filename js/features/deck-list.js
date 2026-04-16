/**
 * Deck list rendering, edit/delete/split handlers, removed cards, mark toggle.
 */

import { state } from "../core/state.js";
import { showError, showSuccess } from "../core/notifications.js";
import { escapeHtml } from "../core/utils.js";
import { parseDecklist, validateDecklist } from "../modules/parser.js";
import {
  processCards,
  removeDeckFromPrism,
  reorderStripes,
  moveStripeToPosition,
  getColorName,
  calculateRemovedCards,
  isCardInOtherDecks,
  splitDeck,
  addSplitToGroup,
  unsplitGroup,
  removeSplitChild,
  formatSlotLabel,
  createPrism,
  isDotVariant,
} from "../modules/processor.js";
import { savePrism, setCurrentPrism } from "../modules/storage.js";
import { canonicalizeCards } from "../modules/scryfall.js";
import { hideEditImportMessages } from "./deck-import.js";
import { initColorSwatches, resetDeckForm } from "./deck-form.js";
import { renderAll } from "./init.js";
import { openStripeReorderDialog, openGroupReorderDialog, isStripeVariantDeck, isDotVariantChild } from "./stripe-reorder-dialog.js";
import { toggleWhatIfAnalysis } from "./analysis.js";
import { renderResults, updateRemovedFilterBadge } from "./results.js";

// ============================================================================
// Stripe count helpers (for marked cards regression fix)
// ============================================================================

export function getStripeCountMap() {
  if (!state.currentPrism || !state.currentPrism.decks.length) return new Map();
  const processed = processCards(state.currentPrism);
  const map = new Map();
  for (const card of processed) {
    map.set(card.name, card.stripes.length);
  }
  return map;
}

export function unmarkCardsWithNewStripes(beforeCounts) {
  if (!state.currentPrism?.markedCards?.length) return 0;

  const afterCounts = getStripeCountMap();
  let unmarkedCount = 0;

  state.currentPrism.markedCards = state.currentPrism.markedCards.filter(
    (cardKey) => {
      const cardName = cardKey.includes("|") ? cardKey.split("|")[0] : cardKey;
      const before = beforeCounts.get(cardName) || 0;
      const after = afterCounts.get(cardName) || 0;

      if (after > before) {
        unmarkedCount++;
        return false;
      }
      return true;
    },
  );

  return unmarkedCount;
}

export function unmarkSharedCards(newCardNames) {
  if (!state.currentPrism?.markedCards?.length) return 0;

  const processed = processCards(state.currentPrism);
  const cardMap = new Map(processed.map((c) => [c.name.toLowerCase(), c]));

  let unmarkedCount = 0;

  state.currentPrism.markedCards = state.currentPrism.markedCards.filter(
    (cardKey) => {
      const cardName = (
        cardKey.includes("|") ? cardKey.split("|")[0] : cardKey
      ).toLowerCase();

      if (newCardNames.has(cardName)) {
        const card = cardMap.get(cardName);
        if (card && card.stripes.length > 1) {
          unmarkedCount++;
          return false;
        }
      }
      return true;
    },
  );

  return unmarkedCount;
}

export function autoClearRemovedCards(newCards) {
  if (!state.currentPrism?.removedCards?.length || !newCards?.length) return 0;

  const newCardNames = new Set(
    newCards.map((c) => c.name.toLowerCase().trim()),
  );

  const before = state.currentPrism.removedCards.length;
  state.currentPrism.removedCards = state.currentPrism.removedCards.filter(
    (rc) => !newCardNames.has(rc.cardName.toLowerCase().trim()),
  );

  return before - state.currentPrism.removedCards.length;
}

// ============================================================================
// Mark toggle
// ============================================================================

export function handleMarkToggle(event) {
  const checkbox = event.currentTarget;
  const row = checkbox.closest("tr");
  const cardKey = row?.dataset?.cardKey;

  if (!cardKey || !state.currentPrism) {
    console.warn("Mark toggle failed:", {
      cardKey,
      hasPrism: !!state.currentPrism,
    });
    return;
  }

  if (!state.currentPrism.markedCards) state.currentPrism.markedCards = [];

  const isChecked = checkbox.checked;

  if (isChecked) {
    if (!state.currentPrism.markedCards.includes(cardKey)) {
      state.currentPrism.markedCards.push(cardKey);
    }
    row.classList.add("marked-row");
  } else {
    state.currentPrism.markedCards = state.currentPrism.markedCards.filter(
      (c) => c !== cardKey,
    );
    row.classList.remove("marked-row");
  }

  state.currentPrism.updatedAt = new Date().toISOString();
  savePrism(state.currentPrism);

  console.log(
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
  renderResults();
  showSuccess(`Cleared "${cardName}" from removed list.`);
}

export function handleClearAllRemoved() {
  if (!state.currentPrism || !state.currentPrism.removedCards?.length) return;

  const count = state.currentPrism.removedCards.length;
  state.currentPrism.removedCards = [];
  state.currentPrism.updatedAt = new Date().toISOString();
  savePrism(state.currentPrism);

  updateRemovedFilterBadge();
  renderResults();
  showSuccess(`Cleared all ${count} card(s) from removed list.`);
}

// ============================================================================
// Edit / Delete / Split handlers
// ============================================================================

export function handleDeleteClick(deckId) {
  const deck = state.currentPrism.decks.find((d) => d.id === deckId);
  if (!deck) return;

  state.deckToDelete = deckId;
  state.elements.deleteDeckName.textContent = deck.name;
  state.elements.deleteDialog.open = true;
}

export function handleEditClick(deckId) {
  const deck = state.currentPrism.decks.find((d) => d.id === deckId);
  if (!deck) return;

  state.deckToEdit = deckId;

  if (state.elements.editDeckId) state.elements.editDeckId.value = deck.id;
  if (state.elements.editDeckName)
    state.elements.editDeckName.value = deck.name;
  if (state.elements.editDeckCommander)
    state.elements.editDeckCommander.value = deck.commander;
  if (state.elements.editDeckBracket)
    state.elements.editDeckBracket.value = String(deck.bracket);
  if (state.elements.editDeckColor)
    state.elements.editDeckColor.value = deck.color;

  if (state.elements.editDeckList) {
    const decklistText = deck.cards
      .map((card) => `${card.quantity} ${card.name}`)
      .join("\n");
    state.elements.editDeckList.value = decklistText;
  }

  if (state.elements.editParseErrors) {
    state.elements.editParseErrors.style.display = "none";
    state.elements.editParseErrors.innerHTML = "";
  }

  hideEditImportMessages();
  if (state.elements.editImportUrl) state.elements.editImportUrl.value = "";
  if (state.elements.editImportSection)
    state.elements.editImportSection.open = false;

  state.elements.editDialog.open = true;
}

export async function handleEditConfirm() {
  if (!state.deckToEdit) return;

  const deck = state.currentPrism.decks.find((d) => d.id === state.deckToEdit);
  if (!deck) return;

  const beforeCounts = getStripeCountMap();
  const oldCards = [...deck.cards];

  const name = (state.elements.editDeckName?.value || "").trim();
  const commander = (state.elements.editDeckCommander?.value || "").trim();
  const bracket = state.elements.editDeckBracket?.value || "2";
  const color = state.elements.editDeckColor?.value || deck.color;
  const decklistText = state.elements.editDeckList?.value || "";

  if (!name) {
    showError("Please enter a deck name.");
    return;
  }
  if (!commander) {
    showError("Please enter a commander name.");
    return;
  }
  if (!decklistText.trim()) {
    showError("Please paste a decklist.");
    return;
  }

  const existingDeck = state.currentPrism.decks.find(
    (d) =>
      d.id !== state.deckToEdit && d.name.toLowerCase() === name.toLowerCase(),
  );
  if (existingDeck) {
    showError(`A deck named "${name}" already exists.`);
    return;
  }

  const parseResult = parseDecklist(decklistText, commander);

  try {
    await canonicalizeCards(parseResult.cards);
  } catch (err) {
    console.warn("Card canonicalization failed, using raw names:", err.message);
  }

  const validation = validateDecklist(parseResult);

  if (parseResult.errors.length > 0 && state.elements.editParseErrors) {
    state.elements.editParseErrors.style.display = "";
    state.elements.editParseErrors.innerHTML = `
      <wa-callout variant="warning">
        <strong>Some lines couldn't be parsed:</strong>
        <ul style="margin: 0.5em 0 0 1.5em; padding: 0;">
          ${parseResult.errors
            .slice(0, 5)
            .map(
              (e) => `<li>Line ${e.lineNumber}: ${escapeHtml(e.content)}</li>`,
            )
            .join("")}
          ${parseResult.errors.length > 5 ? `<li>...and ${parseResult.errors.length - 5} more</li>` : ""}
        </ul>
      </wa-callout>
    `;
  }

  if (!validation.isValid) {
    showError(validation.messages.join(" "));
    return;
  }

  const removedFromDeck = calculateRemovedCards(oldCards, parseResult.cards);

  if (!state.currentPrism.removedCards) state.currentPrism.removedCards = [];

  const now = new Date().toISOString();
  let removedCount = 0;

  for (const removedCard of removedFromDeck) {
    if (
      !isCardInOtherDecks(
        state.currentPrism,
        removedCard.name,
        state.deckToEdit,
      )
    ) {
      state.currentPrism.removedCards.push({
        cardName: removedCard.name,
        deckId: deck.id,
        deckName: deck.name,
        deckColor: deck.color,
        stripePosition: deck.stripePosition,
        removedAt: now,
      });
      removedCount++;
    } else {
      const alreadyTracked = state.currentPrism.removedCards.some(
        (rc) =>
          rc.cardName.toLowerCase() === removedCard.name.toLowerCase() &&
          rc.deckId === deck.id,
      );
      if (!alreadyTracked) {
        state.currentPrism.removedCards.push({
          cardName: removedCard.name,
          deckId: deck.id,
          deckName: deck.name,
          deckColor: deck.color,
          stripePosition: deck.stripePosition,
          removedAt: now,
        });
        removedCount++;
      }
    }
  }

  const autoClearedCount = autoClearRemovedCards(parseResult.cards);

  deck.name = name;
  deck.commander = commander;
  deck.bracket = parseInt(bracket, 10);
  deck.color = color;
  deck.cards = parseResult.cards;
  deck.updatedAt = now;

  const unmarkedCount = unmarkCardsWithNewStripes(beforeCounts);

  state.currentPrism.updatedAt = now;
  savePrism(state.currentPrism);
  state.deckToEdit = null;
  state.elements.editDialog.open = false;

  renderAll();

  let message = `Updated "${name}" with ${parseResult.uniqueCards} cards.`;
  if (unmarkedCount > 0)
    message += ` ${unmarkedCount} card${unmarkedCount > 1 ? "s" : ""} unchecked (new stripes added).`;
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

  for (const card of deck.cards) {
    if (
      !isCardInOtherDecks(state.currentPrism, card.name, state.deckToDelete)
    ) {
      state.currentPrism.removedCards.push({
        cardName: card.name,
        deckId: deck.id,
        deckName: deck.name,
        deckColor: deck.color,
        stripePosition: deck.stripePosition,
        removedAt: now,
      });
      removedCount++;
    } else {
      const alreadyTracked = state.currentPrism.removedCards.some(
        (rc) =>
          rc.cardName.toLowerCase() === card.name.toLowerCase() &&
          rc.deckId === deck.id,
      );
      if (!alreadyTracked) {
        state.currentPrism.removedCards.push({
          cardName: card.name,
          deckId: deck.id,
          deckName: deck.name,
          deckColor: deck.color,
          stripePosition: deck.stripePosition,
          removedAt: now,
        });
        removedCount++;
      }
    }
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

  state.deckToDelete = null;
  state.elements.deleteDialog.open = false;

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
  state.elements.splitDialog.open = true;
}

export function handleSplitConfirm() {
  const deckId = state.elements.splitDeckId.value;
  const count = parseInt(state.elements.splitCount.value) || 2;

  if (count < 2 || count > 8) {
    showError("Split count must be between 2 and 8.");
    return;
  }

  const splitStyle = state.elements.splitStyle?.value || 'stripes';
  let updatedPrism;
  try {
    updatedPrism = splitDeck(state.currentPrism, deckId, count, splitStyle);
  } catch (err) {
    showError(err.message);
    return;
  }
  state.currentPrism = updatedPrism;
  savePrism(state.currentPrism);

  state.elements.splitDialog.open = false;
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

export function handleNewPrism() {
  savePrism(state.currentPrism);
  state.currentPrism = createPrism();
  savePrism(state.currentPrism);
  setCurrentPrism(state.currentPrism.id);

  state.elements.newPrismDialog.open = false;

  resetDeckForm();
  initColorSwatches();
  renderAll();
}

export function handleStripeReorder(deckId, direction) {
  const sortedDecks = [...state.currentPrism.decks].sort(
    (a, b) => a.stripePosition - b.stripePosition,
  );
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

function getDeckPoolCoreCounts(deck, processedCards) {
  let pool = 0;
  let core = 0;

  for (const card of processedCards) {
    // Check if this card belongs to this deck
    const inThisDeck = card.stripes.some(s => s.deckId === deck.id);
    if (!inThisDeck) continue;

    // For basic lands, use this deck's actual quantity
    let qty = 1;
    if (card.isBasicLand) {
      const deckCard = deck.cards.find(c => c.name.toLowerCase() === card.name.toLowerCase());
      qty = deckCard?.quantity || 1;
    }

    if (card.logicalDeckCount > 1) {
      pool += qty;
    } else {
      core += qty;
    }
  }

  return { pool, core };
}

// ============================================================================
// Render deck card + deck list
// ============================================================================

function getMoveButtonHtml(deck, isInGroup) {
  const group = isInGroup ? state.currentPrism.splitGroups?.find(g => g.id === deck.splitGroupId) : null;
  const splitStyle = group?.splitStyle || 'stripes';

  // Dot variants have no slot of their own — mark lives on the parent group's slot.
  if (isInGroup && splitStyle === 'dots') {
    const parentName = group?.name || 'parent deck';
    return `
      <wa-button appearance="plain" variant="neutral" size="small" disabled
        title="Dot variants don't own a slot. Move &quot;${parentName}&quot; instead.">
        <wa-icon name="up-down-left-right"></wa-icon>
      </wa-button>
    `;
  }

  // Standalone decks AND stripes-style variants: fully moveable.
  return `
    <wa-button appearance="plain" variant="neutral" size="small"
      class="btn-move-deck" data-deck-id="${deck.id}" title="Move to a different slot">
      <wa-icon name="up-down-left-right"></wa-icon>
    </wa-button>
  `;
}

export function renderDeckCard(deck, showActions = true, processedCards = null) {
  const isInGroup = !!deck.splitGroupId;
  const isDot = isDotVariant(deck, state.currentPrism);
  const slotTagHtml = isDot
    ? `<wa-tag size="small" variant="brand">Dot variant</wa-tag>`
    : `<wa-tag size="small" variant="${isInGroup ? "brand" : "neutral"}">${formatSlotLabel(deck.stripePosition)}</wa-tag>`;

  return `
    <div class="deck-card-inner ${isInGroup ? "split-child-card" : ""}" data-deck-id="${deck.id}">
      <div class="wa-split wa-align-items-center">
        <div class="wa-cluster wa-gap-m wa-align-items-center">
          <div class="deck-color-indicator" style="background-color: ${deck.color};" title="${getColorName(deck.color)}"></div>
          <div class="wa-stack wa-gap-2xs">
            <div class="wa-cluster wa-gap-s wa-align-items-center">
              <span class="${isInGroup ? "wa-heading-s" : "wa-heading-m"}">${escapeHtml(deck.name)}</span>
              ${slotTagHtml}
              <wa-tag size="small" variant="neutral">Bracket ${deck.bracket}</wa-tag>
            </div>
            <div class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">
              ${escapeHtml(deck.commander)}${processedCards ? (() => { const { pool, core } = getDeckPoolCoreCounts(deck, processedCards); return ` • ${pool} pool • ${core} core`; })() : ` • ${deck.cards.length} cards`}
            </div>
          </div>
        </div>
        ${
          showActions
            ? `
        <div class="wa-cluster wa-gap-xs">
          ${
            state.currentPrism.decks.length >= 2
              ? `
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-what-if" data-deck-id="${deck.id}" title="What if I remove this deck?">
            <wa-icon name="flask"></wa-icon>
          </wa-button>
          `
              : ""
          }
          ${getMoveButtonHtml(deck, isInGroup)}
          ${
            !isInGroup
              ? `
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-split-deck" data-deck-id="${deck.id}" title="Split into variants">
            <wa-icon name="code-branch"></wa-icon>
          </wa-button>
          `
              : ""
          }
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-edit-deck" data-deck-id="${deck.id}" title="Edit deck">
            <wa-icon name="pen-to-square"></wa-icon>
          </wa-button>
          <wa-button appearance="plain" variant="neutral" size="small"
            class="btn-delete-deck" data-deck-id="${deck.id}" title="Delete deck">
            <wa-icon name="trash"></wa-icon>
          </wa-button>
        </div>
        `
            : ""
        }
      </div>
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

  if (sortedDecks.length === 0) {
    state.elements.decksList.innerHTML = `
      <div class="wa-stack wa-gap-m wa-align-items-center" style="padding: var(--wa-space-xl); text-align: center;">
        <wa-icon name="layer-group" style="font-size: 2.5rem; color: var(--wa-color-neutral-text-subtle);"></wa-icon>
        <p style="color: var(--wa-color-neutral-text-subtle);">No decks added yet. Add your first deck below!</p>
      </div>
    `;
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
      return `<wa-card class="deck-card" data-deck-id="${item.deck.id}">${renderDeckCard(item.deck, true, processed)}</wa-card>`;
    }
    const group = item.group;
    const children = group.childDeckIds
      .map((id) => state.currentPrism.decks.find((d) => d.id === id))
      .filter(Boolean);

    return `
      <wa-card class="deck-card split-group-card" data-group-id="${group.id}">
        <div class="split-group-header">
          <div class="wa-split wa-align-items-center">
            <div class="wa-cluster wa-gap-m wa-align-items-center">
              <div class="deck-color-indicator" style="background-color: ${group.sideAColor};" title="${getColorName(group.sideAColor)}"></div>
              <div class="wa-stack wa-gap-2xs">
                <div class="wa-cluster wa-gap-s wa-align-items-center">
                  <span class="wa-heading-m">${escapeHtml(group.name)}</span>
                  <wa-tag size="small" variant="neutral">${formatSlotLabel(group.sideAPosition, "a")}</wa-tag>
                  <wa-tag size="small" variant="brand" appearance="outlined">
                    <wa-icon name="code-branch" style="font-size: 0.8em;"></wa-icon>
                    ${children.length} variants
                  </wa-tag>
                  <wa-tag size="small" variant="${(group.splitStyle || 'stripes') === 'dots' ? 'success' : 'neutral'}" appearance="outlined">
                    <wa-icon name="${(group.splitStyle || 'stripes') === 'dots' ? 'circles-three' : 'lines-horizontal'}" style="font-size: 0.8em;"></wa-icon>
                    ${(group.splitStyle || 'stripes') === 'dots' ? 'Dots' : 'Stripes'}
                  </wa-tag>
                </div>
                <div class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle);">
                  ${escapeHtml(children[0]?.commander || "")} • Split deck group
                </div>
              </div>
            </div>
            <div class="wa-cluster wa-gap-xs">
              <wa-button appearance="plain" variant="neutral" size="small"
                class="btn-move-group" data-group-id="${group.id}" title="Move group to a different slot">
                <wa-icon name="up-down-left-right"></wa-icon>
              </wa-button>
              <wa-button appearance="plain" variant="neutral" size="small"
                class="btn-add-split" data-group-id="${group.id}" title="Add another variant">
                <wa-icon name="plus"></wa-icon>
              </wa-button>
              <wa-button appearance="plain" variant="neutral" size="small"
                class="btn-unsplit" data-group-id="${group.id}" title="Merge back into one deck">
                <wa-icon name="code-merge"></wa-icon>
              </wa-button>
            </div>
          </div>
        </div>
        <div class="split-children">
          ${children.map((child) => renderDeckCard(child, true, processed)).join("")}
        </div>
      </wa-card>
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
}
