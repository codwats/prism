/**
 * Stripe Reorder Dialog — visual card-sleeve slot picker.
 * Opens a wa-dialog with a card outline showing 24 slots per edge.
 * Users click a slot to move the active deck there; occupied slots prompt swap confirmation.
 */

import { state } from '../core/state.js';
import { getPreferences, savePrism } from '../modules/storage.js';
import { moveStripeToPosition, moveGroupToPosition, formatSlotLabel } from '../modules/processor.js';
import { renderAll } from './init.js';
import { showSuccess } from '../core/notifications.js';
import { escapeHtml } from '../core/utils.js';

// Module-level state for the currently open dialog session
let activeDeckId = null;
let activeGroupId = null;
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

  // Split group Side A positions — moveable (the group owns this slot)
  for (const group of (prism.splitGroups || [])) {
    map.set(group.sideAPosition, {
      name: group.name,
      color: group.sideAColor,
      deckId: null,
      groupId: group.id,
      disabled: false,
    });
  }

  for (const deck of prism.decks) {
    if (!deck.splitGroupId) {
      map.set(deck.stripePosition, {
        name: deck.name,
        color: deck.color,
        deckId: deck.id,
        groupId: null,
        disabled: false,
      });
    } else {
      // Stripes-style variants own their own slot; fully moveable.
      // Dot-style variants don't occupy a slot — they render at the group's sideAPosition.
      const group = prism.splitGroups?.find(g => g.id === deck.splitGroupId);
      if (group && (group.splitStyle || 'stripes') === 'stripes' && typeof deck.stripePosition === 'number') {
        map.set(deck.stripePosition, {
          name: deck.name,
          color: deck.color,
          deckId: deck.id,
          groupId: deck.splitGroupId,
          disabled: false,
        });
      }
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
    ? `${info.name}, ${formatSlotLabel(position)}`
    : `Empty, ${formatSlotLabel(position)}`;

  // A title attribute is invisible to touch and unreliable for screen readers,
  // and 48 bare divs are unreachable by keyboard. The picker is a single-choice
  // widget, so model it as a radiogroup with a roving tabindex (see
  // wireSlotKeyboard) rather than 48 tab stops.
  const slotLabel = formatSlotLabel(position);
  slot.setAttribute('role', 'radio');
  slot.setAttribute('aria-checked', isActive ? 'true' : 'false');
  slot.tabIndex = -1;
  if (isDisabled) {
    slot.setAttribute('aria-disabled', 'true');
    slot.setAttribute('aria-label', `${slotLabel}, unavailable`);
  } else if (isActive) {
    slot.setAttribute('aria-label', `${slotLabel}, current slot of ${activeDeck.name}`);
  } else if (info) {
    slot.setAttribute('aria-label', `${slotLabel}, taken by ${info.name}, activate to swap`);
  } else {
    slot.setAttribute('aria-label', `${slotLabel}, empty, activate to move here`);
  }

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
// Keyboard navigation across the two sleeve edges
// ============================================================================

/**
 * Give the 48 slots one tab stop and arrow-key movement.
 *
 * Up/Down walk the current edge, Left/Right cross to the other edge at the same
 * depth, Home/End jump to the ends of the edge, Enter/Space activate. Disabled
 * slots are skipped rather than focused, so a keyboard user never lands on a
 * dead target.
 */
function wireSlotKeyboard(sleeve) {
  const edges = [...sleeve.querySelectorAll('.stripe-reorder-edge')];
  if (edges.length === 0) return;

  const slotsOf = (edge) => [...edge.querySelectorAll('.stripe-reorder-slot')];
  const isFocusable = (el) => el.getAttribute('aria-disabled') !== 'true';
  const allSlots = edges.flatMap(slotsOf);

  // Roving tabindex: the checked slot owns the tab stop, else the first
  // focusable one, so Tab reaches the picker in a single press.
  const initial =
    allSlots.find((s) => s.getAttribute('aria-checked') === 'true') ||
    allSlots.find(isFocusable);
  if (initial) initial.tabIndex = 0;

  const focus = (el) => {
    if (!el) return;
    for (const s of allSlots) s.tabIndex = -1;
    el.tabIndex = 0;
    el.focus();
  };

  const step = (edgeSlots, from, dir) => {
    for (let i = from + dir; i >= 0 && i < edgeSlots.length; i += dir) {
      if (isFocusable(edgeSlots[i])) return edgeSlots[i];
    }
    return null;
  };

  sleeve.addEventListener('keydown', (e) => {
    const slot = e.target.closest?.('.stripe-reorder-slot');
    if (!slot || !sleeve.contains(slot)) return;

    const edge = slot.closest('.stripe-reorder-edge');
    const edgeIndex = edges.indexOf(edge);
    const edgeSlots = slotsOf(edge);
    const index = edgeSlots.indexOf(slot);
    let target = null;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        target = step(edgeSlots, index, e.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        const otherEdge = edges[edgeIndex === 0 ? 1 : 0];
        if (!otherEdge) break;
        const others = slotsOf(otherEdge);
        // Cross at the same depth, then fan outwards for the nearest live slot.
        const at = others[Math.min(index, others.length - 1)];
        if (at && isFocusable(at)) { target = at; break; }
        const start = Math.min(index, others.length - 1);
        for (let d = 1; d < others.length; d++) {
          const down = others[start + d];
          const up = others[start - d];
          if (down && isFocusable(down)) { target = down; break; }
          if (up && isFocusable(up)) { target = up; break; }
        }
        break;
      }
      case 'Home':
        target = edgeSlots.find(isFocusable) || null;
        break;
      case 'End':
        target = [...edgeSlots].reverse().find(isFocusable) || null;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isFocusable(slot)) slot.click();
        return;
      default:
        return;
    }

    if (target) {
      e.preventDefault();
      focus(target);
    }
  });
}

// ============================================================================
// Slot click handler
// ============================================================================

function handleSlotClick(position, activeDeck, slotMap) {
  const info = slotMap.get(position);

  // Clicking the slot the active entity already owns — no-op, just close.
  const clickingSelf = info && (
    (activeGroupId && info.groupId === activeGroupId && !info.deckId) ||
    (activeDeckId && info.deckId === activeDeckId)
  );
  if (clickingSelf) {
    state.elements.stripeReorderDialog.removeAttribute('open');
    return;
  }

  if (!info) {
    executeMove(activeDeck.id, position);
    state.elements.stripeReorderDialog.removeAttribute('open');
  } else {
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
      state.elements.stripeReorderDialog.removeAttribute('open');
      pendingTargetPosition = null;
    }
  });

  content.appendChild(bar);
}

// ============================================================================
// Execute the move / swap
// ============================================================================

function executeMove(id, targetPosition) {
  const isGroup = !!activeGroupId;
  const result = isGroup
    ? moveGroupToPosition(state.currentPrism, id, targetPosition)
    : moveStripeToPosition(state.currentPrism, id, targetPosition);
  state.currentPrism = result.prism;
  savePrism(state.currentPrism);
  renderAll();

  const name = isGroup
    ? result.prism.splitGroups.find(g => g.id === id)?.name
    : result.prism.decks.find(d => d.id === id)?.name;
  const displayName = name || (isGroup ? 'Group' : 'Deck');
  if (result.swapped) {
    showSuccess(`Swapped "${displayName}" with "${result.swappedWithName}"`);
  } else {
    showSuccess(`Moved "${displayName}" to ${formatSlotLabel(targetPosition)}`);
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
  sleeve.setAttribute('role', 'radiogroup');
  sleeve.setAttribute('aria-label', `Choose a slot for ${activeDeck.name}`);

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
      <span>Choose a slot</span>
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
  wireSlotKeyboard(sleeve);
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
  activeGroupId = null;
  pendingTargetPosition = null;

  const dialog = state.elements.stripeReorderDialog;
  if (!dialog) return;
  dialog.setAttribute('label', `Move "${deck.name}"`);

  const content = document.getElementById('stripe-reorder-content');
  if (!content) return;
  content.innerHTML = '';

  const slotMap = buildSlotMap(prism);
  content.appendChild(renderSleeveVisualization(deck, slotMap));
  dialog.setAttribute('open', '');
}

export function openGroupReorderDialog(groupId) {
  const prism = state.currentPrism;
  const group = prism.splitGroups?.find(g => g.id === groupId);
  if (!group) return;

  activeDeckId = null;
  activeGroupId = groupId;
  pendingTargetPosition = null;

  const dialog = state.elements.stripeReorderDialog;
  if (!dialog) return;
  dialog.setAttribute('label', `Move "${group.name}"`);

  const content = document.getElementById('stripe-reorder-content');
  if (!content) return;
  content.innerHTML = '';

  // Synthetic "active deck" for rendering: reuse the group's Side A position + color.
  const syntheticActive = {
    id: group.id,
    name: group.name,
    color: group.sideAColor,
    stripePosition: group.sideAPosition,
  };
  const slotMap = buildSlotMap(prism);
  content.appendChild(renderSleeveVisualization(syntheticActive, slotMap));
  dialog.setAttribute('open', '');
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
        state.elements.stripeReorderDialog.removeAttribute('open');
      }
    });
  }
}
