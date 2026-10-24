/**
 * Sleeve reuse (#376, ADR 0004): match Freed sleeves to cards that need a
 * sleeve, reconciled from current state on every call — never at edit time,
 * never stored. Pure: no DOM, no network. Planned swaps are ignored.
 *
 * A Freed sleeve is a sleeve whose copy left the PRISM: per card, old copy
 * count minus new copy count. The old state is rebuilt from the card's open
 * removedCards rows over the current decks, so edit order never matters.
 * Matching is by marks alone (markId in swap.js, the tallyMarks identity), at most
 * MAX_MARKS_TO_CLEAR clears, cheapest first. Commanders get no special rule.
 */

import { processCards, getColorName } from "./processor.js";
import { normalizeCardName } from "./parser.js";
import { removalOpenCopies, markId } from "./swap.js";
import { isCardDone } from "../core/utils.js";

export const MAX_MARKS_TO_CLEAR = 2;

const visibleMarks = (stripes) => stripes
  .filter((s) => s.markType !== 'membership')
  .map((s) => ({ id: markId(s), side: s.side, position: s.position, markType: s.markType || 'stripe', color: s.color, deckName: s.deckName }));

// The markedCards key that makes one batch Done: plain name on a single-batch card.
const doneKey = (card, batch) => (card.batches.length === 1 ? card.name : batch.key);
const batchDone = (card, batch, markedSet) => isCardDone(card, markedSet) || markedSet.has(doneKey(card, batch));

// A deleted split variant comes back inside its group as its row recorded it.
// If deleting it dissolved the group, the group comes back too, with the
// variant left standing alone put back inside it.
function restoreGroup(decks, splitGroups, painted) {
  let group = splitGroups.find((g) => g.id === painted.id);
  if (!group) {
    const { id, name, sideAPosition, sideAColor, splitStyle } = painted;
    group = { id, name, sideAPosition, sideAColor, splitStyle, childDeckIds: [] };
    splitGroups.push(group);
  }
  for (const v of painted.variants) {
    let d = decks.find((x) => x.id === v.id);
    if (d?.splitGroupId && d.splitGroupId !== group.id) continue;
    if (!d) {
      d = { id: v.id, cards: [] };
      decks.push(d);
    }
    if (!d.splitGroupId) {
      Object.assign(d, { name: v.name, color: v.color, stripePosition: v.stripePosition, splitGroupId: group.id });
    }
    if (!group.childDeckIds.includes(v.id)) group.childDeckIds.push(v.id);
  }
}

// The PRISM with only one card, quantities raised back by its open rows. Rows
// carry the deck's slot and color at removal, so a standalone deck that moved
// since is rebuilt where the mark was painted.
// shortcut: a deleted deck without a recorded group (a standalone deck, or a
// variant row from before groups were recorded) comes back as a standalone deck.
function oneCardPrism(prism, normalizedName, rows = []) {
  const decks = prism.decks.map((d) => ({
    ...d,
    cards: d.cards.filter((c) => normalizeCardName(c.name) === normalizedName).map((c) => ({ ...c })),
  }));
  const splitGroups = (prism.splitGroups || []).map((g) => ({ ...g, childDeckIds: [...g.childDeckIds] }));
  for (const row of rows) {
    if (row.splitGroup && !decks.some((x) => x.id === row.deckId)) restoreGroup(decks, splitGroups, row.splitGroup);
  }
  for (const row of rows) {
    let d = decks.find((x) => x.id === row.deckId);
    if (!d) {
      d = { id: row.deckId, name: row.deckName, color: row.deckColor, stripePosition: row.stripePosition, cards: [] };
      decks.push(d);
    } else if (!d.splitGroupId) {
      d.color = row.deckColor;
      d.stripePosition = row.stripePosition;
    }
    const quantity = (row.newQuantity || 0) + removalOpenCopies(row);
    const c = d.cards[0];
    if (c) c.quantity = Math.max(c.quantity || 1, quantity);
    else d.cards.push({ name: row.cardName, quantity, isCommander: !!row.isCommander, isBasicLand: false });
  }
  return { ...prism, decks, splitGroups };
}

// Batch keys (`<name>|#b|<deck ids>|<copies>`, #146) per card name, with the
// copies each stands for. A marked key that is no longer a current batch key
// is a sleeve still in hand: the card gained a deck or copies, so it needs
// marks added, not a fresh sleeve.
// shortcut: dead keys are never pruned, so keys from an older layout can
// overcount sleeves in hand; tie them to removal history if that shows up.
function sleevedCopiesByCard(markedSet) {
  const byCard = new Map();
  for (const key of markedSet) {
    const at = key.indexOf('|#b|');
    if (at < 0) continue;
    const name = key.slice(0, at);
    if (!byCard.has(name)) byCard.set(name, []);
    byCard.get(name).push([key, Number(key.split('|').pop()) || 0]);
  }
  return byCard;
}

const fewerChanges =(a, b) => a.clear - b.clear || a.add - b.add;

function cost(fromMarks, toMarks) {
  const to = new Set(toMarks.map((m) => m.id));
  const from = new Set(fromMarks.map((m) => m.id));
  const marksToClear = fromMarks.filter((m) => !to.has(m.id));
  const marksToAdd = toMarks.filter((m) => !from.has(m.id));
  return { marksToClear, marksToAdd, clear: marksToClear.length, add: marksToAdd.length };
}

// Old sleeves of one card that no current copy needs. The copies still in the
// PRISM keep the sleeves that cost them the fewest changes, so an ambiguous
// multi-batch loss frees the sleeve with the most marks to clear. `clears`
// counts the marks to clear on the sleeves that stay.
function freedSleevesOf(prism, current, normalizedName, rows, markedSet) {
  const [old] = processCards(oneCardPrism(prism, normalizedName, rows));
  if (!old) return { sleeves: [], clears: 0 };
  const now = current.find((c) => c.normalizedName === normalizedName);
  const sleeves = old.batches.map((b) => {
    const done = batchDone(old, b, markedSet);
    return { batch: b, done, marks: done ? visibleMarks(b.stripes) : [], copiesLeft: b.copyCount };
  });
  let clears = 0;
  for (const batch of now?.batches || []) {
    const need = visibleMarks(batch.stripes);
    for (let i = 0; i < batch.copyCount; i++) {
      const best = sleeves
        .filter((s) => s.copiesLeft > 0)
        .map((s) => ({ s, ...cost(s.marks, need) }))
        .sort(fewerChanges)[0];
      if (!best) break;
      best.s.copiesLeft--;
      clears += best.clear;
    }
  }
  const freed = sleeves.filter((s) => s.copiesLeft > 0).map((s) => {
    const names = visibleMarks(s.batch.stripes).map((m) => m.deckName);
    return {
      id: `${old.name}|${s.batch.key}`,
      cardName: old.name,
      label: old.batches.length > 1 ? `the ${names.join(' + ')}-only sleeve` : null,
      marks: s.marks,
      copies: s.copiesLeft,
      blank: !s.done,
      deckIds: s.batch.participantIds,
    };
  });
  return { sleeves: freed, clears };
}

// What a sleeving session needs: copies counted, not rows.
function prepTotals({ freed, matches, needsFreshSleeve, stayClears }) {
  const sum = (list, f) => list.reduce((n, x) => n + f(x), 0);
  const spares = sum(freed.filter((s) => s.blank), (s) => s.copies);
  const pens = new Map();
  // Pens go by product name; a custom color has none, so it keeps its own row.
  const paint = (marks, copies) => marks.forEach((m) => {
    const named = getColorName(m.color) !== m.color;
    const id = named ? getColorName(m.color) : m.color.toUpperCase();
    const pen = pens.get(id) || { name: named ? id : 'Custom color', color: m.color, count: 0 };
    pen.count += copies;
    pens.set(id, pen);
  });
  matches.forEach((m) => paint(m.marksToAdd, m.copies));
  needsFreshSleeve.forEach((n) => paint(n.marks, n.copyCount));

  const copiesLeft = new Map(freed.map((s) => [s.id, s.copies]));
  matches.forEach((m) => m.freedSleeves.forEach((s) => copiesLeft.set(s.id, copiesLeft.get(s.id) - s.copies)));
  const pull = new Map();
  freed.forEach((s) => pull.set(s.cardName, (pull.get(s.cardName) || 0) + s.copies));

  return {
    sleevesToBuy: Math.max(0, sum(needsFreshSleeve, (n) => n.copyCount) - spares),
    pens: [...pens.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    // Unmatched Freed sleeves still carry their marks, like any Marks to Clear row.
    marksToClear: stayClears
      + sum(matches, (m) => m.marksToClear.length * m.copies)
      + sum(freed, (s) => s.marks.length * copiesLeft.get(s.id)),
    pullList: [...pull].map(([cardName, copies]) => ({ cardName, copies }))
      .sort((a, b) => a.cardName.localeCompare(b.cardName)),
  };
}

/**
 * @param {Object} prism
 * @returns {{
 *   freedSleeves: Array<{ id, cardName, label, marks, copies, blank: false, deckIds }>,
 *   spareSleeves: Array<{ id, cardName, label, marks: [], copies, blank: true, deckIds }>,
 *   matches: Array<{ id, freedSleeves, incomingBatch, copies, marksToClear, marksToAdd }>,
 *   needsFreshSleeve: Array<{ cardName, key, copyCount, marks }>,
 *   prep: { sleevesToBuy, pens: Array<{ name, color, count }>, marksToClear, pullList: Array<{ cardName, copies }> },
 * }}
 *   Marks are `{ id, side, position, markType, color, deckName }`. A Freed
 *   sleeve's `label` names it ("the A-only sleeve") only when its card had
 *   several batches, so which sleeve is meant is not obvious; otherwise null. A match uses
 *   `copies` (the incoming batch's copyCount) from one or more Freed sleeves
 *   with identical marks; each `freedSleeves` entry's `copies` is how many of
 *   that sleeve it uses. `prep` counts copies: sleeves to buy (fresh-sleeve
 *   copies minus spares), marks to paint per pen (product name, or "Custom
 *   color" with its hex for a swatch), marks to clear, and the copies leaving
 *   the PRISM.
 */
export function planSleeveReuse(prism) {
  const current = processCards(prism);
  const markedSet = new Set(prism.markedCards || []);

  const rowsByCard = new Map();
  for (const row of prism.removedCards || []) {
    if (typeof row?.cardName !== 'string' || removalOpenCopies(row) === 0) continue;
    const name = normalizeCardName(row.cardName);
    if (!rowsByCard.has(name)) rowsByCard.set(name, []);
    rowsByCard.get(name).push(row);
  }
  const perCard = [...rowsByCard].map(([name, rows]) => freedSleevesOf(prism, current, name, rows, markedSet));
  const stayClears = perCard.reduce((n, c) => n + c.clears, 0);
  const freed = perCard.flatMap((c) => c.sleeves).sort((a, b) => a.id.localeCompare(b.id));
  const freedSleeves = freed.filter((s) => !s.blank);
  const spareSleeves = freed.filter((s) => s.blank);

  const oldKeys = sleevedCopiesByCard(markedSet);
  const needs = current
    .flatMap((card) => {
      const currentKeys = new Set(card.batches.map((b) => doneKey(card, b)));
      let sleeved = (oldKeys.get(card.name) || [])
        .filter(([key]) => !currentKeys.has(key))
        .reduce((n, [, copies]) => n + copies, 0);
      return card.batches
        .filter((b) => !batchDone(card, b, markedSet))
        .flatMap((b) => {
          const covered = Math.min(sleeved, b.copyCount);
          sleeved -= covered;
          return b.copyCount > covered
            ? [{ cardName: card.name, key: doneKey(card, b), copyCount: b.copyCount - covered, marks: visibleMarks(b.stripes) }]
            : [];
        });
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  // Freed sleeves with identical marks pool, so a 2-copy need can take two
  // 1-copy sleeves.
  const pools = new Map();
  for (const sleeve of freedSleeves) {
    const marksKey = sleeve.marks.map((m) => m.id).sort().join(',');
    if (!pools.has(marksKey)) pools.set(marksKey, []);
    pools.get(marksKey).push(sleeve);
  }
  const candidates = [];
  for (const pool of pools.values()) {
    for (const need of needs) {
      const c = cost(pool[0].marks, need.marks);
      if (c.clear <= MAX_MARKS_TO_CLEAR) candidates.push({ pool, need, ...c });
    }
  }
  candidates.sort(fewerChanges); // stable: ties keep the id/key order above

  const copiesLeft = new Map(freedSleeves.map((s) => [s.id, s.copies]));
  const matched = new Set();
  const matches = [];
  for (const { pool, need, marksToClear, marksToAdd } of candidates) {
    if (matched.has(need.key) || pool.reduce((n, s) => n + copiesLeft.get(s.id), 0) < need.copyCount) continue;
    let wanted = need.copyCount;
    const used = [];
    for (const sleeve of pool) {
      const copies = Math.min(wanted, copiesLeft.get(sleeve.id));
      if (!copies) continue;
      copiesLeft.set(sleeve.id, copiesLeft.get(sleeve.id) - copies);
      wanted -= copies;
      used.push({ ...sleeve, copies });
    }
    matched.add(need.key);
    matches.push({ id: `${used.map((s) => s.id).join('+')}>${need.key}`, freedSleeves: used, incomingBatch: need, copies: need.copyCount, marksToClear, marksToAdd });
  }

  const needsFreshSleeve = needs.filter((n) => !matched.has(n.key));
  return { freedSleeves, spareSleeves, matches, needsFreshSleeve, prep: prepTotals({ freed, matches, needsFreshSleeve, stayClears }) };
}

/**
 * Complete one Sleeve reuse in one step: the removedCards rows its Freed
 * sleeve covers count the copies as cleared, and the incoming batch is Done.
 * No undo here — the player unticks Done in Results like anywhere else.
 * @returns {{ prism: Object, unmarkedKeys: string[] }} The caller passes
 *   unmarkedKeys to recordUnmarkedCards before savePrism. Completing only adds
 *   marks, so it is empty today; the contract matches every other mark write.
 */
export function completeReuse(prism, matchId, { now = new Date().toISOString() } = {}) {
  const match = planSleeveReuse(prism).matches.find((m) => m.id === matchId);
  if (!match) throw new Error('That Sleeve reuse is no longer available.');
  const next = structuredClone(prism);
  for (const { cardName, deckIds, copies } of match.freedSleeves) {
    const name = normalizeCardName(cardName);
    for (const row of next.removedCards || []) {
      if (normalizeCardName(row.cardName) !== name || !deckIds.includes(row.deckId)) continue;
      row.clearedQuantity = (row.clearedQuantity || 0) + Math.min(copies, removalOpenCopies(row));
    }
  }
  next.markedCards = [...new Set([...(next.markedCards || []), match.incomingBatch.key])];
  next.markedCardsUpdatedAt = now;
  next.updatedAt = now;
  return { prism: next, unmarkedKeys: [] };
}
