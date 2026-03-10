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

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
