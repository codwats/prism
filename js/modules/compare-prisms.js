/**
 * Compare PRISMs (#446): what to add, remove and re-mark to turn the sleeves
 * painted for one PRISM (From) into the sleeves another (To) needs. Pure.
 *
 * Sides match on physical paint only: each card's marking batches as mark
 * sets ({ position, side, color, markType }, membership anchors excluded) with
 * their copies. Deck names and ids never count. From is read as fully
 * painted; its Done ticks are ignored. Which physical copy gets repainted into
 * which batch is the player's call, so a re-mark row shows both sides whole.
 */

import { processCards } from './processor.js';
import { markId, openRemovals, removalOpenCopies } from './swap.js';
import { isCardDone, markSingleBatchDone } from '../core/utils.js';

const markOf = (s) => ({ position: s.position, side: s.side, color: s.color.toUpperCase(), markType: s.markType || 'stripe' });
const copiesOf = (list) => list.reduce((n, s) => n + s.copies, 0);

// The first `n` copies of a sleeve list: To add / To remove state only the
// copies beyond the other side's total; re-mark covers the rest.
function take(list, n) {
  const out = [];
  for (const s of list) {
    if (n <= 0) break;
    out.push({ copies: Math.min(s.copies, n), marks: s.marks });
    n -= s.copies;
  }
  return out;
}

// The paint a Marks to Clear row stands for. A dots variant's row records the
// group's Side A slot: its mark is the dot, unless the row is the parent stripe.
function rowMark(row) {
  const g = row.splitGroup;
  const sameColor = (row.deckColor || '').toUpperCase() === (g?.sideAColor || '').toUpperCase();
  const dot = g?.splitStyle === 'dots' && !(row.deckName === g.name && sameColor);
  return markOf({
    position: row.stripePosition,
    side: dot || row.stripePosition > 24 ? 'b' : 'a',
    color: row.deckColor || '',
    markType: dot ? 'dot' : 'stripe',
  });
}

// A card's sleeves: mark-set id -> { copies, marks }.
function sleevesOf(card) {
  const sleeves = new Map();
  for (const b of card?.batches || []) {
    const marks = b.stripes.filter((s) => s.markType !== 'membership').map(markOf);
    const id = marks.map(markId).sort().join(',');
    const prev = sleeves.get(id);
    sleeves.set(id, { copies: (prev?.copies || 0) + b.copyCount, marks });
  }
  return sleeves;
}

// Sleeves of `a` that `b` has no matching paint for.
const unmatched = (a, b) => [...a]
  .map(([id, s]) => ({ copies: s.copies - (b.get(id)?.copies || 0), marks: s.marks }))
  .filter((s) => s.copies > 0);

/**
 * @returns {{ add: Object[], remove: Object[], remark: Object[], unchanged: string[], unchangedCount: number }}
 *   add/remove rows: { name, copies, batches: [{ copies, marks }] } — the
 *   copies beyond the other side's total, from that side's unmatched sleeves. remove also holds From's open Marks to
 *   Clear rows with `stillPainted: true` and `deckName`. remark rows:
 *   { name, copies, from, to } with each side's batches whole. `unchanged`
 *   lists To's names for cards whose batches match exactly.
 */
export function comparePrisms(fromPrism, toPrism) {
  const cards = new Map();
  for (const [side, prism] of [['from', fromPrism], ['to', toPrism]]) {
    for (const card of processCards(prism)) {
      const entry = cards.get(card.normalizedName) || {};
      entry.name = card.name;
      entry[side] = card;
      cards.set(card.normalizedName, entry);
    }
  }

  const result = { add: [], remove: [], remark: [], unchanged: [] };
  for (const { name, from, to } of [...cards.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const f = sleevesOf(from);
    const t = sleevesOf(to);
    const extraFrom = unmatched(f, t);
    const extraTo = unmatched(t, f);
    const nFrom = copiesOf(extraFrom);
    const nTo = copiesOf(extraTo);
    if (!nFrom && !nTo) {
      result.unchanged.push(name);
      continue;
    }
    if (nTo > nFrom) result.add.push({ name, copies: nTo - nFrom, batches: take(extraTo, nTo - nFrom) });
    if (nFrom > nTo) result.remove.push({ name, copies: nFrom - nTo, batches: take(extraFrom, nFrom - nTo) });
    const remarkCopies = Math.min(nFrom, nTo);
    if (remarkCopies) result.remark.push({ name, copies: remarkCopies, from: [...f.values()], to: [...t.values()] });
  }

  for (const row of openRemovals(fromPrism)) {
    const copies = removalOpenCopies(row);
    const marks = row.stripePosition == null ? [] : [rowMark(row)];
    result.remove.push({ name: row.cardName, copies, batches: [{ copies, marks }], stillPainted: true, deckName: row.deckName });
  }

  return { ...result, unchangedCount: result.unchanged.length };
}

/**
 * Tick Done in `toPrism` for each named card, with the keys Mark sleeves
 * writes: a single-batch card through markSingleBatchDone, a multi-batch card
 * every batch key. Cards already Done are left alone; nothing is un-ticked.
 * @returns {{ markedCards: string[], unmarkedKeys: string[], count: number }}
 *   The caller passes unmarkedKeys to recordUnmarkedCards before savePrism.
 */
export function carryDone(toPrism, names) {
  const wanted = new Set(names);
  let markedCards = [...(toPrism.markedCards || [])];
  const unmarkedKeys = [];
  let count = 0;
  for (const card of processCards(toPrism)) {
    if (!wanted.has(card.name) || isCardDone(card, new Set(markedCards))) continue;
    count++;
    if (card.batches.length === 1) {
      const done = markSingleBatchDone(markedCards, card.name, card.batches[0].key);
      markedCards = done.markedCards;
      unmarkedKeys.push(...done.unmarkedKeys);
    } else {
      markedCards = [...new Set([...markedCards, ...card.batches.map((b) => b.key)])];
    }
  }
  return { markedCards, unmarkedKeys, count };
}
