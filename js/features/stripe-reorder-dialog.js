/**
 * Stripe Reorder Dialog — visual card-sleeve slot picker.
 * Opens a wa-dialog with a card outline showing 24 slots per edge, beside a list
 * of slots (under it on phone, where the picture is a preview). Choosing a slot
 * in either one selects it; Move commits. A taken slot asks to swap first.
 */

import { state } from '../core/state.js';
import { getPreferences, savePrism } from '../modules/storage.js';
import { moveStripeToPosition, moveGroupToPosition, formatSlotLabel, processCards } from '../modules/processor.js';
import { renderAll } from './init.js';
import { showSuccess } from '../core/notifications.js';
import { escapeHtml, isCardDone } from '../core/utils.js';

// Module-level state for the currently open dialog session
let activeGroupId = null;
let pendingTargetPosition = null;
// The deck (or group, as a synthetic deck) being moved, plus what the picker shows.
const picker = { entity: null, slotMap: null, side: 'a', freeOnly: true, selected: null };

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

export function buildSlotMap(prism) {
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
// Pure helpers for the slot list (exported for tests)
// ============================================================================

const sideOf = (position) => (position <= 24 ? 'a' : 'b');

/** Free slots per side. The deck's own slot is in the map, so it is not free. */
export function freeSlotCounts(slotMap) {
  const counts = { a: 0, b: 0 };
  for (let p = 1; p <= 48; p++) if (!slotMap.has(p)) counts[sideOf(p)]++;
  return counts;
}

/** Rows for one side, in slot order. The current slot always shows, disabled. */
export function slotRows(slotMap, side, freeOnly, currentPosition) {
  const rows = [];
  for (let p = side === 'a' ? 1 : 25; p <= (side === 'a' ? 24 : 48); p++) {
    const info = slotMap.get(p) || null;
    const isCurrent = p === currentPosition;
    if (freeOnly && info && !isCurrent) continue;
    rows.push({ position: p, info, isCurrent });
  }
  return rows;
}

/**
 * Whether any card of these decks has paint on a sleeve. Uses isCardDone, the
 * sole done gate, plus any marked batch key (a part-done multi-batch card).
 */
export function decksHaveMarks(prism, deckIds) {
  const marked = new Set(prism.markedCards || []);
  if (marked.size === 0) return false;
  const ids = new Set(deckIds);
  return processCards(prism).some((c) =>
    (c.batches || []).some((b) => b.participantIds.some((id) => ids.has(id)))
    && (isCardDone(c, marked) || c.batches.some((b) => marked.has(b.key))));
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
  slot.setAttribute('aria-checked', 'false');
  slot.tabIndex = -1;
  // The current slot cannot be chosen, so it is skipped like a disabled one.
  if (isDisabled || isActive) slot.setAttribute('aria-disabled', 'true');
  if (isDisabled) {
    slot.setAttribute('aria-label', `${slotLabel}, unavailable`);
  } else if (isActive) {
    slot.setAttribute('aria-label', `${slotLabel}, current slot of ${activeDeck.name}`);
  } else if (info) {
    slot.setAttribute('aria-label', `${slotLabel}, taken by ${info.name}`);
  } else {
    slot.setAttribute('aria-label', `${slotLabel}, empty`);
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
    slot.addEventListener('click', () => selectPosition(position));
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
// Selection and Move
// ============================================================================

/** Ring the chosen slot in the picture and the list, and enable Move. */
function syncSelection() {
  const content = document.getElementById('stripe-reorder-content');
  for (const el of content?.querySelectorAll('[data-position]') || []) {
    const on = Number(el.dataset.position) === picker.selected;
    el.setAttribute('aria-checked', String(on));
    el.classList.toggle('is-selected', on);
  }
  document.getElementById('stripe-reorder-move')?.toggleAttribute('disabled', picker.selected === null);
}

function clearSwapBar() {
  document.querySelector('#stripe-reorder-content .stripe-reorder-swap-confirm')?.remove();
  pendingTargetPosition = null;
}

function selectPosition(position) {
  clearSwapBar();
  picker.selected = position;
  if (sideOf(position) !== picker.side) {
    picker.side = sideOf(position);
    const sides = document.getElementById('slot-picker-side');
    if (sides) sides.value = picker.side;
    renderList();
  }
  syncSelection();
}

/** Move button: an empty slot moves now, a taken one asks to swap first. */
function handleMove() {
  const position = picker.selected;
  if (position === null) return;
  const info = picker.slotMap.get(position);
  if (!info) {
    executeMove(picker.entity.id, position);
    state.elements.stripeReorderDialog.removeAttribute('open');
  } else {
    pendingTargetPosition = position;
    showSwapConfirmation(picker.entity, info, position);
  }
}

// ============================================================================
// Slot list
// ============================================================================

function renderRow({ position, info, isCurrent }) {
  const row = document.createElement('div');
  row.className = 'slot-picker-row';
  row.dataset.position = String(position);
  row.setAttribute('role', 'radio');
  row.setAttribute('aria-checked', 'false');
  row.tabIndex = -1;
  const label = formatSlotLabel(position);
  const detail = isCurrent ? 'Current slot' : info ? info.name : 'Free';
  if (isCurrent) {
    row.setAttribute('aria-disabled', 'true');
    row.setAttribute('aria-label', `${label}, current slot of ${picker.entity.name}`);
  } else {
    row.setAttribute('aria-label', info
      ? `${label}, taken by ${info.name}`
      : `${label}, free`);
    row.addEventListener('click', () => selectPosition(position));
  }
  row.innerHTML = `
    <span class="slot-picker-swatch"${info?.color ? ` style="background-color:${escapeHtml(info.color)}"` : ''}></span>
    <span class="wa-stack wa-gap-0">
      <strong>${escapeHtml(label)}</strong>
      <span class="wa-caption-s slot-picker-detail">${escapeHtml(detail)}</span>
    </span>`;
  return row;
}

function renderList() {
  const list = document.getElementById('slot-picker-list');
  if (!list) return;
  const rows = slotRows(picker.slotMap, picker.side, picker.freeOnly, picker.entity.stripePosition);
  // A choice the filter now hides would leave a ring with no row to explain it.
  if (picker.selected !== null && sideOf(picker.selected) === picker.side
    && !rows.some((r) => r.position === picker.selected)) {
    picker.selected = null;
    clearSwapBar();
  }
  list.replaceChildren(...rows.map(renderRow));
  if (rows.every((r) => r.isCurrent)) {
    const empty = document.createElement('p');
    empty.className = 'wa-caption-m slot-picker-detail';
    empty.textContent = 'No free slots on this side. Turn off "Free slots only" to swap with a deck.';
    list.appendChild(empty);
  }
  wireListRoving(list);
  syncSelection();
}

/** Radiogroup keys for the list: one tab stop, arrows walk, Enter or Space choose. */
function wireListRoving(list) {
  const live = [...list.querySelectorAll('.slot-picker-row')]
    .filter((r) => r.getAttribute('aria-disabled') !== 'true');
  const stop = live.find((r) => r.dataset.position === String(picker.selected)) || live[0];
  if (stop) stop.tabIndex = 0;
  if (list.dataset.wired) return;
  list.dataset.wired = '1';
  list.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('.slot-picker-row');
    if (!row) return;
    const items = [...list.querySelectorAll('.slot-picker-row')]
      .filter((r) => r.getAttribute('aria-disabled') !== 'true');
    const at = items.indexOf(row);
    let target = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') target = items[at + 1];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') target = items[at - 1];
    else if (e.key === 'Home') target = items[0];
    else if (e.key === 'End') target = items[items.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      row.click();
      return;
    } else return;
    e.preventDefault();
    if (!target) return;
    for (const r of list.querySelectorAll('.slot-picker-row')) r.tabIndex = -1;
    target.tabIndex = 0;
    target.focus();
  });
}

function renderPicker() {
  const counts = freeSlotCounts(picker.slotMap);
  const col = document.createElement('div');
  col.className = 'wa-stack wa-gap-s';
  col.innerHTML = `
    <wa-radio-group id="slot-picker-side" label="Side" size="s" orientation="horizontal" value="${picker.side}">
      <wa-radio appearance="button" value="a">Side A (${counts.a} free)</wa-radio>
      <wa-radio appearance="button" value="b">Side B (${counts.b} free)</wa-radio>
    </wa-radio-group>
    <wa-switch id="slot-picker-free-only" size="s"${picker.freeOnly ? ' checked' : ''}>Free slots only</wa-switch>
    <div id="slot-picker-list" class="slot-picker-list" role="radiogroup" aria-label="Slots for ${escapeHtml(picker.entity.name)}"></div>`;
  col.querySelector('#slot-picker-side').addEventListener('change', (e) => {
    picker.side = e.target.value;
    renderList();
  });
  col.querySelector('#slot-picker-free-only').addEventListener('change', (e) => {
    picker.freeOnly = e.target.checked;
    renderList();
  });
  return col;
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
        <wa-button size="s" variant="neutral" appearance="outlined" class="btn-swap-cancel">Cancel</wa-button>
        <wa-button size="s" variant="brand" class="btn-swap-confirm">Swap</wa-button>
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

  // Above the picker, scrolled into view: on phone the list is long and the
  // bar must not sit off screen below it.
  content.prepend(bar);
  bar.scrollIntoView({ block: 'nearest' });
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
//
// openStripeReorderDialog(deckId) opens the picker for any deck by id (the Add
// form's Change button calls it once the deck exists).
// ============================================================================

function showPicker(content, prism, entity, deckIds) {
  const slotMap = buildSlotMap(prism);
  const counts = freeSlotCounts(slotMap);
  Object.assign(picker, {
    entity, slotMap, selected: null, freeOnly: true,
    side: counts.a > 0 || counts.b === 0 ? 'a' : 'b',
  });
  if (decksHaveMarks(prism, deckIds)) {
    const note = document.createElement('p');
    note.className = 'wa-body-s';
    note.textContent = 'This deck has marked cards. Marks you already painted do not move with it.';
    content.appendChild(note);
  }
  const layout = document.createElement('div');
  layout.className = 'wa-grid slot-picker-layout';
  layout.appendChild(renderSleeveVisualization(entity, slotMap));
  layout.appendChild(renderPicker());
  content.appendChild(layout);
  renderList();
}

export function openStripeReorderDialog(deckId) {
  const prism = state.currentPrism;
  const deck = prism.decks.find(d => d.id === deckId);
  if (!deck) return;

  activeGroupId = null;
  pendingTargetPosition = null;

  const dialog = state.elements.stripeReorderDialog;
  if (!dialog) return;
  dialog.setAttribute('label', `Move "${deck.name}"`);

  const content = document.getElementById('stripe-reorder-content');
  if (!content) return;
  content.innerHTML = '';

  showPicker(content, prism, deck, [deck.id]);
  dialog.setAttribute('open', '');
}

export function openGroupReorderDialog(groupId) {
  const prism = state.currentPrism;
  const group = prism.splitGroups?.find(g => g.id === groupId);
  if (!group) return;

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
  showPicker(content, prism, syntheticActive, group.childDeckIds || []);
  dialog.setAttribute('open', '');
}

// ============================================================================
// Cancel button setup (called once from init.js after elements are cached)
// ============================================================================

export function setupStripeReorderDialog() {
  document.getElementById('stripe-reorder-move')?.addEventListener('click', handleMove);
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
