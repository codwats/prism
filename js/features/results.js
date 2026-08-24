/**
 * Results table: rendering, sorting, filtering, deck filter menu.
 */

import { state } from '../core/state.js';
import { escapeHtml, stripeNumberLabel, countVisibleMarks, STRIPE_SPARSE_MAX, isCardDone } from '../core/utils.js';
import { getStripeNumbersMode } from '../modules/storage.js';
import { processCards, formatSlotLabel } from '../modules/processor.js';
import { prefetchCards } from '../modules/scryfall.js';
import { handleMarkToggle, handleClearRemoved, handleClearAllRemovedClick } from './deck-list.js';
import { renderOverlapMatrix } from './analysis.js';

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
      const name = batchToggle.dataset.cardName;
      if (expandedCards.has(name)) expandedCards.delete(name);
      else expandedCards.add(name);
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
    if (clearBtn) handleClearRemoved(clearBtn.dataset.cardName, clearBtn.dataset.deckId);
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.closest('.mark-checkbox')) handleMarkToggle(e);
  });
}

// ============================================================================
// Removed filter badge
// ============================================================================

export function updateRemovedFilterBadge() {
  const removedBtn = document.getElementById('removed-filter-btn');
  if (!removedBtn) return;

  const count = state.currentPrism?.removedCards?.length || 0;

  if (count > 0) {
    removedBtn.textContent = `Stale Marks (${count})`;
    removedBtn.style.setProperty('--wa-color-surface', 'var(--wa-color-warning-surface-subtle)');
  } else {
    removedBtn.textContent = 'Stale Marks';
    removedBtn.style.removeProperty('--wa-color-surface');
  }
}

// ============================================================================
// Marked progress (sleeves done)
// ============================================================================

// Sums totalQuantity for marked vs all rows — matches Total Cards stat.
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
  if (state.elements.markedProgress) {
    state.elements.markedProgress.value = totalCount > 0 ? Math.round((markedCount / totalCount) * 100) : 0;
  }
}

// ============================================================================
// Results rendering
// ============================================================================

export function renderResults({ preserveRows = false } = {}) {
  // Any re-render invalidates the pending tail observer; a new one is attached
  // once the fresh rows exist.
  rowObserver?.disconnect();
  rowObserver = null;
  if (state.elements.resultsTbody) bindResultsDelegation(state.elements.resultsTbody);

  const processedCards = processCards(state.currentPrism);
  state.processedCards = processedCards;
  const totalCardCount = processedCards.reduce((sum, c) => sum + c.totalQuantity, 0);
  // Pool/core belongs to batches (#146): A5/B3 contributes 3 pool + 2 core,
  // not 5 pool — so Pool Cards sums pool-batch quantities.
  const sharedCardCount = processedCards.reduce(
    (sum, c) => sum + (c.batches || []).reduce((s, b) => s + (b.isPool ? b.copyCount : 0), 0),
    0,
  );

  // Update stats
  if (state.elements.statTotal) state.elements.statTotal.textContent = totalCardCount;
  if (state.elements.statShared) state.elements.statShared.textContent = sharedCardCount;
  updateMarkedProgress();

  // Show/hide based on deck count
  if (state.currentPrism.decks.length === 0) {
    if (state.elements.resultsStats) state.elements.resultsStats.style.display = 'none';
    if (state.elements.noResults) state.elements.noResults.style.display = 'flex';
    const tableContainer = document.getElementById('results-table-container');
    if (tableContainer) tableContainer.style.display = 'none';
    const filterParent = state.elements.resultsFilter?.parentElement;
    if (filterParent) filterParent.style.display = 'none';
    return;
  }

  if (state.elements.resultsStats) state.elements.resultsStats.style.display = '';
  if (state.elements.noResults) state.elements.noResults.style.display = 'none';
  const tableContainer = document.getElementById('results-table-container');
  if (tableContainer) tableContainer.style.display = '';
  const filterParent = state.elements.resultsFilter?.parentElement;
  if (filterParent) filterParent.style.display = '';

  // Apply filters
  const filter = state.elements.resultsFilter?.value || 'all';
  const search = (state.elements.resultsSearch?.value || '').toLowerCase().trim();

  let filteredCards = [...processedCards];
  let displayCards = []; // What we'll actually render

  if (filter === 'shared') {
    filteredCards = filteredCards.filter(c => c.logicalDeckCount > 1);
    displayCards = filteredCards;
  } else if (filter === 'basics-by-deck') {
    // One-mark-at-a-time pass view (#149): the per-deck projection of the
    // canonical batches (#146), generalized from basics to every repeated
    // card. One row per distinct physical mark; its quantity is the sum of
    // the copy counts of the batches carrying that mark — "an A-mark pass
    // over 5 copies", "a child-indicator pass over the 3 A-only copies".
    // Row keys stay `<name>|<deckName>` (#151), shared with passKeysForCard.
    displayCards = [];
    for (const card of filteredCards) {
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
    const removedCards = state.currentPrism.removedCards || [];

    for (const removed of removedCards) {
      displayCards.push({
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

  if (search) {
    displayCards = displayCards.filter(c =>
      c.name.toLowerCase().includes(search)
    );
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

  // Persistent undone-only filter: keep cards the user hasn't marked done.
  // Card rows go through isCardDone so multi-batch cards classify consistently
  // (a partially-done card stays visible); pass rows keep key equality.
  if (state.elements.undoneFilter?.checked) {
    const markedSet = new Set(state.currentPrism.markedCards || []);
    displayCards = displayCards.filter(card => {
      if (card.isPassRow) return !markedSet.has(`${card.displayName}|${card.deckName}`);
      if (card.isRemoved) return true;
      return !isCardDone(card, markedSet);
    });
  }

  // Render deck filter menu and overlap matrix
  renderDeckFilterMenu();
  renderOverlapMatrix();

  // Apply sorting
  displayCards = sortCards(displayCards, state.sortState.column, state.sortState.direction);

  // Snapshot for SCRY-Mode — reflects exact list visible to user (all
  // filters/sort applied). Multi-batch cards flatten to one entry per batch
  // (#149): the parent row is not markable, so it is not a screen.
  state.resultsView = displayCards.flatMap(card => {
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

  const describeMark = (m) =>
    `${m.isDot ? 'Dot, ' : ''}${formatSlotLabel(m.position)}, ${m.deckName}`;

  let detailRowSeq = 0;
  // Done / Card Name / Copies / Stripes. The Copies column is unconditional
  // (#149) and the stale-marks view uses its own row markup, so this is stable.
  const detailColspan = 4;

  // Returns the <td> plus, when there is anything to decode, a full-width
  // sibling <tr> holding the legend for that row. The detail deliberately does
  // NOT live inside the stripes <td>: on a phone the table scrolls horizontally
  // and that column sits past the right edge, so text placed there would be
  // unreadable without scrolling and would inflate the row height besides.
  const stripesCell = (stripes, band = '') => {
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
        <td colspan="${detailColspan}"><ul class="stripe-detail">${items}</ul></td>
      </tr>`,
    };
  };

  const markedSetForRows = new Set(state.currentPrism.markedCards || []);
  // Copies cell renders only when the quantity exceeds one (#149) — the
  // common singleton path gains no text at all.
  const copiesCell = (q) => `<td class="copies-cell">${q > 1 ? q : ''}</td>`;

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
      const clearCopies = card.removedPreviousQuantity != null
        ? Math.max(1, (card.removedPreviousQuantity || 1) - (card.removedNewQuantity || 0))
        : null;
      const copiesNote = clearCopies != null
        ? ` — clear ${clearCopies} ${clearCopies === 1 ? 'copy' : 'copies'}`
        : '';
      return `
        <tr class="removed-row${band}" data-removed-key="${escapeHtml(removedKey)}">
          <td>${escapeHtml(card.name)}</td>
          <td>
            <div class="wa-cluster wa-gap-xs wa-align-items-center">
              <div
                class="stripe-indicator"
                style="background-color: ${card.removedDeckColor};"
                title="Remove from ${card.removedStripePosition != null ? formatSlotLabel(card.removedStripePosition) : 'this deck’s group slot'}"
              ></div>
              <span class="removed-deck-label">Remove from ${escapeHtml(card.removedDeckName)}${copiesNote}</span>
            </div>
          </td>
          <td style="text-align: center;">
            <wa-button
              appearance="plain"
              variant="neutral"
              size="small"
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
      const cardKey = card.isPassRow ? `${card.displayName}|${card.deckName}` : card.name;
      const isMarked = markedSetForRows.has(cardKey);
      const stripes = stripesCell(card.stripes, band);
      return `
        <tr class="${isMarked ? 'marked-row' : ''}${band}" data-card-key="${escapeHtml(cardKey)}">
          <td style="text-align: center;">
            <label class="mark-checkbox-hit"><input type="checkbox" class="mark-checkbox" aria-label="Mark ${escapeHtml(card.name)} done" ${isMarked ? "checked" : ""}></label>
          </td>
          <td class="${nameClass} card-name-cell" data-card-name="${escapeHtml(card.isPassRow ? card.displayName : card.name)}">${escapeHtml(card.name)}${basicTag}</td>${copiesCell(card.totalQuantity)}
          ${stripes.cell}
        </tr>
        ${stripes.detailRow}
      `;
    }

    // Multi-batch card: parent row with derived (non-clickable) checkbox and
    // no mark union — the union is the over-marking trap (#149). Marking
    // requires expanding and checking each batch.
    const doneCount = batches.filter(b => markedSetForRows.has(b.key)).length;
    const allDone = doneCount === batches.length;
    const isExpanded = expandedCards.has(card.name);
    const parentRow = `
      <tr class="${allDone ? 'marked-row' : ''} batch-parent${band}">
        <td style="text-align: center;">
          <input type="checkbox" class="batch-parent-check" disabled
            aria-label="${escapeHtml(card.name)} roll-up: ${doneCount} of ${batches.length} batches done"
            ${allDone ? 'checked' : ''} ${doneCount > 0 && !allDone ? 'data-indeterminate="1"' : ''}>
        </td>
        <td class="${nameClass} card-name-cell" data-card-name="${escapeHtml(card.name)}">
          <button type="button" class="batch-toggle" data-card-name="${escapeHtml(card.name)}" aria-expanded="${isExpanded}" title="${isExpanded ? 'Collapse' : 'Expand'} batches">
            <wa-icon name="${isExpanded ? 'chevron-down' : 'chevron-right'}"></wa-icon>
          </button>
          ${escapeHtml(card.name)}${basicTag}
        </td>${copiesCell(card.totalQuantity)}
        <td><span class="basic-tag">${batches.length} different markings</span></td>
      </tr>
    `;
    if (!isExpanded) return parentRow;

    return parentRow + batches.map(b => {
      const marked = markedSetForRows.has(b.key);
      // Two batches can share a copy count, so the class disambiguates the label.
      const batchClass = b.isDedicated ? 'dedicated' : (b.isPool ? 'pool' : 'core');
      const stripes = stripesCell(b.stripes, band);
      return `
        <tr class="batch-subrow ${marked ? 'marked-row' : ''}${band}" data-card-key="${escapeHtml(b.key)}">
          <td style="text-align: center;">
            <label class="mark-checkbox-hit"><input type="checkbox" class="mark-checkbox" aria-label="Mark ${b.copyCount} ${batchClass} ${escapeHtml(card.name)} copies done" ${marked ? "checked" : ""}></label>
          </td>
          <td class="batch-subrow-label" data-card-name="${escapeHtml(card.name)}">${b.copyCount} ${b.copyCount === 1 ? 'copy' : 'copies'} — ${batchClass}</td>${copiesCell(b.copyCount)}
          ${stripes.cell}
        </tr>
        ${stripes.detailRow}
      `;
    }).join('');
  };

  const tbody = state.elements.resultsTbody;

  // `indeterminate` is a property, not an attribute, so the parent roll-up
  // checkboxes have to be set after their markup lands — for appended chunks
  // too. Idempotent, so re-running it over the whole tbody is fine.
  const applyRowState = () => {
    tbody.querySelectorAll('.batch-parent-check[data-indeterminate="1"]').forEach(cb => {
      cb.indeterminate = true;
    });
  };

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
    applyRowState();
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
  applyRowState();
  observeTail();

  // Add event listener for "Clear All" removed button (opens a confirm dialog —
  // the rows it drops are paint still on sleeves and cannot be rebuilt)
  const clearAllBtn = document.getElementById('clear-all-removed-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', handleClearAllRemovedClick);
  }

  const colspan = 4;

  // Handle empty states
  if (displayCards.length === 0) {
    renderedRowCount = 0;
    let emptyMessage = 'No cards match your filters. Clear All Filters shows every card again.';

    if (filter === 'removed') {
      emptyMessage = 'No stale marks. A stale mark belongs to a deck that no longer needs the card.';
    } else if (processedCards.length === 0) {
      // Decks exist but hold no cards: a blank table under live stats reads as
      // lost data, so state the failure instead of returning silently.
      emptyMessage = 'No cards in any deck. Edit a deck to paste its decklist.';
    }

    state.elements.resultsTbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" style="text-align: center; color: var(--wa-color-neutral-text-subtle); padding: var(--wa-space-xl);">
          ${emptyMessage}
        </td>
      </tr>
    `;
    return;
  }

  // Prefetch card images for visible cards (first 20 to avoid rate limiting)
  const cardNames = displayCards
    .slice(0, 20)
    .map(c => c.isPassRow ? c.displayName : c.name)
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
  // Pre-compute lookup for marked status
  const markedSet = column === 'marked' ? new Set(state.currentPrism?.markedCards || []) : null;

  return cards.sort((a, b) => {
    let comparison = 0;

    switch (column) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'copies':
        comparison = a.totalQuantity - b.totalQuantity;
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
          ? (markedSet.has(`${c.displayName}|${c.deckName}`) ? 1 : 0)
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

  const filter = state.elements.resultsFilter?.value || 'all';
  const showCopies = true; // Copies column always present; cells are empty at qty 1 (#149)
  const isRemovedFilter = filter === 'removed';

  const getSortIcon = (column) => {
    if (state.sortState.column !== column) return 'sort';
    return state.sortState.direction === 'asc' ? 'sort-up' : 'sort-down';
  };

  const getSortedClass = (column) => {
    return state.sortState.column === column ? 'sorted' : '';
  };

  const copiesHeader = showCopies ? `
      <th class="sortable ${getSortedClass('copies')}" data-sort="copies">
        Copies
        <wa-icon name="${getSortIcon('copies')}" class="sort-icon"></wa-icon>
      </th>` : '';

  // Different header for removed cards view
  if (isRemovedFilter) {
    thead.innerHTML = `
      <tr>
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card Name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>
        <th>Remove Mark From</th>
        <th style="width: 80px; text-align: center;">
          <wa-button id="clear-all-removed-btn" appearance="outlined" variant="danger" size="small">Clear All</wa-button>
        </th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th class="sortable ${getSortedClass('marked')}" data-sort="marked" style="width: 60px; text-align: center;">
          Done
          <wa-icon name="${getSortIcon('marked')}" class="sort-icon"></wa-icon>
        </th>
        <th class="sortable ${getSortedClass('name')}" data-sort="name">
          Card Name
          <wa-icon name="${getSortIcon('name')}" class="sort-icon"></wa-icon>
        </th>${copiesHeader}
        <th class="sortable ${getSortedClass('deckCount')}" data-sort="deckCount">
          Stripes
          <wa-icon name="${getSortIcon('deckCount')}" class="sort-icon"></wa-icon>
        </th>
      </tr>
    `;
  }

  // Add click handlers for sortable columns
  thead.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      const defaultDirection = column === 'name' ? 'asc' : 'desc';

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

function renderDeckFilterMenu() {
  if (!state.elements.deckFilterMenu) return;

  const sortedDecks = [...state.currentPrism.decks].sort((a, b) => a.stripePosition - b.stripePosition);

  // No zero-deck branch: results.js:155 hides the cluster holding this menu
  // when there are no decks, so an empty state here is unreachable (#161).

  // Plain wa-buttons (not wa-menu-item) to match the deck-actions kebab menu
  // styling and dodge the flaky wa-menu CDN autoload (see CLAUDE.md).
  state.elements.deckFilterMenu.innerHTML = `
    <wa-button class="deck-filter-clear" appearance="plain" variant="neutral" size="small">
      <wa-icon slot="start" name="xmark"></wa-icon>
      Clear All Filters
    </wa-button>
    <wa-divider></wa-divider>
    ${sortedDecks.map(deck => {
      const selected = state.selectedDeckIds.has(deck.id);
      return `
      <wa-button class="deck-filter-item" data-deck-id="${deck.id}"
        appearance="plain" variant="neutral" size="small">
        <wa-icon slot="start" name="check" style="visibility: ${selected ? 'visible' : 'hidden'};"></wa-icon>
        <span class="deck-color-indicator small" style="background-color: ${deck.color};"></span>
        ${escapeHtml(deck.name)}
      </wa-button>
    `;
    }).join('')}
  `;

  // Toggle selection on item click; plain buttons keep the dropdown open.
  state.elements.deckFilterMenu.querySelectorAll('.deck-filter-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const deckId = btn.dataset.deckId;
      if (state.selectedDeckIds.has(deckId)) {
        state.selectedDeckIds.delete(deckId);
      } else {
        state.selectedDeckIds.add(deckId);
      }
      const icon = btn.querySelector('wa-icon[slot="start"]');
      if (icon) icon.style.visibility = state.selectedDeckIds.has(deckId) ? 'visible' : 'hidden';
      updateDeckFilterButtonLabel();
      renderResults();
    });
  });

  // Clear all listener
  const clearBtn = state.elements.deckFilterMenu.querySelector('.deck-filter-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.selectedDeckIds.clear();
      state.elements.deckFilterMenu.querySelectorAll('.deck-filter-item wa-icon[slot="start"]')
        .forEach(icon => { icon.style.visibility = 'hidden'; });
      updateDeckFilterButtonLabel();
      renderResults();
    });
  }

  // Update button label to show how many filters active
  updateDeckFilterButtonLabel();
}

function updateDeckFilterButtonLabel() {
  const btn = state.elements.deckFilterDropdown?.querySelector('wa-button[slot="trigger"]');
  if (!btn) return;

  // Compose the trigger label from every filter the dropdown owns: deck
  // selection plus the undone-only and all-slots switches.
  const facets = [];
  if (state.selectedDeckIds.size > 0) facets.push(`Decks (${state.selectedDeckIds.size})`);
  if (state.elements.undoneFilter?.checked) facets.push('Undone');
  if (state.elements.showAllSlots?.checked) facets.push('All slots');

  let label;
  if (facets.length === 0) label = 'Filters';
  else if (facets.length === 1) label = facets[0];
  else label = `Filters (${facets.length})`;

  btn.innerHTML = `<wa-icon slot="start" name="filter"></wa-icon>${label}`;
}
