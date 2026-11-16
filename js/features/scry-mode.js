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

// Search (#478) jumps within these rows; order and membership never change.
let session = createScrySession([]);
// The audit pass (#457, audit.js) swaps these through openScryMode options.
const DEFAULT_OPTS = {
  skipLabel: 'Skip',
  doneLabel: 'Done',
  title: 'SCRY-Mode',
  onDone: (key) => {
    setCardMarked(key, true);
    updateMarkedProgress();
  },
  onSkip: null,
  skipAnswers: false, // true when Skip is an answer too (Audit's Wrong); otherwise a skipped card stays findable
  rows: null, // screens to walk; null walks the shown rows (state.resultsView)
  endLabel: 'All cards reviewed',
  renderEnd: null, // (contentEl) => void, replaces the default end screen
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

/** rows: the screens fixed at Start marking or Audit. acted: indexes already answered. */
export function createScrySession(rows) {
  return { rows, index: 0, acted: new Set(), returnTo: null };
}

const screenName = (row) => (row.isPassRow ? row.displayName : row.name);

/** Unanswered screens whose name contains `query`, labelled so batches and passes can be told apart. */
export function scryMatches(s, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return s.rows.flatMap((row, index) => {
    const name = screenName(row) || '';
    if (s.acted.has(index) || !name.toLowerCase().includes(q)) return [];
    let label = name;
    if (row.isPassRow) label += `, ${row.deckName}`;
    else if (row.batchKey) {
      const decks = (row.stripes || []).filter((m) => m.markType !== 'membership').map((m) => m.deckName);
      label += `, ${row.copyCount} ${row.copyCount === 1 ? 'copy' : 'copies'}, ${decks.join(' + ')}`;
    }
    return [{ index, label }];
  });
}

/** Show screen `i`, remembering where the walk was (only the first jump of a search sets it). */
export function scryJump(s, i) {
  if (s.returnTo === null) s.returnTo = s.index;
  s.index = i;
}

/** Back to where the walk was before searching. */
export function scryClearSearch(s) {
  if (s.returnTo === null) return;
  s.index = s.returnTo;
  s.returnTo = null;
}

/** After Done or Skip: back to the walk if this was a found card, else the next unanswered screen.
 *  answered=false (a plain Skip) leaves the screen searchable and unanswered. */
export function scryAct(s, answered = true) {
  if (answered) s.acted.add(s.index);
  const back = s.returnTo;
  s.returnTo = null;
  if (back !== null && !s.acted.has(back)) {
    s.index = back;
    return;
  }
  let i = (back ?? s.index) + 1;
  while (i < s.rows.length && s.acted.has(i)) i++;
  s.index = i;
}

/**
 * Card scale. availH is the height the dialog really leaves for the card (measured at render);
 * without it, fall back to a fixed reserve for header, progress and footer.
 * Phone portrait stacks the legend under the card, so it gives up ~120px more.
 */
export function computeScale(w = window.innerWidth, h = window.innerHeight, availH = null) {
  const phone = w < 768;
  const height = availH ?? h - (phone ? 360 : 240);
  const fit = Math.min(height / 340, (w - 48) / 244);
  return phone ? Math.min(2.0, Math.max(0.4, fit)) * 0.85 : Math.min(3.0, Math.max(0.4, fit)) * 0.95;
}

/** Height left for the card inside the open dialog body, or null before the dialog has laid out. */
function measureCardHeight() {
  const { scryDialog, scryProgress, scryBar } = state.elements;
  const body = scryDialog?.shadowRoot?.querySelector('[part~="body"]');
  if (!body?.clientHeight || !scryProgress) return null;
  const cs = getComputedStyle(body);
  const inner = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const legend = window.innerWidth < 768 ? 120 : 0;
  return Math.max(0, inner - scryProgress.offsetHeight - (scryBar?.offsetHeight || 0) - 16 - legend);
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

  if (session.rows.length === 0) return;

  // Re-enable buttons (may have been disabled on completion)
  if (btnScryDone) btnScryDone.removeAttribute('disabled');
  if (btnScrySkip) btnScrySkip.removeAttribute('disabled');

  if (session.index >= session.rows.length) {
    showCompletionState();
    return;
  }

  const card = session.rows[session.index];
  const displayName = screenName(card);
  // Each screen states its quantity — "mark 2 copies" — rather than implying
  // one copy per card (#149). Pass rows and batch screens both carry one.
  const copies = card.copyCount || card.totalQuantity || 1;
  const copiesNote = copies > 1 ? `, mark ${copies} copies` : '';
  // A found card shows where the walk is, not the found card's list index.
  const walk = session.returnTo ?? session.index;
  scryProgress.textContent = `${walk + 1} of ${session.rows.length}: ${displayName}${copiesNote}`;
  const bar = state.elements.scryBar;
  if (bar) bar.setAttribute('value', String(Math.round((walk / session.rows.length) * 100)));

  const scale = computeScale(window.innerWidth, window.innerHeight, measureCardHeight());
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
  const capturedIndex = session.index;

  try {
    const stripes = card.stripes || [];
    const el = await buildCardWithStripes(displayName, stripes);

    if (session.index !== capturedIndex) return;

    scryContent.innerHTML = '';
    const { outer, inner } = makeScaledWrapper(scale);
    inner.appendChild(el);
    scryContent.append(outer, side);
  } catch (err) {
    console.warn(`SCRY: failed to load card image for "${displayName}":`, err);
    if (session.index !== capturedIndex) return;

    scryContent.innerHTML = '';
    const { outer, inner } = makeScaledWrapper(scale);
    inner.appendChild(createErrorElement('Image not available'));
    scryContent.append(outer, side);
  }

  // Prefetch next few cards so advance is snappy
  const nextNames = session.rows
    .slice(session.index + 1, session.index + 4)
    .map(screenName)
    .filter(Boolean);
  if (nextNames.length > 0) prefetchCards(nextNames).catch(() => {});
}

function showCompletionState() {
  const { scryProgress, scryContent, btnScryDone, btnScrySkip } = state.elements;
  if (scryProgress) scryProgress.textContent = scryOpts.endLabel;
  state.elements.scryBar?.setAttribute('value', '100');
  if (scryContent && scryOpts.renderEnd) {
    scryContent.innerHTML = '';
    scryOpts.renderEnd(scryContent);
  } else if (scryContent) {
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

/** Done or Skip on the shown screen: call the option handler, then move the walk. */
export function scryAnswer(s, opts, kind) {
  if (s.index >= s.rows.length) return;
  const card = s.rows[s.index];
  const key = getScryCardKey(card);
  if (kind === 'done') opts.onDone(key, card);
  else opts.onSkip?.(key, card);
  scryAct(s, kind === 'done' || !!opts.skipAnswers);
}

function answer(kind) {
  const found = session.returnTo !== null;
  scryAnswer(session, scryOpts, kind);
  if (found) resetSearchField(); // back on the walk, so the search is over
  renderCurrentScryCard();
}

const handleScryDone = () => answer('done');
const handleScrySkip = () => answer('skip');

function resetSearchField() {
  const { scrySearchInput, scrySearchResults } = state.elements;
  if (scrySearchInput) scrySearchInput.value = '';
  if (scrySearchResults) scrySearchResults.hidden = true;
  syncActionsWithSearch();
}

/** While matches are listed over the card, Done and Skip would act on a card the player cannot see. */
function syncActionsWithSearch() {
  const { scrySearchResults, btnScryDone, btnScrySkip } = state.elements;
  const open = scrySearchResults && !scrySearchResults.hidden;
  for (const b of [btnScryDone, btnScrySkip]) {
    if (!b) continue;
    if (open) b.setAttribute('disabled', '');
    else if (session.index < session.rows.length) b.removeAttribute('disabled');
  }
}

function handleSearchInput() {
  const { scrySearchInput, scrySearchResults } = state.elements;
  const query = scrySearchInput.value || '';
  if (!query.trim()) {
    scrySearchResults.hidden = true;
    syncActionsWithSearch();
    if (session.returnTo !== null) {
      scryClearSearch(session);
      renderCurrentScryCard();
    }
    return;
  }
  const matches = scryMatches(session, query);
  scrySearchResults.innerHTML = matches.length
    ? matches.map((m) => `<li><wa-button appearance="plain" size="s" data-index="${m.index}">${escapeHtml(m.label)}</wa-button></li>`).join('')
    : `<li class="scry-search-empty">No card left in this session matches "${escapeHtml(query.trim())}".</li>`;
  scrySearchResults.hidden = false;
  syncActionsWithSearch();
}

function handleSearchPick(e) {
  const btn = e.target.closest('[data-index]');
  if (!btn) return;
  scryJump(session, Number(btn.dataset.index));
  state.elements.scrySearchResults.hidden = true;
  syncActionsWithSearch();
  btn.blur(); // focus off the field, so s/d and Enter act on the card
  renderCurrentScryCard();
}

function handleScryKeydown(e) {
  const dialog = state.elements.scryDialog;
  if (!dialog || !dialog.hasAttribute('open')) return;
  // Typing a name, or Enter on a match, must not skip or mark the card (#478).
  if (state.elements.scrySearch && e.composedPath().includes(state.elements.scrySearch)) return;

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
 *   onDone(key, card), onSkip(key, card), rows, endLabel, renderEnd(contentEl).
 *   The audit pass (#457, audit.js) passes its own.
 *   Called from a click listener, so a non-plain argument (the event) is ignored.
 */
export function openScryMode(opts) {
  scryOpts = { ...DEFAULT_OPTS, ...(opts && !(opts instanceof Event) ? opts : {}) };
  const { scryDialog, btnScryDone, btnScrySkip } = state.elements;
  if (btnScryDone) btnScryDone.textContent = scryOpts.doneLabel;
  if (btnScrySkip) btnScrySkip.textContent = scryOpts.skipLabel;
  scryDialog?.setAttribute('label', scryOpts.title);

  const view = scryOpts.rows || state.resultsView || [];
  const filtered = view.filter(c => !c.isRemoved);

  if (filtered.length === 0) {
    showError('No cards to scry in the current view.');
    return;
  }

  session = createScrySession([...filtered]);
  resetSearchField();

  if (state.elements.scryDialog) {
    state.elements.scryDialog.setAttribute('open', '');
  }

  renderCurrentScryCard();
}

export function setupScryMode() {
  const { btnScryDone, btnScrySkip, scryDialog } = state.elements;

  if (btnScryDone) btnScryDone.addEventListener('click', handleScryDone);
  if (btnScrySkip) btnScrySkip.addEventListener('click', handleScrySkip);
  const { scrySearchInput, scrySearchResults } = state.elements;
  scrySearchInput?.addEventListener('input', handleSearchInput);
  scrySearchInput?.addEventListener('wa-clear', handleSearchInput);
  scrySearchResults?.addEventListener('click', handleSearchPick);
  // Escape clears the search; it must not reach the dialog and close it.
  scrySearchInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !scrySearchInput.value) return;
    e.preventDefault();
    e.stopPropagation();
    scrySearchInput.value = '';
    handleSearchInput();
  });

  if (scryDialog) {
    // Re-render results once when dialog closes to sync marked rows
    scryDialog.addEventListener('wa-hide', () => {
      renderResults({ preserveRows: true });
    });
  }

  document.addEventListener('keydown', handleScryKeydown);
}
