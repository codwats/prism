/**
 * Deck form: add deck submission, color swatches, form reset, parse errors.
 */

import { state } from "../core/state.js";
import { showError, showSuccess } from "../core/notifications.js";
import { logToSupabase } from "../modules/supabase-client.js";
import { escapeHtml, debugLog } from "../core/utils.js";
import { parseDecklist, validateDecklist, rewriteDecklistCommanders } from "../modules/parser.js";
import {
  createDeck,
  commanderNames,
  getNextStripePosition,
  getNextColor,
  isColorUsed,
  addDeckToPrism,
  getUsedPositions,
  MAX_STRIPE_SLOTS,
  DEFAULT_COLORS,
  getColorName,
} from "../modules/processor.js";
import { savePrism, recordUnmarkedCards } from "../modules/storage.js";
import { canonicalizeCards } from "../modules/scryfall.js";
import {
  unmarkSharedCards,
  autoClearRemovedCards,
} from "./deck-list.js";
import { resetFileInput } from "./deck-import.js";
import { renderAll } from "./init.js";

// ============================================================================
// Color Swatches
// ============================================================================

export function initColorSwatches() {
  if (!state.elements.colorSwatches) return;

  state.elements.colorSwatches.innerHTML = "";

  DEFAULT_COLORS.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    swatch.style.backgroundColor = color;
    swatch.title = getColorName(color);
    swatch.dataset.color = color;

    swatch.addEventListener("click", () => {
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

  state.elements.colorSwatches
    .querySelectorAll(".color-swatch")
    .forEach((swatch) => {
      const isSelected = swatch.dataset.color.toUpperCase() === selectedColor;
      swatch.classList.toggle("selected", isSelected);
    });
}

// ============================================================================
// Commander field <-> decklist text sync (#147)
// ============================================================================
// The parsed decklist text is the sole commander authority; the fields are a
// text-authoring shortcut kept in sync both ways. All reconciliation happens
// visibly in the textarea.

// Web Awesome inputs may hold their value in shadow DOM before upgrade
function getInputValue(element) {
  if (!element) return "";
  const shadowInput = element.shadowRoot?.querySelector("input, textarea");
  if (shadowInput && shadowInput.value) {
    return String(shadowInput.value).trim();
  }
  if (
    element.value !== undefined &&
    element.value !== null &&
    element.value !== ""
  ) {
    return String(element.value).trim();
  }
  return "";
}

export function addCommanderRefs() {
  return {
    textarea: state.elements.deckList,
    field1: state.elements.deckCommander,
    field2: state.elements.deckCommander2,
    toggle: state.elements.deckTwoCommanders,
  };
}

export function editCommanderRefs() {
  return {
    textarea: state.elements.editDeckList,
    field1: state.elements.editDeckCommander,
    field2: state.elements.editDeckCommander2,
    toggle: state.elements.editDeckTwoCommanders,
  };
}

/**
 * text → fields: repopulate the commander fields from the parsed decklist.
 * Toggle auto-enables at ≥2 flags; >2 flags disables the fields (edit the
 * Commander section directly). With 0 flags the typed field-1 value is kept —
 * paste-99-then-type is the dominant flow and the save-entry rewrite will
 * carry it into the text.
 */
export function syncCommanderFieldsFromText(refs) {
  if (!refs.textarea || !refs.field1) return;
  const names = parseDecklist(refs.textarea.value || "")
    .cards.filter((c) => c.isCommander)
    .map((c) => c.name);

  const many = names.length > 2;
  if (names.length > 0) refs.field1.value = names[0];
  if (refs.field2) {
    refs.field2.value = names[1] || "";
    refs.field2.hidden = names.length < 2;
  }
  if (refs.toggle) {
    refs.toggle.checked = names.length >= 2;
    refs.toggle.disabled = many;
  }
  refs.field1.disabled = many;
  if (refs.field2) refs.field2.disabled = many;
  refs.field1.hint = many
    ? `${names.length} commanders detected — edit the Commander section directly`
    : "";
}

/**
 * fields → text: rewrite the decklist's Commander section to exactly the
 * field names. Runs on field change and once more at save entry (idempotent)
 * so a value typed without blurring is not lost. No-op while the fields are
 * disabled (>2 flags: the text is being edited directly).
 */
export function applyCommanderFieldsToText(refs) {
  if (!refs.textarea || !refs.field1 || refs.field1.disabled) return;
  const names = [getInputValue(refs.field1)];
  if (refs.toggle?.checked) names.push(getInputValue(refs.field2));
  const wanted = names.filter(Boolean);
  if (wanted.length === 0) return; // nothing to author; save validation catches empty
  refs.textarea.value = rewriteDecklistCommanders(refs.textarea.value || "", wanted);
}

/** Toggle switched: show the second field, or collapse the section to field 1. */
export function handleTwoCommandersToggle(refs) {
  if (!refs.toggle || !refs.field2) return;
  if (refs.toggle.checked) {
    refs.field2.hidden = false;
  } else {
    refs.field2.value = "";
    refs.field2.hidden = true;
    applyCommanderFieldsToText(refs);
  }
}

// ============================================================================
// Deck Submit
// ============================================================================

let _submitting = false;

export async function handleDeckSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (_submitting) return;
  _submitting = true;

  // Spinner while card names are canonicalized via Scryfall — the await below
  // is network-bound and can exceed 300ms with no other feedback.
  const submitBtn = state.elements.btnAddDeck;
  submitBtn?.setAttribute("loading", "");

  try {
    debugLog("PRISM: Form submitted");

    // Check slot limit — a new standalone deck consumes one of the 48 physical
    // stripe slots (dot variants don't own a slot, so they're excluded here).
    if (getUsedPositions(state.currentPrism).size >= MAX_STRIPE_SLOTS) {
      showError(`All ${MAX_STRIPE_SLOTS} stripe slots are full. Free a slot or start a new PRISM.`);
      return;
    }

    // Fields → text once at save entry (idempotent) so a commander typed
    // without blurring still lands in the Commander section (#147)
    applyCommanderFieldsToText(addCommanderRefs());

    const name = getInputValue(state.elements.deckName);
    const commander = getInputValue(state.elements.deckCommander);
    const bracket = state.elements.deckBracket?.value || "2";
    const color = state.elements.deckColor?.value || "#FF0000";
    const decklistText = getInputValue(state.elements.deckList);

    debugLog("PRISM: Form values:", {
      name,
      commander,
      bracket,
      color,
      decklistLength: decklistText.length,
    });

    // Basic validation
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

    // Parse decklist — the text is the sole commander authority
    const parseResult = parseDecklist(decklistText);
    const validation = validateDecklist(parseResult);

    debugLog("PRISM: Parse result:", {
      cards: parseResult.cards.length,
      errors: parseResult.errors.length,
    });

    // Show parse errors if any
    if (parseResult.errors.length > 0) {
      showParseErrors(parseResult.errors);
    } else {
      hideParseErrors();
    }

    if (!validation.isValid) {
      showError(validation.messages.join(" "));
      return;
    }

    // Check for duplicate deck name
    const existingDeck = state.currentPrism.decks.find(
      (d) => d.name.toLowerCase() === name.toLowerCase(),
    );
    if (existingDeck) {
      showError(`A deck named "${name}" already exists.`);
      return;
    }

    // Canonicalize card names via Scryfall
    try {
      await canonicalizeCards(parseResult.cards);
    } catch (err) {
      console.warn("Card canonicalization failed, using raw names:", err.message);
    }

    // Get card names from the new deck (no processCards call)
    const newCardNames = new Set(
      parseResult.cards.map((c) => c.name.toLowerCase()),
    );

    // Create deck
    const deck = createDeck({
      name,
      bracket,
      color,
      stripePosition: getNextStripePosition(state.currentPrism),
      cards: parseResult.cards,
    });

    // Add to PRISM
    state.currentPrism = addDeckToPrism(state.currentPrism, deck);

    // Unmark marked cards that are now shared with this deck
    const unmarkedKeys = unmarkSharedCards(newCardNames);
    const unmarkedCount = unmarkedKeys.length;
    if (unmarkedKeys.length > 0) {
      recordUnmarkedCards(state.currentPrism.id, unmarkedKeys);
    }

    // Auto-clear any removed cards that are now back
    const autoClearedCount = autoClearRemovedCards(parseResult.cards);

    savePrism(state.currentPrism);

    debugLog("PRISM: Deck added:", deck.name);
    logToSupabase('info', 'deck_added', { name: deck.name, commander: commanderNames(deck).join(' / '), bracket: deck.bracket, cardCount: parseResult.uniqueCards });

    // Reset form and re-render
    resetDeckForm();
    renderAll();

    // Show success feedback
    let message = `Added "${name}" with ${parseResult.uniqueCards} cards.`;
    if (unmarkedCount > 0) {
      message += ` ${unmarkedCount} card${unmarkedCount > 1 ? "s" : ""} unchecked (new stripes added).`;
    }
    if (autoClearedCount > 0) {
      message += ` ${autoClearedCount} card${autoClearedCount > 1 ? "s" : ""} auto-cleared from removed list.`;
    }
    showSuccess(message);
  } finally {
    _submitting = false;
    submitBtn?.removeAttribute("loading");
  }
}

// ============================================================================
// Form Reset & Warnings
// ============================================================================

export function resetDeckForm() {
  if (state.elements.deckForm) state.elements.deckForm.reset();
  if (state.elements.deckName) state.elements.deckName.value = "";
  if (state.elements.deckCommander) {
    state.elements.deckCommander.value = "";
    state.elements.deckCommander.disabled = false;
    state.elements.deckCommander.hint = "";
  }
  if (state.elements.deckCommander2) {
    state.elements.deckCommander2.value = "";
    state.elements.deckCommander2.hidden = true;
    state.elements.deckCommander2.disabled = false;
  }
  if (state.elements.deckTwoCommanders) {
    state.elements.deckTwoCommanders.checked = false;
    state.elements.deckTwoCommanders.disabled = false;
  }
  if (state.elements.deckBracket) state.elements.deckBracket.value = "2";
  if (state.elements.deckList) state.elements.deckList.value = "";
  resetFileInput(state.elements.deckFileInput);

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
  const span = state.elements.colorWarning.querySelector("span");
  if (span) span.textContent = message;
  state.elements.colorWarning.style.display = "flex";
}

export function hideColorWarning() {
  if (state.elements.colorWarning) {
    state.elements.colorWarning.style.display = "none";
  }
}

export function showParseErrors(errors) {
  if (!state.elements.parseErrors) return;
  state.elements.parseErrors.style.display = "";
  state.elements.parseErrors.innerHTML = `
    <wa-callout variant="warning">
      <strong>Some lines couldn't be parsed:</strong>
      <ul style="margin: 0.5em 0 0 1.5em; padding: 0;">
        ${errors
          .slice(0, 5)
          .map((e) => `<li>Line ${e.lineNumber}: ${escapeHtml(e.content)}</li>`)
          .join("")}
        ${errors.length > 5 ? `<li>...and ${errors.length - 5} more</li>` : ""}
      </ul>
    </wa-callout>
  `;
}

export function hideParseErrors() {
  if (state.elements.parseErrors) {
    state.elements.parseErrors.style.display = "none";
    state.elements.parseErrors.innerHTML = "";
  }
}

export function handlePrismNameChange(e) {
  const value = e.target.value || "Untitled PRISM";
  state.currentPrism.name = value;
  state.currentPrism.updatedAt = new Date().toISOString();
  savePrism(state.currentPrism);
}
