/**
 * Shared utility functions.
 */

/**
 * Get the "logical" deck count: standalone decks + split groups (each group = 1 deck).
 * Used for the 32-deck cap and header display.
 */
export function getLogicalDeckCount(prism) {
  const standalone = prism.decks.filter(d => !d.splitGroupId).length;
  const groups = (prism.splitGroups || []).length;
  return standalone + groups;
}

export function debounce(fn, ms = 150) {
  let t;
  return function(...args) { const ctx = this; clearTimeout(t); t = setTimeout(() => fn.apply(ctx, args), ms); };
}

// Slots per side (Side A = 1-24, Side B = 25-48).
const SLOTS_PER_SIDE = 24;
// Anchor marker every Nth slot within each side.
const STRIPE_POSITION_ANCHOR_INTERVAL = 5;

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
  if (!Number.isFinite(position) || position < 1 || position > SLOTS_PER_SIDE * 2) return null;
  const sideRelative = position > SLOTS_PER_SIDE ? position - SLOTS_PER_SIDE : position;
  return sideRelative % STRIPE_POSITION_ANCHOR_INTERVAL === 0 ? String(sideRelative) : null;
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
