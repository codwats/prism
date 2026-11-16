/**
 * SCRY-Mode: full-screen one-card-at-a-time marking session.
 */

import { state } from '../core/state.js';
import { showError } from '../core/notifications.js';
import { buildCardWithStripes, createLoadingElement, createErrorElement } from '../modules/card-preview.js';
import { prefetchCards } from '../modules/scryfall.js';
import { setCardMarked } from './deck-list.js';
import { renderResults, updateMarkedProgress } from './results.js';
import { getColorName, formatSlotLabel } from '../modules/processor.js';
import { escapeHtml } from '../core/utils.js';

let scrySnapshot = [];
let scryIndex = 0;
// Step 9 (#457) swaps these through openScryMode options for the audit pass.
const DEFAULT_OPTS = {
  skipLabel: 'Skip',
  doneLabel: 'Done',
  title: 'SCRY-Mode',
  onDone: (key) => {
    setCardMarked(key, true);
    updateMarkedProgress();
  },
  onSkip: null,
};
let scryOpts = DEFAULT_OPTS;

/** One legend line per rendered mark: color name, deck, slot (same as Mark sleeves). */
export function scryLegend(stripes) {
  return (stripes || [])
    .filter((s) => s.markType !== 'membership')
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      color: s.color,
      isDot: s.markType === 'dot',
      text: `${getColorName(s.color)}${s.markType === 'dot' ? ' dot' : ''}, ${s.deckName}, ${formatSlotLabel(s.position)}`,
    }));
}

export function getScryCardKey(card) {
  if (card.batchKey) return card.batchKey; // one screen per batch (#149/#151)
  return card.isPassRow ? `${card.displayName}|${card.deckName}` : card.name;
}

function computeScale() {
  // Reserve ~160px for progress line + footer buttons + dialog chrome.
  // 0.85 factor prevents overflow inside WA dialog's own padding on mobile.
  // Phone stacks the legend under the card, so it reserves more height.
  const availH = window.innerHeight - (window.innerWidth < 768 ? 360 : 160);
  const availW = window.innerWidth - 48;
  const scaleH = availH / 340;
  const scaleW = availW / 244;
  return Math.min(2.0, Math.max(0.8, Math.min(scaleH, scaleW))) * 0.85;
}

function makeScaledWrapper(scale) {
  const scaledW = Math.round(244 * scale);
  const scaledH = Math.round(340 * scale);
  const outer = document.createElement('div');
  outer.style.cssText = `width:${scaledW}px;height:${scaledH}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
  const inner = document.createElement('div');
  inner.style.cssText = `transform:scale(${scale});transform-origin:center;flex-shrink:0;`;
  outer.appendChild(inner);
  return { outer, inner };
}

async function renderCurrentScryCard() {
  const { scryProgress, scryContent, btnScryDone, btnScrySkip } = state.elements;
  if (!scryProgress || !scryContent) return;

  if (scrySnapshot.length === 0) return;

  // Re-enable buttons (may have been disabled on completion)
  if (btnScryDone) btnScryDone.removeAttribute('disabled');
  if (btnScrySkip) btnScrySkip.removeAttribute('disabled');

  if (scryIndex >= scrySnapshot.length) {
    showCompletionState();
    return;
  }

  const card = scrySnapshot[scryIndex];
  const displayName = card.isPassRow ? card.displayName : card.name;
  // Each screen states its quantity — "mark 2 copies" — rather than implying
  // one copy per card (#149). Pass rows and batch screens both carry one.
  const copies = card.copyCount || card.totalQuantity || 1;
  const copiesNote = copies > 1 ? ` — mark ${copies} copies` : '';
  scryProgress.textContent = `${scryIndex + 1} of ${scrySnapshot.length}: ${displayName}${copiesNote}`;
  const bar = state.elements.scryBar;
  if (bar) bar.setAttribute('value', String(Math.round((scryIndex / scrySnapshot.length) * 100)));

  const scale = computeScale();
  scryContent.innerHTML = '';
  const legend = scryLegend(card.stripes)
    .map((m) => `<li><span class="stripe-detail-swatch${m.isDot ? ' stripe-detail-swatch-dot' : ''}" style="background-color:${escapeHtml(m.color)};"></span><span>${escapeHtml(m.text)}</span></li>`)
    .join('');
  const copiesLine = copies > 1 ? `<p class="scry-copies">Mark ${copies} copies</p>` : '';
  const side = document.createElement('div');
  side.className = 'scry-legend';
  side.innerHTML = `${copiesLine}<ul class="stripe-detail">${legend}</ul>`;

  // Show loading state
  const { outer: loadOuter, inner: loadInner } = makeScaledWrapper(scale);
  loadInner.appendChild(createLoadingElement());
  scryContent.appendChild(loadOuter);

  // Stale-check token
  const capturedIndex = scryIndex;

  try {
    const stripes = card.stripes || [];
    const el = await buildCardWithStripes(displayName, stripes);

    if (scryIndex !== capturedIndex) return;

    scryContent.innerHTML = '';
    const { outer, inner } = makeScaledWrapper(scale);
    inner.appendChild(el);
    scryContent.append(outer, side);
  } catch (err) {
    console.warn(`SCRY: failed to load card image for "${displayName}":`, err);
    if (scryIndex !== capturedIndex) return;

    scryContent.innerHTML = '';
    const { outer, inner } = makeScaledWrapper(scale);
    inner.appendChild(createErrorElement('Image not available'));
    scryContent.append(outer, side);
  }

  // Prefetch next few cards so advance is snappy
  const nextNames = scrySnapshot
    .slice(scryIndex + 1, scryIndex + 4)
    .map(c => c.isPassRow ? c.displayName : c.name)
    .filter(Boolean);
  if (nextNames.length > 0) prefetchCards(nextNames).catch(() => {});
}

function showCompletionState() {
  const { scryProgress, scryContent, btnScryDone, btnScrySkip } = state.elements;
  if (scryProgress) scryProgress.textContent = 'All cards reviewed';
  if (scryContent) {
    scryContent.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wa-stack wa-gap-m wa-align-items-center';
    wrap.style.padding = 'var(--wa-space-2xl)';

    const icon = document.createElement('wa-icon');
    icon.setAttribute('name', 'check-circle');
    icon.style.cssText = 'font-size:4rem;color:var(--wa-color-success-fill);';

    const msg = document.createElement('p');
    msg.className = 'wa-heading-m';
    msg.textContent = 'All cards reviewed';

    wrap.appendChild(icon);
    wrap.appendChild(msg);
    scryContent.appendChild(wrap);
  }
  if (btnScryDone) btnScryDone.setAttribute('disabled', '');
  if (btnScrySkip) btnScrySkip.setAttribute('disabled', '');
}

function advance() {
  scryIndex++;
  renderCurrentScryCard();
}

function handleScryDone() {
  if (scryIndex >= scrySnapshot.length) return;
  const card = scrySnapshot[scryIndex];
  scryOpts.onDone(getScryCardKey(card), card);
  advance();
}

function handleScrySkip() {
  if (scryIndex >= scrySnapshot.length) return;
  scryOpts.onSkip?.(getScryCardKey(scrySnapshot[scryIndex]), scrySnapshot[scryIndex]);
  advance();
}

function handleScryKeydown(e) {
  const dialog = state.elements.scryDialog;
  if (!dialog || !dialog.hasAttribute('open')) return;

  switch (e.key) {
    case 'ArrowRight':
    case 's':
      e.preventDefault();
      handleScrySkip();
      break;
    case 'Enter':
    case 'd':
      e.preventDefault();
      handleScryDone();
      break;
  }
}

/**
 * @param {Object} [opts] Overrides for DEFAULT_OPTS: skipLabel, doneLabel, title,
 *   onDone(key, card), onSkip(key, card). The audit pass (#457) passes its own.
 *   Called from a click listener, so a non-plain argument (the event) is ignored.
 */
export function openScryMode(opts) {
  scryOpts = { ...DEFAULT_OPTS, ...(opts && !(opts instanceof Event) ? opts : {}) };
  const { scryDialog, btnScryDone, btnScrySkip } = state.elements;
  if (btnScryDone) btnScryDone.textContent = scryOpts.doneLabel;
  if (btnScrySkip) btnScrySkip.textContent = scryOpts.skipLabel;
  scryDialog?.setAttribute('label', scryOpts.title);

  const view = state.resultsView || [];
  const filtered = view.filter(c => !c.isRemoved);

  if (filtered.length === 0) {
    showError('No cards to scry in the current view.');
    return;
  }

  scrySnapshot = [...filtered];
  scryIndex = 0;

  if (state.elements.scryDialog) {
    state.elements.scryDialog.setAttribute('open', '');
  }

  renderCurrentScryCard();
}

export function setupScryMode() {
  const { btnScryDone, btnScrySkip, scryDialog } = state.elements;

  if (btnScryDone) btnScryDone.addEventListener('click', handleScryDone);
  if (btnScrySkip) btnScrySkip.addEventListener('click', handleScrySkip);

  if (scryDialog) {
    // Re-render results once when dialog closes to sync marked rows
    scryDialog.addEventListener('wa-hide', () => {
      renderResults({ preserveRows: true });
    });
  }

  document.addEventListener('keydown', handleScryKeydown);
}
