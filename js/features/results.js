/**
 * Results table: rendering, sorting, filtering, deck filter menu.
 */

import { state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { processCards, formatSlotLabel } from '../modules/processor.js';
import { prefetchCards } from '../modules/scryfall.js';
import { handleMarkToggle, handleClearRemoved, handleClearAllRemoved } from './deck-list.js';
import { renderOverlapMatrix } from './analysis.js';

// ============================================================================
// Stripe indicator helpers
// ============================================================================

function renderStripeIndicator(s) {
  // Dot-style variant: render circle for dotIndex > 0, skip dotIndex 0
  if (s.markType === 'dot') {
    if (s.dotIndex === 0) return ''; // Variant 1 has no dot indicator
    return `<div
      class="stripe-indicator stripe-dot-indicator"
      style="background-color: ${s.color};"
      title="Dot: ${escapeHtml(s.deckName)}"
    ></div>`;
  }
  // Standard stripe indicator
  return `<div
    class="stripe-indicator${s.side === 'b' ? ' stripe-side-b' : ''}"
    style="background-color: ${s.color};"
    title="${formatSlotLabel(s.position)}: ${escapeHtml(s.deckName)}"
  ></div>`;
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
// Results rendering
// ============================================================================

export function renderResults() {
  const processedCards = processCards(state.currentPrism);
  state.processedCards = processedCards;
  const totalCardCount = processedCards.reduce((sum, c) => sum + c.totalQuantity, 0);
  const sharedCardCount = processedCards.filter(c => c.deckCount > 1).reduce((sum, c) => sum + c.totalQuantity, 0);

  // Update stats
  if (state.elements.statTotal) state.elements.statTotal.textContent = totalCardCount;
  if (state.elements.statShared) state.elements.statShared.textContent = sharedCardCount;

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
    filteredCards = filteredCards.filter(c => c.deckCount > 1);
    displayCards = filteredCards;
  } else if (filter === 'unique') {
    filteredCards = filteredCards.filter(c => c.deckCount === 1);
    displayCards = filteredCards;
  } else if (filter === 'basics-by-deck') {
    // Show only basic lands, split into per-deck rows
    displayCards = [];
    for (const card of filteredCards) {
      if (card.isBasicLand) {
        // Create a separate row for each deck this basic appears in
        for (const stripe of card.stripes) {
          // Find the quantity for this specific deck
          const deck = state.currentPrism.decks.find(d => d.id === stripe.deckId);
          const deckCard = deck?.cards.find(c => c.name.toLowerCase() === card.name.toLowerCase());
          const quantity = deckCard?.quantity || 1;

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
      // Non-basic cards are excluded from this view
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

  // Render deck filter menu and overlap matrix
  renderDeckFilterMenu();
  renderOverlapMatrix();

  // Apply sorting
  displayCards = sortCards(displayCards, state.sortState.column, state.sortState.direction);

  // Render table header with sort indicators
  renderResultsHeader();

  // Render table body
  if (!state.elements.resultsTbody) return;

  const showAllSlots = state.elements.showAllSlots?.checked || false;
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
                title="Remove from ${formatSlotLabel(card.removedStripePosition)}"
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

    if (showAllSlots && totalDecks > 0) {
      // Collect all used positions (deck positions + split group Side A positions)
      const allPositions = [...new Set([
        ...state.currentPrism.decks.map(d => d.stripePosition),
        ...(state.currentPrism.splitGroups || []).map(g => g.sideAPosition)
      ])].sort((a, b) => a - b);

      const stripeMap = new Map(card.stripes.map(s => [s.position, s]));
      stripeIndicators = '';
      for (const pos of allPositions) {
        const stripe = stripeMap.get(pos);
        if (stripe) {
          stripeIndicators += renderStripeIndicator(stripe);
        } else {
          stripeIndicators += `
            <div
              class="stripe-indicator stripe-empty"
              title="${formatSlotLabel(pos)}: Empty"
            ></div>`;
        }
      }
    } else {
      // Show only filled slots (default)
      stripeIndicators = card.stripes.map(s => renderStripeIndicator(s)).join('');
    }

    const rowClass = card.deckCount > 1 ? 'shared-row' : '';
    const nameClass = card.isBasicLand ? 'basic-land' : '';
    const basicTag = card.isBasicLand && !card.isBasicByDeck ? ' <span class="basic-tag">(Basic)</span>' : '';
    const copiesCell = filter === 'basics-by-deck' ? `<td>${card.totalQuantity}</td>` : '';

    // Check if card is marked (use original card name for basics-by-deck entries)
    const cardKey = card.isBasicByDeck ? `${card.displayName}|${card.deckName}` : card.name;
    const isMarked = state.currentPrism.markedCards?.includes(cardKey) || false;
    const markedClass = isMarked ? 'marked-row' : '';

    // Prepare stripes data for preview (exclude position-only data for cleaner JSON)
    // Escape for use in HTML attribute (escape single quotes and ampersands)
    const stripesJson = JSON.stringify(card.stripes.map(s => ({
      position: s.position,
      color: s.color,
      deckName: s.deckName,
      side: s.side || 'a',
      markType: s.markType,
      dotIndex: s.dotIndex,
    }))).replace(/&/g, '&amp;').replace(/'/g, '&#39;');

    return `
      <tr class="${rowClass} ${markedClass}" data-card-key="${escapeHtml(cardKey)}">
        <td style="text-align: center;">
          <input type="checkbox" class="mark-checkbox" ${isMarked ? 'checked' : ''}>
        </td>
        <td class="${nameClass} card-name-cell" data-card-name="${escapeHtml(card.name)}" data-stripes='${stripesJson}'>${escapeHtml(card.name)}${basicTag}</td>${copiesCell}
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
        // Sort by deck count (most shared first by default)
        comparison = a.deckCount - b.deckCount;
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
    state.elements.deckFilterMenu.innerHTML = '<wa-menu-item disabled>No decks added</wa-menu-item>';
    return;
  }

  // Build menu with checkboxes using native inputs for performance
  state.elements.deckFilterMenu.innerHTML = `
    <wa-menu-item class="deck-filter-clear" style="border-bottom: 1px solid var(--wa-color-neutral-stroke-subtle);">
      <wa-icon slot="start" name="xmark"></wa-icon>
      Clear All Filters
    </wa-menu-item>
    ${sortedDecks.map(deck => `
      <wa-menu-item class="deck-filter-item" data-deck-id="${deck.id}">
        <input type="checkbox" class="deck-filter-checkbox" data-deck-id="${deck.id}"
          ${state.selectedDeckIds.has(deck.id) ? 'checked' : ''}
          style="margin-right: 8px;">
        <div class="deck-color-indicator small" style="background-color: ${deck.color}; margin-right: 8px;"></div>
        ${escapeHtml(deck.name)}
      </wa-menu-item>
    `).join('')}
  `;

  // Add event listeners for checkboxes
  state.elements.deckFilterMenu.querySelectorAll('.deck-filter-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation(); // Prevent menu item click
      const deckId = checkbox.dataset.deckId;
      if (checkbox.checked) {
        state.selectedDeckIds.add(deckId);
      } else {
        state.selectedDeckIds.delete(deckId);
      }
      updateDeckFilterButtonLabel();
      renderResults();
    });
  });

  // Add clear all listener
  const clearBtn = state.elements.deckFilterMenu.querySelector('.deck-filter-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.selectedDeckIds.clear();
      updateDeckFilterButtonLabel();
      renderResults();
    });
  }

  // Update button label to show how many filters active
  updateDeckFilterButtonLabel();
}

function updateDeckFilterButtonLabel() {
  const btn = state.elements.deckFilterDropdown?.querySelector('wa-button');
  if (!btn) return;

  if (state.selectedDeckIds.size === 0) {
    btn.innerHTML = '<wa-icon slot="start" name="filter"></wa-icon>Filter by Deck';
  } else {
    btn.innerHTML = `<wa-icon slot="start" name="filter"></wa-icon>Decks (${state.selectedDeckIds.size})`;
  }
}
