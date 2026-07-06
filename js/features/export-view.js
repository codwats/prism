/**
 * Deck legend rendering (Legend dropdown in the Results toolbar; also prints on the guide).
 */

import { state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { formatSlotLabel } from '../modules/processor.js';

// ============================================================================
// Legend rendering
// ============================================================================

export function renderExport() {
  const sortedDecks = [...state.currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  if (sortedDecks.length === 0) {
    if (state.elements.deckLegend) state.elements.deckLegend.style.display = 'none';
    if (state.elements.noDecksLegend) state.elements.noDecksLegend.style.display = '';
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

    const legendRow = (color, name, slotLabel) => `
      <div class="wa-cluster wa-gap-s wa-align-items-center" style="flex-wrap: nowrap;">
        <div class="deck-color-indicator" style="background-color: ${color};"></div>
        <span style="flex: 1;">${escapeHtml(name)}</span>
        <span class="wa-caption-s" style="font-family: var(--wa-font-family-code); white-space: nowrap;">${escapeHtml(slotLabel)}</span>
      </div>`;

    state.elements.deckLegend.innerHTML = legendItems.map(item => {
      if (item.type === 'standalone') {
        return legendRow(item.deck.color, item.deck.name, formatSlotLabel(item.deck.stripePosition));
      }
      const group = item.group;
      const children = group.childDeckIds.map(id => state.currentPrism.decks.find(d => d.id === id)).filter(Boolean);
      return `
        <div class="wa-stack wa-gap-2xs" style="width: 100%;">
          ${legendRow(group.sideAColor, `${group.name} (split · ${(group.splitStyle || 'stripes') === 'dots' ? 'dots' : 'stripes'})`, formatSlotLabel(group.sideAPosition, 'a'))}
          ${children.map(child => `
            <div style="padding-left: var(--wa-space-l);">
              ${legendRow(child.color, child.name, typeof child.stripePosition === 'number' ? formatSlotLabel(child.stripePosition) : 'dot')}
            </div>
          `).join('')}
        </div>`;
    }).join('');
  }
}
