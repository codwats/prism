// Swap Planner (#296): search one incoming card, list the comparable cards in
// the decks it fits, and what each Swap costs in marks. A Members-only Extra
// (ADR 0003). Prints only a card's image, name, mana cost and type line from
// Scryfall — never color identity or tag names (#278).

import { initLayout } from './layout.js';
import { initExtraGate } from './modules/membership.js';
import { getCurrentPrism, savePrism, recordUnmarkedCards } from './modules/storage.js';
import { fetchCard, getCardAttributes } from './modules/scryfall.js';
import { loadJobIndex } from './modules/oracle-tags.js';
import { rankComparables, mainType } from './modules/comparables.js';
import { applySwap } from './modules/swap.js';
import { processCards } from './modules/processor.js';
import { wireCardPreview, buildCardWithStripes, createLoadingElement, createErrorElement } from './modules/card-preview.js';
import { wireCardAutocomplete } from './modules/card-autocomplete.js';
import { escapeHtml } from './core/utils.js';
import { showError, showSuccess } from './core/notifications.js';

const INTRO_KEY = 'prism_swap_intro_dismissed';
const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const commanderNames = (prism) => prism.decks.flatMap((d) => d.cards.filter((c) => c.isCommander).map((c) => c.name));

let jobIndexReady = null;
let stripesByName = new Map();
let searchVersion = 0;
// The last search's incoming card and ranking, for the confirm dialog.
let current = null;

initLayout({ activePage: '', headerCta: { href: 'build.html', label: 'Build PRISM', icon: 'wand-magic-sparkles' } });
initExtraGate(() => {
  // Once per page: eligibility needs the commanders' attributes before any
  // search, and the job index can take a few seconds on its first daily load.
  if (jobIndexReady) return;
  jobIndexReady = loadJobIndex();
  const prism = getCurrentPrism();
  // A failure here is ignored: the search asks again and reports it.
  if (prism?.decks?.length) getCardAttributes(commanderNames(prism)).catch(() => {});
});

wireIntro();
wireCardAutocomplete($('swap-search'), $('swap-search-suggest'), search);
wireCardPreview($('swap-results'), (name) => stripesByName.get(name) || []);
wireSwapDialog();

function wireIntro() {
  const intro = $('swap-intro');
  try {
    if (localStorage.getItem(INTRO_KEY) === '1') return;
  } catch { /* no storage: show it every time */ }
  intro.hidden = false;
  $('swap-intro-dismiss').addEventListener('click', () => {
    intro.hidden = true;
    try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* shown again next visit */ }
  });
}

function setStatus(text) {
  $('swap-status').textContent = text || '';
  $('swap-status').hidden = !text;
}

// A Scryfall failure stops the search with no partial results: a list ranked
// on missing identities would read as real.
async function search(name) {
  const version = ++searchVersion;
  try {
    await runSearch(name, version);
  } catch (err) {
    console.error('Swap Planner search failed:', err);
    if (version !== searchVersion) return;
    $('swap-incoming').hidden = true;
    $('swap-results').replaceChildren();
    current = null;
    // A 429 blocks every request for 30 s, so an immediate retry would fail too.
    setStatus(/Rate limited/.test(err.message)
      ? 'Scryfall asked PRISM to slow down. Try the search again in 30 seconds.'
      : "Scryfall didn't answer. Try the search again.");
  }
}

async function runSearch(name, version) {
  const stale = () => version !== searchVersion;
  $('swap-incoming').hidden = true;
  $('swap-results').replaceChildren();
  current = null;

  const prism = getCurrentPrism();
  if (!prism?.decks?.length) {
    setStatus('This PRISM has no decks yet. Add them on the Build page first.');
    return;
  }
  setStatus(`Looking up ${name}…`);

  const [card, attrsMap] = await Promise.all([
    fetchCard(name).catch(() => null),
    getCardAttributes([name]),
  ]);
  if (stale()) return;
  const attrs = attrsMap.get(name);
  if (!attrs) {
    setStatus(`Scryfall couldn't match ${name}.`);
    return;
  }
  const incoming = { name, ...attrs };
  renderIncoming(incoming, card?.image_uri);

  setStatus('Finding the decks it fits…');
  const jobIndex = await (jobIndexReady ?? loadJobIndex());
  // Commanders first (enough for eligibility), then every card in the decks
  // it fits; both only request what isn't cached.
  const commanders = commanderNames(prism);
  const first = rankComparables(prism, incoming, await getCardAttributes(commanders), jobIndex);
  if (stale()) return;
  if (first.reason === 'basic-land') {
    setStatus('A basic land has no Swap to plan. Pick a nonbasic card.');
    return;
  }
  const eligible = new Set(first.eligibleDecks.map((d) => d.deckId));
  const deckCards = prism.decks.filter((d) => eligible.has(d.id)).flatMap((d) => d.cards.map((c) => c.name));
  if (deckCards.length) setStatus('Comparing cards…');
  const attributes = await getCardAttributes([...new Set([...commanders, ...deckCards])]);
  if (stale()) return;

  const ranked = rankComparables(prism, incoming, attributes, jobIndex);
  stripesByName = new Map(processCards(prism).map((c) => [c.name, c.stripes]));
  current = { incoming, ranked };
  setStatus('');
  renderSummary(ranked);
  renderResults(prism, incoming, ranked, attributes, version);
}

function renderIncoming(incoming, imageUri) {
  const img = $('swap-incoming-image');
  img.hidden = !imageUri;
  if (imageUri) {
    img.src = imageUri;
    img.alt = incoming.name;
  }
  $('swap-incoming-name').textContent = incoming.name;
  $('swap-incoming-meta').textContent = metaLine(incoming);
  $('swap-fit').textContent = '';
  $('swap-unmatched').hidden = true;
  $('swap-incoming').hidden = false;
}

function metaLine({ manaCost, typeLine }) {
  return [manaCost, typeLine].filter(Boolean).join(' · ');
}

function renderSummary(ranked) {
  const decks = ranked.eligibleDecks.length;
  const unknown = ranked.eligibleDecks.filter((d) => d.identityUnknown).length;
  const similar = new Set([...ranked.sameType.noNewMarks, ...ranked.sameType.otherSwaps].map((r) => r.name)).size;
  $('swap-fit').textContent = decks
    ? `Fits ${plural(decks, 'deck')}${unknown ? ` (identity unknown for ${unknown})` : ''}. ${plural(similar, 'card')} of the same type ${similar === 1 ? 'does' : 'do'} a similar job.`
    : 'Fits none of the decks in this PRISM. The decks that could take it already run it, or its colors are outside theirs.';
  $('swap-unmatched').textContent = `${plural(ranked.unmatched, 'card')} couldn't be matched.`;
  $('swap-unmatched').hidden = !ranked.unmatched;
}

function costText({ marksToAdd, staleMarks }) {
  if (!marksToAdd && !staleMarks) return 'No new marks';
  return [
    marksToAdd && `${plural(marksToAdd, 'mark')} to add`,
    staleMarks && plural(staleMarks, 'stale mark'),
  ].filter(Boolean).join(' · ');
}

function renderResults(prism, incoming, ranked, attributes, version) {
  const results = $('swap-results');
  if (!ranked.eligibleDecks.length) return;
  const decks = new Map(prism.decks.map((d) => [d.id, d]));

  // One button per deck opens the confirm dialog. An "Other swaps" button
  // gets a cost slot that fillCosts prices after render.
  const chip = (name, deckId, withCost) => {
    const deck = decks.get(deckId);
    const cost = withCost
      ? `<span data-cost-out="${escapeHtml(name)}" data-cost-deck="${escapeHtml(deckId)}">· …</span>`
      : '';
    return `<wa-button size="s" appearance="outlined" variant="neutral" data-swap-deck="${escapeHtml(deckId)}"><span slot="start" class="stripe-detail-swatch" style="background:${escapeHtml(deck.color)}"></span>${escapeHtml(deck.name)}${cost}</wa-button>`;
  };
  const row = (r, withCost) => `<li class="swap-row wa-stack wa-gap-2xs" data-swap-out="${escapeHtml(r.name)}"${withCost ? '' : ` data-sleeve="${escapeHtml(r.deckIds.join(','))}"`}>
      <span class="card-name-cell" data-card-name="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
      <span class="wa-caption-s wa-color-text-quiet">${escapeHtml(metaLine(attributes.get(r.name) || r))}</span>
      <span class="wa-cluster wa-gap-2xs">${r.deckIds.map((id) => chip(r.name, id, withCost)).join('')}</span>${withCost ? '' : `
      <span class="wa-caption-s wa-color-text-quiet">No new marks · buy ${copiesText(r.copyCount)}</span>`}
    </li>`;
  const sectionsHtml = ({ noNewMarks, otherSwaps }) => [
    noNewMarks.length && `<section class="wa-stack wa-gap-s"><h3 class="wa-heading-l">No new marks</h3><ul class="swap-rows">${noNewMarks.map((r) => row(r, false)).join('')}</ul></section>`,
    otherSwaps.length && `<section class="wa-stack wa-gap-s"><h3 class="wa-heading-l">Other swaps</h3><ul class="swap-rows">${otherSwaps.map((r) => row(r, true)).join('')}</ul></section>`,
  ].filter(Boolean).join('');
  const count = (s) => new Set([...s.noNewMarks, ...s.otherSwaps].map((r) => r.name)).size;

  const sameType = sectionsHtml(ranked.sameType);
  const differentJob = count(ranked.differentJob);
  const type = mainType(incoming.typeLine);
  results.innerHTML = [
    sameType || '<p class="wa-color-text-quiet">No card of the same type in these decks does a similar job.</p>',
    differentJob && `<wa-details summary="${plural(differentJob, 'more card')} of the same type, doing a different job"><div class="wa-stack wa-gap-l">${sectionsHtml(ranked.differentJob)}</div></wa-details>`,
    ranked.lookBeyond && `<div><wa-button id="swap-look-beyond" variant="${sameType ? 'neutral' : 'brand'}" appearance="${sameType ? 'outlined' : 'accent'}">Look beyond ${escapeHtml(type ? type.toLowerCase() : 'this type')}</wa-button></div>`,
  ].filter(Boolean).join('');
  fillCosts(prism, incoming, version);

  $('swap-look-beyond')?.addEventListener('click', (e) => {
    const holder = e.currentTarget.parentElement;
    const beyond = sectionsHtml(ranked.lookBeyond);
    holder.outerHTML = `<div class="wa-stack wa-gap-l"><p class="wa-color-text-quiet">${beyond
      ? `Cards of other types that do every job ${escapeHtml(incoming.name)} does.`
      : 'No card of another type does every job this card does.'}</p>${beyond}</div>`;
    fillCosts(prism, incoming, version);
  });
}

// A plain Swap is priced per deck: one copy out of that deck alone. Each
// applySwap runs processCards twice (~50 ms on a 14-deck PRISM), so costs
// fill in after the rows render, in page order, yielding between rows.
// Two runs never price the same slot twice: each takes its slots up front.
async function fillCosts(prism, incoming, version) {
  const slots = [...$('swap-results').querySelectorAll('[data-cost-out]:not([data-cost-taken])')];
  slots.forEach((el) => el.setAttribute('data-cost-taken', ''));
  for (const el of slots) {
    await new Promise((resolve) => setTimeout(resolve));
    if (version !== searchVersion) return;
    const { summary } = applySwap(prism, {
      outgoing: el.dataset.costOut, incoming: incoming.name, deckIds: [el.dataset.costDeck], copies: 1,
    });
    el.textContent = `· ${costText(summary)}`;
  }
}

// ============================================================================
// Confirm dialog (#297)
// ============================================================================

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });
const copiesText = (n) => `${n} ${n === 1 ? 'copy' : 'copies'}`;
let dialogState = null;

// Scope choices for an outgoing card, from every row it has in the ranking:
// a Sleeve swap per "No new marks" row, then one deck at a time. Rows only
// ever hold decks where the card isn't the commander, so a commander deck
// never appears.
function scopesFor(name) {
  const { ranked } = current;
  const rows = [ranked.sameType, ranked.differentJob, ranked.lookBeyond]
    .filter(Boolean)
    .flatMap((s) => [...s.noNewMarks.map((r) => ({ ...r, sleeve: true })), ...s.otherSwaps])
    .filter((r) => r.name === name);
  const sleeves = rows.filter((r) => r.sleeve).map((r) => ({
    value: `sleeve:${r.deckIds.join(',')}`, deckIds: r.deckIds, copies: r.copyCount, sleeve: true,
  }));
  const deckIds = [...new Set(rows.flatMap((r) => r.deckIds))];
  return [...sleeves, ...deckIds.map((id) => ({ value: `deck:${id}`, deckIds: [id], copies: 1 }))];
}

function wireSwapDialog() {
  const dialog = $('swap-dialog');
  const scope = $('swap-scope');

  $('swap-results').addEventListener('click', (e) => {
    // On mobile a tap on the name opens the card preview instead.
    if (e.target.closest('.card-name-cell') && window.matchMedia('(max-width: 768px)').matches) return;
    const row = e.target.closest('[data-swap-out]');
    if (!row || !current) return;
    const deckId = e.target.closest('[data-swap-deck]')?.dataset.swapDeck;
    const first = row.dataset.sleeve ? `sleeve:${row.dataset.sleeve}` : `deck:${deckId || row.querySelector('[data-swap-deck]').dataset.swapDeck}`;
    openSwapDialog(row.dataset.swapOut, first);
  });

  scope.addEventListener('change', () => renderSwapPreview(scope.value || scope.getAttribute('value')));
  $('swap-confirm').addEventListener('click', confirmSwap);
  dialog.addEventListener('wa-after-hide', (e) => {
    if (e.target === dialog) dialogState = null;
  });
}

function openSwapDialog(outgoing, firstScope) {
  const prism = getCurrentPrism();
  const scopes = scopesFor(outgoing);
  const decks = new Map(prism.decks.map((d) => [d.id, d]));
  dialogState = { outgoing, incoming: current.incoming.name, scopes, decks };

  const dialog = $('swap-dialog');
  dialog.setAttribute('label', `Swap ${outgoing} for ${current.incoming.name}`);
  $('swap-out-caption').textContent = `${outgoing}, marked now`;
  $('swap-in-caption').textContent = `${current.incoming.name}, after the Swap`;
  showCard($('swap-out-card'), outgoing, stripesByName.get(outgoing) || []);

  const scope = $('swap-scope');
  scope.innerHTML = scopes.map((s) => {
    const label = s.sleeve
      ? `Sleeve swap (${s.deckIds.map((id) => decks.get(id).name).join(', ')})`
      : `Only ${decks.get(s.deckIds[0]).name}`;
    return `<wa-radio value="${escapeHtml(s.value)}">${escapeHtml(label)}</wa-radio>`;
  }).join('');
  scope.value = firstScope;
  scope.setAttribute('value', firstScope);
  renderSwapPreview(firstScope);
  dialog.setAttribute('open', '');
}

// The same applySwap call prices the preview and performs the Swap.
function swapFor(prism, value) {
  const s = dialogState.scopes.find((x) => x.value === value);
  return {
    scope: s,
    result: applySwap(prism, { outgoing: dialogState.outgoing, incoming: dialogState.incoming, deckIds: s.deckIds, copies: s.copies, sleeve: !!s.sleeve }),
  };
}

function renderSwapPreview(value) {
  if (!dialogState) return;
  const { outgoing, incoming, decks } = dialogState;
  const prism = getCurrentPrism();
  let preview;
  try {
    preview = swapFor(prism, value);
  } catch (err) {
    showError(err.message);
    return;
  }
  const { scope, result: { prism: after, summary } } = preview;
  // The sleeve the incoming copy goes into, not every sleeve of the card.
  const incomingAfter = processCards(after).find((c) => c.name === incoming);
  const sleeveBatch = incomingAfter?.batches.find((b) => scope.deckIds.every((id) => b.participantIds.includes(id)));
  showCard($('swap-in-card'), incoming, sleeveBatch?.stripes || incomingAfter?.stripes || []);

  $('swap-cost').textContent = costText(summary);
  $('swap-copies').textContent = summary.copiesToBuy ? `Buy ${copiesText(summary.copiesToBuy)} of ${incoming}.` : 'No copy to buy.';
  const alreadyHere = prism.decks.some((d) => d.cards.some((c) => c.name === incoming));
  $('swap-sleeve').textContent = summary.sleeveSwap
    ? `${incoming} goes into the ${outgoing} sleeve, which already carries these decks' marks.${alreadyHere ? ` Your other ${incoming} sleeve stays as it is.` : ''}`
    : alreadyHere
      ? `The ${incoming} sleeve you already have takes the new marks.`
      : `${incoming} gets its own sleeve.${summary.staleMarks ? ` The ${outgoing} sleeve's stale marks show under Stale Marks on the Results tab.` : ''}`;

  const scopeDecks = scope.deckIds.map((id) => decks.get(id));
  const commanders = [...new Set(scopeDecks.flatMap((d) => d.cards.filter((c) => c.isCommander).map((c) => c.name)))];
  const em = (t) => `<em>${escapeHtml(t)}</em>`;
  $('swap-questions').innerHTML = [
    `Does ${em(incoming)} do the same job as ${em(outgoing)}?`,
    'Is it better at that job?',
    'What does the deck lose?',
    `Does it work with ${commanders.length ? em(listFormat.format(commanders)) : 'your commander'}?`,
  ].map((q) => `<li>${q}</li>`).join('');
}

let cardToken = 0;
async function showCard(holder, name, stripes) {
  const token = String(++cardToken);
  holder.dataset.token = token;
  holder.replaceChildren(createLoadingElement());
  let el;
  try {
    el = await buildCardWithStripes(name, stripes);
  } catch {
    el = createErrorElement();
  }
  // A later preview for this holder may have landed first.
  if (holder.dataset.token !== token) return;
  holder.replaceChildren(el);
}

function confirmSwap() {
  if (!dialogState) return;
  const scope = $('swap-scope');
  const prism = getCurrentPrism();
  let swap;
  try {
    swap = swapFor(prism, scope.value || scope.getAttribute('value'));
  } catch (err) {
    showError(err.message);
    return;
  }
  const { scope: chosen, result } = swap;
  recordUnmarkedCards(prism.id, result.summary.unmarkedKeys);
  savePrism(result.prism);

  const { outgoing, incoming, decks } = dialogState;
  const deckNames = listFormat.format(chosen.deckIds.map((id) => decks.get(id).name));
  $('swap-dialog').removeAttribute('open');
  showSuccess(`Swapped ${outgoing} for ${incoming} in ${deckNames}. Update the deck on Moxfield or Archidekt too; PRISM only changes its own decklist.`);
  search(incoming);
}
