/**
 * Results table: rendering, sorting, filtering, deck filter menu.
 */

import { state } from '../core/state.js';
import { escapeHtml, stripeNumberLabel, countVisibleMarks, STRIPE_SPARSE_MAX, isCardDone, batchTally, rowDoneKey, rowImageName } from '../core/utils.js';
import { markingPrereqVisible, retireMarkingPrereq } from '../core/marking-prereq.js';
import { getStripeNumbersMode } from '../modules/storage.js';
import { processCards, formatSlotLabel, getColorName } from '../modules/processor.js';
import { normalizeCardName } from '../modules/parser.js';
import { removalOpenCopies, openRemovals } from '../modules/swap.js';
import { planSleeveReuse } from '../modules/sleeve-reuse.js';
import { prefetchCards, getCardAttributes } from '../modules/scryfall.js';
import { savedCopiesByCard, savedDollars, formatUsd } from '../modules/savings.js';
import { mainType, compareByMainType, matchesMainTypes } from '../modules/comparables.js';
import { handleMarkToggle, handleClearRemoved, handleClearAllRemovedClick } from './deck-list.js';
import { renderOverlapMatrix } from './analysis.js';
import { requestTokenTypes, currentTokenRows, tokenEmptyMessage, tokenRowExtras, updateTokenTally } from './token-pack.js';

// ============================================================================
// Stripe indicator helpers
// ============================================================================

// Group a card's stripes by position, separating squares from dots.
// Returns Map<position, { square: stripe|null, dots: stripe[] }> in sorted stripe order.
function buildSlotMap(stripes) {
  const slotMap = new Map();
  for (const s of stripes) {
    if (!slotMap.has(s.position)) slotMap.set(s.position, { square: null, dots: [] });
    const slot = slotMap.get(s.position);
    if (s.markType === 'dot') slot.dots.push(s);
    else if (s.markType !== 'membership') slot.square = s;
  }
  return slotMap;
}

// Stable signature of a card's physical stripe set: one token per visible mark
// capturing its slot, mark type, and color, so two cards share a signature only
// when they need the exact same pens in the exact same places. Color/markType
// matter because dot-style split variants stack several differently-colored
// marks at one Side A position (a position-only key would collide them). The
// invisible 'membership' anchors are excluded so only real marks count.
function stripeSignature(card) {
  return (card.stripes || [])
    .filter(s => s.markType !== 'membership')
    .map(s => `${s.position}:${s.markType || 'stripe'}:${s.color}`)
    .sort()
    .join(',');
}

// Slot-number overlay. Sparse cards (`exact`) number every mark with its exact
// slot; otherwise only anchor slots (5/10/15/20) show, gated on `showNums`.
function positionNumHtml(position, { showNums, exact }, muted = false) {
  const label = (exact || showNums) ? stripeNumberLabel(position, { exact }) : null;
  if (!label) return '';
  return `<span class="stripe-pos-num${muted ? ' stripe-pos-num-muted' : ''}">${label}</span>`;
}

// Render a single stripe square (no dots).
function renderSquare(s, opts) {
  return `<div
    class="stripe-indicator${s.side === 'b' ? ' stripe-side-b' : ''}"
    style="background-color: ${s.color};"
    title="${formatSlotLabel(s.position)}: ${escapeHtml(s.deckName)}"
  >${positionNumHtml(s.position, opts)}</div>`;
}

// Render a slot: if it has dots, use ö-style (dot row above square).
function renderSlot(slot, opts) {
  if (slot.dots.length === 0) {
    return slot.square ? renderSquare(slot.square, opts) : '';
  }
  const dotsHtml = slot.dots.map(d => `<div
    class="stripe-indicator stripe-dot-indicator"
    style="background-color: ${d.color};"
    title="Dot: ${escapeHtml(d.deckName)}"
  ></div>`).join('');
  const slotPos = slot.square ? slot.square.position : slot.dots[0]?.position;
  const squareHtml = slot.square
    ? renderSquare(slot.square, opts)
    : `<div class="stripe-indicator stripe-empty">${positionNumHtml(slotPos, opts, true)}</div>`;
  return `<div class="stripe-slot"><div class="slot-dot-row">${dotsHtml}</div>${squareHtml}</div>`;
}

// Multi-batch cards the user has expanded (by card name). Module-level so the
// disclosure state survives re-renders within the session.
const expandedCards = new Set();

export function toggleCardExpanded(name) {
  if (expandedCards.has(name)) expandedCards.delete(name);
  else expandedCards.add(name);
}

// The row's markedCards key (rowDoneKey): pass rows `<name>|<deckName>`,
// token rows their `token:` key (#412), others the name.
const rowKey = rowDoneKey;

// Cards the last render left after view, filters, search and sort.
let shownCards = [];

/**
 * Keys of the checkbox rows the current view shows, for the bulk actions.
 * Marks to Clear rows and multi-batch parents have no checkbox and are
 * skipped; a collapsed parent's batch rows are hidden, so they are skipped
 * too and counted in `collapsed`.
 * @returns {{ keys: string[], collapsed: number }}
 */
export function shownMarkRows() {
  const keys = [];
  let collapsed = 0;
  for (const card of shownCards) {
    if (card.isRemoved) continue;
    const batches = card.batches || [];
    if (card.isPassRow || batches.length <= 1) keys.push(rowKey(card));
    else if (expandedCards.has(card.name)) keys.push(...batches.map(b => b.key));
    else collapsed++;
  }
  return { keys, collapsed };
}

// ============================================================================
// Chunked row rendering
// ============================================================================

// A full 1575-row table is ~15k DOM nodes and measured ~160ms of innerHTML
// parse + table layout per render — paid again on every sort click and, with
// the undone filter on, on every checkbox tick. So the first paint builds only
// CHUNK_ROWS rows and an IntersectionObserver appends the rest as the user
// scrolls toward them.
// ponytail: append-only — rows are never removed again on scroll-up, so a user
// who scrolls to the bottom still ends up with the full table in the DOM. That
// is fine (they paid for it gradually, one chunk per frame); swap in real
// windowing only if the fully-scrolled state ever becomes the common one.
// Known limit: browser find-in-page only sees rendered rows. The search box
// above the table covers that.
const CHUNK_ROWS = 60;
let rowObserver = null;
let renderedRowCount = 0;
let delegationBound = false;

// One delegated handler set on the tbody, bound once. Chunked rows are added
// after render, so per-render `querySelectorAll(...).forEach(addEventListener)`
// would leave every appended row dead. (Measured at 0.7ms for 1575 elements —
// this is a correctness requirement, not a performance one.)
function bindResultsDelegation(tbody) {
  if (delegationBound) return;
  delegationBound = true;

  tbody.addEventListener('click', (e) => {
    const batchToggle = e.target.closest('.batch-toggle');
    if (batchToggle) {
      toggleCardExpanded(batchToggle.dataset.cardName);
      // Preserve depth: expanding a card at row 400 must not yank the list
      // back to the first 60 rows.
      renderResults({ preserveRows: true });
      return;
    }

    // Reveal the deck name and slot behind each mark. Kept local to the row so
    // a marking session never loses its place in the table to a popover.
    const stripeToggle = e.target.closest('.stripe-cell-toggle');
    if (stripeToggle) {
      const detail = document.getElementById(stripeToggle.getAttribute('aria-controls'));
      if (!detail) return;
      const open = stripeToggle.getAttribute('aria-expanded') === 'true';
      stripeToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      detail.hidden = open;
      return;
    }

    const clearBtn = e.target.closest('.btn-clear-removed');
    if (clearBtn) {
      handleClearRemoved(clearBtn.dataset.cardName, clearBtn.dataset.deckId);
      return;
    }

    // Tapping a row opens its legend (#452); a multi-batch parent has no
    // marks of its own, so its row expands the batches instead. The checkbox
    // and every button keep their own job. Keyboard users have the
    // stripe-cell-toggle and batch-toggle buttons, so this is pointer only.
    if (e.target.closest('label, input, button, wa-button, wa-dropdown, a, .stripe-detail-row')) return;
    const row = e.target.closest('tr');
    (row?.querySelector('.batch-toggle') || row?.querySelector('.stripe-cell-toggle'))?.click();
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.closest('.mark-checkbox')) handleMarkToggle(e);
  });
}

// "Reuse for Cultivate: clear E, add F" — the full instruction, free (ADR 0003).
function reuseHintText({ incomingBatch, marksToClear, marksToAdd }, freedSleeve) {
  const decks = (marks) => marks.map(m => m.deckName).join(', ');
  const steps = [
    marksToClear.length && `clear ${decks(marksToClear)}`,
    marksToAdd.length && `add ${decks(marksToAdd)}`,
  ].filter(Boolean).join(', ') || 'no marks to change';
  return `Reuse${freedSleeve.label ? ` ${freedSleeve.label}` : ''} for ${incomingBatch.cardName}: ${steps}`;
}

// ============================================================================
// Removed filter badge
// ============================================================================

export function updateRemovedFilterBadge() {
  const removedBtn = document.getElementById('removed-filter-btn');
  if (!removedBtn) return;

  const count = openRemovals(state.currentPrism).length;

  if (count > 0) {
    removedBtn.textContent = `Marks to Clear (${count})`;
    removedBtn.style.setProperty('--wa-color-surface', 'var(--wa-color-warning-surface-subtle)');
  } else {
    removedBtn.textContent = 'Marks to Clear';
    removedBtn.style.removeProperty('--wa-color-surface');
  }
}

// ============================================================================
// Marked progress (sleeves done)
// ============================================================================

// Sums totalQuantity for marked vs all rows — matches Total cards stat.
// Uses cached state.processedCards so it can run on mark toggle without reprocessing.
export function updateMarkedProgress() {
  const cards = state.processedCards || [];
  const markedSet = new Set(state.currentPrism?.markedCards || []);
  const totalCount = cards.reduce((sum, c) => sum + c.totalQuantity, 0);
  // Batch-aware (#151): a fully-done card counts all copies (isCardDone also
  // honours pass keys); a partially-done multi-batch card counts the copies
  // of its done batches, so marking 3 of 5 Forests moves the bar.
  const markedCount = cards.reduce((sum, c) => {
    if (isCardDone(c, markedSet)) return sum + c.totalQuantity;
    const batches = c.batches || [];
    if (batches.length > 1) {
      return sum + batches.reduce((s, b) => s + (markedSet.has(b.key) ? b.copyCount : 0), 0);
    }
    return sum;
  }, 0);

  if (state.elements.statMarked) state.elements.statMarked.textContent = `${markedCount}/${totalCount}`;
  const percent = totalCount > 0 ? Math.round((markedCount / totalCount) * 100) : 0;
  if (state.elements.markedProgress) state.elements.markedProgress.value = percent;
  // Phone bottom bar mirrors the Marked stat, which lives in the sheet there
  if (state.elements.barMarked) state.elements.barMarked.textContent = `${markedCount}/${totalCount}`;
  if (state.elements.barProgress) state.elements.barProgress.value = percent;
  // Tokens keep their own tally (#412); the sleeve counts above are cards only.
  updateTokenTally();
}

// ============================================================================
// Results rendering
// ============================================================================

// The view switch holds All cards / Pool / Tokens / Marks to Clear; One Mark
// at a Time is a Filters item (#452) that turns either card view into the
// pass view. The pass view keeps its internal value, `basics-by-deck`. A
// token is one copy, so the Tokens view has no passes.
function resultsFilterValue() {
  const view = state.elements.resultsFilter?.value || 'all';
  if ((view === 'all' || view === 'shared') && state.elements.oneMarkFilter?.checked) return 'basics-by-deck';
  return view;
}

// The view the last render showed, so the Tokens view knows when it opens.
let lastFilter = null;

/** Show or hide the pre-marking warning for the current PRISM (#476). */
export function syncMarkingPrereq() {
  const callout = state.elements.markingPrereq;
  if (!callout) return;
  retireMarkingPrereq(state.currentPrism);
  callout.style.display = markingPrereqVisible(state.currentPrism) ? '' : 'none';
}

export function renderResults({ preserveRows = false } = {}) {
  // Any re-render invalidates the pending tail observer; a new one is attached
  // once the fresh rows exist.
  rowObserver?.disconnect();
  rowObserver = null;
  if (state.elements.resultsTbody) bindResultsDelegation(state.elements.resultsTbody);

  const processedCards = processCards(state.currentPrism);
  state.processedCards = processedCards;
  shownCards = [];
  const totalCardCount = processedCards.reduce((sum, c) => sum + c.totalQuantity, 0);
  // Pool/core belongs to batches (#146): A5/B3 contributes 3 pool + 2 core,
  // not 5 pool — so Pool cards sums pool-batch quantities.
  const sharedCardCount = processedCards.reduce(
    (sum, c) => sum + (c.batches || []).reduce((s, b) => s + (b.isPool ? b.copyCount : 0), 0),
    0,
  );

  // Update stats
  if (state.elements.statTotal) state.elements.statTotal.textContent = totalCardCount;
  if (state.elements.statShared) state.elements.statShared.textContent = sharedCardCount;
  updateCardAttributes(state.currentPrism, processedCards);
  updateMarkedProgress();

  // Show/hide based on deck count
  // The layout holds toolbar, table, rail and phone bar. Stats are hidden on
  // their own too, since on phone they live in the sheet outside the layout.
  const hasDecks = state.currentPrism.decks.length > 0;
  if (state.elements.markingLayout) state.elements.markingLayout.style.display = hasDecks ? '' : 'none';
  if (state.elements.resultsStats) state.elements.resultsStats.style.display = hasDecks ? '' : 'none';
  if (state.elements.noResults) state.elements.noResults.style.display = hasDecks ? 'none' : 'flex';
  syncMarkingPrereq();
  if (!hasDecks) return;

  // Apply filters
  const filter = resultsFilterValue();
  const search = (state.elements.resultsSearch?.value || '').toLowerCase().trim();

  let filteredCards = [...processedCards];
  let displayCards = []; // What we'll actually render

  const entering = filter !== lastFilter;
  lastFilter = filter;

  if (filter === 'shared') {
    filteredCards = filteredCards.filter(c => c.logicalDeckCount > 1);
    displayCards = filteredCards;
  } else if (filter === 'tokens') {
    // Token pack (#412): rows in the card shape, kept out of every count above.
    requestTokenTypes({ fresh: entering });
    displayCards = [...currentTokenRows()];
  } else if (filter === 'basics-by-deck') {
    // One-mark-at-a-time pass view (#149): the per-deck projection of the
    // canonical batches (#146), generalized from basics to every repeated
    // card. One row per distinct physical mark; its quantity is the sum of
    // the copy counts of the batches carrying that mark — "an A-mark pass
    // over 5 copies", "a child-indicator pass over the 3 A-only copies".
    // Row keys stay `<name>|<deckName>` (#151), shared with passKeysForCard.
    displayCards = [];
    // With the Pool view on, passes cover Pool cards only.
    const passSource = state.elements.resultsFilter?.value === 'shared'
      ? filteredCards.filter(c => c.logicalDeckCount > 1)
      : filteredCards;
    for (const card of passSource) {
      if (card.totalQuantity <= 1) continue; // single physical copy — no pass needed
      const passes = new Map(); // deckName -> { stripe, copies }
      for (const batch of card.batches || []) {
        for (const s of batch.stripes) {
          if (s.markType === 'membership') continue;
          const entry = passes.get(s.deckName) || { stripe: s, copies: 0 };
          entry.copies += batch.copyCount;
          passes.set(s.deckName, entry);
        }
      }
      for (const [deckName, { stripe, copies }] of passes) {
        displayCards.push({
          name: `${card.name} (${deckName})`,
          displayName: card.name,
          deckName,
          isBasicLand: card.isBasicLand,
          isPassRow: true,
          totalQuantity: copies,
          deckCount: 1,
          stripes: [stripe]
        });
      }
    }
    // Sort by card name first, then by deck name
    displayCards.sort((a, b) => {
      const nameCompare = a.displayName.localeCompare(b.displayName);
      if (nameCompare !== 0) return nameCompare;
      return a.deckName.localeCompare(b.deckName);
    });
  } else if (filter === 'removed') {
    // Show cards that have been removed from decks and need marks cleared
    displayCards = [];
    const removedCards = openRemovals(state.currentPrism);
    // Free Sleeve reuse hint (#376): each row a match's Freed sleeve covers.
    const reuseHints = new Map();
    for (const match of planSleeveReuse(state.currentPrism).matches) {
      for (const sleeve of match.freedSleeves) {
        for (const deckId of sleeve.deckIds) {
          const key = `${normalizeCardName(sleeve.cardName)}|${deckId}`;
          reuseHints.set(key, [...(reuseHints.get(key) || []), reuseHintText(match, sleeve)]);
        }
      }
    }

    for (const removed of removedCards) {
      displayCards.push({
        reuseHints: reuseHints.get(`${normalizeCardName(removed.cardName)}|${removed.deckId}`) || [],
        removedOpenCopies: removalOpenCopies(removed),
        name: removed.cardName,
        isRemoved: true,
        removedDeckId: removed.deckId,
        removedDeckName: removed.deckName,
        removedDeckColor: removed.deckColor,
        removedStripePosition: removed.stripePosition,
        removedAt: removed.removedAt,
        removedPreviousQuantity: removed.previousQuantity,
        removedNewQuantity: removed.newQuantity,
        deckCount: 0, // Not in any deck now (for this stripe)
        stripes: [{
          position: removed.stripePosition,
          color: removed.deckColor,
          deckName: removed.deckName,
          deckId: removed.deckId
        }]
      });
    }

    // Sort by removal date (most recent first), then by card name
    displayCards.sort((a, b) => {
      const dateCompare = new Date(b.removedAt) - new Date(a.removedAt);
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name);
    });
  } else {
    displayCards = filteredCards;
  }

  // Apply deck filter (if any decks are selected). First prune IDs whose deck
  // no longer exists (deck deleted / unsplit while filtered) so a stale
  // selection can't silently empty the table.
  if (state.selectedDeckIds.size > 0) {
    const liveDeckIds = new Set((state.currentPrism.decks || []).map(d => d.id));
    for (const id of state.selectedDeckIds) {
      if (!liveDeckIds.has(id)) state.selectedDeckIds.delete(id);
    }
  }
  if (state.selectedDeckIds.size > 0) {
    displayCards = displayCards.filter(card => {
      // Check if any of the card's stripes match a selected deck
      return card.stripes.some(s => state.selectedDeckIds.has(s.deckId));
    });
  }

  // Type filter (#538); the Tokens view has no main type, so it ignores it.
  if (state.selectedTypes.size > 0 && filter !== 'tokens') {
    displayCards = displayCards.filter(card => matchesMainTypes(typeOfRow(card), state.selectedTypes));
  }

  // Persistent undone-only filter: keep cards the user hasn't marked done.
  // Card rows go through isCardDone so multi-batch cards classify consistently
  // (a partially-done card stays visible); pass rows keep key equality.
  if (state.elements.undoneFilter?.checked) {
    const markedSet = new Set(state.currentPrism.markedCards || []);
    displayCards = displayCards.filter(card => {
      if (card.isPassRow) return !markedSet.has(rowDoneKey(card));
      if (card.isRemoved) return true;
      return !isCardDone(card, markedSet);
    });
  }

  // Render deck filter menu and overlap matrix
  renderFiltersMenu();
  renderOverlapMatrix();

  // Multi-batch cards flatten to one entry per batch (#149): the parent row
  // is not markable, so it is not a screen.
  const flattenBatches = cards => cards.flatMap(card => {
    const batches = card.batches || [];
    if (card.isRemoved || card.isPassRow || batches.length <= 1) return [card];
    return batches.map(b => ({
      name: card.name,
      isBasicLand: card.isBasicLand,
      batchKey: b.key,
      copyCount: b.copyCount,
      totalQuantity: b.copyCount,
      stripes: b.stripes
    }));
  });

  // Snapshot for SCRY-Mode: deck/undone filters and sort, but not the text
  // search, so SCRY's own search can find cards the table search hid (#519).
  state.scryView = flattenBatches(sortCards(displayCards, state.sortState.column, state.sortState.direction));

  if (search) {
    displayCards = displayCards.filter(c =>
      c.name.toLowerCase().includes(search)
    );
  }

  // Apply sorting
  displayCards = sortCards(displayCards, state.sortState.column, state.sortState.direction);
  shownCards = displayCards;

  // Snapshot for Audit: exactly the list visible to the user.
  state.resultsView = flattenBatches(displayCards);

  // Render table header with sort indicators
  renderResultsHeader();

  // Render table body
  if (!state.elements.resultsTbody) return;

  const showAllSlots = state.elements.showAllSlots?.checked || false;
  const numbersMode = getStripeNumbersMode();
  const showNums = numbersMode !== 'none';
  const totalDecks = state.currentPrism?.decks?.length || 0;

  // All used positions, for the show-all-slots ruler. Dot-style split variants
  // have stripePosition === null (they share the group's Side A slot), so drop
  // nulls before building the ruler — same as generatePrintableGuide.
  const allPositions = showAllSlots && totalDecks > 0
    ? [...new Set([
        ...state.currentPrism.decks.map(d => d.stripePosition),
        ...(state.currentPrism.splitGroups || []).map(g => g.sideAPosition)
      ])].filter(p => p != null).sort((a, b) => a - b)
    : null;

  // Render a stripe-indicator strip for any stripe set (card row or batch row).
  // Sparse sets number every mark with its exact slot; dense sets fall back to
  // anchor numbering unless the pref forces all.
  const stripeHtml = (stripes) => {
    const exact = numbersMode === 'all' || countVisibleMarks(stripes) <= STRIPE_SPARSE_MAX;
    const opts = { showNums, exact };
    const slotMap = buildSlotMap(stripes);
    let html = '';
    if (allPositions) {
      for (const pos of allPositions) {
        const slot = slotMap.get(pos);
        if (slot) {
          html += renderSlot(slot, opts);
        } else {
          // Empty reference slots only ever show the anchor ruler number, never
          // an "exact" number (they are not this card's marks).
          html += `<div
            class="stripe-indicator stripe-empty"
            title="${formatSlotLabel(pos)}: Empty"
          >${positionNumHtml(pos, { showNums, exact: false }, true)}</div>`;
        }
      }
    } else {
      for (const [, slot] of slotMap) html += renderSlot(slot, opts);
    }
    return html;
  };

  // The stripes strip answers "which pen, which slot" — but deck identity lived
  // only in a `title`, which touch devices never fire and screen readers do not
  // reliably announce. The strip is therefore wrapped in one focusable control
  // (one tab stop per row, not one per mark) carrying the full list as its
  // accessible name, and activating it reveals the same list as text.
  const markDescriptors = (stripes) =>
    (stripes || [])
      .filter((s) => s.markType !== 'membership')
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        position: s.position,
        deckName: s.deckName,
        color: s.color,
        isDot: s.markType === 'dot',
      }));

  // Color name, deck, slot: the three things a player checks against the pen
  const describeMark = (m) =>
    `${getColorName(m.color)}${m.isDot ? ' dot' : ''}, ${m.deckName}, ${formatSlotLabel(m.position)}`;

  let detailRowSeq = 0;
  // Done / Card name / Type / Marks; Tokens have no main type, so no Type (#538).
  const showType = filter !== 'tokens';
  const detailColspan = showType ? 4 : 3;
  // Type column from 768px; below it the same text is a caption under the name.
  const typeLabel = (card) => escapeHtml(typeOfRow(card) || '—');
  const typeCell = (card) => (showType ? `<td class="card-type-cell">${typeLabel(card)}</td>` : '');
  const typeCaption = (card) => (showType ? `<span class="card-type-caption">${typeLabel(card)}</span>` : '');

  // Returns the <td> plus, when there is anything to decode, a full-width
  // sibling <tr> holding the legend for that row. The detail deliberately does
  // NOT live inside the stripes <td>: on a phone the table scrolls horizontally
  // and that column sits past the right edge, so text placed there would be
  // unreadable without scrolling and would inflate the row height besides.
  // previewName/batchKey feed Show card, which opens wireCardPreview with the
  // same marks as the row (a batch row previews only its batch, never the union).
  const stripesCell = (stripes, band, previewName, batchKey = '') => {
    const marks = markDescriptors(stripes);
    const strip = `<div class="stripe-indicators">${stripeHtml(stripes)}</div>`;
    if (marks.length === 0) return { cell: `<td>${strip}</td>`, detailRow: '' };

    const id = `stripe-detail-${++detailRowSeq}`;
    const summary = `${marks.length} ${marks.length === 1 ? 'mark' : 'marks'}: ${marks
      .map(describeMark)
      .join('; ')}`;
    const items = marks
      .map(
        (m) => `<li>
          <span class="stripe-detail-swatch${m.isDot ? ' stripe-detail-swatch-dot' : ''}" style="background-color: ${m.color};"></span>
          <span>${escapeHtml(describeMark(m))}</span>
        </li>`,
      )
      .join('');

    return {
      cell: `<td>
        <button type="button" class="stripe-cell-toggle" aria-expanded="false" aria-controls="${id}" aria-label="${escapeHtml(summary)}">${strip}</button>
      </td>`,
      detailRow: `<tr class="stripe-detail-row${band}" id="${id}" hidden>
        <td colspan="${detailColspan}">
          <div class="stripe-detail-body">
            <ul class="stripe-detail">${items}</ul>
            <wa-button size="s" appearance="outlined" variant="neutral" class="card-name-cell card-show-btn"
              data-card-name="${escapeHtml(previewName)}"${batchKey ? ` data-batch-key="${escapeHtml(batchKey)}"` : ''}>
              <wa-icon slot="start" name="image"></wa-icon>
              Show card
            </wa-button>
          </div>
        </td>
      </tr>`,
    };
  };

  const markedSetForRows = new Set(state.currentPrism.markedCards || []);
  // Copy count folds into the name as "×14" only above one (#149), so the
  // common singleton path gains no text at all.
  const copiesTag = (q) => (q > 1 ? ` <span class="card-copies">×${q}</span>` : '');

  // Zebra banding is applied per card, not per <tr>: a multi-batch card's
  // sub-rows and a row's stripe-detail row all share their card's band, so an
  // expanded card still reads as one block. It cannot be done with
  // :nth-child() — the detail rows interleave, and cards with no marks emit
  // none, so row parity is not even uniform.
  const rowHtml = (card, cardIndex) => {
    const band = cardIndex % 2 === 1 ? ' alt-row' : '';
    // Handle removed cards differently
    if (card.isRemoved) {
      const removedKey = `${card.name}|${card.removedDeckId}`;
      // "clear this mark from N copies" (#151); legacy rows without quantity
      // fields keep the plain label.
      const clearCopies = card.removedPreviousQuantity != null ? Math.max(1, card.removedOpenCopies) : null;
      const copiesNote = clearCopies != null
        ? `, clear ${clearCopies} ${clearCopies === 1 ? 'copy' : 'copies'}`
        : '';
      return `
        <tr class="removed-row${band}" data-removed-key="${escapeHtml(removedKey)}">
          <td>${escapeHtml(card.name)}${typeCaption(card)}</td>
          ${typeCell(card)}
          <td>
            <div class="wa-cluster wa-gap-xs wa-align-items-center">
              <div
                class="stripe-indicator"
                style="background-color: ${card.removedDeckColor};"
                title="Remove from ${card.removedStripePosition != null ? formatSlotLabel(card.removedStripePosition) : 'this deck’s group slot'}"
              ></div>
              <span class="removed-deck-label">Remove from ${escapeHtml(card.removedDeckName)}${copiesNote}</span>
            </div>
            ${card.reuseHints.map(h => `<div class="reuse-hint">${escapeHtml(h)}</div>`).join('')}
          </td>
          <td style="text-align: center;">
            <wa-button
              appearance="plain"
              variant="neutral"
              size="s"
              class="btn-clear-removed"
              data-card-name="${escapeHtml(card.name)}"
              data-deck-id="${card.removedDeckId}"
              title="Mark as cleared"
              aria-label="Mark ${escapeHtml(card.name)} as cleared"
            >
              <wa-icon name="check"></wa-icon>
            </wa-button>
          </td>
        </tr>
      `;
    }

    const nameClass = card.isBasicLand ? 'basic-land' : '';
    const basicTag = card.isBasicLand && !card.isPassRow ? ' <span class="basic-tag">(Basic)</span>' : '';
    const batches = card.batches || [];
    const multiBatch = !card.isPassRow && batches.length > 1;

    if (!multiBatch) {
      // Singleton path — exactly today's row (#149). Pass rows keep their
      // `<name>|<deckName>` key.
      const cardKey = rowKey(card);
      const isMarked = markedSetForRows.has(cardKey);
      const previewName = rowImageName(card);
      const stripes = stripesCell(card.stripes, band, previewName);
      const tokenExtras = card.isToken ? tokenRowExtras(card) : '';
      return `
        <tr class="${isMarked ? 'marked-row' : ''}${band}" data-card-key="${escapeHtml(cardKey)}">
          <td style="text-align: center;">
            <label class="mark-checkbox-hit"><input type="checkbox" class="mark-checkbox" aria-label="Mark ${escapeHtml(card.name)} done" ${isMarked ? "checked" : ""}></label>
          </td>
          <td class="${nameClass} card-name-cell" data-preview="hover" data-card-name="${escapeHtml(previewName)}">${escapeHtml(card.name)}${basicTag}${copiesTag(card.totalQuantity)}${tokenExtras}${typeCaption(card)}</td>
          ${typeCell(card)}
          ${stripes.cell}
        </tr>
        ${stripes.detailRow}
      `;
    }

    // Multi-batch card: parent row with a derived, never-clickable tally of
    // done batches (#452, was a disabled checkbox) and no mark union — the
    // union is the over-marking trap (#149). Marking requires expanding and
    // checking each batch.
    const tally = batchTally(card, markedSetForRows);
    const allDone = tally.done === tally.total;
    const isExpanded = expandedCards.has(card.name);
    const parentRow = `
      <tr class="${allDone ? 'marked-row' : ''} batch-parent${band}">
        <td style="text-align: center;">
          <span class="batch-tally"><span aria-hidden="true">${tally.done}/${tally.total}</span><span class="visually-hidden">${escapeHtml(card.name)}: ${tally.done} of ${tally.total} batches done</span></span>
        </td>
        <td class="${nameClass} card-name-cell" data-preview="hover" data-card-name="${escapeHtml(card.name)}">
          <button type="button" class="batch-toggle" data-card-name="${escapeHtml(card.name)}" aria-expanded="${isExpanded}" title="${isExpanded ? 'Collapse' : 'Expand'} batches">
            <wa-icon name="${isExpanded ? 'chevron-down' : 'chevron-right'}"></wa-icon>
          </button>
          ${escapeHtml(card.name)}${basicTag}${copiesTag(card.totalQuantity)}${typeCaption(card)}
        </td>
        ${typeCell(card)}
        <td><span class="basic-tag">${batches.length} different markings</span></td>
      </tr>
    `;
    if (!isExpanded) return parentRow;

    return parentRow + batches.map(b => {
      const marked = markedSetForRows.has(b.key);
      // Two batches can share copy count and class (#424 tiers), so the
      // checkbox label also names the marks; sighted users read the stripes.
      const batchLabel = b.isDedicated
        ? 'Core (dedicated)'
        : `${b.isPool ? 'Pool' : 'Core'}${b.isSeparateSleeve ? ' (separate sleeve)' : ''}`;
      const markNames = b.stripes.filter(s => s.markType !== 'membership').map(s => s.deckName).join(' + ');
      const stripes = stripesCell(b.stripes, band, card.name, b.key);
      return `
        <tr class="batch-subrow ${marked ? 'marked-row' : ''}${band}" data-card-key="${escapeHtml(b.key)}">
          <td style="text-align: center;">
            <label class="mark-checkbox-hit"><input type="checkbox" class="mark-checkbox" aria-label="Mark ${b.copyCount} ${batchLabel} ${escapeHtml(card.name)} copies (${escapeHtml(markNames)}) done" ${marked ? "checked" : ""}></label>
          </td>
          <td class="batch-subrow-label card-name-cell" data-preview="hover" data-card-name="${escapeHtml(card.name)}">${b.copyCount} ${b.copyCount === 1 ? 'copy' : 'copies'}, ${batchLabel}</td>
          ${showType ? '<td class="card-type-cell"></td>' : ''}
          ${stripes.cell}
        </tr>
        ${stripes.detailRow}
      `;
    }).join('');
  };

  const tbody = state.elements.resultsTbody;

  // Watch a row a few short of the end so the next chunk lands before the user
  // reaches blank space. Stripe-detail rows are `hidden` and never intersect,
  // so the anchor must come from the visible rows or the loader stalls.
  const observeTail = () => {
    rowObserver?.disconnect();
    rowObserver = null;
    if (renderedRowCount >= displayCards.length) return;

    const visible = tbody.querySelectorAll('tr:not([hidden])');
    const anchor = visible[Math.max(0, visible.length - 8)];
    if (!anchor) return;

    rowObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) appendChunk();
    }, { rootMargin: '400px 0px' });
    rowObserver.observe(anchor);
  };

  function appendChunk() {
    const next = Math.min(renderedRowCount + CHUNK_ROWS, displayCards.length);
    if (next <= renderedRowCount) return;
    tbody.insertAdjacentHTML(
      'beforeend',
      displayCards.slice(renderedRowCount, next)
        .map((card, i) => rowHtml(card, renderedRowCount + i))
        .join(''),
    );
    renderedRowCount = next;
    // Re-observing an anchor that is already on screen fires immediately, so
    // this cascades until the tail is genuinely below the fold.
    observeTail();
  }

  // Sort/filter/search restart at the top; mark and batch toggles keep the
  // depth the user had already scrolled to.
  const initialRows = Math.min(
    preserveRows ? Math.max(renderedRowCount, CHUNK_ROWS) : CHUNK_ROWS,
    displayCards.length,
  );
  tbody.innerHTML = displayCards.slice(0, initialRows).map(rowHtml).join('');
  renderedRowCount = initialRows;
  observeTail();

  // Add event listener for "Clear All" removed button (opens a confirm dialog —
  // the rows it drops are paint still on sleeves and cannot be rebuilt)
  const clearAllBtn = document.getElementById('clear-all-removed-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', handleClearAllRemovedClick);
  }


  // Handle empty states
  if (displayCards.length === 0) {
    renderedRowCount = 0;
    let emptyMessage = 'No cards match your filters. Clear them in Filters to see every card again.';

    if (filter === 'removed') {
      emptyMessage = 'No marks to clear. A mark to clear is paint for a deck that no longer needs the card.';
    } else if (filter === 'tokens') {
      if (!search && state.selectedDeckIds.size === 0 && !state.elements.undoneFilter?.checked) emptyMessage = tokenEmptyMessage();
    } else if (processedCards.length === 0) {
      // Decks exist but hold no cards: a blank table under live stats reads as
      // lost data, so state the failure instead of returning silently.
      emptyMessage = 'No cards in any deck. Edit a deck to paste its decklist.';
    }

    state.elements.resultsTbody.innerHTML = `
      <tr>
        <td colspan="${detailColspan}" style="text-align: center; color: var(--wa-color-neutral-text-subtle); padding: var(--wa-space-xl);">
          ${emptyMessage}
        </td>
      </tr>
    `;
    return;
  }

  // Prefetch card images for visible cards (first 20 to avoid rate limiting)
  const cardNames = displayCards
    .slice(0, 20)
    .map(rowImageName)
    .filter(Boolean);
  if (cardNames.length > 0) {
    prefetchCards(cardNames).catch(() => {
      // Silently ignore prefetch errors
    });
  }
}

// ============================================================================
// Sorting
// ============================================================================

function sortCards(cards, column, direction) {
  if (column === 'type') return cards.sort(compareByMainType(typeOfRow, direction));
  // Pre-compute lookup for marked status
  const markedSet = column === 'marked' ? new Set(state.currentPrism?.markedCards || []) : null;

  return cards.sort((a, b) => {
    let comparison = 0;

    switch (column) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'deckCount':
        // 1. Sort by deck count (most shared first by default)
        comparison = a.deckCount - b.deckCount;
        // 2. Cluster cards that carry the identical set of stripes together,
        //    so the user marks all of them without swapping pens.
        if (comparison === 0) {
          comparison = stripeSignature(a).localeCompare(stripeSignature(b));
        }
        // 3. Alphabetical within a matching set
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
      case 'marked': {
        // Card rows classify through isCardDone (batch-aware); pass rows keep
        // their key equality.
        const doneOf = (c) => c.isPassRow
          ? (markedSet.has(rowDoneKey(c)) ? 1 : 0)
          : (isCardDone(c, markedSet) ? 1 : 0);
        comparison = doneOf(a) - doneOf(b);
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
      }
      default:
        comparison = 0;
    }

    return direction === 'desc' ? -comparison : comparison;
  });
}

// ============================================================================
// Results header (sort controls)
// ============================================================================

function renderResultsHeader() {
  const thead = document.querySelector('#results-table thead');
  if (!thead) return;

  const isRemovedFilter = resultsFilterValue() === 'removed';

  const getSortIcon = (column) => {
    if (state.sortState.column !== column) return 'sort';
    return state.sortState.direction === 'asc' ? 'sort-up' : 'sort-down';
  };

  const getSortedClass = (column) => {
    return state.sortState.column === column ? 'sorted' : '';
  };
  const typeTh = resultsFilterValue() === 'tokens' ? '' : `
        <th class="sortable card-type-head ${getSortedClass('type')}" data-sort="type">
          Type
          <wa-icon name="${getSortIcon('type')}" class="sort-icon"></wa-icon>
        </th>`;

  // Different header for removed cards view
  if (isRemovedFilter) {
    thead.innerHTML = `
      <tr class="removed-head">
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>${typeTh}
        <th>Remove mark from</th>
        <th style="text-align: center;">
          <wa-button id="clear-all-removed-btn" appearance="outlined" variant="danger" size="s">Clear All</wa-button>
        </th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th class="sortable ${getSortedClass('marked')}" data-sort="marked" style="text-align: center;">
          Done
          <wa-icon name="${getSortIcon('marked')}" class="sort-icon"></wa-icon>
        </th>
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>${typeTh}
        <th class="sortable ${getSortedClass('deckCount')}" data-sort="deckCount">
          Marks
          <wa-icon name="${getSortIcon('deckCount')}" class="sort-icon"></wa-icon>
        </th>
      </tr>
    `;
  }

  // Add click handlers for sortable columns
  thead.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      const defaultDirection = column === 'name' || column === 'type' ? 'asc' : 'desc';

      if (state.sortState.column === column) {
        if (state.sortState.direction === defaultDirection) {
          // First click was default, toggle to opposite
          state.sortState.direction = defaultDirection === 'asc' ? 'desc' : 'asc';
        } else {
          // Already toggled, reset to default sort (deckCount desc)
          state.sortState.column = 'deckCount';
          state.sortState.direction = 'desc';
        }
      } else {
        // New column, set default direction for that column
        state.sortState.column = column;
        state.sortState.direction = defaultDirection;
      }
      renderResults();
    });
  });
}

// ============================================================================
// Deck filter menu
// ============================================================================

// Deck items are checkbox wa-dropdown-items appended straight into the
// Filters dropdown (it only sees direct-child items), so a keyboard choice
// works; events.js handles every choice on wa-select. Rebuilt only when the
// decks change: replacing items on every render would drop keyboard focus
// out of the open menu.
let deckFilterSignature = null;

function renderFiltersMenu() {
  const dropdown = state.elements.deckFilterDropdown;
  if (!dropdown) return;

  const sortedDecks = [...state.currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);
  const signature = sortedDecks.map(d => `${d.id}:${d.name}:${d.color}`).join('|');
  if (signature !== deckFilterSignature) {
    deckFilterSignature = signature;
    dropdown.querySelectorAll('.deck-filter-item').forEach(item => item.remove());
    dropdown.insertAdjacentHTML('beforeend', sortedDecks.map(deck => `
      <wa-dropdown-item class="deck-filter-item" type="checkbox" data-deck-id="${escapeHtml(deck.id)}">
        <span class="deck-color-indicator small" style="background-color: ${deck.color};"></span>
        ${escapeHtml(deck.name)}
      </wa-dropdown-item>`).join(''));
  }
  dropdown.querySelectorAll('.deck-filter-item').forEach(item => {
    item.checked = state.selectedDeckIds.has(item.dataset.deckId);
  });
  dropdown.querySelectorAll('.type-filter-item').forEach(item => {
    item.checked = state.selectedTypes.has(item.dataset.mainType);
  });

  updateFiltersButtonLabel();
}

function updateFiltersButtonLabel() {
  const btn = state.elements.deckFilterDropdown?.querySelector('wa-button[slot="trigger"]');
  if (!btn) return;

  // Compose the trigger label from every filter the dropdown owns: deck
  // selection plus the undone-only and all-slots switches.
  const facets = [];
  if (state.selectedDeckIds.size > 0) facets.push(`Decks (${state.selectedDeckIds.size})`);
  if (state.selectedTypes.size > 0) facets.push(`Types (${state.selectedTypes.size})`);
  if (state.elements.undoneFilter?.checked) facets.push('Undone');
  if (state.elements.oneMarkFilter?.checked) facets.push('One Mark at a Time');
  if (state.elements.showAllSlots?.checked) facets.push('All slots');

  let label;
  if (facets.length === 0) label = 'Filters';
  else if (facets.length === 1) label = facets[0];
  else label = `Filters (${facets.length})`;

  btn.innerHTML = `<wa-icon slot="start" name="filter"></wa-icon>${label}`;
}

// Main type per card name (#538), filled from the card-attribute cache. A name
// not in it (still loading, Scryfall failed, offline) is unknown: "—", sorts
// last, matches no ticked type. Pass rows look up the card they belong to.
const cardTypes = new Map();
const typeOfRow = (card) => cardTypes.get(card.displayName || card.name) ?? null;

// One getCardAttributes call feeds both the Type column and "This PRISM saved
// ≈ $N" (copies saved priced from the same cache). A newer render wins; a
// Scryfall failure hides the stat rather than showing $0 and leaves types unknown.
let attributesRun = 0;
function updateCardAttributes(prism, processedCards) {
  const { statSaved, statSavedWrap } = state.elements;
  const run = ++attributesRun;
  const saved = savedCopiesByCard(prism, processedCards);
  if (statSavedWrap) statSavedWrap.hidden = true; // never show the previous amount while this run prices
  // Names already typed (a miss included) are not asked again, so a name
  // Scryfall can't match is POSTed once per page load, not on every render.
  const untyped = [...processedCards.map(c => c.name), ...openRemovals(prism).map(r => r.cardName)]
    .filter(name => !cardTypes.has(name));
  const names = [...new Set([...saved.keys(), ...untyped])];
  if (names.length === 0) return;
  getCardAttributes(names).then((attributes) => {
    if (run !== attributesRun) return;
    if (statSaved && statSavedWrap && saved.size > 0) {
      const usd = savedDollars(saved, (name) => attributes.get(name)?.usd);
      statSaved.textContent = formatUsd(usd);
      statSavedWrap.hidden = usd < 1;
    }
    let changed = false;
    for (const name of untyped) {
      const type = mainType(attributes.get(name)?.typeLine);
      if (type) changed = true;
      cardTypes.set(name, type);
    }
    // The table never waits for types; it fills in when they land. The
    // re-render asks only for names still untyped, so it stops.
    if (changed) renderResults({ preserveRows: true });
  }).catch(() => {
    if (run === attributesRun && statSavedWrap) statSavedWrap.hidden = true;
  });
}
