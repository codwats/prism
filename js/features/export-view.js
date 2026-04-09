/**
 * Export tab: deck legend and stripe reorder list.
 */

import { state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { formatSlotLabel, getColorName } from '../modules/processor.js';
import { handleStripeReorder } from './deck-list.js';

// ============================================================================
// Export rendering
// ============================================================================

export function renderExport() {
  const sortedDecks = [...state.currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  // Show/hide reorder card based on deck count (needs 2+ decks to reorder)
  if (state.elements.reorderCard) {
    state.elements.reorderCard.style.display = sortedDecks.length >= 2 ? '' : 'none';
  }

  // Deck legend
  if (sortedDecks.length === 0) {
    if (state.elements.deckLegend) state.elements.deckLegend.style.display = 'none';
    if (state.elements.noDecksLegend) state.elements.noDecksLegend.style.display = '';
    if (state.elements.stripeReorderList) {
      state.elements.stripeReorderList.innerHTML = '';
    }
    return;
  }

  if (state.elements.deckLegend) state.elements.deckLegend.style.display = '';
  if (state.elements.noDecksLegend) state.elements.noDecksLegend.style.display = 'none';

  if (state.elements.deckLegend) {
    // Build legend items: standalone decks + split group headers with children
    const splitGroups = state.currentPrism.splitGroups || [];
    const renderedGroupIds = new Set();
    const legendItems = [];

    for (const deck of sortedDecks) {
      if (!deck.splitGroupId) {
        legendItems.push({ type: 'standalone', deck, sortPos: deck.stripePosition });
      } else if (!renderedGroupIds.has(deck.splitGroupId)) {
        renderedGroupIds.add(deck.splitGroupId);
        const group = splitGroups.find(g => g.id === deck.splitGroupId);
        if (group) legendItems.push({ type: 'group', group, sortPos: group.sideAPosition });
      }
    }
    legendItems.sort((a, b) => a.sortPos - b.sortPos);

    state.elements.deckLegend.innerHTML = legendItems.map(item => {
      if (item.type === 'standalone') {
        const slotLabel = formatSlotLabel(item.deck.stripePosition);
        return `
          <div class="wa-cluster wa-gap-xs wa-align-items-center">
            <div class="deck-color-indicator small" style="background-color: ${item.deck.color};"></div>
            <span><strong>${slotLabel}:</strong> ${escapeHtml(item.deck.name)}</span>
          </div>`;
      }
      const group = item.group;
      const children = group.childDeckIds.map(id => state.currentPrism.decks.find(d => d.id === id)).filter(Boolean);
      return `
        <div class="wa-stack wa-gap-2xs" style="width: 100%;">
          <div class="wa-cluster wa-gap-xs wa-align-items-center">
            <div class="deck-color-indicator small" style="background-color: ${group.sideAColor};"></div>
            <span><strong>${formatSlotLabel(group.sideAPosition, 'a')}:</strong> ${escapeHtml(group.name)} <span style="color:var(--wa-color-neutral-text-subtle);">(split group · ${(group.splitStyle || 'stripes') === 'dots' ? 'dots' : 'stripes'})</span></span>
          </div>
          ${children.map(child => `
            <div class="wa-cluster wa-gap-xs wa-align-items-center" style="padding-left: var(--wa-space-l);">
              <div class="deck-color-indicator small" style="background-color: ${child.color};"></div>
              <span><strong>${formatSlotLabel(child.stripePosition)}:</strong> ${escapeHtml(child.name)}</span>
            </div>
          `).join('')}
        </div>`;
    }).join('');
  }

  // Stripe reorder list
  if (state.elements.stripeReorderList) {
    state.elements.stripeReorderList.innerHTML = sortedDecks.map((deck, index) => {
      const slotLabel = formatSlotLabel(deck.stripePosition);
      return `
      <div class="reorder-item wa-split wa-align-items-center" data-deck-id="${deck.id}">
        <div class="wa-cluster wa-gap-s wa-align-items-center">
          <div class="deck-color-indicator" style="background-color: ${deck.color};"></div>
          <span><strong>${slotLabel}:</strong> ${escapeHtml(deck.name)}</span>
        </div>
        <div class="wa-cluster wa-gap-2xs">
          <wa-button
            appearance="plain"
            variant="neutral"
            size="small"
            class="btn-move-up"
            data-deck-id="${deck.id}"
            ${index === 0 ? 'disabled' : ''}
            title="Move up"
          >
            <wa-icon name="chevron-up"></wa-icon>
          </wa-button>
          <wa-button
            appearance="plain"
            variant="neutral"
            size="small"
            class="btn-move-down"
            data-deck-id="${deck.id}"
            ${index === sortedDecks.length - 1 ? 'disabled' : ''}
            title="Move down"
          >
            <wa-icon name="chevron-down"></wa-icon>
          </wa-button>
        </div>
      </div>
    `;
    }).join('');

    // Add reorder listeners
    state.elements.stripeReorderList.querySelectorAll('.btn-move-up').forEach(btn => {
      btn.addEventListener('click', () => handleStripeReorder(btn.dataset.deckId, 'up'));
    });
    state.elements.stripeReorderList.querySelectorAll('.btn-move-down').forEach(btn => {
      btn.addEventListener('click', () => handleStripeReorder(btn.dataset.deckId, 'down'));
    });
  }
}
