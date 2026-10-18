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
import { queueSwap, queueByDeck, applyDeck, removeSwap } from './modules/swap-queue.js';
import { cardsToDecklistText } from './modules/parser.js';
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
  renderQueue();
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
wireQueue();

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
  $('swap-queue-deck').hidden = true;
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

  const picker = $('swap-queue-deck');
  const deckNames = new Map(getCurrentPrism().decks.map((d) => [d.id, d.name]));
  picker.innerHTML = ranked.eligibleDecks
    .map((d) => `<wa-option value="${escapeHtml(d.deckId)}">${escapeHtml(deckNames.get(d.deckId))}</wa-option>`).join('');
  picker.value = '';
  picker.hidden = !decks;
}

function costText({ marksToAdd, staleMarks }) {
  if (!marksToAdd && !staleMarks) return 'No new marks';
  return [
    marksToAdd && `${plural(marksToAdd, 'mark')} to add`,
    staleMarks && `${plural(staleMarks, 'mark')} to clear`,
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
    return `<span class="wa-cluster wa-gap-3xs"><wa-button size="s" appearance="outlined" variant="neutral" data-swap-deck="${escapeHtml(deckId)}"><span slot="start" class="stripe-detail-swatch" style="background:${escapeHtml(deck.color)}"></span>${escapeHtml(deck.name)}${cost}</wa-button><wa-button size="s" appearance="plain" variant="neutral" data-queue-deck="${escapeHtml(deckId)}"><wa-icon name="list-check" label="Add to queue for ${escapeHtml(deck.name)}"></wa-icon></wa-button></span>`;
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
    const queueDeck = e.target.closest('[data-queue-deck]')?.dataset.queueDeck;
    if (queueDeck) {
      addToQueue({ deckId: queueDeck, outgoing: row.dataset.swapOut });
      return;
    }
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
      : `${incoming} gets its own sleeve.${summary.staleMarks ? ` The ${outgoing} sleeve's old marks show under Marks to Clear on the Results tab.` : ''}`;

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
  renderQueue();
}

// ============================================================================
// Swap Queue (#364)
// ============================================================================

// Ticks live for the page only. A flagged swap starts unticked.
const ticks = new Map();
const isTicked = (swap) => ticks.get(swap.id) ?? !swap.flag;
const FLAG_TEXT = {
  'in-deck': 'Already in this deck. Untick it, or remove it.',
  'duplicate-cut': 'Another Planned swap for this deck cuts the same card.',
};

function addToQueue({ deckId, outgoing }) {
  const prism = getCurrentPrism();
  savePrism(queueSwap(prism, { incoming: current.incoming.name, deckId, outgoing }));
  const deck = prism.decks.find((d) => d.id === deckId);
  showSuccess(`Queued ${current.incoming.name} for ${deck.name}.`);
  renderQueue();
}

// Each Planned swap's single-swap cost on the PRISM as it is now.
function estimateText(prism, swap) {
  if (!swap.outgoing) return 'No cut chosen yet.';
  try {
    const { summary } = applySwap(prism, { outgoing: swap.outgoing, incoming: swap.incoming, deckIds: [swap.deckId], copies: swap.copies });
    return `Estimate: ${costText(summary).toLowerCase()}`;
  } catch (err) {
    return err.message;
  }
}

let queueVersion = 0;

function renderQueue() {
  const stored = getCurrentPrism();
  if (!stored) return;
  const { prism, groups } = queueByDeck(stored);
  // Planned swaps for a deleted deck are removed for good, with a tombstone.
  if (prism !== stored) savePrism(prism);
  const version = ++queueVersion;

  $('swap-queue').hidden = !groups.length;
  $('swap-queue-decks').innerHTML = groups.map(({ deck, swaps }) => {
    const blocked = swaps.some((s) => isTicked(s) && !s.outgoing);
    const none = !swaps.some(isTicked);
    return `<section class="wa-stack wa-gap-s" data-queue-group="${escapeHtml(deck.id)}">
      <h3 class="wa-heading-m wa-cluster wa-gap-xs"><span class="stripe-detail-swatch" style="background:${escapeHtml(deck.color)}"></span>${escapeHtml(deck.name)}</h3>
      <ul class="swap-rows">${swaps.map((s) => `<li class="queue-swap wa-stack wa-gap-xs" data-planned="${escapeHtml(s.id)}">
        <wa-checkbox data-tick ${isTicked(s) ? 'checked' : ''}><span class="card-name-cell" data-card-name="${escapeHtml(s.incoming)}">${escapeHtml(s.incoming)}</span>${s.outgoing ? ` for <span class="card-name-cell" data-card-name="${escapeHtml(s.outgoing)}">${escapeHtml(s.outgoing)}</span>` : ''}</wa-checkbox>
        ${s.flag ? `<wa-callout size="small" variant="warning">${FLAG_TEXT[s.flag]}</wa-callout>` : ''}
        <span class="wa-caption-s wa-color-text-quiet">${escapeHtml(estimateText(prism, s))}</span>
        <div class="queue-swap-fields wa-cluster wa-gap-s wa-align-items-end">
          <wa-select data-cut size="s" label="Cut" placeholder="Choose a cut">${s.outgoing ? `<wa-option value="0">${escapeHtml(s.outgoing)}</wa-option>` : ''}</wa-select>
          <wa-input data-copies type="number" min="1" size="s" label="Copies" value="${s.copies}"></wa-input>
          <wa-input data-note size="s" label="Note" value="${escapeHtml(s.note || '')}"></wa-input>
          <wa-button data-remove size="s" appearance="plain" variant="danger"><wa-icon slot="start" name="trash"></wa-icon>Remove</wa-button>
        </div>
      </li>`).join('')}</ul>
      <div class="wa-cluster wa-gap-s wa-align-items-center">
        <wa-button data-apply-deck="${escapeHtml(deck.id)}" variant="brand" size="s" ${blocked || none ? 'disabled' : ''}>Apply this deck</wa-button>
        ${blocked ? '<span class="wa-caption-s wa-color-text-quiet">Choose a cut for every ticked idea first.</span>' : ''}
      </div>
    </section>`;
  }).join('');

  for (const group of groups) {
    for (const swap of group.swaps) {
      const select = $('swap-queue-decks').querySelector(`[data-planned="${CSS.escape(swap.id)}"] [data-cut]`);
      select.value = swap.outgoing ? '0' : '';
      fillCutOptions(prism, swap, select, version);
    }
  }
}

// The cut picker lists the comparable ranking for this deck. It needs Scryfall
// attributes (cached), so it fills in after render; if Scryfall fails it
// falls back to the deck's other cards.
const cutChoices = new WeakMap();
async function fillCutOptions(prism, swap, select, version) {
  const deck = prism.decks.find((d) => d.id === swap.deckId);
  let names;
  try {
    const attributes = await getCardAttributes([...new Set([swap.incoming, ...commanderNames(prism), ...deck.cards.map((c) => c.name)])]);
    const incoming = attributes.get(swap.incoming);
    if (!incoming) throw new Error(`Scryfall couldn't match ${swap.incoming}.`);
    const ranked = rankComparables(prism, { name: swap.incoming, ...incoming }, attributes, await (jobIndexReady ?? loadJobIndex()));
    names = [ranked.sameType, ranked.differentJob, ranked.lookBeyond].filter(Boolean)
      .flatMap((s) => [...s.noNewMarks, ...s.otherSwaps])
      .filter((r) => r.deckIds.includes(swap.deckId))
      .map((r) => r.name);
  } catch (err) {
    console.warn('Swap Queue: ranking the cut picker failed:', err);
    names = deck.cards.filter((c) => !c.isCommander && !c.isBasicLand).map((c) => c.name);
  }
  if (version !== queueVersion) return;
  names = [...new Set([...(swap.outgoing ? [swap.outgoing] : []), ...names])];
  cutChoices.set(select, names);
  select.innerHTML = names.map((n, i) => `<wa-option value="${i}">${escapeHtml(n)}</wa-option>`).join('');
  select.value = swap.outgoing ? '0' : '';
}

function plannedSwapFor(el) {
  const id = el.closest('[data-planned]')?.dataset.planned;
  return getCurrentPrism().plannedSwaps?.find((s) => s.id === id);
}

function updatePlanned(swap, changes) {
  savePrism(queueSwap(getCurrentPrism(), { incoming: swap.incoming, deckId: swap.deckId, ...changes }));
  renderQueue();
}

function wireQueue() {
  const list = $('swap-queue-decks');
  wireCardPreview(list, (name) => processCards(getCurrentPrism()).find((c) => c.name === name)?.stripes || []);

  $('swap-queue-deck').addEventListener('change', (e) => {
    const deckId = e.target.value;
    if (!deckId || !current) return;
    addToQueue({ deckId });
    e.target.value = '';
  });

  list.addEventListener('change', (e) => {
    const swap = plannedSwapFor(e.target);
    if (!swap) return;
    if (e.target.matches('[data-tick]')) {
      ticks.set(swap.id, e.target.checked);
      renderQueue();
    } else if (e.target.matches('[data-cut]')) {
      const outgoing = cutChoices.get(e.target)?.[Number(e.target.value)];
      if (outgoing && outgoing !== swap.outgoing) updatePlanned(swap, { outgoing });
    } else if (e.target.matches('[data-copies]')) {
      const copies = Math.max(1, Math.floor(Number(e.target.value)) || 1);
      if (copies !== swap.copies) updatePlanned(swap, { copies });
    } else if (e.target.matches('[data-note]')) {
      const note = e.target.value.trim();
      if (note !== (swap.note || '')) updatePlanned(swap, { note });
    }
  });

  list.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      savePrism(removeSwap(getCurrentPrism(), plannedSwapFor(remove).id));
      renderQueue();
      return;
    }
    const apply = e.target.closest('[data-apply-deck]');
    if (apply && !apply.disabled) openQueueDialog(apply.dataset.applyDeck);
  });

  $('queue-steps').addEventListener('change', (e) => {
    if (!e.target.matches('[data-sleeve]') || !queueState) return;
    queueState.sleeves.set(e.target.dataset.sleeve, e.target.checked);
    renderQueuePreview();
  });
  $('queue-confirm').addEventListener('click', confirmQueue);
  $('queue-dialog').addEventListener('wa-after-hide', (e) => {
    if (e.target === $('queue-dialog')) queueState = null;
  });
}

// { deckId, sleeves: Map(id → wants a Sleeve swap; default yes when offered) }
let queueState = null;

function tickedFor(deckId) {
  const group = queueByDeck(getCurrentPrism()).groups.find((g) => g.deck.id === deckId);
  return (group?.swaps || []).filter(isTicked)
    .map((s) => ({ id: s.id, sleeve: queueState.sleeves.get(s.id) ?? true }));
}

function openQueueDialog(deckId) {
  const deck = getCurrentPrism().decks.find((d) => d.id === deckId);
  queueState = { deckId, sleeves: new Map() };
  const dialog = $('queue-dialog');
  dialog.setAttribute('label', `Apply ${deck.name}`);
  $('queue-preview').hidden = false;
  $('queue-result').hidden = true;
  $('queue-confirm').hidden = false;
  $('queue-cancel').textContent = 'Cancel';
  if (renderQueuePreview()) dialog.setAttribute('open', '');
}

// The same applyDeck call prices the preview and performs the apply.
function renderQueuePreview() {
  let result;
  try {
    result = applyDeck(getCurrentPrism(), tickedFor(queueState.deckId));
  } catch (err) {
    showError(err.message);
    return false;
  }
  const { summary, steps } = result;
  $('queue-cost').textContent = costText(summary);
  $('queue-copies').textContent = summary.copiesToBuy ? `Buy ${copiesText(summary.copiesToBuy)} in all.` : 'No copy to buy.';
  $('queue-steps').innerHTML = steps.map(({ swap, sleeve, sleeveSwap }) => `<li class="wa-stack wa-gap-2xs">
      <span><strong>${escapeHtml(swap.incoming)}</strong> for ${escapeHtml(swap.outgoing)}${swap.copies > 1 ? ` (${copiesText(swap.copies)})` : ''}</span>
      ${sleeve === 'available' ? `<wa-checkbox data-sleeve="${escapeHtml(swap.id)}" ${sleeveSwap ? 'checked' : ''} hint="${escapeHtml(swap.incoming)} goes into the ${escapeHtml(swap.outgoing)} sleeve, which already carries this deck's marks.">Sleeve swap</wa-checkbox>` : ''}
      ${sleeve === 'other-decks' ? `<span class="wa-caption-s wa-color-text-quiet">The ${escapeHtml(swap.outgoing)} sleeve also carries other decks' marks, so this is a plain Swap.</span>` : ''}
    </li>`).join('');
  return true;
}

function confirmQueue() {
  if (!queueState) return;
  const prism = getCurrentPrism();
  let result;
  try {
    result = applyDeck(prism, tickedFor(queueState.deckId));
  } catch (err) {
    showError(err.message);
    return;
  }
  recordUnmarkedCards(prism.id, result.summary.unmarkedKeys);
  savePrism(result.prism);

  const deck = result.prism.decks.find((d) => d.id === queueState.deckId);
  $('queue-result-summary').textContent = `Applied ${plural(result.steps.length, 'Planned swap')} to ${deck.name}. PRISM only changes its own decklist, so paste this one into Moxfield or Archidekt too.`;
  $('queue-decklist').value = cardsToDecklistText(deck.cards);
  $('queue-pull').innerHTML = result.pullList.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  $('queue-pull-empty').hidden = result.pullList.length > 0;
  $('queue-preview').hidden = true;
  $('queue-result').hidden = false;
  $('queue-confirm').hidden = true;
  $('queue-cancel').textContent = 'Done';

  renderQueue();
  if (current) search(current.incoming.name);
}
