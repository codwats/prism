// PROTOTYPE — throwaway. Swap Planner flow (#276). Lives on branch
// prototype/swap-planner-flow only; never merge to main.
//
// Question: what should the Swap Planner flow look and feel like?
// Three structurally different variants on one page, switched by ?variant=
// (A = stepper, B = ranked list, C = deck board). All share the same
// data + cost logic below; only rendering differs.
//
// Reads the current PRISM from localStorage. Nothing is saved: "Swap" applies
// in memory and shows what would be written.

import { getCurrentPrism } from '../modules/storage.js';
import { processCards, commanderNames, DEFAULT_COLORS } from '../modules/processor.js';
import { escapeHtml, countVisibleMarks, passKeysForCard } from '../core/utils.js';
import { showPreview, hidePreview, updatePosition } from '../modules/card-preview.js';

const VARIANTS = { A: 'Stepper', B: 'Ranked list', C: 'Deck board' };
const variant = VARIANTS[new URLSearchParams(location.search).get('variant')] ? new URLSearchParams(location.search).get('variant') : 'A';

// ---------- card attributes (PROTOTYPE cache, wipe me) ----------
const ATTR_KEY = 'prism_swap_prototype_attrs';
let attrs = {};
try { attrs = JSON.parse(localStorage.getItem(ATTR_KEY) || '{}'); } catch { /* fresh */ }
const front = n => n.split(' // ')[0].toLowerCase();
const attrOf = n => attrs[front(n)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const slim = c => ({
  ci: c.color_identity || [],
  type: (c.type_line || c.card_faces?.[0]?.type_line || ''),
  cmc: c.cmc ?? 0,
  mana: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '',
});

async function fetchAttrs(names, onProgress) {
  const todo = [...new Set(names.map(front))].filter(n => !attrs[n]);
  for (let i = 0; i < todo.length; i += 75) {
    onProgress?.(i, todo.length);
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: todo.slice(i, i + 75).map(name => ({ name })) }),
    });
    const json = await res.json();
    for (const c of json.data || []) attrs[front(c.name)] = slim(c);
    await sleep(120);
  }
  try { localStorage.setItem(ATTR_KEY, JSON.stringify(attrs)); } catch { /* full */ }
}

// ---------- domain (rough applySwap + cost diff, per #274) ----------
const MAIN_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'];
const mainTypes = typeLine => MAIN_TYPES.filter(t => typeLine.split(' // ')[0].split('—')[0].includes(t));
const deckCi = deck => {
  const cmdrs = commanderNames(deck);
  if (!cmdrs.length || cmdrs.some(n => !attrOf(n))) return null;
  return new Set(cmdrs.flatMap(n => attrOf(n).ci));
};
const fits = (x, ci) => ci && x.ci.every(c => ci.has(c));
const runs = (deck, name) => deck.cards.some(c => c.name.toLowerCase() === name.toLowerCase());
const markKey = s => `${s.position}|${s.side}|${s.markType || 'stripe'}`;
const visibleMarks = card => new Set((card?.stripes || []).filter(s => s.markType !== 'membership').map(markKey));

export function applySwap(prism, { outgoing, incoming, deckIds, copies }) {
  const next = structuredClone(prism);
  const now = new Date().toISOString();
  for (const deck of next.decks.filter(d => deckIds.includes(d.id))) {
    const y = deck.cards.find(c => c.name === outgoing);
    y.quantity -= copies;
    if (y.quantity <= 0) deck.cards = deck.cards.filter(c => c !== y);
    const x = deck.cards.find(c => c.name.toLowerCase() === incoming.toLowerCase());
    if (x) x.quantity += copies;
    else deck.cards.push({ name: incoming, quantity: copies, isCommander: false, isBasicLand: false });
    deck.updatedAt = now;
  }
  next.updatedAt = now;
  return next;
}

function costOf(prism, before, opt, xName) {
  const after = processCards(applySwap(prism, opt));
  const find = (list, n) => list.find(c => c.name.toLowerCase() === n.toLowerCase());
  const [yB, yA, xB, xA] = [find(before, opt.outgoing), find(after, opt.outgoing), find(before, xName), find(after, xName)];
  const stale = [...visibleMarks(yB)].filter(k => !visibleMarks(yA).has(k)).length;
  const add = [...visibleMarks(xA)].filter(k => !visibleMarks(xB).has(k)).length;
  const buy = (xA?.totalQuantity || 0) - (xB?.totalQuantity || 0);
  return { stale, add, buy, xAfter: xA };
}

/** Every Swap option for incoming card X across the PRISM. */
function buildOptions(prism, x) {
  const processed = processCards(prism);
  const xInPrism = prism.decks.some(d => runs(d, x.name));
  const marked = new Set(prism.markedCards || []);
  const cis = new Map(prism.decks.map(d => [d.id, deckCi(d)]));
  const eligible = prism.decks.filter(d => fits(x, cis.get(d.id)) && !runs(d, x.name));
  const skipped = prism.decks.filter(d => !cis.get(d.id));
  const xTypes = mainTypes(x.type);
  const seenSleeve = new Set();
  const options = [];

  for (const deck of eligible) {
    const comparable = deck.cards
      .filter(c => !c.isCommander && !c.isBasicLand && c.quantity === 1 && attrOf(c.name))
      .filter(c => mainTypes(attrOf(c.name).type).some(t => xTypes.includes(t)))
      .sort((a, b) => Math.abs(attrOf(a.name).cmc - x.cmc) - Math.abs(attrOf(b.name).cmc - x.cmc))
      .slice(0, 8);

    for (const y of comparable) {
      const pc = processed.find(p => p.name === y.name);
      const batch = pc?.batches.find(b => !b.isDedicated && b.participantIds.includes(deck.id));
      const sleeveOk = batch && !xInPrism && batch.copyCount === 1 && batch.participantIds.every(id => {
        const d = prism.decks.find(dd => dd.id === id);
        return fits(x, cis.get(id)) && !runs(d, x.name) && d.cards.find(c => c.name === y.name)?.quantity === 1;
      });
      const base = { outgoing: y.name, incoming: x.name, attrs: attrOf(y.name), stripes: pc?.stripes || [] };

      if (sleeveOk && !seenSleeve.has(batch.key)) {
        seenSleeve.add(batch.key);
        const done = batch && (marked.has(batch.key) || (pc.batches.length === 1 && marked.has(pc.name)) ||
          (passKeysForCard(pc).length > 0 && passKeysForCard(pc).every(k => marked.has(k))));
        const opt = { ...base, kind: 'sleeve', deckIds: batch.participantIds, copies: 1, done };
        opt.cost = { stale: 0, add: 0, buy: 1, check: costOf(prism, processed, opt, x.name) };
        options.push(opt);
      }
      // Plain single-deck Swap, unless it is the same as the Sleeve swap (core card).
      if (!(sleeveOk && batch.participantIds.length === 1)) {
        const opt = { ...base, kind: xInPrism ? 'add-mark' : 'plain', deckIds: [deck.id], copies: 1 };
        opt.cost = costOf(prism, processed, opt, x.name);
        options.push(opt);
      }
    }
  }
  const total = o => o.cost.add + o.cost.stale;
  options.sort((a, b) => (a.kind === 'sleeve' ? 0 : 1) - (b.kind === 'sleeve' ? 0 : 1) || total(a) - total(b) || Math.abs(a.attrs.cmc - x.cmc) - Math.abs(b.attrs.cmc - x.cmc));
  return { eligible, skipped, options, xInPrism };
}

// ---------- shared bits (not layout) ----------
const deckById = id => ctx.prism.decks.find(d => d.id === id);
const deckNames = o => o.deckIds.map(id => deckById(id).name).join(', ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function costText(o) {
  if (o.kind === 'sleeve') return 'No new marks';
  const parts = [];
  if (o.cost.add) parts.push(plural(o.cost.add, 'mark') + ' to add');
  if (o.cost.stale) parts.push(plural(o.cost.stale, 'stale mark'));
  return parts.join(' · ') || 'No mark changes';
}
const costBadge = o => `<wa-badge variant="${o.kind === 'sleeve' ? 'success' : 'neutral'}" appearance="${o.kind === 'sleeve' ? 'accent' : 'outlined'}">${costText(o)}</wa-badge>`;
const cardName = (o) => `<span class="sp-card" data-card="${escapeHtml(o.outgoing)}" data-opt="${ctx.options.indexOf(o)}">${escapeHtml(o.outgoing)}</span>`;
const meta = a => `<span class="sp-meta">${escapeHtml(a.mana)} · ${escapeHtml(a.type)}</span>`;
const xImg = (size = 'normal') => `<img class="sp-ximg" alt="${escapeHtml(ctx.x.name)}" src="${ctx.x.image}" data-size="${size}">`;

function confirmHtml(o) {
  const deck = deckById(o.deckIds[0]);
  const cmdr = commanderNames(deck).join(' and ') || 'your commander';
  const kindLine = {
    sleeve: `<strong>${escapeHtml(o.incoming)}</strong> moves into ${escapeHtml(o.outgoing)}'s sleeve in ${escapeHtml(deckNames(o))}. The marks are already painted.${o.done ? ' This sleeve is marked, so the new card starts marked.' : ''}`,
    plain: `Swaps ${escapeHtml(o.outgoing)} for <strong>${escapeHtml(o.incoming)}</strong> in ${escapeHtml(deckNames(o))}.`,
    'add-mark': `<strong>${escapeHtml(o.incoming)}</strong> is already in your PRISM. Its sleeve gets a mark for ${escapeHtml(deckNames(o))}, so there's no copy to buy.`,
  }[o.kind];
  return `
    <div class="wa-stack wa-gap-m">
      <div class="wa-cluster wa-gap-s wa-align-items-center">
        <span class="wa-heading-m">${escapeHtml(o.outgoing)} → ${escapeHtml(o.incoming)}</span>
      </div>
      <div class="sp-cost-headline ${o.kind === 'sleeve' ? 'sp-sleeve' : ''}">${costText(o)}${o.kind !== 'add-mark' ? ` · ${plural(o.cost.buy, 'copy')} to buy` : ''}</div>
      <p>${kindLine}</p>
      <div class="wa-stack wa-gap-2xs sp-checklist">
        <span class="wa-caption-m" style="color: var(--wa-color-neutral-text-subtle)">Before you swap, ask yourself:</span>
        <span>Does ${escapeHtml(o.incoming)} do the same job as ${escapeHtml(o.outgoing)}?</span>
        <span>Is it better at that job?</span>
        <span>What does the deck lose?</span>
        <span>Does it work with ${escapeHtml(cmdr)}?</span>
        <a href="guide.html#swap-a-card">How to compare cards →</a>
      </div>
      <div class="wa-cluster wa-gap-s">
        <wa-button variant="brand" data-apply="${ctx.options.indexOf(o)}">Swap</wa-button>
        <span class="wa-caption-s" style="color: var(--wa-color-neutral-text-subtle)">Prototype: nothing is saved.</span>
      </div>
    </div>`;
}

function applyOption(o) {
  const next = applySwap(ctx.prism, o);
  const summary = {
    kind: o.kind,
    removedCardsRowsToWrite: o.kind === 'sleeve' ? [] : o.deckIds.map(deckId => ({ cardName: o.outgoing, deckId, previousQuantity: 1, newQuantity: 0 })),
    markCarried: o.kind === 'sleeve' ? !!o.done : false,
    decksTouched: o.deckIds.map(id => deckById(id).name),
    sleeveCheck_xMarksAfter: o.cost.check ? countVisibleMarks(o.cost.check.xAfter?.stripes) : undefined,
    sleeveCheck_yMarksBefore: o.kind === 'sleeve' ? countVisibleMarks(o.stripes) : undefined,
  };
  setState({ applied: summary, cardCountBefore: countCards(ctx.prism), cardCountAfter: countCards(next) });
  toast(`Swapped ${o.outgoing} for ${o.incoming}. Update the deck on Moxfield or Archidekt too, since PRISM only changes its own decklist.`);
}
const countCards = p => p.decks.reduce((n, d) => n + d.cards.reduce((m, c) => m + c.quantity, 0), 0);

function toast(msg) {
  const el = document.getElementById('sp-toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 6000);
}
function setState(extra) {
  const o = ctx.selected;
  document.getElementById('sp-state').textContent = JSON.stringify({
    variant, incoming: ctx.x && { name: ctx.x.name, type: ctx.x.type, mana: ctx.x.mana, cmc: ctx.x.cmc },
    xInPrism: ctx.xInPrism, eligibleDecks: ctx.eligible?.map(d => d.name), skippedNoCommander: ctx.skipped?.map(d => d.name),
    optionCount: ctx.options?.length, sleeveSwaps: ctx.options?.filter(x => x.kind === 'sleeve').length,
    selected: o && { kind: o.kind, outgoing: o.outgoing, decks: deckNames(o), cost: { ...o.cost, check: undefined, xAfter: undefined }, done: o.done },
    ...extra,
  }, null, 2);
}

// ---------- variants ----------
const ctx = { prism: null, x: null, options: [], eligible: [], skipped: [], selected: null, deckId: null };

function renderA(root) {
  const decks = ctx.eligible;
  const sleeves = ctx.options.filter(o => o.kind === 'sleeve');
  const deckOpts = id => ctx.options.filter(o => o.deckIds.includes(id));
  const step = (n, title, body, on = true) => `
    <wa-card class="${on ? '' : 'sp-dim'}">
      <div slot="header" class="wa-heading-m">${n} · ${title}</div>${on ? body : ''}
    </wa-card>`;
  root.innerHTML = `
    ${sleeves.length ? `<wa-callout variant="success"><wa-icon slot="icon" name="circle-check"></wa-icon>
      ${plural(sleeves.length, 'Sleeve swap')} available: ${escapeHtml(ctx.x.name)} can take over a sleeve with no new marks. Look for the green badge.</wa-callout>` : ''}
    ${step(2, 'Pick a deck', `
      <div class="wa-stack wa-gap-xs">${decks.map(d => `
        <button class="sp-row ${ctx.deckId === d.id ? 'sp-on' : ''}" data-deck="${d.id}" style="--deck:${d.color}">
          <span class="sp-swatch"></span><span>${escapeHtml(d.name)}</span>
          <span class="sp-grow"></span>
          ${deckOpts(d.id).some(o => o.kind === 'sleeve') ? '<wa-badge variant="success">Sleeve swap</wa-badge>' : ''}
          <span class="wa-caption-s">${plural(deckOpts(d.id).length, 'comparable card')}</span>
        </button>`).join('') || '<p>No deck can take this card.</p>'}
      </div>`)}
    ${step(3, 'Pick a card to replace', `
      <div class="wa-stack wa-gap-xs">${deckOpts(ctx.deckId).map(o => `
        <button class="sp-row ${ctx.selected === o ? 'sp-on' : ''}" data-pick="${ctx.options.indexOf(o)}">
          ${cardName(o)} ${meta(o.attrs)}<span class="sp-grow"></span>${costBadge(o)}
        </button>`).join('')}
      </div>`, !!ctx.deckId)}
    ${step(4, 'Check the marks and confirm', ctx.selected ? confirmHtml(ctx.selected) : '', !!ctx.selected)}`;
}

function renderB(root) {
  const sleeves = ctx.options.filter(o => o.kind === 'sleeve');
  const rest = ctx.options.filter(o => o.kind !== 'sleeve');
  const row = o => `
    <button class="sp-row" data-pick="${ctx.options.indexOf(o)}">
      <span class="sp-swatches">${o.deckIds.map(id => `<span class="sp-swatch" style="--deck:${deckById(id).color}"></span>`).join('')}</span>
      <span class="wa-stack wa-gap-3xs" style="text-align:left">
        <span>Swap out ${cardName(o)} ${meta(o.attrs)}</span>
        <span class="wa-caption-s">in ${escapeHtml(deckNames(o))}</span>
      </span>
      <span class="sp-grow"></span>${costBadge(o)}
    </button>`;
  root.innerHTML = `
    <div class="sp-b">
      <div class="wa-cluster wa-gap-m wa-align-items-center">
        ${xImg('small')}
        <div class="wa-stack wa-gap-2xs"><span class="wa-heading-l">${escapeHtml(ctx.x.name)}</span>${meta(ctx.x)}
          <span class="wa-caption-m">Fits ${plural(ctx.eligible.length, 'deck')} · ${plural(ctx.options.length, 'way')} to swap it in</span></div>
      </div>
      <h2 class="wa-heading-m">No new marks</h2>
      <div class="wa-stack wa-gap-xs">${sleeves.map(row).join('') || '<p class="wa-caption-m">No Sleeve swap for this card.</p>'}</div>
      <h2 class="wa-heading-m">Other swaps</h2>
      <div class="wa-stack wa-gap-xs">${rest.map(row).join('')}</div>
    </div>
    <wa-dialog id="sp-dialog" label="Confirm Swap">${ctx.selected ? confirmHtml(ctx.selected) : ''}</wa-dialog>`;
  if (ctx.selected) root.querySelector('#sp-dialog').setAttribute('open', '');
}

function renderC(root) {
  const tile = d => {
    const opts = ctx.options.filter(o => o.deckIds.includes(d.id)).slice(0, 6);
    return `
      <div class="sp-tile" style="--deck:${d.color}">
        <div class="wa-heading-s">${escapeHtml(d.name)}</div>
        <div class="wa-caption-s">${escapeHtml(commanderNames(d).join(' / '))}</div>
        <div class="wa-stack wa-gap-2xs">${opts.map(o => `
          <button class="sp-chip ${o.kind === 'sleeve' ? 'sp-chip-sleeve' : ''} ${ctx.selected === o ? 'sp-on' : ''}" data-pick="${ctx.options.indexOf(o)}">
            ${cardName(o)}<span class="sp-grow"></span><span class="wa-caption-s">${o.kind === 'sleeve' ? 'no new marks' : `+${o.cost.add} / ${o.cost.stale} stale`}</span>
          </button>`).join('') || '<span class="wa-caption-s">No comparable card</span>'}
        </div>
      </div>`;
  };
  root.innerHTML = `
    <div class="sp-c">
      <aside class="sp-c-side wa-stack wa-gap-s">${xImg()}<span class="wa-heading-m">${escapeHtml(ctx.x.name)}</span>${meta(ctx.x)}
        <span class="wa-caption-m">Green = Sleeve swap, no new marks.</span></aside>
      <div class="sp-c-grid">${ctx.eligible.map(tile).join('')}</div>
    </div>
    <wa-drawer id="sp-drawer" label="Confirm Swap" placement="bottom">${ctx.selected ? confirmHtml(ctx.selected) : ''}</wa-drawer>`;
  if (ctx.selected) root.querySelector('#sp-drawer').setAttribute('open', '');
}

function render() {
  const root = document.getElementById('sp-root');
  if (!ctx.x) { root.innerHTML = ''; setState(); return; }
  ({ A: renderA, B: renderB, C: renderC })[variant](root);
  setState();
}

// ---------- search ----------
async function loadIncoming(name) {
  const status = document.getElementById('sp-status');
  status.textContent = `Loading ${name}…`;
  const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
  if (!res.ok) { status.textContent = 'Card not found.'; return; }
  const c = await res.json();
  const x = { name: c.name.split(' // ')[0], ...slim(c), image: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal };
  // Stage 2 of #273: fetch attributes for every card in decks whose colors fit.
  const fitting = ctx.prism.decks.filter(d => fits(x, deckCi(d)));
  await fetchAttrs(fitting.flatMap(d => d.cards.map(c2 => c2.name)), (i, n) => { status.textContent = `Reading deck cards ${i}/${n}…`; });
  Object.assign(ctx, { x, selected: null, deckId: null }, buildOptions(ctx.prism, x));
  status.textContent = '';
  const url = new URL(location.href);
  url.searchParams.set('card', x.name);
  history.replaceState(null, '', url);
  render();
}

export async function initSwapPlannerPrototype() {
  ctx.prism = getCurrentPrism();
  const status = document.getElementById('sp-status');
  if (!ctx.prism?.decks?.length) ctx.prism = demoPrism();
  document.getElementById('sp-prism').textContent = `${ctx.prism.name || 'Untitled PRISM'} · ${plural(ctx.prism.decks.length, 'deck')}`;
  // Stage 1 of #273: commanders first, for color identity.
  status.textContent = 'Reading commanders…';
  await fetchAttrs(ctx.prism.decks.flatMap(commanderNames));
  status.textContent = '';

  const input = document.getElementById('sp-search');
  const list = document.getElementById('sp-suggest');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (input.value.length < 2) return;
      const { data = [] } = await (await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(input.value)}`)).json();
      list.innerHTML = data.map(n => `<option value="${escapeHtml(n)}">`).join('');
      if (data.includes(input.value)) loadIncoming(input.value);
    }, 250);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') loadIncoming(input.value); });

  const root = document.getElementById('sp-root');
  root.addEventListener('click', e => {
    const apply = e.target.closest('[data-apply]');
    if (apply) { applyOption(ctx.options[+apply.dataset.apply]); return; }
    const deck = e.target.closest('[data-deck]');
    if (deck) { ctx.deckId = deck.dataset.deck; ctx.selected = null; render(); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { ctx.selected = ctx.options[+pick.dataset.pick]; render(); }
  });
  root.addEventListener('wa-after-hide', () => { ctx.selected = null; setState(); });
  root.addEventListener('mouseover', e => {
    const el = e.target.closest('.sp-card');
    if (el) showPreview(el.dataset.card, ctx.options[+el.dataset.opt]?.stripes || [], e);
  });
  root.addEventListener('mousemove', e => { if (e.target.closest('.sp-card')) updatePosition(e); });
  root.addEventListener('mouseout', e => { if (e.target.closest('.sp-card')) hidePreview(); });

  initSwitcher();
  setState();
  const card = new URLSearchParams(location.search).get('card');
  if (card) { input.value = card; loadIncoming(card); }
}

// ---------- floating variant switcher (prototype chrome) ----------
function initSwitcher() {
  if (location.hostname === 'prismmtg.com') return;
  const keys = Object.keys(VARIANTS);
  const go = step => {
    const url = new URL(location.href);
    url.searchParams.set('variant', keys[(keys.indexOf(variant) + step + keys.length) % keys.length]);
    location.replace(url);
  };
  const bar = document.createElement('div');
  bar.className = 'sp-switcher';
  bar.innerHTML = `<button aria-label="Previous variant">←</button><span>${variant} (${VARIANTS[variant]})</span><button aria-label="Next variant">→</button>`;
  const [prev, next] = bar.querySelectorAll('button');
  prev.onclick = () => go(-1);
  next.onclick = () => go(1);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });
  document.body.appendChild(bar);
}

// ---------- demo PRISM (in memory only; used when this browser has no decks) ----------
function demoPrism() {
  const lists = {
    'Meren': ['*Meren of Clan Nel Toth', 'Sol Ring', 'Arcane Signet', "Kodama's Reach", 'Cultivate', 'Beast Within', 'Eternal Witness',
      'Sakura-Tribe Elder', 'Viscera Seer', 'Grave Pact', 'Demonic Tutor', 'Phyrexian Arena', 'Birds of Paradise', 'Mind Stone', 'Harmonize', 'Rampant Growth'],
    'Atraxa': ["*Atraxa, Praetors' Voice", 'Sol Ring', 'Arcane Signet', 'Cultivate', 'Swords to Plowshares', 'Counterspell', 'Eternal Witness',
      'Rhystic Study', 'Cyclonic Rift', 'Farseek', 'Demonic Tutor', 'Fact or Fiction', 'Path to Exile', 'Birds of Paradise', 'Mulldrifter', 'Rampant Growth'],
    'Kenrith': ["*Kenrith, the Returned King", 'Sol Ring', 'Arcane Signet', "Commander's Sphere", 'Swords to Plowshares', 'Counterspell', 'Chaos Warp',
      'Beast Within', 'Three Visits', "Nature's Lore", 'Mulldrifter', 'Fact or Fiction', 'Phyrexian Arena', 'Rampant Growth'],
    'Tatyova': ['*Tatyova, Benthic Druid', 'Sol Ring', "Kodama's Reach", 'Cultivate', 'Counterspell', 'Eternal Witness', 'Sakura-Tribe Elder',
      'Rhystic Study', 'Cyclonic Rift', 'Farseek', 'Three Visits', 'Beast Whisperer', 'Harmonize', 'Llanowar Elves', 'Mind Stone', 'Rampant Growth'],
  };
  const decks = Object.entries(lists).map(([name, cards], i) => ({
    id: `demo-${i}`, name, bracket: 3, color: DEFAULT_COLORS[i + 1], stripePosition: i + 1,
    cards: cards.map(c => ({ name: c.replace('*', ''), quantity: 1, isCommander: c.startsWith('*'), isBasicLand: false })),
  }));
  return { id: 'demo', name: 'Demo PRISM (in memory)', decks, splitGroups: [], markedCards: ["Kodama's Reach", 'Sol Ring'], removedCards: [] };
}
