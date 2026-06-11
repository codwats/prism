/**
 * Results table: rendering, sorting, filtering, deck filter menu.
 */

import { state } from '../core/state.js';
import { escapeHtml, stripeNumberLabel, countVisibleMarks, STRIPE_SPARSE_MAX, isCardDone } from '../core/utils.js';
import { getPreferences } from '../modules/storage.js';
import { processCards, formatSlotLabel } from '../modules/processor.js';
import { prefetchCards } from '../modules/scryfall.js';
import { handleMarkToggle, handleClearRemoved, handleClearAllRemoved } from './deck-list.js';
import { renderOverlapMatrix } from './analysis.js';

// ============================================================================
// Stripe indicator helpers
// ============================================================================

// Group a card's stripes by position, separating squares from dots.
// Returns Map<position, { square: stripe|null, dots: stripe[] }> in sorted stripe order.
function buildSlotMap(stripes) {
  const slotMap = new Map();
  for (const s of stripes) {
    if (!slotMap.has(s.position)) slotMap.set(s.position, { square: null, dots: [] });
    const slot = slotMap.get(s.position);
    if (s.markType === 'dot') slot.dots.push(s);
    else if (s.markType !== 'membership') slot.square = s;
  }
  return slotMap;
}

// Stable signature of a card's physical stripe set: one token per visible mark
// capturing its slot, mark type, and color, so two cards share a signature only
// when they need the exact same pens in the exact same places. Color/markType
// matter because dot-style split variants stack several differently-colored
// marks at one Side A position (a position-only key would collide them). The
// invisible 'membership' anchors are excluded so only real marks count.
function stripeSignature(card) {
  return (card.stripes || [])
    .filter(s => s.markType !== 'membership')
    .map(s => `${s.position}:${s.markType || 'stripe'}:${s.color}`)
    .sort()
    .join(',');
}

// Slot-number overlay. Sparse cards (`exact`) number every mark with its exact
// slot; otherwise only anchor slots (5/10/15/20) show, gated on `showNums`.
function positionNumHtml(position, { showNums, exact }, muted = false) {
  const label = (exact || showNums) ? stripeNumberLabel(position, { exact }) : null;
  if (!label) return '';
  return `<span class="stripe-pos-num${muted ? ' stripe-pos-num-muted' : ''}">${label}</span>`;
}

// Render a single stripe square (no dots).
function renderSquare(s, opts) {
  return `<div
    class="stripe-indicator${s.side === 'b' ? ' stripe-side-b' : ''}"
    style="background-color: ${s.color};"
    title="${formatSlotLabel(s.position)}: ${escapeHtml(s.deckName)}"
  >${positionNumHtml(s.position, opts)}</div>`;
}

// Render a slot: if it has dots, use ö-style (dot row above square).
function renderSlot(slot, opts) {
  if (slot.dots.length === 0) {
    return slot.square ? renderSquare(slot.square, opts) : '';
  }
  const dotsHtml = slot.dots.map(d => `<div
    class="stripe-indicator stripe-dot-indicator"
    style="background-color: ${d.color};"
    title="Dot: ${escapeHtml(d.deckName)}"
  ></div>`).join('');
  const slotPos = slot.square ? slot.square.position : slot.dots[0]?.position;
  const squareHtml = slot.square
    ? renderSquare(slot.square, opts)
    : `<div class="stripe-indicator stripe-empty">${positionNumHtml(slotPos, opts, true)}</div>`;
  return `<div class="stripe-slot"><div class="slot-dot-row">${dotsHtml}</div>${squareHtml}</div>`;
}

// ============================================================================
// Removed filter badge
// ============================================================================

export function updateRemovedFilterBadge() {
  const removedBtn = document.getElementById('removed-filter-btn');
  if (!removedBtn) return;

  const count = state.currentPrism?.removedCards?.length || 0;

  if (count > 0) {
    removedBtn.textContent = `Removed (${count})`;
    removedBtn.style.setProperty('--wa-color-surface', 'var(--wa-color-warning-surface-subtle)');
  } else {
    removedBtn.textContent = 'Removed';
    removedBtn.style.removeProperty('--wa-color-surface');
  }
}

// ============================================================================
// Marked progress (sleeves done)
// ============================================================================

// Sums totalQuantity for marked vs all rows — matches Total Cards stat.
// Uses cached state.processedCards so it can run on mark toggle without reprocessing.
export function updateMarkedProgress() {
  const cards = state.processedCards || [];
  const markedSet = new Set(state.currentPrism?.markedCards || []);
  const totalCount = cards.reduce((sum, c) => sum + c.totalQuantity, 0);
  // isCardDone also honours per-deck basic marks ("Name|DeckName" keys from the
  // Basics-by-Deck view) so progress can reach 100% for users of that view.
  const markedCount = cards.reduce((sum, c) => sum + (isCardDone(c, markedSet) ? c.totalQuantity : 0), 0);

  if (state.elements.statMarked) state.elements.statMarked.textContent = `${markedCount}/${totalCount}`;
  if (state.elements.markedProgress) {
    state.elements.markedProgress.value = totalCount > 0 ? Math.round((markedCount / totalCount) * 100) : 0;
  }
}

// ============================================================================
// Results rendering
// ============================================================================

export function renderResults() {
  const processedCards = processCards(state.currentPrism);
  state.processedCards = processedCards;
  const totalCardCount = processedCards.reduce((sum, c) => sum + c.totalQuantity, 0);
  const sharedCardCount = processedCards.filter(c => c.logicalDeckCount > 1).reduce((sum, c) => sum + c.totalQuantity, 0);

  // Update stats
  if (state.elements.statTotal) state.elements.statTotal.textContent = totalCardCount;
  if (state.elements.statShared) state.elements.statShared.textContent = sharedCardCount;
  updateMarkedProgress();

  // Show/hide based on deck count
  if (state.currentPrism.decks.length === 0) {
    if (state.elements.resultsStats) state.elements.resultsStats.style.display = 'none';
    if (state.elements.noResults) state.elements.noResults.style.display = 'flex';
    const tableContainer = document.getElementById('results-table-container');
    if (tableContainer) tableContainer.style.display = 'none';
    const filterParent = state.elements.resultsFilter?.parentElement;
    if (filterParent) filterParent.style.display = 'none';
    return;
  }

  if (state.elements.resultsStats) state.elements.resultsStats.style.display = '';
  if (state.elements.noResults) state.elements.noResults.style.display = 'none';
  const tableContainer = document.getElementById('results-table-container');
  if (tableContainer) tableContainer.style.display = '';
  const filterParent = state.elements.resultsFilter?.parentElement;
  if (filterParent) filterParent.style.display = '';

  // Apply filters
  const filter = state.elements.resultsFilter?.value || 'all';
  const search = (state.elements.resultsSearch?.value || '').toLowerCase().trim();

  let filteredCards = [...processedCards];
  let displayCards = []; // What we'll actually render

  if (filter === 'shared') {
    filteredCards = filteredCards.filter(c => c.logicalDeckCount > 1);
    displayCards = filteredCards;
  } else if (filter === 'basics-by-deck') {
    // Show only basic lands, one row per LOGICAL deck. Standalone decks and
    // split groups each emit exactly one Side A stripe, so iterating Side A
    // gives the right row set — split variants share physical cards, so the
    // group row carries the max quantity across its children. Iterating all
    // stripes (the old behaviour) leaked invisible membership anchors and
    // group-level stripes with no deckId, producing bogus rows with qty 1.
    const findQty = (deck, cardName) =>
      deck?.cards.find(c => c.name.toLowerCase() === cardName.toLowerCase())?.quantity || 0;
    displayCards = [];
    for (const card of filteredCards) {
      if (!card.isBasicLand) continue; // Non-basics are excluded from this view
      for (const stripe of card.stripes) {
        if (stripe.side !== 'a') continue;

        let quantity = 1;
        if (stripe.deckId) {
          const deck = state.currentPrism.decks.find(d => d.id === stripe.deckId);
          quantity = findQty(deck, card.name) || 1;
        } else if (stripe.groupId) {
          const group = (state.currentPrism.splitGroups || []).find(g => g.id === stripe.groupId);
          const childQtys = (group?.childDeckIds || [])
            .map(id => findQty(state.currentPrism.decks.find(d => d.id === id), card.name));
          quantity = Math.max(1, ...childQtys);
        }

        displayCards.push({
          name: `${card.name} (${stripe.deckName})`,
          displayName: card.name,
          deckName: stripe.deckName,
          isBasicLand: true,
          isBasicByDeck: true,
          totalQuantity: quantity,
          deckCount: 1,
          stripes: [stripe]
        });
      }
    }
    // Sort by land type first, then by deck name
    displayCards.sort((a, b) => {
      const landCompare = a.displayName.localeCompare(b.displayName);
      if (landCompare !== 0) return landCompare;
      return a.deckName.localeCompare(b.deckName);
    });
  } else if (filter === 'removed') {
    // Show cards that have been removed from decks and need marks cleared
    displayCards = [];
    const removedCards = state.currentPrism.removedCards || [];

    for (const removed of removedCards) {
      displayCards.push({
        name: removed.cardName,
        isRemoved: true,
        removedDeckId: removed.deckId,
        removedDeckName: removed.deckName,
        removedDeckColor: removed.deckColor,
        removedStripePosition: removed.stripePosition,
        removedAt: removed.removedAt,
        deckCount: 0, // Not in any deck now (for this stripe)
        stripes: [{
          position: removed.stripePosition,
          color: removed.deckColor,
          deckName: removed.deckName,
          deckId: removed.deckId
        }]
      });
    }

    // Sort by removal date (most recent first), then by card name
    displayCards.sort((a, b) => {
      const dateCompare = new Date(b.removedAt) - new Date(a.removedAt);
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name);
    });
  } else {
    displayCards = filteredCards;
  }

  if (search) {
    displayCards = displayCards.filter(c =>
      c.name.toLowerCase().includes(search)
    );
  }

  // Apply deck filter (if any decks are selected)
  if (state.selectedDeckIds.size > 0) {
    displayCards = displayCards.filter(card => {
      // Check if any of the card's stripes match a selected deck
      return card.stripes.some(s => state.selectedDeckIds.has(s.deckId));
    });
  }

  // Persistent undone-only filter: keep cards the user hasn't marked done.
  if (state.elements.undoneFilter?.checked) {
    const markedSet = new Set(state.currentPrism.markedCards || []);
    displayCards = displayCards.filter(card => {
      const cardKey = card.isBasicByDeck ? `${card.displayName}|${card.deckName}` : card.name;
      return !markedSet.has(cardKey);
    });
  }

  // Render deck filter menu and overlap matrix
  renderDeckFilterMenu();
  renderOverlapMatrix();

  // Apply sorting
  displayCards = sortCards(displayCards, state.sortState.column, state.sortState.direction);

  // Snapshot for SCRY-Mode — reflects exact list visible to user (all filters/sort applied)
  state.resultsView = displayCards;

  // Render table header with sort indicators
  renderResultsHeader();

  // Render table body
  if (!state.elements.resultsTbody) return;

  const showAllSlots = state.elements.showAllSlots?.checked || false;
  const showNums = !!getPreferences().showStripePositionNumbers;
  const totalDecks = state.currentPrism?.decks?.length || 0;

  state.elements.resultsTbody.innerHTML = displayCards.map(card => {
    // Handle removed cards differently
    if (card.isRemoved) {
      const removedKey = `${card.name}|${card.removedDeckId}`;
      return `
        <tr class="removed-row" data-removed-key="${escapeHtml(removedKey)}">
          <td>${escapeHtml(card.name)}</td>
          <td>
            <div class="wa-cluster wa-gap-xs wa-align-items-center">
              <div
                class="stripe-indicator"
                style="background-color: ${card.removedDeckColor};"
                title="Remove from ${card.removedStripePosition != null ? formatSlotLabel(card.removedStripePosition) : 'this deck’s group slot'}"
              ></div>
              <span class="removed-deck-label">Remove from ${escapeHtml(card.removedDeckName)}</span>
            </div>
          </td>
          <td style="text-align: center;">
            <wa-button
              appearance="plain"
              variant="neutral"
              size="small"
              class="btn-clear-removed"
              data-card-name="${escapeHtml(card.name)}"
              data-deck-id="${card.removedDeckId}"
              title="Mark as cleared"
            >
              <wa-icon name="check"></wa-icon>
            </wa-button>
          </td>
        </tr>
      `;
    }

    let stripeIndicators;

    // Sparse cards number every mark with its exact slot (always-on); dense
    // cards fall back to the toggle-gated anchor numbering.
    const exact = countVisibleMarks(card.stripes) <= STRIPE_SPARSE_MAX;
    const opts = { showNums, exact };

    if (showAllSlots && totalDecks > 0) {
      // Collect all used positions (deck positions + split group Side A positions)
      const allPositions = [...new Set([
        ...state.currentPrism.decks.map(d => d.stripePosition),
        ...(state.currentPrism.splitGroups || []).map(g => g.sideAPosition)
      ])].sort((a, b) => a - b);

      const slotMap = buildSlotMap(card.stripes);
      stripeIndicators = '';
      for (const pos of allPositions) {
        const slot = slotMap.get(pos);
        if (slot) {
          stripeIndicators += renderSlot(slot, opts);
        } else {
          // Empty reference slots only ever show the anchor ruler number, never
          // an "exact" number (they are not this card's marks).
          stripeIndicators += `<div
            class="stripe-indicator stripe-empty"
            title="${formatSlotLabel(pos)}: Empty"
          >${positionNumHtml(pos, { showNums, exact: false }, true)}</div>`;
        }
      }
    } else {
      // Show only filled slots (default)
      const slotMap = buildSlotMap(card.stripes);
      stripeIndicators = '';
      for (const [, slot] of slotMap) {
        stripeIndicators += renderSlot(slot, opts);
      }
    }

    const rowClass = card.logicalDeckCount > 1 ? 'shared-row' : '';
    const nameClass = card.isBasicLand ? 'basic-land' : '';
    const basicTag = card.isBasicLand && !card.isBasicByDeck ? ' <span class="basic-tag">(Basic)</span>' : '';
    const copiesCell = filter === 'basics-by-deck' ? `<td>${card.totalQuantity}</td>` : '';

    // Check if card is marked (use original card name for basics-by-deck entries)
    const cardKey = card.isBasicByDeck ? `${card.displayName}|${card.deckName}` : card.name;
    const isMarked = state.currentPrism.markedCards?.includes(cardKey) || false;
    const markedClass = isMarked ? 'marked-row' : '';

    return `
      <tr class="${rowClass} ${markedClass}" data-card-key="${escapeHtml(cardKey)}">
        <td style="text-align: center;">
          <input type="checkbox" class="mark-checkbox" aria-label="Mark ${escapeHtml(card.name)} done" ${isMarked ? 'checked' : ''}>
        </td>
        <td class="${nameClass} card-name-cell" data-card-name="${escapeHtml(card.name)}">${escapeHtml(card.name)}${basicTag}</td>${copiesCell}
        <td><div class="stripe-indicators">${stripeIndicators}</div></td>
      </tr>
    `;
  }).join('');

  // Add event listeners for checkboxes
  state.elements.resultsTbody.querySelectorAll('.mark-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleMarkToggle);
  });

  // Add event listeners for "Clear removed" buttons
  state.elements.resultsTbody.querySelectorAll('.btn-clear-removed').forEach(btn => {
    btn.addEventListener('click', () => {
      const cardName = btn.dataset.cardName;
      const deckId = btn.dataset.deckId;
      handleClearRemoved(cardName, deckId);
    });
  });

  // Add event listener for "Clear All" removed button
  const clearAllBtn = document.getElementById('clear-all-removed-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', handleClearAllRemoved);
  }

  const colspan = filter === 'basics-by-deck' ? 4 : 3;

  // Handle empty states
  if (displayCards.length === 0) {
    let emptyMessage = 'No cards match your filter.';

    if (filter === 'removed') {
      emptyMessage = 'No cards pending removal. Edit a deck to see cards that need marks cleared.';
    } else if (processedCards.length === 0) {
      return; // Don't show message if no cards exist at all
    }

    state.elements.resultsTbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" style="text-align: center; color: var(--wa-color-neutral-text-subtle); padding: var(--wa-space-xl);">
          ${emptyMessage}
        </td>
      </tr>
    `;
    return;
  }

  // Prefetch card images for visible cards (first 20 to avoid rate limiting)
  const cardNames = displayCards
    .slice(0, 20)
    .map(c => c.isBasicByDeck ? c.displayName : c.name)
    .filter(Boolean);
  if (cardNames.length > 0) {
    prefetchCards(cardNames).catch(() => {
      // Silently ignore prefetch errors
    });
  }
}

// ============================================================================
// Sorting
// ============================================================================

function sortCards(cards, column, direction) {
  // Pre-compute lookup for marked status
  const markedSet = column === 'marked' ? new Set(state.currentPrism?.markedCards || []) : null;

  return cards.sort((a, b) => {
    let comparison = 0;

    switch (column) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'copies':
        comparison = a.totalQuantity - b.totalQuantity;
        break;
      case 'deckCount':
        // 1. Sort by deck count (most shared first by default)
        comparison = a.deckCount - b.deckCount;
        // 2. Cluster cards that carry the identical set of stripes together,
        //    so the user marks all of them without swapping pens.
        if (comparison === 0) {
          comparison = stripeSignature(a).localeCompare(stripeSignature(b));
        }
        // 3. Alphabetical within a matching set
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
      case 'marked': {
        const aKey = a.isBasicByDeck ? `${a.displayName}|${a.deckName}` : a.name;
        const bKey = b.isBasicByDeck ? `${b.displayName}|${b.deckName}` : b.name;
        const aMarked = markedSet.has(aKey) ? 1 : 0;
        const bMarked = markedSet.has(bKey) ? 1 : 0;
        comparison = aMarked - bMarked;
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
      }
      default:
        comparison = 0;
    }

    return direction === 'desc' ? -comparison : comparison;
  });
}

// ============================================================================
// Results header (sort controls)
// ============================================================================

function renderResultsHeader() {
  const thead = document.querySelector('#results-table thead');
  if (!thead) return;

  const filter = state.elements.resultsFilter?.value || 'all';
  const showCopies = filter === 'basics-by-deck';
  const isRemovedFilter = filter === 'removed';

  const getSortIcon = (column) => {
    if (state.sortState.column !== column) return 'sort';
    return state.sortState.direction === 'asc' ? 'sort-up' : 'sort-down';
  };

  const getSortedClass = (column) => {
    return state.sortState.column === column ? 'sorted' : '';
  };

  const copiesHeader = showCopies ? `
      <th class="sortable ${getSortedClass('copies')}" data-sort="copies">
        Copies
        <wa-icon name="${getSortIcon('copies')}" class="sort-icon"></wa-icon>
      </th>` : '';

  // Different header for removed cards view
  if (isRemovedFilter) {
    thead.innerHTML = `
      <tr>
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card Name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>
        <th>Remove Mark From</th>
        <th style="width: 80px; text-align: center;">
          <button id="clear-all-removed-btn" class="btn-clear-all-removed" title="Clear all removed cards">Clear All</button>
        </th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th class="sortable ${getSortedClass('marked')}" data-sort="marked" style="width: 60px; text-align: center;">
          Done
          <wa-icon name="${getSortIcon('marked')}" class="sort-icon"></wa-icon>
        </th>
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card Name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>${copiesHeader}
        <th class="sortable ${getSortedClass('deckCount')}" data-sort="deckCount">
          Stripes
          <wa-icon name="${getSortIcon('deckCount')}" class="sort-icon"></wa-icon>
        </th>
      </tr>
    `;
  }

  // Add click handlers for sortable columns
  thead.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      const defaultDirection = column === 'name' ? 'asc' : 'desc';

      if (state.sortState.column === column) {
        if (state.sortState.direction === defaultDirection) {
          // First click was default, toggle to opposite
          state.sortState.direction = defaultDirection === 'asc' ? 'desc' : 'asc';
        } else {
          // Already toggled, reset to default sort (deckCount desc)
          state.sortState.column = 'deckCount';
          state.sortState.direction = 'desc';
        }
      } else {
        // New column, set default direction for that column
        state.sortState.column = column;
        state.sortState.direction = defaultDirection;
      }
      renderResults();
    });
  });
}

// ============================================================================
// Deck filter menu
// ============================================================================

function renderDeckFilterMenu() {
  if (!state.elements.deckFilterMenu) return;

  const sortedDecks = [...state.currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  if (sortedDecks.length === 0) {
    // Plain wa-button like the rest of this menu — wa-menu-item is avoided
    // codebase-wide (flaky CDN autoload, see CLAUDE.md).
    state.elements.deckFilterMenu.innerHTML =
      '<wa-button disabled appearance="plain" variant="neutral" size="small">No decks added</wa-button>';
    return;
  }

  // Plain wa-buttons (not wa-menu-item) to match the deck-actions kebab menu
  // styling and dodge the flaky wa-menu CDN autoload (see CLAUDE.md).
  state.elements.deckFilterMenu.innerHTML = `
    <wa-button class="deck-filter-clear" appearance="plain" variant="neutral" size="small">
      <wa-icon slot="start" name="xmark"></wa-icon>
      Clear All Filters
    </wa-button>
    <wa-divider></wa-divider>
    ${sortedDecks.map(deck => {
      const selected = state.selectedDeckIds.has(deck.id);
      return `
      <wa-button class="deck-filter-item" data-deck-id="${deck.id}"
        appearance="plain" variant="neutral" size="small">
        <wa-icon slot="start" name="check" style="visibility: ${selected ? 'visible' : 'hidden'};"></wa-icon>
        <span class="deck-color-indicator small" style="background-color: ${deck.color};"></span>
        ${escapeHtml(deck.name)}
      </wa-button>
    `;
    }).join('')}
  `;

  // Toggle selection on item click; plain buttons keep the dropdown open.
  state.elements.deckFilterMenu.querySelectorAll('.deck-filter-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const deckId = btn.dataset.deckId;
      if (state.selectedDeckIds.has(deckId)) {
        state.selectedDeckIds.delete(deckId);
      } else {
        state.selectedDeckIds.add(deckId);
      }
      const icon = btn.querySelector('wa-icon[slot="start"]');
      if (icon) icon.style.visibility = state.selectedDeckIds.has(deckId) ? 'visible' : 'hidden';
      updateDeckFilterButtonLabel();
      renderResults();
    });
  });

  // Clear all listener
  const clearBtn = state.elements.deckFilterMenu.querySelector('.deck-filter-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.selectedDeckIds.clear();
      state.elements.deckFilterMenu.querySelectorAll('.deck-filter-item wa-icon[slot="start"]')
        .forEach(icon => { icon.style.visibility = 'hidden'; });
      updateDeckFilterButtonLabel();
      renderResults();
    });
  }

  // Update button label to show how many filters active
  updateDeckFilterButtonLabel();
}

function updateDeckFilterButtonLabel() {
  const btn = state.elements.deckFilterDropdown?.querySelector('wa-button[slot="trigger"]');
  if (!btn) return;

  // Compose the trigger label from every filter the dropdown owns: deck
  // selection plus the undone-only and all-slots switches.
  const facets = [];
  if (state.selectedDeckIds.size > 0) facets.push(`Decks (${state.selectedDeckIds.size})`);
  if (state.elements.undoneFilter?.checked) facets.push('Undone');
  if (state.elements.showAllSlots?.checked) facets.push('All slots');

  let label;
  if (facets.length === 0) label = 'Filters';
  else if (facets.length === 1) label = facets[0];
  else label = `Filters (${facets.length})`;

  btn.innerHTML = `<wa-icon slot="start" name="filter"></wa-icon>${label}`;
}
