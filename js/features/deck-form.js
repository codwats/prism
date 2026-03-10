/**
 * Deck form: add deck submission, color swatches, form reset, parse errors.
 */

import { state } from '../core/state.js';
import { showError, showSuccess } from '../core/notifications.js';
import { escapeHtml, getLogicalDeckCount } from '../core/utils.js';
import { parseDecklist, validateDecklist } from '../modules/parser.js';
import { createDeck, getNextStripePosition, getNextColor, isColorUsed, addDeckToPrism, DEFAULT_COLORS, getColorName } from '../modules/processor.js';
import { savePrism } from '../modules/storage.js';
import { canonicalizeCards } from '../modules/scryfall.js';
import { getStripeCountMap, unmarkCardsWithNewStripes, autoClearRemovedCards } from './deck-list.js';
import { renderAll } from './init.js';

// ============================================================================
// Color Swatches
// ============================================================================

export function initColorSwatches() {
  if (!state.elements.colorSwatches) return;

  state.elements.colorSwatches.innerHTML = '';

  DEFAULT_COLORS.forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = getColorName(color);
    swatch.dataset.color = color;

    swatch.addEventListener('click', () => {
      state.elements.deckColor.value = color;
      updateColorSwatchSelection();
      checkColorWarning();
    });

    state.elements.colorSwatches.appendChild(swatch);
  });

  // Set initial color
  const nextColor = getNextColor(state.currentPrism);
  state.elements.deckColor.value = nextColor;
  updateColorSwatchSelection();
}

export function updateColorSwatchSelection() {
  const selectedColor = state.elements.deckColor.value.toUpperCase();

  state.elements.colorSwatches.querySelectorAll('.color-swatch').forEach(swatch => {
    const isSelected = swatch.dataset.color.toUpperCase() === selectedColor;
    swatch.classList.toggle('selected', isSelected);
  });
}

// ============================================================================
// Deck Submit
// ============================================================================

export async function handleDeckSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  console.log('PRISM: Form submitted');

  // Check deck limit (split groups count as 1 logical deck)
  if (getLogicalDeckCount(state.currentPrism) >= 32) {
    showError('Maximum 32 decks per PRISM reached.');
    return;
  }

  // Get form values - for web components, access the native input in shadow DOM
  const getInputValue = (element) => {
    if (!element) return '';
    const shadowInput = element.shadowRoot?.querySelector('input, textarea');
    if (shadowInput && shadowInput.value) {
      return String(shadowInput.value).trim();
    }
    if (element.value !== undefined && element.value !== null && element.value !== '') {
      return String(element.value).trim();
    }
    return '';
  };

  const name = getInputValue(state.elements.deckName);
  const commander = getInputValue(state.elements.deckCommander);
  const bracket = state.elements.deckBracket?.value || '2';
  const color = state.elements.deckColor?.value || '#FF0000';
  const decklistText = getInputValue(state.elements.deckList);

  console.log('PRISM: Form values:', { name, commander, bracket, color, decklistLength: decklistText.length });

  // Basic validation
  if (!name) { showError('Please enter a deck name.'); return; }
  if (!commander) { showError('Please enter a commander name.'); return; }
  if (!decklistText.trim()) { showError('Please paste a decklist.'); return; }

  // Parse decklist
  const parseResult = parseDecklist(decklistText, commander);
  const validation = validateDecklist(parseResult);

  console.log('PRISM: Parse result:', { cards: parseResult.cards.length, errors: parseResult.errors.length });

  // Show parse errors if any
  if (parseResult.errors.length > 0) {
    showParseErrors(parseResult.errors);
  } else {
    hideParseErrors();
  }

  if (!validation.isValid) {
    showError(validation.messages.join(' '));
    return;
  }

  // Check for duplicate deck name
  const existingDeck = state.currentPrism.decks.find(
    d => d.name.toLowerCase() === name.toLowerCase()
  );
  if (existingDeck) {
    showError(`A deck named "${name}" already exists.`);
    return;
  }

  // Canonicalize card names via Scryfall
  try {
    await canonicalizeCards(parseResult.cards);
  } catch (err) {
    console.warn('Card canonicalization failed, using raw names:', err.message);
  }

  // Snapshot stripe counts before adding the deck
  const beforeCounts = getStripeCountMap();

  // Create deck
  const deck = createDeck({
    name,
    commander,
    bracket,
    color,
    stripePosition: getNextStripePosition(state.currentPrism),
    cards: parseResult.cards
  });

  // Add to PRISM
  state.currentPrism = addDeckToPrism(state.currentPrism, deck);

  // Unmark cards that gained new stripes
  const unmarkedCount = unmarkCardsWithNewStripes(beforeCounts);

  // Auto-clear any removed cards that are now back
  const autoClearedCount = autoClearRemovedCards(parseResult.cards);

  savePrism(state.currentPrism);

  console.log('PRISM: Deck added:', deck.name);

  // Reset form and re-render
  resetDeckForm();
  renderAll();

  // Show success feedback
  let message = `Added "${name}" with ${parseResult.uniqueCards} cards.`;
  if (unmarkedCount > 0) {
    message += ` ${unmarkedCount} card${unmarkedCount > 1 ? 's' : ''} unchecked (new stripes added).`;
  }
  if (autoClearedCount > 0) {
    message += ` ${autoClearedCount} card${autoClearedCount > 1 ? 's' : ''} auto-cleared from removed list.`;
  }
  showSuccess(message);
}

// ============================================================================
// Form Reset & Warnings
// ============================================================================

export function resetDeckForm() {
  if (state.elements.deckForm) state.elements.deckForm.reset();
  if (state.elements.deckName) state.elements.deckName.value = '';
  if (state.elements.deckCommander) state.elements.deckCommander.value = '';
  if (state.elements.deckBracket) state.elements.deckBracket.value = '2';
  if (state.elements.deckList) state.elements.deckList.value = '';
  if (state.elements.deckFileInput) state.elements.deckFileInput.files = [];

  const nextColor = getNextColor(state.currentPrism);
  if (state.elements.deckColor) state.elements.deckColor.value = nextColor;
  updateColorSwatchSelection();

  hideParseErrors();
  hideColorWarning();
}

export function checkColorWarning() {
  const color = state.elements.deckColor?.value;
  if (!color) return;

  const existingDeck = isColorUsed(state.currentPrism, color);
  if (existingDeck) {
    showColorWarning(`This color is already used by "${existingDeck.name}".`);
  } else {
    hideColorWarning();
  }
}

export function showColorWarning(message) {
  if (!state.elements.colorWarning) return;
  const span = state.elements.colorWarning.querySelector('span');
  if (span) span.textContent = message;
  state.elements.colorWarning.style.display = 'flex';
}

export function hideColorWarning() {
  if (state.elements.colorWarning) {
    state.elements.colorWarning.style.display = 'none';
  }
}

export function showParseErrors(errors) {
  if (!state.elements.parseErrors) return;
  state.elements.parseErrors.style.display = '';
  state.elements.parseErrors.innerHTML = `
    <wa-callout variant="warning">
      <strong>Some lines couldn't be parsed:</strong>
      <ul style="margin: 0.5em 0 0 1.5em; padding: 0;">
        ${errors.slice(0, 5).map(e => `<li>Line ${e.lineNumber}: ${escapeHtml(e.content)}</li>`).join('')}
        ${errors.length > 5 ? `<li>...and ${errors.length - 5} more</li>` : ''}
      </ul>
    </wa-callout>
  `;
}

export function hideParseErrors() {
  if (state.elements.parseErrors) {
    state.elements.parseErrors.style.display = 'none';
    state.elements.parseErrors.innerHTML = '';
  }
}

export function handlePrismNameChange(e) {
  const value = e.target.value || 'Untitled PRISM';
  state.currentPrism.name = value;
  state.currentPrism.updatedAt = new Date().toISOString();
  savePrism(state.currentPrism);
}
