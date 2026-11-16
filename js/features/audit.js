/**
 * Audit (#457): a second pass over the rows the player ticked Done, checking
 * each painted sleeve against its marks. Matches or Wrong per row, then a list
 * of the wrong rows with their legend so the player can fix the paint.
 *
 * The verdicts live on this device only, under `prism_audit_<prismId>`, keyed
 * by the same row keys as markedCards (plain name, `|#b|` batch key, pass key
 * `name|deck`). Nothing here writes markedCards, tombstones, prism_data or any
 * sync payload: it never calls setCardMarked, setCardsMarked,
 * recordUnmarkedCards or savePrism. Storage failures are swallowed, so the
 * audit still runs and lists its wrong rows, it just does not remember them.
 */

import { state } from '../core/state.js';
import { showError } from '../core/notifications.js';
import { escapeHtml } from '../core/utils.js';
import { openScryMode, getScryCardKey, scryLegend } from './scry-mode.js';

export const auditStorageKey = (prismId) => `prism_audit_${prismId}`;

/** Stored verdicts for a PRISM: `{ [rowKey]: 'match' | 'wrong' }`. */
export function loadAudit(prismId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(auditStorageKey(prismId)));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAudit(prismId, verdicts) {
  try {
    localStorage.setItem(auditStorageKey(prismId), JSON.stringify(verdicts));
  } catch {
    // Storage full or blocked: the run keeps its verdicts in memory.
  }
}

/** The shown rows the player ticked Done: what the audit walks. */
export function auditRows(view, markedCards) {
  const marked = new Set(markedCards || []);
  return (view || []).filter((row) => !row.isRemoved && marked.has(getScryCardKey(row)));
}

/** Audited rows whose verdict is Wrong, with their legend, in walk order. */
export function wrongRows(rows, verdicts) {
  return rows
    .filter((row) => verdicts[getScryCardKey(row)] === 'wrong')
    .map((row) => ({
      key: getScryCardKey(row),
      name: row.isPassRow ? row.displayName : row.name,
      copies: row.copyCount || row.totalQuantity || 1,
      legend: scryLegend(row.stripes),
    }));
}

function endHtml(wrong) {
  if (!wrong.length) {
    return `<div class="audit-end wa-stack wa-gap-m wa-align-items-center">
      <wa-icon name="check-circle" class="audit-end-icon"></wa-icon>
      <p class="wa-heading-l">Every mark matches</p>
    </div>`;
  }
  const items = wrong.map((w) => {
    const legend = w.legend
      .map((m) => `<li><span class="stripe-detail-swatch${m.isDot ? ' stripe-detail-swatch-dot' : ''}" style="background-color:${escapeHtml(m.color)};"></span><span>${escapeHtml(m.text)}</span></li>`)
      .join('');
    const copies = w.copies > 1 ? `, ${w.copies} copies` : '';
    return `<li class="audit-wrong"><p class="audit-wrong-name">${escapeHtml(w.name)}${copies}</p><ul class="stripe-detail">${legend}</ul></li>`;
  }).join('');
  return `<div class="audit-end wa-stack wa-gap-m">
    <p class="wa-heading-l">${wrong.length} ${wrong.length === 1 ? 'row' : 'rows'} to fix</p>
    <p class="wa-caption-m">Repaint these sleeves to match the marks below. Your Done ticks stay as they are.</p>
    <ul class="audit-wrong-list wa-stack wa-gap-m">${items}</ul>
  </div>`;
}

/**
 * openScryMode options for an audit of `rows`. Each verdict goes into the
 * in-memory map first, then to device storage.
 */
export function auditOptions(prismId, rows) {
  const verdicts = loadAudit(prismId);
  const record = (verdict) => (key) => {
    verdicts[key] = verdict;
    saveAudit(prismId, verdicts);
  };
  return {
    rows,
    title: 'Audit',
    skipLabel: 'Wrong',
    doneLabel: 'Matches',
    onDone: record('match'),
    onSkip: record('wrong'),
    skipAnswers: true,
    endLabel: 'Audit finished',
    renderEnd: (el) => {
      el.innerHTML = endHtml(wrongRows(rows, verdicts));
    },
  };
}

export function startAudit() {
  const prism = state.currentPrism;
  if (!prism) return;
  const rows = auditRows(state.resultsView, prism.markedCards);
  if (!rows.length) {
    showError('No shown row is marked done. Tick some rows done, or change your filters, to audit them.');
    return;
  }
  document.getElementById('marking-sheet')?.removeAttribute('open'); // phone: the tools sheet would sit under the dialog
  openScryMode(auditOptions(prism.id, rows));
}

export function setupAudit() {
  const btn = document.getElementById('btn-audit');
  if (!btn) return;
  btn.addEventListener('click', startAudit);
  // Marks to Clear rows have no Done tick, so the button hides there, like Start marking.
  const filter = state.elements?.resultsFilter;
  filter?.addEventListener('change', () => {
    btn.style.display = filter.value === 'removed' ? 'none' : '';
  });
}
