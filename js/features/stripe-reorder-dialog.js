/**
 * Stripe Reorder Dialog — visual card-sleeve slot picker.
 * Opens a wa-dialog with a card outline showing 24 slots per edge.
 * Users click a slot to move the active deck there; occupied slots prompt swap confirmation.
 */

import { state } from '../core/state.js';
import { getPreferences, savePrism } from '../modules/storage.js';
import { moveStripeToPosition, formatSlotLabel } from '../modules/processor.js';
import { renderAll } from './init.js';
import { showSuccess } from '../core/notifications.js';
import { escapeHtml } from '../core/utils.js';

// Module-level state for the currently open dialog session
let activeDeckId = null;
let pendingTargetPosition = null;

// ============================================================================
// Corner config (mirrors card-preview.js — kept local to avoid circular import)
// ============================================================================

function getCornerConfig() {
  const prefs = getPreferences();
  const corner = prefs.stripeStartCorner || 'top-right';
  return {
    sideARight: corner.includes('right'),
    topDown: corner.includes('top'),
  };
}

// ============================================================================
// Slot map: position → occupant info
// ============================================================================

function buildSlotMap(prism) {
  const map = new Map();

  // Split group Side A positions — stripe-style groups are disabled
  for (const group of (prism.splitGroups || [])) {
    const isStripe = (group.splitStyle || 'stripes') === 'stripes';
    map.set(group.sideAPosition, {
      name: group.name,
      color: group.sideAColor,
      deckId: null,
      groupId: group.id,
      disabled: isStripe,
    });
  }

  for (const deck of prism.decks) {
    if (!deck.splitGroupId) {
      // Standalone deck — always clickable
      map.set(deck.stripePosition, {
        name: deck.name,
        color: deck.color,
        deckId: deck.id,
        groupId: null,
        disabled: false,
      });
    } else {
      // Stripe-variant child — occupies a Side B position, always disabled
      const group = prism.splitGroups?.find(g => g.id === deck.splitGroupId);
      if (group && (group.splitStyle || 'stripes') === 'stripes') {
        map.set(deck.stripePosition, {
          name: deck.name,
          color: deck.color,
          deckId: deck.id,
          groupId: deck.splitGroupId,
          disabled: true,
        });
      }
      // Dot-variant children don't occupy a visible slot — they follow the group
    }
  }

  return map;
}

// ============================================================================
// Edge position ordering (top-to-bottom display order)
// ============================================================================

function getEdgePositions(sideARight, topDown) {
  const sideA = topDown
    ? Array.from({ length: 24 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => 24 - i);
  const sideB = topDown
    ? Array.from({ length: 24 }, (_, i) => i + 25)
    : Array.from({ length: 24 }, (_, i) => 48 - i);

  return sideARight
    ? { leftPositions: sideB, rightPositions: sideA }
    : { leftPositions: sideA, rightPositions: sideB };
}

// ============================================================================
// Single slot element
// ============================================================================

function renderSlot(position, activeDeck, slotMap) {
  const info = slotMap.get(position);
  const isActive = activeDeck.stripePosition === position;
  const isDisabled = info?.disabled ?? false;

  const slot = document.createElement('div');
  slot.dataset.position = String(position);
  slot.title = info
    ? `${info.name} — ${formatSlotLabel(position)}`
    : `Empty — ${formatSlotLabel(position)}`;

  const classes = ['stripe-reorder-slot'];
  if (isDisabled) {
    classes.push('stripe-reorder-slot--disabled');
  } else if (isActive) {
    classes.push('stripe-reorder-slot--active');
  } else if (info) {
    classes.push('stripe-reorder-slot--occupied');
  } else {
    classes.push('stripe-reorder-slot--empty');
  }
  slot.className = classes.join(' ');

  if (info?.color) {
    slot.style.backgroundColor = info.color;
    if (!isActive) {
      slot.style.borderColor = 'rgba(0,0,0,0.2)';
    }
  }

  if (!isDisabled && !isActive) {
    slot.addEventListener('click', () => handleSlotClick(position, activeDeck, slotMap));
  }

  return slot;
}

// ============================================================================
// Slot click handler
// ============================================================================

function handleSlotClick(position, activeDeck, slotMap) {
  const info = slotMap.get(position);

  if (!info) {
    // Empty slot — move immediately and close
    executeMove(activeDeck.id, position);
    state.elements.stripeReorderDialog.open = false;
  } else {
    // Occupied non-disabled slot — show inline swap confirmation
    pendingTargetPosition = position;
    showSwapConfirmation(activeDeck, info, position);
  }
}

// ============================================================================
// Inline swap confirmation bar
// ============================================================================

function showSwapConfirmation(activeDeck, targetInfo, targetPosition) {
  const content = document.getElementById('stripe-reorder-content');
  if (!content) return;

  // Remove any previous confirmation
  content.querySelector('.stripe-reorder-swap-confirm')?.remove();

  const bar = document.createElement('div');
  bar.className = 'stripe-reorder-swap-confirm';
  bar.innerHTML = `
    <div class="wa-cluster wa-gap-s wa-align-items-center" style="flex-wrap: wrap;">
      <span class="wa-body-s">
        <strong>${escapeHtml(formatSlotLabel(targetPosition))}</strong> is used by
        <strong>${escapeHtml(targetInfo.name)}</strong>. Swap positions?
      </span>
      <div class="wa-cluster wa-gap-xs">
        <wa-button size="small" variant="neutral" appearance="outlined" class="btn-swap-cancel">Cancel</wa-button>
        <wa-button size="small" variant="brand" class="btn-swap-confirm">Swap</wa-button>
      </div>
    </div>
  `;

  bar.querySelector('.btn-swap-cancel').addEventListener('click', () => {
    bar.remove();
    pendingTargetPosition = null;
  });

  bar.querySelector('.btn-swap-confirm').addEventListener('click', () => {
    if (pendingTargetPosition !== null) {
      executeMove(activeDeck.id, pendingTargetPosition);
      state.elements.stripeReorderDialog.open = false;
      pendingTargetPosition = null;
    }
  });

  content.appendChild(bar);
}

// ============================================================================
// Execute the move / swap
// ============================================================================

function executeMove(deckId, targetPosition) {
  const result = moveStripeToPosition(state.currentPrism, deckId, targetPosition);
  state.currentPrism = result.prism;
  savePrism(state.currentPrism);
  renderAll();

  const deck = result.prism.decks.find(d => d.id === deckId);
  const deckName = deck?.name || 'Deck';
  if (result.swapped) {
    showSuccess(`Swapped "${deckName}" with "${result.swappedWithName}"`);
  } else {
    showSuccess(`Moved "${deckName}" to ${formatSlotLabel(targetPosition)}`);
  }
}

// ============================================================================
// Sleeve visualization
// ============================================================================

function renderSleeveVisualization(activeDeck, slotMap) {
  const { sideARight, topDown } = getCornerConfig();
  const { leftPositions, rightPositions } = getEdgePositions(sideARight, topDown);

  // Outer wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'stripe-reorder-sleeve-wrapper';

  // Sleeve card
  const sleeve = document.createElement('div');
  sleeve.className = 'stripe-reorder-sleeve';

  // Left edge
  const leftEdge = document.createElement('div');
  leftEdge.className = 'stripe-reorder-edge';
  for (const pos of leftPositions) {
    leftEdge.appendChild(renderSlot(pos, activeDeck, slotMap));
  }

  // Card body
  const cardBody = document.createElement('div');
  cardBody.className = 'stripe-reorder-card-body';
  cardBody.innerHTML = `
    <div class="stripe-reorder-card-hint">
      <wa-icon name="hand-pointer" style="font-size: 1.5rem; display: block; margin-bottom: var(--wa-space-2xs);"></wa-icon>
      <span>Click a slot</span>
    </div>
  `;

  // Right edge
  const rightEdge = document.createElement('div');
  rightEdge.className = 'stripe-reorder-edge';
  for (const pos of rightPositions) {
    rightEdge.appendChild(renderSlot(pos, activeDeck, slotMap));
  }

  sleeve.appendChild(leftEdge);
  sleeve.appendChild(cardBody);
  sleeve.appendChild(rightEdge);
  wrapper.appendChild(sleeve);

  // Edge labels
  const leftLabel = sideARight ? 'Side B (25–48)' : 'Side A (1–24)';
  const rightLabel = sideARight ? 'Side A (1–24)' : 'Side B (25–48)';
  const labels = document.createElement('div');
  labels.className = 'stripe-reorder-edge-labels';
  labels.innerHTML = `
    <span class="wa-caption-xs">${leftLabel}</span>
    <span class="wa-caption-xs">${rightLabel}</span>
  `;
  wrapper.appendChild(labels);

  return wrapper;
}

// ============================================================================
// Legend (occupied slots only)
// ============================================================================

function renderLegend(slotMap, activeDeckId) {
  const occupied = [...slotMap.entries()].sort((a, b) => a[0] - b[0]);
  if (occupied.length === 0) return null;

  const activeDeck = state.currentPrism.decks.find(d => d.id === activeDeckId);

  const legend = document.createElement('div');
  legend.className = 'stripe-reorder-legend';

  const items = occupied.map(([pos, info]) => {
    const isActive = activeDeck?.stripePosition === pos;
    const disabledNote = info.disabled ? ' <span style="opacity:0.6;">(locked)</span>' : '';
    const activeNote = isActive ? ' <span style="color: var(--wa-color-success-text);">(moving)</span>' : '';
    return `
      <div class="wa-cluster wa-gap-xs wa-align-items-center">
        <div class="deck-color-indicator small" style="background-color: ${info.color}; opacity: ${info.disabled ? '0.5' : '1'};"></div>
        <span class="wa-caption-s">${escapeHtml(formatSlotLabel(pos))}: ${escapeHtml(info.name)}${activeNote}${disabledNote}</span>
      </div>
    `;
  });

  legend.innerHTML = `
    <p class="wa-caption-xs" style="color: var(--wa-color-neutral-text-subtle); margin-bottom: var(--wa-space-2xs);">OCCUPIED SLOTS</p>
    <div class="wa-cluster wa-gap-s" style="flex-wrap: wrap;">${items.join('')}</div>
  `;

  return legend;
}

// ============================================================================
// Public helpers used by deck-list.js
// ============================================================================

export function isStripeVariantDeck(prism, deckId) {
  const deck = prism.decks.find(d => d.id === deckId);
  if (!deck?.splitGroupId) return false;
  const group = prism.splitGroups?.find(g => g.id === deck.splitGroupId);
  return !!(group && (group.splitStyle || 'stripes') === 'stripes');
}

export function isDotVariantChild(prism, deckId) {
  const deck = prism.decks.find(d => d.id === deckId);
  if (!deck?.splitGroupId) return false;
  const group = prism.splitGroups?.find(g => g.id === deck.splitGroupId);
  return !!(group && group.splitStyle === 'dots');
}

// ============================================================================
// Main entry point
// ============================================================================

export function openStripeReorderDialog(deckId) {
  const prism = state.currentPrism;
  const deck = prism.decks.find(d => d.id === deckId);
  if (!deck) return;

  activeDeckId = deckId;
  pendingTargetPosition = null;

  const dialog = state.elements.stripeReorderDialog;
  if (!dialog) return;

  dialog.setAttribute('label', `Move "${deck.name}"`);

  const content = document.getElementById('stripe-reorder-content');
  if (!content) return;
  content.innerHTML = '';

  const slotMap = buildSlotMap(prism);

  content.appendChild(renderSleeveVisualization(deck, slotMap));

  const legend = renderLegend(slotMap, deckId);
  if (legend) content.appendChild(legend);

  dialog.open = true;
}

// ============================================================================
// Cancel button setup (called once from init.js after elements are cached)
// ============================================================================

export function setupStripeReorderDialog() {
  const cancelBtn = document.getElementById('stripe-reorder-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      pendingTargetPosition = null;
      if (state.elements.stripeReorderDialog) {
        state.elements.stripeReorderDialog.open = false;
      }
    });
  }
}
