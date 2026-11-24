/**
 * Bulk marks on the Mark sleeves tab (#454): "Mark all shown as done" and
 * "Clear marks on all shown". Both act on exactly the checkbox rows the
 * current view, filters and search leave (`shownMarkRows`), flip only the rows
 * whose tick differs, and write through `setCardsMarked`, the same code the
 * row checkbox uses, so keys, `markTimes` and `markedCardsUpdatedAt` match a
 * row-by-row pass with one save and one render.
 */

import { state } from '../core/state.js';
import { setCardsMarked } from './deck-list.js';
import { renderResults, shownMarkRows } from './results.js';
import { showSuccess } from '../core/notifications.js';

const rows = (n) => `${n} ${n === 1 ? 'row' : 'rows'}`;

/**
 * Shown row keys whose tick a bulk action would flip.
 * @param {boolean} marked - true for Mark all shown, false for Clear
 * @returns {{ keys: string[], collapsed: number }}
 */
export function bulkMarkTargets(marked) {
  const markedSet = new Set(state.currentPrism?.markedCards || []);
  const { keys, collapsed } = shownMarkRows();
  return { keys: keys.filter((k) => markedSet.has(k) !== marked), collapsed };
}

/**
 * Mark or clear the given row keys with one save and one render. Keys whose
 * tick already matches are dropped, so a key never gets a second tombstone.
 * @returns {number} rows changed
 */
export function applyBulkMark(keys, marked) {
  const markedSet = new Set(state.currentPrism?.markedCards || []);
  const todo = keys.filter((k) => markedSet.has(k) !== marked);
  if (!todo.length) return 0;
  setCardsMarked(todo, marked);
  renderResults({ preserveRows: true });
  return todo.length;
}

const collapsedNote = (n) =>
  n ? ` ${n === 1 ? 'One card' : `${n} cards`} with different markings stayed as is. Expand a card to include its batches.` : '';

export function setupBulkMark() {
  const dropdown = document.getElementById('bulk-mark-dropdown');
  const dialog = document.getElementById('clear-shown-dialog');
  const countEl = document.getElementById('clear-shown-count');
  if (!dropdown || !dialog) return;

  let pendingClear = [];

  dropdown.addEventListener('wa-select', (e) => {
    const id = e.detail?.item?.id;
    if (id === 'btn-mark-shown') {
      const { keys, collapsed } = bulkMarkTargets(true);
      const n = applyBulkMark(keys, true);
      showSuccess(`${n ? `Marked ${rows(n)} done.` : 'Every shown row is already done.'}${collapsedNote(collapsed)}`);
    } else if (id === 'btn-clear-shown') {
      const { keys, collapsed } = bulkMarkTargets(false);
      if (!keys.length) {
        showSuccess(`No shown row is marked done.${collapsedNote(collapsed)}`);
        return;
      }
      // The dialog clears the rows it counted, not whatever is shown at confirm.
      pendingClear = keys;
      if (countEl) countEl.textContent = rows(keys.length);
      dialog.setAttribute('open', '');
    }
  });

  document.getElementById('btn-cancel-clear-shown')?.addEventListener('click', () => {
    dialog.removeAttribute('open');
  });
  document.getElementById('btn-confirm-clear-shown')?.addEventListener('click', () => {
    dialog.removeAttribute('open');
    const n = applyBulkMark(pendingClear, false);
    pendingClear = [];
    showSuccess(`Cleared the Done tick on ${rows(n)}.`);
  });

  // Marks to Clear rows have no Done tick, so the menu hides there, like Start marking.
  const filter = state.elements?.resultsFilter;
  filter?.addEventListener('change', () => {
    dropdown.style.display = filter.value === 'removed' ? 'none' : '';
  });
}
