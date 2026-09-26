// PROTOTYPE — throwaway. Swap Planner flow (#276). Lives on branch
// prototype/swap-planner-flow only; never merge to main.
//
// Question: what should the Swap Planner flow look and feel like?
// Round 1 compared a stepper, a ranked list and a deck board (see this
// branch's first commit). Round 2 keeps the ranked list, one row per
// comparable card, with a side-by-side compare in the confirm dialog.
//
// Reads the current PRISM from localStorage. Nothing is saved: "Swap" applies
// in memory and shows what would be written.

import { getCurrentPrism } from '../modules/storage.js';
import { processCards, commanderNames, DEFAULT_COLORS } from '../modules/processor.js';
import { escapeHtml, countVisibleMarks, passKeysForCard } from '../core/utils.js';
import { showPreview, hidePreview, updatePosition, buildCardWithStripes, createLoadingElement, createErrorElement } from '../modules/card-preview.js';


// ---------- card attributes (PROTOTYPE cache, wipe me) ----------
const ATTR_KEY = 'prism_swap_prototype_attrs_v2'; // v2 adds oracle_id
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
  oid: c.oracle_id ?? c.card_faces?.[0]?.oracle_id,
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
    await sleep(500); // /cards/collection is limited to 2/s (#271)
  }
  try { localStorage.setItem(ATTR_KEY, JSON.stringify(attrs)); } catch { /* full */ }
}

// ---------- oracle-tag roles (#271, #278: ranking only, never printed) ----------
// Allowlisted role roots, rolled up through child_ids. ponytail: pinned by slug
// for the prototype; production pins UUIDs and keeps a deny list (#271).
const ROLE_ROOTS = ['ramp', 'mana-producer', 'removal', 'sweeper', 'card-advantage', 'tutor', 'counterspell',
  'recursion', 'protects-permanent', 'protects-creature', 'lifegain', 'sacrifice-outlet', 'burn', 'discard',
  'mill', 'evasion', 'anthem', 'cost-reducer', 'untapper', 'copy', 'extra-turn', 'fog', 'hate', 'combat-trick', 'flicker'];
let roleIndex = null; // oracle_id -> { roles: Set<root slug>, leaves: Set<tag id> }

async function loadRoles() {
  const bulk = await (await fetch('https://api.scryfall.com/bulk-data')).json();
  const entry = bulk.data.find(d => d.type === 'oracle_tags');
  // data.scryfall.io is unmetered; the dated URL is immutable, so the HTTP cache serves repeats.
  const bytes = new Uint8Array(await (await fetch(entry.jsonl_download_uri ?? entry.download_uri)).arrayBuffer());
  const text = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  const byId = new Map();
  const bySlug = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const t = JSON.parse(line);
    byId.set(t.id, t);
    bySlug.set(t.slug, t);
  }
  const index = new Map();
  for (const root of ROLE_ROOTS) {
    const start = bySlug.get(root);
    if (!start) { console.warn(`Swap prototype: role tag "${root}" not found`); continue; }
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const t = stack.pop();
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      for (const { oracle_id } of t.taggings || []) {
        if (!index.has(oracle_id)) index.set(oracle_id, { roles: new Set(), leaves: new Set() });
        const e = index.get(oracle_id);
        e.roles.add(root);
        e.leaves.add(t.id);
      }
      for (const id of t.child_ids || []) if (byId.has(id)) stack.push(byId.get(id));
    }
  }
  roleIndex = index;
}

const overlap = (a, b) => [...a].filter(v => b.has(v)).length;
/** How alike two cards' jobs are: shared role roots, then shared leaf tags. */
function likeness(x, y) {
  const a = roleIndex?.get(x.oid);
  const b = roleIndex?.get(y.oid);
  if (!a || !b) return { roles: 0, leaves: 0 };
  return { roles: overlap(a.roles, b.roles), leaves: overlap(a.leaves, b.leaves) };
}
const byLikeness = (x, a, b) => b.like.roles - a.like.roles || b.like.leaves - a.like.leaves || Math.abs(a.attrs.cmc - x.cmc) - Math.abs(b.attrs.cmc - x.cmc);

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

/**
 * Every Swap option for incoming card X across the PRISM. Same card type by default;
 * otherTypes drops the type rule and keeps only cards sharing a specific role tag.
 */
function buildOptions(prism, x, { otherTypes = false } = {}) {
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
      .map(c => ({ ...c, attrs: attrOf(c.name), like: likeness(x, attrOf(c.name)) }))
      .filter(c => {
        const sameType = mainTypes(c.attrs.type).some(t => xTypes.includes(t));
        // Across types a shared role is too loose (every mana rock is "ramp"), so require a shared specific tag.
        return otherTypes ? !sameType && c.like.leaves > 0 : sameType;
      })
      .sort((a, b) => byLikeness(x, a, b))
      .slice(0, 8);

    for (const y of comparable) {
      const pc = processed.find(p => p.name === y.name);
      const batch = pc?.batches.find(b => !b.isDedicated && b.participantIds.includes(deck.id));
      const sleeveOk = batch && !xInPrism && batch.copyCount === 1 && batch.participantIds.every(id => {
        const d = prism.decks.find(dd => dd.id === id);
        return fits(x, cis.get(id)) && !runs(d, x.name) && d.cards.find(c => c.name === y.name)?.quantity === 1;
      });
      const base = { outgoing: y.name, incoming: x.name, attrs: y.attrs, like: y.like, stripes: pc?.stripes || [] };

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

// ---------- shared bits ----------
const deckById = id => ctx.prism.decks.find(d => d.id === id);
const deckNames = o => o.deckIds.map(id => deckById(id).name).join(', ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const total = o => o.kind === 'sleeve' ? 0 : o.cost.add + o.cost.stale;
function costText(o) {
  if (o.kind === 'sleeve') return 'No new marks';
  const parts = [];
  if (o.cost.add) parts.push(plural(o.cost.add, 'mark') + ' to add');
  if (o.cost.stale) parts.push(plural(o.cost.stale, 'stale mark'));
  return parts.join(' · ') || 'No mark changes';
}
const meta = a => `<span class="sp-meta">${escapeHtml(a.mana)} · ${escapeHtml(a.type)}</span>`;
// Marks the incoming card carries after the Swap (a Sleeve swap inherits the outgoing sleeve's).
const xStripesAfter = o => (o.kind === 'sleeve' ? o.cost.check.xAfter : o.cost.xAfter)?.stripes || [];

/** One row per comparable card: its options (Sleeve swap and/or single-deck Swaps), best first. */
function groupOptions(options) {
  const groups = new Map();
  for (const o of options) {
    if (!groups.has(o.outgoing)) groups.set(o.outgoing, { outgoing: o.outgoing, attrs: o.attrs, like: o.like, stripes: o.stripes, options: [] });
    groups.get(o.outgoing).options.push(o);
  }
  for (const g of groups.values()) {
    g.options.sort((a, b) => total(a) - total(b));
    g.best = g.options[0];
    g.deckIds = [...new Set(g.options.flatMap(o => o.deckIds))];
  }
  return [...groups.values()].sort((a, b) => byLikeness(ctx.x, a, b) || total(a.best) - total(b.best) || a.outgoing.localeCompare(b.outgoing));
}

function scopeLabel(o) {
  if (o.kind === 'sleeve' && o.deckIds.length > 1) return `Every deck in this sleeve: ${escapeHtml(deckNames(o))}`;
  return `Only ${escapeHtml(deckNames(o))}`;
}

function confirmBody(g, o) {
  const cmdrs = [...new Set(o.deckIds.flatMap(id => commanderNames(deckById(id))))];
  const cmdr = cmdrs.join(' and ') || 'your commander';
  const kindLine = {
    sleeve: `${escapeHtml(o.incoming)} goes into ${escapeHtml(o.outgoing)}'s sleeve. The marks are already painted.${o.done ? ' That sleeve is marked, so the new card starts marked.' : ''}`,
    plain: `${escapeHtml(o.incoming)} needs its own sleeve, and ${escapeHtml(o.outgoing)}'s sleeve keeps a mark it no longer needs.`,
    'add-mark': `${escapeHtml(o.incoming)} is already in your PRISM. Its sleeve gets one more mark, so there's no copy to buy.`,
  }[o.kind];
  return `
    <div class="sp-compare">
      <figure class="wa-stack wa-gap-xs">
        <div class="sp-slot" data-img="out"></div>
        <figcaption class="wa-caption-m">Out · ${escapeHtml(o.outgoing)}</figcaption>
      </figure>
      <wa-icon name="arrow-right" class="sp-compare-arrow" label="replaced by"></wa-icon>
      <figure class="wa-stack wa-gap-xs">
        <div class="sp-slot" data-img="in"></div>
        <figcaption class="wa-caption-m">In · ${escapeHtml(o.incoming)}</figcaption>
      </figure>
    </div>
    <div class="wa-stack wa-gap-l">
      <div class="wa-stack wa-gap-2xs">
        <span class="sp-cost-headline ${o.kind === 'sleeve' ? 'sp-sleeve' : ''}">${costText(o)}</span>
        <span class="sp-meta">${o.kind === 'add-mark' ? 'No copy to buy' : `${plural(o.cost.buy, 'copy')} to buy`}</span>
        <p>${kindLine}</p>
      </div>
      ${g.options.length > 1 ? `
        <wa-radio-group label="Swap it in" id="sp-scope" value="${g.options.indexOf(o)}">
          ${g.options.map((opt, i) => `<wa-radio value="${i}">${scopeLabel(opt)} <span class="sp-meta">· ${costText(opt)}</span></wa-radio>`).join('')}
        </wa-radio-group>` : `<p class="wa-caption-m">${scopeLabel(o)}</p>`}
      <div class="wa-stack wa-gap-2xs sp-checklist">
        <span class="sp-meta">Before you swap, ask yourself:</span>
        <span>Does ${escapeHtml(o.incoming)} do the same job as ${escapeHtml(o.outgoing)}?</span>
        <span>Is it better at that job?</span>
        <span>What does the deck lose?</span>
        <span>Does it work with ${escapeHtml(cmdr)}?</span>
        <a href="guide.html#swap-a-card">How to compare cards →</a>
      </div>
    </div>`;
}

async function fillImage(slot, name, stripes) {
  slot.replaceChildren(createLoadingElement());
  try {
    const el = await buildCardWithStripes(name, stripes);
    el.dataset.card = name;
    if (slot.isConnected) slot.replaceChildren(el);
  } catch {
    slot.replaceChildren(createErrorElement('Image not available'));
  }
}

function openConfirm(g, o) {
  ctx.group = g;
  ctx.selected = o;
  const dialog = document.getElementById('sp-dialog');
  const oldOut = dialog.querySelector('[data-img="out"] .card-preview-image')?.parentElement;
  dialog.setAttribute('label', `Swap ${o.outgoing} for ${o.incoming}`);
  dialog.querySelector('[data-body]').innerHTML = confirmBody(g, o);
  // Changing scope only changes the incoming card's marks; keep the outgoing image.
  if (oldOut && oldOut.dataset.card === o.outgoing) dialog.querySelector('[data-img="out"]').replaceChildren(oldOut);
  else fillImage(dialog.querySelector('[data-img="out"]'), o.outgoing, g.stripes);
  fillImage(dialog.querySelector('[data-img="in"]'), o.incoming, xStripesAfter(o));
  dialog.setAttribute('open', '');
  setState();
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
  document.getElementById('sp-dialog').removeAttribute('open');
  setState({ applied: summary, cardCountBefore: countCards(ctx.prism), cardCountAfter: countCards(next) });
  toast(`Swapped ${o.outgoing} for ${o.incoming}. Update the deck on Moxfield or Archidekt too, since PRISM only changes its own decklist.`);
}
const countCards = p => p.decks.reduce((n, d) => n + d.cards.reduce((m, c) => m + c.quantity, 0), 0);

function toast(msg) {
  const el = document.getElementById('sp-toast');
  el.querySelector('[data-msg]').textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 7000);
}
function setState(extra) {
  const o = ctx.selected;
  document.getElementById('sp-state').textContent = JSON.stringify({
    incoming: ctx.x && { name: ctx.x.name, type: ctx.x.type, mana: ctx.x.mana, cmc: ctx.x.cmc },
    rolesLoaded: !!roleIndex, incomingHasRoles: !!roleIndex?.get(ctx.x?.oid)?.roles.size,
    xInPrism: ctx.xInPrism, eligibleDecks: ctx.eligible?.map(d => d.name), skippedNoCommander: ctx.skipped?.map(d => d.name),
    comparableCards: ctx.groups?.length, sleeveSwaps: ctx.options?.filter(x => x.kind === 'sleeve').length,
    selected: o && { kind: o.kind, outgoing: o.outgoing, like: o.like, decks: deckNames(o), cost: { stale: o.cost.stale, add: o.cost.add, buy: o.cost.buy }, done: o.done },
    ...extra,
  }, null, 2);
}

// ---------- page ----------
window.__sp = { roles: () => roleIndex, attrs: () => attrs }; // PROTOTYPE debug handle
const ctx = { prism: null, x: null, options: [], groups: [], eligible: [], skipped: [], group: null, selected: null };

function render() {
  const root = document.getElementById('sp-root');
  if (!ctx.x) { root.innerHTML = ''; setState(); return; }
  // With no roles for the incoming card there is nothing to split on: fall back to type + mana value.
  const xHasRoles = !!roleIndex?.get(ctx.x.oid)?.roles.size;
  const alike = g => !xHasRoles || g.like.roles > 0;
  const sameType = ctx.groups.filter(g => !g.wide);
  const sleeves = sameType.filter(g => g.best.kind === 'sleeve');
  const rest = sameType.filter(g => g.best.kind !== 'sleeve');
  const wide = ctx.groups.filter(g => g.wide);
  const deckChips = ids => ids.map(id => {
    const d = deckById(id);
    return `<span class="sp-deck"><span class="sp-swatch" style="--deck:${d.color}"></span>${escapeHtml(d.name)}</span>`;
  }).join('');
  const row = g => `
    <li>
      <button class="sp-row" data-group="${ctx.groups.indexOf(g)}">
        <span class="sp-row-main">
          <span class="sp-row-title"><span class="sp-card" data-card="${escapeHtml(g.outgoing)}">${escapeHtml(g.outgoing)}</span> ${meta(g.attrs)}</span>
          <span class="sp-decks">${deckChips(g.deckIds)}</span>
        </span>
        <span class="sp-row-end">
          ${g.best.kind === 'sleeve' && !g.wide ? '' : `<span class="sp-meta">${costText(g.best)}</span>`}
          <wa-icon name="chevron-right" class="sp-chevron"></wa-icon>
        </span>
      </button>
    </li>`;
  const list = items => `<ul class="sp-list wa-stack wa-gap-xs">${items.map(row).join('')}</ul>`;
  const section = (title, hint, items, empty) => {
    const near = items.filter(alike);
    const far = items.filter(g => !alike(g));
    return `
      <section class="wa-stack wa-gap-s">
        <div class="wa-stack wa-gap-3xs">
          <h2 class="wa-heading-m">${title}</h2>
          <span class="sp-meta">${hint}</span>
        </div>
        ${near.length ? list(near) : `<p class="sp-meta">${items.length ? `No card here does the same job as ${escapeHtml(ctx.x.name)}.` : empty}</p>`}
        ${far.length ? `
          <wa-details class="sp-far">
            <span slot="summary">${plural(far.length, 'more card')} of the same type, doing a different job</span>
            ${list(far)}
          </wa-details>` : ''}
      </section>`;
  };
  const nearCount = sameType.filter(alike).length;
  const typeWords = mainTypes(ctx.x.type).map(t => t.toLowerCase().replace(/y$/, 'ie') + 's').join(' and ');
  const widen = !xHasRoles ? '' : `
    <section class="wa-stack wa-gap-s">
      <div class="wa-stack wa-gap-3xs">
        <h2 class="wa-heading-m">Other card types</h2>
        <span class="sp-meta">Cards that aren't ${escapeHtml(typeWords)} but do a similar job.</span>
      </div>
      ${ctx.widened
        ? (wide.length ? list(wide) : `<p class="sp-meta">No card of another type does a similar job.</p>`)
        : `<div><wa-button data-widen variant="${nearCount ? 'neutral' : 'brand'}" appearance="${nearCount ? 'outlined' : 'accent'}">Look beyond ${escapeHtml(typeWords)}</wa-button></div>`}
    </section>`;
  root.innerHTML = `
    <div class="sp-incoming">
      <img src="${ctx.x.image}" alt="${escapeHtml(ctx.x.name)}" class="sp-incoming-img">
      <div class="wa-stack wa-gap-2xs">
        <span class="wa-heading-l">${escapeHtml(ctx.x.name)}</span>
        ${meta(ctx.x)}
        <span>Fits ${plural(ctx.eligible.length, 'deck')}. ${xHasRoles ? `${plural(nearCount, 'card')} of the same type ${nearCount === 1 ? 'does' : 'do'} a similar job` : plural(sameType.length, 'card') + ' of the same type'}.</span>
        ${ctx.skipped.length ? `<span class="sp-meta">Skipped ${plural(ctx.skipped.length, 'deck')} with no commander set: ${escapeHtml(ctx.skipped.map(d => d.name).join(', '))}</span>` : ''}
      </div>
    </div>
    ${section('No new marks', `${escapeHtml(ctx.x.name)} takes over the sleeve, marks and all.`, sleeves, 'No card here can hand over its sleeve.')}
    ${section('Other swaps', 'These need new marks and leave a stale one behind.', rest, 'Nothing else to compare.')}
    ${widen}`;
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
  status.textContent = 'Reading card roles…';
  await ctx.rolesReady;
  await fetchAttrs(fitting.flatMap(d => d.cards.map(c2 => c2.name)), (i, n) => { status.textContent = `Reading deck cards ${i}/${n}…`; });
  Object.assign(ctx, { x, selected: null, group: null, widened: false }, buildOptions(ctx.prism, x));
  ctx.groups = groupOptions(ctx.options);
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
  ctx.rolesReady = loadRoles().catch(err => console.warn('Swap prototype: oracle tags unavailable, ranking by type + mana value', err));
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
    if (e.target.closest('[data-widen]')) {
      const wide = buildOptions(ctx.prism, ctx.x, { otherTypes: true }).options;
      ctx.options = [...ctx.options, ...wide];
      ctx.groups = [...ctx.groups, ...groupOptions(wide).map(g => ({ ...g, wide: true }))];
      ctx.widened = true;
      render();
      return;
    }
    const row = e.target.closest('[data-group]');
    if (!row) return;
    hidePreview();
    const g = ctx.groups[+row.dataset.group];
    openConfirm(g, g.best);
  });
  // The build.html hover: card image with its current stripes.
  root.addEventListener('mouseover', e => {
    const el = e.target.closest('.sp-card');
    if (el) showPreview(el.dataset.card, ctx.groups.find(g => g.outgoing === el.dataset.card)?.stripes || [], e);
  });
  root.addEventListener('mousemove', e => { if (e.target.closest('.sp-card')) updatePosition(e); });
  root.addEventListener('mouseout', e => { if (e.target.closest('.sp-card')) hidePreview(); });

  const dialog = document.getElementById('sp-dialog');
  dialog.addEventListener('change', e => {
    if (e.target.id !== 'sp-scope') return;
    const o = ctx.group.options[+e.target.value];
    ctx.selected = o;
    openConfirm(ctx.group, o);
  });
  dialog.querySelector('[data-apply]').addEventListener('click', () => applyOption(ctx.selected));
  dialog.addEventListener('wa-after-hide', e => { if (e.target === dialog) { ctx.selected = null; setState(); } });

  setState();
  const card = new URLSearchParams(location.search).get('card');
  if (card) { input.value = card; loadIncoming(card); }
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
