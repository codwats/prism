/**
 * Copy a PRISM deck back to Moxfield or Archidekt (#377). Neither site takes
 * a changes paste (docs/agents/deck-export.md), so changes are a checklist the
 * player applies by hand, which leaves the site's printings and categories
 * alone; the full list is the paste fallback.
 */

import { cardsToDecklistText, normalizeCardName } from './parser.js';
import { importFromMoxfield } from './moxfield.js';
import { importFromArchidekt } from './archidekt.js';

export const SITE_NAMES = { moxfield: 'Moxfield', archidekt: 'Archidekt' };

/** @returns {'moxfield'|'archidekt'|null} */
export function siteForUrl(url) {
  if (/archidekt\.com/i.test(url || '')) return 'archidekt';
  if (/moxfield\.com/i.test(url || '')) return 'moxfield';
  return null;
}

function fullListText(cards, site) {
  if (site === 'moxfield') return cardsToDecklistText(cards);
  const ordered = [...cards.filter(c => c.isCommander), ...cards.filter(c => !c.isCommander)];
  return ordered.map(c => `${c.quantity}x ${c.name}${c.isCommander ? ' [Commander]' : ''}`).join('\n');
}

// Count per normalized name in one zone; the name shown is the first spelling met.
function tally(cards, isCommander) {
  const counts = new Map();
  for (const c of cards) {
    if (!!c.isCommander !== isCommander) continue;
    const key = normalizeCardName(c.name);
    const entry = counts.get(key) || { name: c.name, quantity: 0 };
    entry.quantity += c.quantity || 1;
    counts.set(key, entry);
  }
  return counts;
}

function zoneDiff(prismCards, siteCards, isCommander) {
  const ours = tally(prismCards, isCommander);
  const theirs = tally(siteCards, isCommander);
  const out = [];
  for (const key of new Set([...ours.keys(), ...theirs.keys()])) {
    const delta = (ours.get(key)?.quantity || 0) - (theirs.get(key)?.quantity || 0);
    if (delta !== 0) out.push({ name: (ours.get(key) || theirs.get(key)).name, delta });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {Object} deck - PRISM deck
 * @param {Array|null} siteCards - live site cards (mainboard + commander zones), or null
 * @param {'moxfield'|'archidekt'} site
 * @returns {{ changes: {commander: Array, deck: Array}|null, fullList: string }}
 */
export function deckExport(deck, siteCards, site) {
  const cards = deck.cards || [];
  return {
    changes: siteCards
      ? { commander: zoneDiff(cards, siteCards, true), deck: zoneDiff(cards, siteCards, false) }
      : null,
    fullList: fullListText(cards, site)
  };
}

/** Checklist text for `changes`: commander zone first, `+N`/`-N` lines. */
export function changesText(changes) {
  const lines = (list) => list.map(({ name, delta }) => `${delta > 0 ? '+' : ''}${delta} ${name}`);
  return [
    ...(changes.commander.length ? ['Commander', ...lines(changes.commander)] : []),
    ...(changes.commander.length && changes.deck.length ? [''] : []),
    ...(changes.deck.length ? ['Deck', ...lines(changes.deck)] : [])
  ].join('\n');
}

/**
 * Fetch the live deck named by `deck.sourceUrl` and diff it. With no
 * sourceUrl, `site` picks the full-list format. A failed fetch falls back to
 * the full list with a notice.
 * @returns {Promise<{site, changes, fullList, notice: string|null}>}
 */
export async function exportDeck(deck, site = 'moxfield') {
  const sourceSite = siteForUrl(deck.sourceUrl);
  if (!sourceSite) return { site, ...deckExport(deck, null, site), notice: null };

  try {
    const load = sourceSite === 'archidekt' ? importFromArchidekt : importFromMoxfield;
    const { cards } = await load(deck.sourceUrl);
    return { site: sourceSite, ...deckExport(deck, cards, sourceSite), notice: null };
  } catch (err) {
    return {
      site: sourceSite,
      ...deckExport(deck, null, sourceSite),
      notice: `Couldn't load the deck from ${SITE_NAMES[sourceSite]} (${err.message}), so here is the full list instead.`
    };
  }
}
