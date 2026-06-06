/**
 * SCRY-Mode: full-screen one-card-at-a-time marking session.
 */

import { state } from '../core/state.js';
import { showError } from '../core/notifications.js';
import { buildCardWithStripes, createLoadingElement, createErrorElement } from '../modules/card-preview.js';
import { prefetchCards } from '../modules/scryfall.js';
import { setCardMarked } from './deck-list.js';
import { renderResults, updateMarkedProgress } from './results.js';

let scrySnapshot = [];
let scryIndex = 0;

function getScryCardKey(card) {
  return card.isBasicByDeck ? `${card.displayName}|${card.deckName}` : card.name;
}

function computeScale() {
  // Reserve ~160px for progress line + footer buttons + dialog chrome
  const availH = window.innerHeight - 160;
  const availW = window.innerWidth - 48;
  const scaleH = availH / 340;
  const scaleW = availW / 244;
  return Math.min(2.0, Math.max(0.8, Math.min(scaleH, scaleW)));
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
  const displayName = card.isBasicByDeck ? card.displayName : card.name;
  scryProgress.textContent = `${scryIndex + 1} / ${scrySnapshot.length} — ${displayName}`;

  const scale = computeScale();
  scryContent.innerHTML = '';

  // Show loading state
  const { outer: loadOuter, inner: loadInner } = makeScaledWrapper(scale);
  loadInner.appendChild(createLoadingElement());
  scryContent.appendChild(loadOuter);

  // Stale-check token
  const capturedIndex = scryIndex;

  try {
    const cardName = card.isBasicByDeck ? card.displayName : card.name;
    const stripes = card.stripes || [];
    const el = await buildCardWithStripes(cardName, stripes);

    if (scryIndex !== capturedIndex) return;

    scryContent.innerHTML = '';
    const { outer, inner } = makeScaledWrapper(scale);
    inner.appendChild(el);
    scryContent.appendChild(outer);
  } catch (_err) {
    if (scryIndex !== capturedIndex) return;

    scryContent.innerHTML = '';
    const { outer, inner } = makeScaledWrapper(scale);
    inner.appendChild(createErrorElement('Image not available'));
    scryContent.appendChild(outer);
  }

  // Prefetch next few cards so advance is snappy
  const nextNames = scrySnapshot
    .slice(scryIndex + 1, scryIndex + 4)
    .map(c => c.isBasicByDeck ? c.displayName : c.name)
    .filter(Boolean);
  if (nextNames.length > 0) prefetchCards(nextNames).catch(() => {});
}

function showCompletionState() {
  const { scryProgress, scryContent, btnScryDone, btnScrySkip } = state.elements;
  if (scryProgress) scryProgress.textContent = 'All cards reviewed!';
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
  const cardKey = getScryCardKey(card);
  setCardMarked(cardKey, true);
  updateMarkedProgress();
  advance();
}

function handleScrySkip() {
  if (scryIndex >= scrySnapshot.length) return;
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

export function openScryMode() {
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
      renderResults();
    });
  }

  document.addEventListener('keydown', handleScryKeydown);
}
