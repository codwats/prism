/**
 * Shared utility functions.
 */

/**
 * Get the "logical" deck count: standalone decks + split groups (each group = 1 deck).
 * Used for the header live count. Physical capacity is gated separately on the 48
 * stripe slots (see MAX_STRIPE_SLOTS / getUsedPositions in processor.js).
 */
export function getLogicalDeckCount(prism) {
  const standalone = prism.decks.filter(d => !d.splitGroupId).length;
  const groups = (prism.splitGroups || []).length;
  return standalone + groups;
}

/**
 * Debug logger. No-ops unless localStorage 'PRISM_DEBUG' is set (any truthy value).
 * Keeps developer trace logs out of the production console while leaving them
 * one localStorage flag away. Genuine console.error/warn are left untouched.
 */
export function debugLog(...args) {
  try {
    if (localStorage.getItem('PRISM_DEBUG')) console.log(...args);
  } catch {
    // localStorage unavailable (private mode / blocked) — stay silent.
  }
}

export function debounce(fn, ms = 150) {
  let t;
  return function(...args) { const ctx = this; clearTimeout(t); t = setTimeout(() => fn.apply(ctx, args), ms); };
}

// Slots per side (Side A = 1-24, Side B = 25-48).
const SLOTS_PER_SIDE = 24;
// Anchor marker every Nth slot within each side.
const STRIPE_POSITION_ANCHOR_INTERVAL = 5;
// A card with this many or fewer visible marks is "sparse": every mark gets its
// exact slot number (not just anchors), since a lone stripe has no neighbours to
// count against. "Fewer than 6 marks" per the design decision.
export const STRIPE_SPARSE_MAX = 5;

function isValidPosition(position) {
  return Number.isFinite(position) && position >= 1 && position <= SLOTS_PER_SIDE * 2;
}

/**
 * Side-relative slot number (1-24) for any valid 1-48 position, or null.
 * Side A is 1-24, Side B is 25-48 → both map back to 1-24 on their own edge.
 * @param {number} position - Stripe position 1-48
 * @returns {string|null} Exact label string (e.g. "13") or null
 */
export function slotNumberLabel(position) {
  if (!isValidPosition(position)) return null;
  return String(position > SLOTS_PER_SIDE ? position - SLOTS_PER_SIDE : position);
}

/**
 * Side-relative slot number to overlay at "anchor" positions — every 5th slot
 * within each side (5/10/15/20 on Side A and Side B). Returns null for
 * non-anchor positions. Pure label logic; callers gate on the
 * showStripePositionNumbers preference. Shared by the results table, card
 * preview, and printable guide so all three surfaces stay in parity.
 * @param {number} position - Stripe position 1-48
 * @returns {string|null} Label string (e.g. "10") or null
 */
export function stripePositionLabel(position) {
  if (!isValidPosition(position)) return null;
  const sideRelative = position > SLOTS_PER_SIDE ? position - SLOTS_PER_SIDE : position;
  return sideRelative % STRIPE_POSITION_ANCHOR_INTERVAL === 0 ? String(sideRelative) : null;
}

/**
 * Count a card's visible marks (stripes + dots), excluding invisible
 * 'membership' anchors which only carry deckId for deck-filter matching.
 * @param {Array} stripes - card.stripes
 * @returns {number}
 */
export function countVisibleMarks(stripes) {
  if (!Array.isArray(stripes)) return 0;
  return stripes.reduce((n, s) => (s.markType !== 'membership' ? n + 1 : n), 0);
}

/**
 * Resolve the slot-number label for a stripe given whether the card is sparse.
 * Sparse → exact number on every mark (always-on). Otherwise → anchor label
 * (caller still gates this branch on the showStripePositionNumbers preference).
 * @param {number} position - Stripe position 1-48
 * @param {{ exact: boolean }} opts
 * @returns {string|null}
 */
export function stripeNumberLabel(position, { exact } = {}) {
  return exact ? slotNumberLabel(position) : stripePositionLabel(position);
}

/**
 * Whether a processed card is fully marked ("done").
 * Non-basics are done when their plain name key is in markedCards. Basics can
 * also be marked per logical deck from the Basics-by-Deck view (one row per
 * Side A stripe, key "Name|DeckName"), so a basic counts as done when its
 * plain key is marked OR every one of its per-deck keys is marked.
 * Shared by the Marked progress stat and the undone-list exports so all
 * surfaces agree on what "done" means.
 * @param {Object} card - Processed card ({ name, isBasicLand, stripes })
 * @param {Set<string>} markedSet - markedCards as a Set
 * @returns {boolean}
 */
export function isCardDone(card, markedSet) {
  if (markedSet.has(card.name)) return true;
  if (!card.isBasicLand) return false;
  const sideAKeys = (card.stripes || [])
    .filter(s => s.side === 'a')
    .map(s => `${card.name}|${s.deckName}`);
  return sideAKeys.length > 0 && sideAKeys.every(k => markedSet.has(k));
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
