/**
 * Overlap matrix and what-if analysis.
 */

import { state } from '../core/state.js';
import { escapeHtml } from '../core/utils.js';
import { processCards, calculateOverlap, getColorName } from '../modules/processor.js';

// ============================================================================
// Overlap Matrix
// ============================================================================

export function renderOverlapMatrix() {
  if (!state.elements.overlapMatrixContainer || !state.elements.overlapMatrix) return;

  // Need at least 2 decks for comparison
  if (state.currentPrism.decks.length < 2) {
    state.elements.overlapMatrixContainer.style.display = 'none';
    return;
  }

  state.elements.overlapMatrixContainer.style.display = '';

  const overlap = calculateOverlap(state.currentPrism);
  const decks = [...state.currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  // Build lookup map for pairwise overlap counts
  const overlapMap = {};
  for (const pair of overlap.pairwiseOverlap) {
    const key1 = `${pair.deck1}|${pair.deck2}`;
    const key2 = `${pair.deck2}|${pair.deck1}`;
    overlapMap[key1] = pair.overlapCount;
    overlapMap[key2] = pair.overlapCount;
  }

  // Find max overlap for color scaling
  const maxOverlap = Math.max(...overlap.pairwiseOverlap.map(p => p.overlapCount), 1);

  // Truncate deck names for column headers
  const truncate = (name, len = 12) => name.length > len ? name.slice(0, len) + '…' : name;

  // Build the table
  let html = `
    <table class="overlap-matrix-table">
      <thead>
        <tr>
          <th></th>
          ${decks.map(d => `
            <th title="${escapeHtml(d.name)}">
              <div class="overlap-header">
                <div class="deck-color-dot" style="background: ${d.color};"></div>
                <span>${escapeHtml(truncate(d.name))}</span>
              </div>
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${decks.map(rowDeck => `
          <tr>
            <th title="${escapeHtml(rowDeck.name)}">
              <div class="overlap-header">
                <div class="deck-color-dot" style="background: ${rowDeck.color};"></div>
                <span>${escapeHtml(truncate(rowDeck.name))}</span>
              </div>
            </th>
            ${decks.map(colDeck => {
              if (rowDeck.id === colDeck.id) {
                return `<td class="overlap-cell overlap-self">
                  <span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle);">${rowDeck.cards.length}</span>
                </td>`;
              }
              const count = overlapMap[`${rowDeck.name}|${colDeck.name}`] || 0;
              const intensity = count / maxOverlap;
              const bg = count > 0
                ? `rgba(var(--wa-color-brand-60-rgb, 99, 102, 241), ${0.1 + intensity * 0.5})`
                : 'transparent';
              return `<td class="overlap-cell${count > 0 ? ' overlap-has-value' : ''}"
                style="background: ${bg};"
                title="${escapeHtml(rowDeck.name)} & ${escapeHtml(colDeck.name)}: ${count} shared cards">
                <span>${count}</span>
              </td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  state.elements.overlapMatrix.innerHTML = html;
}

// ============================================================================
// What-If Analysis
// ============================================================================

export function toggleWhatIfAnalysis(deckId) {
  const container = document.getElementById(`what-if-${deckId}`);
  if (!container) return;

  if (container.style.display === 'none') {
    // Close any other open what-if panels
    document.querySelectorAll('.what-if-container').forEach(el => {
      el.style.display = 'none';
      el.innerHTML = '';
    });
    renderWhatIfAnalysis(deckId, container);
    container.style.display = '';
  } else {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function renderWhatIfAnalysis(deckId, container) {
  const deck = state.currentPrism.decks.find(d => d.id === deckId);
  if (!deck) return;

  const processedCards = processCards(state.currentPrism);

  // Normalize deck card names for lookup
  const deckCardNames = new Set(
    deck.cards.map(c => c.name.toLowerCase())
  );

  // Categorize cards in this deck
  const becomeMarkFree = []; // Cards that go from deckCount=2 to 1 (no longer need marks)
  const removedEntirely = []; // Cards unique to this deck (deckCount=1), lost entirely
  const stillShared = []; // Cards in 3+ decks, still need marks even after removal
  let totalMarksRemoved = 0;

  for (const card of processedCards) {
    if (!deckCardNames.has(card.name.toLowerCase())) continue;

    if (card.logicalDeckCount === 1) {
      removedEntirely.push(card);
    } else if (card.logicalDeckCount === 2) {
      becomeMarkFree.push(card);
      totalMarksRemoved++;
    } else {
      stillShared.push({ ...card, newDeckCount: card.logicalDeckCount - 1 });
      totalMarksRemoved++;
    }
  }

  // Sort by logical deck count descending (most shared first)
  becomeMarkFree.sort((a, b) => b.logicalDeckCount - a.logicalDeckCount || a.name.localeCompare(b.name));
  stillShared.sort((a, b) => b.logicalDeckCount - a.logicalDeckCount || a.name.localeCompare(b.name));

  const showAllMarkFree = becomeMarkFree.length <= 8;
  const showAllStillShared = stillShared.length <= 8;

  container.innerHTML = `
    <div class="what-if-panel">
      <div class="wa-cluster wa-gap-xs wa-align-items-center" style="margin-bottom: var(--wa-space-s);">
        <wa-icon name="flask" style="color: var(--wa-color-brand-text);"></wa-icon>
        <span class="wa-heading-s">What if you remove "${escapeHtml(deck.name)}"?</span>
      </div>

      <div class="what-if-stats">
        <div class="what-if-stat">
          <div class="stat-value" style="color: var(--wa-color-success-text);">${becomeMarkFree.length}</div>
          <div class="stat-label">Cards become CORE</div>
        </div>
        <div class="what-if-stat">
          <div class="stat-value" style="color: var(--wa-color-warning-text);">${stillShared.length}</div>
          <div class="stat-label">Still shared with others</div>
        </div>
        <div class="what-if-stat">
          <div class="stat-value" style="color: var(--wa-color-danger-text);">${removedEntirely.length}</div>
          <div class="stat-label">Unique cards lost</div>
        </div>
        <div class="what-if-stat">
          <div class="stat-value">${totalMarksRemoved}</div>
          <div class="stat-label">Stripe marks removed</div>
        </div>
      </div>

      ${becomeMarkFree.length > 0 ? `
        <div class="wa-stack wa-gap-xs" style="margin-bottom: var(--wa-space-m);">
          <span class="wa-caption-m" style="color: var(--wa-color-success-text);">
            <wa-icon name="circle-check" style="font-size: 0.9em;"></wa-icon>
            Cards that would become CORE (was in 2 decks, would drop to 1):
          </span>
          <ul class="what-if-card-list">
            ${becomeMarkFree.slice(0, showAllMarkFree ? undefined : 5).map(card => `
              <li>${escapeHtml(card.name)} <span style="color: var(--wa-color-neutral-text-subtle);">— was in ${card.logicalDeckCount} decks</span></li>
            `).join('')}
            ${!showAllMarkFree ? `<li style="color: var(--wa-color-neutral-text-subtle);">…and ${becomeMarkFree.length - 5} more</li>` : ''}
          </ul>
        </div>
      ` : ''}

      ${stillShared.length > 0 ? `
        <div class="wa-stack wa-gap-xs">
          <span class="wa-caption-m" style="color: var(--wa-color-warning-text);">
            <wa-icon name="triangle-exclamation" style="font-size: 0.9em;"></wa-icon>
            Cards still needing marks (shared with other decks):
          </span>
          <ul class="what-if-card-list">
            ${stillShared.slice(0, showAllStillShared ? undefined : 5).map(card => `
              <li>${escapeHtml(card.name)} <span style="color: var(--wa-color-neutral-text-subtle);">— ${card.logicalDeckCount} decks → ${card.newDeckCount}</span></li>
            `).join('')}
            ${!showAllStillShared ? `<li style="color: var(--wa-color-neutral-text-subtle);">…and ${stillShared.length - 5} more</li>` : ''}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}
