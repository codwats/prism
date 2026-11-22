/**
 * Token pack on the Mark sleeves tab (#412): the Tokens view's rows, its
 * toolbar (tally, Add token, Hidden), each row's actions (Pair, Unpair, Edit
 * decks, Hide) and the Add token and Pair dialogs. The rows go through the
 * card table, Done ticks, SCRY-Mode and Audit like any other row.
 */

import { state } from '../core/state.js';
import { escapeHtml, isCardDone } from '../core/utils.js';
import { showError } from '../core/notifications.js';
import { savePrism } from '../modules/storage.js';
import { getTokenTypes, searchTokens } from '../modules/scryfall.js';
import { wireCardAutocomplete } from '../modules/card-autocomplete.js';
import {
  tokenRows, tokenNeeds, tokenPartner, pairTokens, unpairToken, setTokenHidden,
  setAddedToken, addedTokenIds, hiddenTokenIds, tokenDeckOptions,
} from '../modules/tokens.js';
import { renderResults } from './results.js';

// The last Scryfall answer, and the card names and oracle ids asked this
// visit to the view. Misses are not cached, so without `asked` every render
// would ask again.
let known = { byCard: new Map(), byOracle: new Map(), incomplete: false };
const asked = new Set();
let loading = false;

const tokensOf = (name) => known.byCard.get(name);
const typeOf = (oracleId) => known.byOracle.get(oracleId);
const $ = (id) => document.getElementById(id);

/**
 * Ask Scryfall for the Token types of any card or hand-added token not asked
 * yet this visit; renders the Tokens view again when the answer lands.
 * @param {{ fresh?: boolean }} opts - true when the view was just opened: ask everything again
 */
export function requestTokenTypes({ fresh = false } = {}) {
  const prism = state.currentPrism;
  if (fresh) asked.clear();
  const names = [...new Set(prism.decks.flatMap((d) => d.cards.map((c) => c.name)))];
  const ids = addedTokenIds(prism);
  if (!loading && [...names, ...ids].some((k) => !asked.has(k))) lookUp(names, ids);
}

/** The Tokens view's rows from what is known so far; keeps state.tokenRows and the toolbar current. */
export function currentTokenRows() {
  state.tokenRows = tokenRows(state.currentPrism, tokensOf, typeOf);
  renderToolbar();
  return state.tokenRows;
}

async function lookUp(names, ids) {
  loading = true;
  [...names, ...ids].forEach((k) => asked.add(k));
  try {
    known = await getTokenTypes(names, ids);
  } finally {
    loading = false;
    if (state.elements.resultsFilter?.value === 'tokens') renderResults({ preserveRows: true });
  }
}

/** What the table says when the Tokens view has no rows. */
export function tokenEmptyMessage() {
  if (loading) return 'Looking up the tokens your cards make…';
  if (known.incomplete) return 'Scryfall didn’t answer, so tokens can’t be listed yet. Open Tokens again to retry.';
  return 'No tokens. None of your cards makes a token. Add one with Add token.';
}

/** "12 of 30 tokens marked", from the rows the Tokens view last built. */
export function updateTokenTally() {
  const tally = state.elements?.tokenTally;
  if (!tally) return;
  const rows = state.tokenRows || [];
  const marked = new Set(state.currentPrism?.markedCards || []);
  tally.textContent = `${rows.filter((r) => isCardDone(r, marked)).length} of ${rows.length} tokens marked`;
}

function renderToolbar() {
  updateTokenTally();
  const { tokenStatus: status, tokenHiddenMenu: menu, tokenHiddenLabel: label } = state.elements || {};
  if (status) {
    status.hidden = !(known.incomplete && !loading);
    status.textContent = 'Scryfall didn’t answer, so some tokens may be missing.';
  }
  if (!menu) return;
  const needs = tokenNeeds(state.currentPrism, tokensOf, typeOf);
  const hidden = hiddenTokenIds(state.currentPrism).map((id) => needs.get(id)?.type).filter(Boolean);
  label.textContent = `Hidden (${hidden.length})`;
  menu.querySelector('wa-button').toggleAttribute('disabled', hidden.length === 0);
  menu.querySelectorAll('wa-dropdown-item').forEach((item) => item.remove());
  menu.insertAdjacentHTML('beforeend', hidden.map((t) => `
    <wa-dropdown-item data-oracle-id="${escapeHtml(t.oracleId)}">
      <wa-icon slot="icon" name="eye"></wa-icon>
      Show ${escapeHtml(t.name)}${t.detail ? ` (${escapeHtml(t.detail)})` : ''}
    </wa-dropdown-item>`).join(''));
}

/** The name cell's extras on a token row: its kind, and the actions menu. */
export function tokenRowExtras(row) {
  const ids = row.oracleIds;
  const paired = ids.length > 1;
  return `${row.detail ? ` <span class="basic-tag">${escapeHtml(row.detail)}</span>` : ''}
    <wa-dropdown class="token-actions" data-oracle-ids="${escapeHtml(ids.join(','))}">
      <wa-button slot="trigger" appearance="plain" variant="neutral" size="s">
        <wa-icon name="ellipsis" label="Actions for ${escapeHtml(row.name)}"></wa-icon>
      </wa-button>
      ${paired
        ? '<wa-dropdown-item value="unpair"><wa-icon slot="icon" name="link-slash"></wa-icon>Unpair</wa-dropdown-item>'
        : `<wa-dropdown-item value="pair"><wa-icon slot="icon" name="link"></wa-icon>Pair with another token</wa-dropdown-item>
           <wa-dropdown-item value="edit"><wa-icon slot="icon" name="pen"></wa-icon>Choose decks</wa-dropdown-item>`}
      <wa-dropdown-item value="hide"><wa-icon slot="icon" name="eye-slash"></wa-icon>Hide (not used)</wa-dropdown-item>
    </wa-dropdown>`;
}

function save(prism) {
  state.currentPrism = prism;
  savePrism(prism);
  renderResults({ preserveRows: true });
}

// ---------------------------------------------------------------------------
// Add token / Choose decks dialog
// ---------------------------------------------------------------------------

let picked = null; // the Token type the dialog adds or edits

function openDeckDialog(type) {
  picked = type;
  const search = $('token-search');
  search.value = type ? type.name : '';
  search.toggleAttribute('disabled', !!type);
  $('token-add-dialog').setAttribute('label', type ? `Decks for ${type.name}` : 'Add token');
  showPicked();
  $('token-add-dialog').setAttribute('open', '');
}

// A deck whose own card makes it is ticked and locked, unless the player also
// added it there: then it stays theirs to untick. Before a pick, no deck has it.
function renderDeckOptions() {
  $('token-decks').innerHTML = tokenDeckOptions(state.currentPrism, picked?.oracleId, tokensOf)
    .map(({ deck: d, checked, locked }) => `<wa-checkbox data-deck-id="${escapeHtml(d.id)}" ${checked ? 'checked' : ''} ${locked ? 'disabled hint="A card in this deck makes it"' : ''}>
      <span class="deck-color-indicator small" style="background-color: ${d.color};"></span> ${escapeHtml(d.name)}
    </wa-checkbox>`).join('');
}

function showPicked() {
  renderDeckOptions();
  const note = $('token-picked');
  note.hidden = !picked;
  note.textContent = picked ? `${picked.name}${picked.detail ? `, ${picked.detail}` : ''}` : '';
  $('btn-save-token').toggleAttribute('disabled', !picked);
}

function saveDeckDialog() {
  if (!picked) return;
  const deckIds = [...$('token-decks').querySelectorAll('wa-checkbox')]
    .filter((box) => box.checked && !box.disabled)
    .map((box) => box.dataset.deckId);
  $('token-add-dialog').removeAttribute('open');
  save(setAddedToken(state.currentPrism, picked, deckIds));
}

// ---------------------------------------------------------------------------
// Pair dialog
// ---------------------------------------------------------------------------

let pairing = null; // oracle id of the side being paired

function openPairDialog(oracleId) {
  const rows = state.tokenRows || [];
  const others = rows.filter((r) => r.oracleIds.length === 1 && r.oracleIds[0] !== oracleId);
  if (!others.length) {
    showError('There is no other unpaired token to pair it with.');
    return;
  }
  pairing = oracleId;
  const name = rows.find((r) => r.oracleIds.includes(oracleId))?.name || 'this token';
  const select = $('token-pair-select');
  select.setAttribute('label', `Other side of ${name}`);
  select.innerHTML = others.map((r) => `<wa-option value="${escapeHtml(r.oracleIds[0])}">${escapeHtml(r.name)}${r.detail ? ` (${escapeHtml(r.detail)})` : ''}</wa-option>`).join('');
  select.value = others[0].oracleIds[0];
  $('token-pair-dialog').setAttribute('open', '');
}

export function setupTokenPack() {
  const tbody = state.elements.resultsTbody;
  const filter = state.elements.resultsFilter;
  if (!tbody || !filter || !$('token-add-dialog')) return;

  // The toolbar belongs to the Tokens view; the card actions don't.
  filter.addEventListener('change', () => {
    state.elements.tokensToolbar.hidden = filter.value !== 'tokens';
  });

  tbody.addEventListener('wa-select', (e) => {
    const menu = e.target.closest?.('.token-actions');
    const action = e.detail?.item?.value;
    if (!menu || !action) return;
    const ids = menu.dataset.oracleIds.split(',');
    const prism = state.currentPrism;
    if (action === 'unpair') save(unpairToken(prism, ids[0]));
    else if (action === 'hide') save(ids.reduce((p, id) => setTokenHidden(p, id, true), prism));
    else if (action === 'pair') openPairDialog(ids[0]);
    else if (action === 'edit') {
      const row = (state.tokenRows || []).find((r) => r.oracleIds[0] === ids[0]);
      openDeckDialog({ oracleId: ids[0], name: row?.name || 'Token', detail: row?.detail || '' });
    }
  });

  state.elements.tokenHiddenMenu?.addEventListener('wa-select', (e) => {
    const id = e.detail?.item?.dataset.oracleId;
    if (id) save(setTokenHidden(state.currentPrism, id, false));
  });

  $('btn-add-token').addEventListener('click', () => openDeckDialog(null));
  $('token-search').addEventListener('input', () => {
    if (!picked) return;
    picked = null; // typing again drops the pick and its deck ticks
    showPicked();
  });
  wireCardAutocomplete($('token-search'), $('token-search-suggest'), (type) => {
    picked = type;
    showPicked();
  }, async (q) => (await searchTokens(q)).map((t) => ({ label: `${t.name}${t.detail ? `, ${t.detail}` : ''}`, value: t })));
  $('btn-cancel-token').addEventListener('click', () => $('token-add-dialog').removeAttribute('open'));
  $('btn-save-token').addEventListener('click', saveDeckDialog);

  $('btn-cancel-pair').addEventListener('click', () => $('token-pair-dialog').removeAttribute('open'));
  $('btn-confirm-pair').addEventListener('click', () => {
    const other = $('token-pair-select').value;
    $('token-pair-dialog').removeAttribute('open');
    if (pairing && other && tokenPartner(state.currentPrism, pairing) !== other) {
      save(pairTokens(state.currentPrism, pairing, other));
    }
  });
}
