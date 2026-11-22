/**
 * Copy a PRISM deck back to Moxfield or Archidekt (#377). Neither site takes
 * a changes paste (docs/agents/deck-export.md), so changes are a checklist the
 * player applies by hand, which leaves the site's printings and categories
 * alone; the full list is the paste fallback.
 */

import { normalizeCardName } from './parser.js';
import { deckSourceSite, resolveDeckSource } from './deck-source.js';

export const SITE_NAMES = { moxfield: 'Moxfield', archidekt: 'Archidekt' };

// Moxfield's Bulk Edit has no commander board (docs/agents/deck-export.md), so
// its list leaves commanders out; the panel hint says to set them by hand.
// Sideboard rows (#29) go in Moxfield's SIDEBOARD: section, Archidekt's
// [Sideboard] category.
function fullListText(cards, site) {
  const side = cards.filter(c => c.isSideboard);
  const main = cards.filter(c => !c.isSideboard);
  if (site === 'moxfield') {
    const line = c => `${c.quantity} ${c.name}`;
    const list = main.filter(c => !c.isCommander).map(line).join('\n');
    return side.length ? `${list}\n\nSIDEBOARD:\n${side.map(line).join('\n')}` : list;
  }
  const ordered = [...main.filter(c => c.isCommander), ...main.filter(c => !c.isCommander), ...side];
  const category = c => c.isCommander ? ' [Commander]' : c.isSideboard ? ' [Sideboard]' : '';
  return ordered.map(c => `${c.quantity}x ${c.name}${category(c)}`).join('\n');
}

const zoneOf = c => c.isCommander ? 'commander' : c.isSideboard ? 'sideboard' : 'deck';

// Count per normalized name in one zone; the name shown is the first spelling met.
function tally(cards, zone) {
  const counts = new Map();
  for (const c of cards) {
    if (zoneOf(c) !== zone) continue;
    const key = normalizeCardName(c.name);
    const entry = counts.get(key) || { name: c.name, quantity: 0 };
    entry.quantity += c.quantity || 1;
    counts.set(key, entry);
  }
  return counts;
}

function zoneDiff(prismCards, siteCards, zone) {
  const ours = tally(prismCards, zone);
  const theirs = tally(siteCards, zone);
  const out = [];
  for (const key of new Set([...ours.keys(), ...theirs.keys()])) {
    const delta = (ours.get(key)?.quantity || 0) - (theirs.get(key)?.quantity || 0);
    if (delta !== 0) out.push({ name: (ours.get(key) || theirs.get(key)).name, delta });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {Object} deck - PRISM deck
 * @param {Array|null} siteCards - live site cards (mainboard, commander and, with no commander, sideboard zones), or null
 * @param {'moxfield'|'archidekt'} site
 * @returns {{ changes: {commander: Array, deck: Array, sideboard: Array}|null, fullList: string }}
 */
export function deckExport(deck, siteCards, site) {
  const cards = deck.cards || [];
  return {
    changes: siteCards
      ? Object.fromEntries(['commander', 'deck', 'sideboard'].map(zone => [zone, zoneDiff(cards, siteCards, zone)]))
      : null,
    fullList: fullListText(cards, site)
  };
}

/** Checklist text for `changes`: Commander, Deck, Sideboard sections, `+N`/`-N` lines. */
export function changesText(changes) {
  const lines = (list) => list.map(({ name, delta }) => `${delta > 0 ? '+' : ''}${delta} ${name}`);
  return [['Commander', changes.commander], ['Deck', changes.deck], ['Sideboard', changes.sideboard || []]]
    .filter(([, list]) => list.length)
    .map(([header, list]) => [header, ...lines(list)].join('\n'))
    .join('\n\n');
}

/**
 * Fetch the live deck named by `deck.sourceUrl` and diff it. With no
 * sourceUrl, `site` picks the full-list format. A failed fetch falls back to
 * the full list with a notice.
 * @returns {Promise<{site, changes, fullList, notice: string|null}>}
 */
export async function exportDeck(deck, site = 'moxfield') {
  const sourceSite = deckSourceSite(deck.sourceUrl);
  if (!sourceSite) return { site, ...deckExport(deck, null, site), notice: null };

  try {
    const { deckData: { cards } } = await resolveDeckSource(deck.sourceUrl);
    return { site: sourceSite, ...deckExport(deck, cards, sourceSite), notice: null };
  } catch (err) {
    return {
      site: sourceSite,
      ...deckExport(deck, null, sourceSite),
      notice: `Couldn't load the deck from ${SITE_NAMES[sourceSite]} (${err.message}), so here is the full list instead.`
    };
  }
}
