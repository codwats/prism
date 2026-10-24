/**
 * Sleeve reuse (#376, ADR 0004): match Freed sleeves to cards that need a
 * sleeve, reconciled from current state on every call — never at edit time,
 * never stored. Pure: no DOM, no network. Planned swaps are ignored.
 *
 * A Freed sleeve is a sleeve whose copy left the PRISM: per card, old copy
 * count minus new copy count. The old state is rebuilt from the card's open
 * removedCards rows over the current decks, so edit order never matters.
 * Matching is by marks alone (the tallyMarks identity in swap.js), at most
 * MAX_MARKS_TO_CLEAR clears, cheapest first. Commanders get no special rule.
 */

import { processCards } from "./processor.js";
import { normalizeCardName } from "./parser.js";
import { removalOpenCopies } from "./swap.js";
import { isCardDone } from "../core/utils.js";

export const MAX_MARKS_TO_CLEAR = 2;

const markId = (s) => `${s.side}|${s.position}|${s.markType || 'stripe'}|${s.color}`;

const visibleMarks = (stripes) => stripes
  .filter((s) => s.markType !== 'membership')
  .map((s) => ({ id: markId(s), side: s.side, position: s.position, markType: s.markType || 'stripe', color: s.color, deckName: s.deckName }));

// The markedCards key that makes one batch Done: plain name on a single-batch card.
const doneKey = (card, batch) => (card.batches.length === 1 ? card.name : batch.key);
const batchDone = (card, batch, markedSet) => isCardDone(card, markedSet) || markedSet.has(doneKey(card, batch));

// The PRISM with only one card, quantities raised back by its open rows. Rows
// carry the deck's slot and color at removal, so a standalone deck that moved
// since is rebuilt where the mark was painted.
// shortcut: a deleted deck comes back as a standalone deck, so a deleted split
// variant's marks read as Side A stripes; rebuild its group if that shows up.
function oneCardPrism(prism, normalizedName, rows = []) {
  const decks = prism.decks.map((d) => ({
    ...d,
    cards: d.cards.filter((c) => normalizeCardName(c.name) === normalizedName).map((c) => ({ ...c })),
  }));
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
  return { ...prism, decks };
}

const fewerChanges = (a, b) => a.clear - b.clear || a.add - b.add;

function cost(fromMarks, toMarks) {
  const to = new Set(toMarks.map((m) => m.id));
  const from = new Set(fromMarks.map((m) => m.id));
  const marksToClear = fromMarks.filter((m) => !to.has(m.id));
  const marksToAdd = toMarks.filter((m) => !from.has(m.id));
  return { marksToClear, marksToAdd, clear: marksToClear.length, add: marksToAdd.length };
}

// Old sleeves of one card that no current copy needs. The copies still in the
// PRISM keep the sleeves that cost them the fewest changes, so an ambiguous
// multi-batch loss frees the sleeve with the most marks to clear.
function freedSleevesOf(prism, current, normalizedName, rows, markedSet) {
  const [old] = processCards(oneCardPrism(prism, normalizedName, rows));
  if (!old) return [];
  const now = current.find((c) => c.normalizedName === normalizedName);
  const sleeves = old.batches.map((b) => {
    const done = batchDone(old, b, markedSet);
    return { batch: b, done, marks: done ? visibleMarks(b.stripes) : [], left: b.copyCount };
  });
  for (const batch of now?.batches || []) {
    const need = visibleMarks(batch.stripes);
    for (let i = 0; i < batch.copyCount; i++) {
      const best = sleeves
        .filter((s) => s.left > 0)
        .map((s) => ({ s, ...cost(s.marks, need) }))
        .sort(fewerChanges)[0];
      if (!best) break;
      best.s.left--;
    }
  }
  return sleeves.filter((s) => s.left > 0).map((s) => {
    const names = visibleMarks(s.batch.stripes).map((m) => m.deckName);
    return {
      id: `${old.name}|${s.batch.key}`,
      cardName: old.name,
      label: old.batches.length > 1 ? `the ${names.join(' + ')}-only sleeve` : null,
      marks: s.marks,
      copies: s.left,
      blank: !s.done,
      deckIds: s.batch.participantIds,
    };
  });
}

/**
 * @param {Object} prism
 * @returns {{
 *   freedSleeves: Array<{ id, cardName, label, marks, copies, blank: false, deckIds }>,
 *   spareSleeves: Array<{ id, cardName, label, marks: [], copies, blank: true, deckIds }>,
 *   matches: Array<{ id, freedSleeve, incomingBatch, copies, marksToClear, marksToAdd }>,
 *   needsFreshSleeve: Array<{ cardName, key, copyCount, marks }>,
 * }}
 *   Marks are `{ id, side, position, markType, color, deckName }`. A Freed
 *   sleeve's `label` names it ("the A-only sleeve") only when its card had
 *   several batches, so which sleeve is meant is not obvious; otherwise null. A match uses
 *   `copies` (the incoming batch's copyCount) of its Freed sleeve.
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
  const freed = [...rowsByCard]
    .flatMap(([name, rows]) => freedSleevesOf(prism, current, name, rows, markedSet))
    .sort((a, b) => a.id.localeCompare(b.id));
  const freedSleeves = freed.filter((s) => !s.blank);
  const spareSleeves = freed.filter((s) => s.blank);

  const needs = current
    .flatMap((card) => card.batches
      .filter((b) => !batchDone(card, b, markedSet))
      .map((b) => ({ cardName: card.name, key: doneKey(card, b), copyCount: b.copyCount, marks: visibleMarks(b.stripes) })))
    .sort((a, b) => a.key.localeCompare(b.key));

  const candidates = [];
  for (const sleeve of freedSleeves) {
    for (const need of needs) {
      if (need.copyCount > sleeve.copies) continue;
      const c = cost(sleeve.marks, need.marks);
      if (c.clear <= MAX_MARKS_TO_CLEAR) candidates.push({ sleeve, need, ...c });
    }
  }
  candidates.sort(fewerChanges); // stable: ties keep the id/key order above

  const left = new Map(freedSleeves.map((s) => [s.id, s.copies]));
  const matched = new Set();
  const matches = [];
  for (const { sleeve, need, marksToClear, marksToAdd } of candidates) {
    if (matched.has(need.key) || left.get(sleeve.id) < need.copyCount) continue;
    left.set(sleeve.id, left.get(sleeve.id) - need.copyCount);
    matched.add(need.key);
    matches.push({ id: `${sleeve.id}>${need.key}`, freedSleeve: sleeve, incomingBatch: need, copies: need.copyCount, marksToClear, marksToAdd });
  }

  return { freedSleeves, spareSleeves, matches, needsFreshSleeve: needs.filter((n) => !matched.has(n.key)) };
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
  const { freedSleeve, incomingBatch, copies } = match;
  const next = structuredClone(prism);
  const name = normalizeCardName(freedSleeve.cardName);
  for (const row of next.removedCards || []) {
    if (normalizeCardName(row.cardName) !== name || !freedSleeve.deckIds.includes(row.deckId)) continue;
    row.clearedQuantity = (row.clearedQuantity || 0) + Math.min(copies, removalOpenCopies(row));
  }
  next.markedCards = [...new Set([...(next.markedCards || []), incomingBatch.key])];
  next.markedCardsUpdatedAt = now;
  next.updatedAt = now;
  return { prism: next, unmarkedKeys: [] };
}
