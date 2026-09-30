/**
 * Swap engine (#292): one card replacing another in a set of decks, and what
 * that costs in marks. Pure — takes a PRISM, returns a new one; the caller
 * records unmark tombstones and saves. Also owns the removed-card bookkeeping
 * the deck edit/delete paths share with it.
 */

import { processCards } from "./processor.js";
import { normalizeCardName } from "./parser.js";
import { isCardDone, countVisibleMarks } from "../core/utils.js";

const sameName = (a, b) => normalizeCardName(a) === normalizeCardName(b);
const findCard = (processed, name) => processed.find((c) => sameName(c.name, name));

// Upsert a removedCards row by (cardName, deckId): successive quantity edits
// merge instead of duplicating — previousQuantity keeps its max (5→4→3 must
// not under-report the surplus), the latest newQuantity/removedAt win.
// Mirrors mergeRemovedCards in storage.js. Returns true if the row is new.
export function trackRemovedCard(prism, row) {
  const list = prism.removedCards;
  const rowName = normalizeCardName(row.cardName);
  const idx = list.findIndex(
    (rc) => normalizeCardName(rc.cardName) === rowName && rc.deckId === row.deckId,
  );
  if (idx >= 0) {
    row.previousQuantity = Math.max(row.previousQuantity || 1, list[idx].previousQuantity || 0);
    list.splice(idx, 1);
  }
  list.push(row);
  return idx < 0;
}

// Carry each card's Separate sleeve id (#309) from a deck's old rows onto its
// rebuilt ones, by name: decklist text can't hold it, and every path that
// replaces a deck's cards (form save, URL re-import, file upload) saves here.
export function keepSeparateSleeves(oldCards, newCards) {
  const sleeves = new Map(oldCards.filter((c) => c.sleeve).map((c) => [normalizeCardName(c.name), c.sleeve]));
  for (const card of newCards) {
    const sleeve = sleeves.get(normalizeCardName(card.name));
    if (sleeve) card.sleeve = sleeve;
  }
}

// Slot to record in removedCards for a deck's cleared marks. Dot variants own
// no slot of their own (stripePosition null) — their physical marks live at
// the parent group's Side A position, so record that instead of null (which
// rendered as "Remove from Side A - Slot null" in the Removed view).
export function getRemovalStripePosition(prism, deck) {
  if (typeof deck.stripePosition === 'number') return deck.stripePosition;
  const group = (prism.splitGroups || []).find((g) => g.id === deck.splitGroupId);
  return group?.sideAPosition ?? null;
}

// Visible marks per card name. markType 'membership' entries are invisible
// filter anchors and carry no paint mark, so they don't count.
export function stripeCountMap(prism) {
  if (!prism?.decks?.length) return new Map();
  return new Map(processCards(prism).map((c) => [c.name, countVisibleMarks(c.stripes)]));
}

// Stale-mark rows for cards back in the deck they left, at their full
// quantity, with the deck still in the slot and color the row recorded: that
// mark is still on the sleeve and valid again (#307). Removes the rows from
// prism.removedCards and returns them.
export function clearReturnedRemovals(prism, deck) {
  const quantities = new Map(deck.cards.map((c) => [normalizeCardName(c.name), c.quantity || 1]));
  const position = getRemovalStripePosition(prism, deck);
  const cleared = [];
  prism.removedCards = (prism.removedCards || []).filter((rc) => {
    const quantity = quantities.get(normalizeCardName(rc.cardName));
    const back = rc.deckId === deck.id
      && quantity != null
      && quantity >= (rc.previousQuantity || 1)
      && rc.stripePosition === position
      && rc.deckColor === deck.color;
    if (back) cleared.push(rc);
    return !back;
  });
  return cleared;
}

// Drop marks on cards that gained a visible stripe since beforeCounts: the
// sleeve needs a new mark, so it is no longer done. Stripes a stillPainted row
// (clearReturnedRemovals) accounts for are already on the sleeve and don't
// count. Returns the removed keys for recordUnmarkedCards.
// ponytail: counts stripes, one per returning deck; exact per-mark matching if
// a returning split variant ever adds more than one visible mark.
export function unmarkCardsWithNewStripes(prism, beforeCounts, stillPainted = []) {
  if (!prism?.markedCards?.length) return [];
  const afterCounts = stripeCountMap(prism);
  const painted = new Map();
  for (const row of stillPainted) {
    const name = normalizeCardName(row.cardName);
    painted.set(name, (painted.get(name) || 0) + 1);
  }
  const unmarkedKeys = [];
  prism.markedCards = prism.markedCards.filter((cardKey) => {
    const cardName = cardKey.includes("|") ? cardKey.split("|")[0] : cardKey;
    const gained = (afterCounts.get(cardName) || 0) - (beforeCounts.get(cardName) || 0);
    if (gained > (painted.get(normalizeCardName(cardName)) || 0)) {
      unmarkedKeys.push(cardKey);
      return false;
    }
    return true;
  });
  return unmarkedKeys;
}

/**
 * Whether swapping `outgoing` for `incoming` across one marking batch can be
 * a Sleeve swap: no deck in the batch has the outgoing card as its commander
 * or already runs the incoming card. An incoming card elsewhere in the PRISM
 * is fine — the Sleeve swap gives it a Separate sleeve (#309). Color-identity
 * fit is the caller's check.
 */
export function canSleeveSwap(prism, batch, { outgoing, incoming }) {
  return !prism.decks.some(
    (d) => batch.participantIds.includes(d.id)
      && d.cards.some((c) => sameName(c.name, incoming) || (c.isCommander && sameName(c.name, outgoing))),
  );
}

// Copies per physical mark on a card: { "<side>|<pos>|<type>|<color>": copies }.
function tallyMarks(cards, tally = new Map()) {
  for (const card of cards) {
    for (const batch of card?.batches || []) {
      for (const s of batch.stripes) {
        if (s.markType === 'membership') continue;
        const id = `${s.side}|${s.position}|${s.markType || 'stripe'}|${s.color}`;
        tally.set(id, (tally.get(id) || 0) + batch.copyCount);
      }
    }
  }
  return tally;
}

function diffMarks(before, after) {
  let add = 0;
  let stale = 0;
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(id) || 0) - (before.get(id) || 0);
    if (delta > 0) add += delta;
    else stale -= delta;
  }
  return { add, stale };
}

/**
 * Apply a Swap: `copies` of `outgoing` leave each deck in `deckIds` and the
 * same number of `incoming` come in. With `sleeve`, it is a Sleeve swap:
 * `deckIds` must be exactly one of the outgoing card's marking batches,
 * `copies` its copyCount, and canSleeveSwap must hold. No stale-mark rows,
 * and the batch's done state carries to the incoming card. An incoming card
 * already in the PRISM gets a Separate sleeve: the new rows share a `sleeve`
 * id, and its existing sleeves keep their marks and done state. Otherwise it
 * is a plain Swap per deck. The outgoing card's mark keys are never pruned,
 * so swapping back resurrects them.
 *
 * @returns {{ prism: Object, summary: { sleeveSwap: boolean, marksToAdd: number,
 *   staleMarks: number, copiesToBuy: number, unmarkedKeys: string[], carriedKey: string|null } }}
 *   The caller calls recordUnmarkedCards(prism.id, summary.unmarkedKeys) before savePrism.
 */
export function applySwap(prism, { outgoing, incoming, deckIds, copies = 1, sleeve = false, now = new Date().toISOString() }) {
  const before = processCards(prism);
  const outgoingBefore = findCard(before, outgoing);
  const incomingBefore = findCard(before, incoming);
  const deckSet = [...deckIds].sort().join(",");
  const sleeveBatch = sleeve
    ? (outgoingBefore?.batches || []).find(
      (b) => b.participantIds.join(",") === deckSet
        && b.copyCount === copies
        && canSleeveSwap(prism, b, { outgoing, incoming }),
    )
    : null;
  if (sleeve && !sleeveBatch) throw new Error(`No Sleeve swap of ${outgoing} for ${incoming} in these decks.`);
  const separateSleeve = sleeveBatch && incomingBefore ? crypto.randomUUID() : null;

  const next = structuredClone(prism);
  next.removedCards ??= [];
  next.markedCards ??= [];
  // Stale marks a plain Swap brings back into use. A Sleeve swap puts the
  // incoming card in the outgoing card's sleeve, so its old sleeve stays stale.
  const returned = [];

  for (const deckId of deckIds) {
    const deck = next.decks.find((d) => d.id === deckId);
    const out = deck?.cards.find((c) => sameName(c.name, outgoing));
    if (!out || out.quantity < copies) {
      throw new Error(`${deck?.name ?? deckId} doesn't run ${copies} ${outgoing}.`);
    }
    if (out.isCommander) throw new Error(`${outgoing} is ${deck.name}'s commander.`);

    const previousQuantity = out.quantity;
    out.quantity -= copies;
    if (out.quantity === 0) deck.cards = deck.cards.filter((c) => c !== out);
    const existing = deck.cards.find((c) => sameName(c.name, incoming));
    if (existing) existing.quantity += copies;
    else deck.cards.push({
      name: incoming, quantity: copies, isCommander: false, isBasicLand: false,
      ...(separateSleeve ? { sleeve: separateSleeve } : {}),
    });
    deck.updatedAt = now;
    deck.cardsUpdatedAt = now;

    if (!sleeveBatch) {
      trackRemovedCard(next, {
        cardName: out.name,
        deckId: deck.id,
        deckName: deck.name,
        deckColor: deck.color,
        stripePosition: getRemovalStripePosition(next, deck),
        removedAt: now,
        previousQuantity,
        newQuantity: out.quantity,
      });
      returned.push(...clearReturnedRemovals(next, deck));
    }
  }
  next.updatedAt = now;

  const beforeCounts = new Map(before.map((c) => [c.name, countVisibleMarks(c.stripes)]));
  // A Separate sleeve's marks are on the new sleeve, never the existing ones.
  if (separateSleeve) beforeCounts.set(incomingBefore.name, Infinity);
  const unmarkedKeys = unmarkCardsWithNewStripes(next, beforeCounts, returned);

  const after = processCards(next);
  const outgoingAfter = findCard(after, outgoing);
  const incomingAfter = findCard(after, incoming);

  let carriedKey = null;
  const markedSet = new Set(prism.markedCards || []);
  if (sleeveBatch && (markedSet.has(sleeveBatch.key) || isCardDone(outgoingBefore, markedSet))) {
    const match = incomingAfter?.batches.find(
      (b) => b.participantIds.join(",") === deckSet && b.copyCount === copies,
    );
    if (match) {
      carriedKey = incomingAfter.batches.length === 1 ? incomingAfter.name : match.key;
      if (!next.markedCards.includes(carriedKey)) next.markedCards.push(carriedKey);
      next.markedCardsUpdatedAt = now;
    }
  }

  // A Separate sleeve can make the incoming card multi-batch, where only batch
  // keys count: each existing sleeve that was done stays done under its key.
  if (separateSleeve) {
    const doneBefore = (b) => markedSet.has(incomingBefore.batches.length === 1 ? incomingBefore.name : b.key);
    for (const b of incomingBefore.batches.filter(doneBefore)) {
      const key = incomingAfter.batches.find((a) => a.key === b.key && !a.isSeparateSleeve)?.key;
      if (key && incomingAfter.batches.length > 1 && !next.markedCards.includes(key)) {
        next.markedCards.push(key);
        next.markedCardsUpdatedAt = now;
      }
    }
  }

  // A Sleeve swap moves marks from one card to the other in the same sleeve,
  // so both cards are tallied together; a plain Swap paints a new sleeve and
  // leaves a stale mark on the old one, so each card is tallied alone.
  const cost = sleeveBatch
    ? diffMarks(tallyMarks([outgoingBefore, incomingBefore]), tallyMarks([outgoingAfter, incomingAfter]))
    : [[outgoingBefore, outgoingAfter], [incomingBefore, incomingAfter]]
      .map(([b, a]) => diffMarks(tallyMarks([b]), tallyMarks([a])))
      .reduce((s, d) => ({ add: s.add + d.add, stale: s.stale + d.stale }));

  return {
    prism: next,
    summary: {
      sleeveSwap: !!sleeveBatch,
      // A returned stale mark is already painted, on a copy already owned.
      marksToAdd: Math.max(0, cost.add - returned.length),
      staleMarks: cost.stale,
      copiesToBuy: Math.max(0, (incomingAfter?.totalQuantity || 0) - (incomingBefore?.totalQuantity || 0) - returned.length),
      unmarkedKeys,
      carriedKey,
    },
  };
}
