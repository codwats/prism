/**
 * Swap engine (#292): one card replacing another in a set of decks, and what
 * that costs in marks. Pure — takes a PRISM, returns a new one; the caller
 * records unmark tombstones and saves. Also owns the removed-card bookkeeping
 * the deck edit/delete paths share with it.
 */

import { processCards } from "./processor.js";
import { normalizeCardName, markingCards } from "./parser.js";
import { isCardDone, markSingleBatchDone } from "../core/utils.js";

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
  // A split variant's marks depend on its whole group, so the row keeps the
  // group as painted: Sleeve reuse rebuilds a deleted variant's sleeve from it.
  const deck = prism.decks?.find((d) => d.id === row.deckId);
  const group = deck?.splitGroupId && (prism.splitGroups || []).find((g) => g.id === deck.splitGroupId);
  if (group) {
    row.splitGroup = {
      id: group.id, name: group.name, sideAPosition: group.sideAPosition, sideAColor: group.sideAColor,
      splitStyle: group.splitStyle || 'stripes',
      variants: group.childDeckIds
        .map((id) => prism.decks.find((d) => d.id === id))
        .filter(Boolean)
        .map((d) => ({ id: d.id, name: d.name, color: d.color, stripePosition: d.stripePosition })),
    };
  }
  if (idx >= 0) {
    const old = list[idx];
    if (removalOpenCopies(old) === 0) {
      // A closed row (#501) is done: this is a new removal, so a fresh row one
      // generation on, which mergeRemovedCards takes whole over the closed one.
      row.generation = (old.generation || 0) + 1;
    } else {
      row.previousQuantity = Math.max(row.previousQuantity || 1, old.previousQuantity || 0);
      // Copies already cleared stay cleared (#376): both fields only go up.
      if (old.clearedQuantity) row.clearedQuantity = old.clearedQuantity;
      if (old.sleeveSwappedQuantity) row.sleeveSwappedQuantity = old.sleeveSwappedQuantity;
      if (old.generation) row.generation = old.generation;
    }
    list.splice(idx, 1);
  }
  list.push(row);
  return idx < 0;
}

// Copies of a removedCards row whose mark is still on a sleeve. clearedQuantity
// (#376) counts copies a Sleeve reuse already dealt with; the row is done at 0.
// Legacy rows without quantity fields stand for one copy.
export function removalOpenCopies(row) {
  return Math.max(0, (row.previousQuantity ?? 1) - (row.newQuantity ?? 0) - (row.clearedQuantity || 0));
}

// The removedCards rows still listed under Marks to Clear.
export const openRemovals = (prism) => (prism?.removedCards || []).filter((rc) => removalOpenCopies(rc) > 0);

// Done with a row: count its open copies as cleared. Rows close, never go
// (#501): mergeRemovedCards is a union, so a dropped row comes back from the
// other copy, while clearedQuantity only goes up.
export function closeRemoval(row) {
  row.clearedQuantity = (row.clearedQuantity || 0) + removalOpenCopies(row);
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

const isChildMark = (s, deckId) => s.side === 'b' && s.deckId === deckId && s.markType !== 'membership';

// Copies of a card that carry a split variant's child mark (Side B stripe or dot).
function childMarkCopies(card, deckId) {
  return (card?.batches || [])
    .filter((b) => b.stripes.some((s) => isChildMark(s, deckId)))
    .reduce((n, b) => n + b.copyCount, 0);
}

const removalRowFor = (prism, cardName, deckId) =>
  (prism.removedCards || []).find((rc) => sameName(rc.cardName, cardName) && rc.deckId === deckId);

/**
 * The mark a removedCards row for `cardName` leaving `deck` points at, as
 * { deckName, deckColor, stripePosition }, or null when there is no row to
 * write (#423). A split variant's row stands for its child mark. A card every
 * variant shared had none painted: nothing to list while another variant
 * still runs as many copies (the parent stripe stays in use), else the row
 * points at the group's parent stripe. An open stillInDeck row already lists
 * the variant's stale copies while the variant keeps some. `before` is
 * processCards of the PRISM before the change; `prism` holds the other decks.
 */
export function removalMark(prism, before, deck, cardName, previousQuantity, newQuantity) {
  const own = { deckName: deck.name, deckColor: deck.color, stripePosition: getRemovalStripePosition(prism, deck) };
  if (!deck.splitGroupId) return own;
  const flagged = removalRowFor(prism, cardName, deck.id);
  if (flagged?.stillInDeck && removalOpenCopies(flagged) > 0) return newQuantity > 0 ? null : own;
  if (childMarkCopies(findCard(before, cardName), deck.id) > 0) return own;
  if (prism.decks.some((d) => d.id !== deck.id && d.splitGroupId === deck.splitGroupId
    && markingCards(d.cards).some((c) => sameName(c.name, cardName) && c.quantity >= previousQuantity))) return null;
  const group = (prism.splitGroups || []).find((g) => g.id === deck.splitGroupId);
  return group ? { deckName: group.name, deckColor: group.sideAColor, stripePosition: group.sideAPosition } : own;
}

/**
 * #423: a variant's child mark an edit no longer needs on copies the variant
 * keeps (another variant gained the card, so it is shared) stays painted.
 * Record it as a stillInDeck row: previousQuantity counts the copies painted
 * with it, newQuantity the copies that still need it, so the open copies are
 * the stale ones. An open plain row for the variant (copies that left) folds
 * in: the row then lists every copy with a stale mark. A stillInDeck row
 * closes once the mark is needed on every copy it was painted on.
 * Returns the stillInDeck rows whose mark is painted where the deck now is,
 * for unmarkCardsWithNewStripes. `before` is processCards before the change.
 */
export function trackStaleChildMarks(prism, before, now) {
  prism.removedCards ??= [];
  const after = processCards(prism);
  for (const card of before) {
    const afterCard = findCard(after, card.name);
    for (const deck of prism.decks) {
      // A deck no longer split (Unsplit, #428) still has its old child marks painted.
      const deckCard = markingCards(deck.cards).find((c) => sameName(c.name, card.name)); // main + Sideboard (#29)
      if (!deckCard) continue;
      const needed = childMarkCopies(afterCard, deck.id);
      // Only copies still in the deck: a copy that left has its own removal row.
      const stale = Math.min(childMarkCopies(card, deck.id), deckCard.quantity || 1) - needed;
      if (stale <= 0) continue;
      // Slot and color as painted: an unsplit deck has moved to the group's Side A.
      const mark = card.batches.flatMap((b) => b.stripes).find((s) => isChildMark(s, deck.id));
      const existing = removalRowFor(prism, card.name, deck.id);
      // A closed row stays for trackRemovedCard to open a new generation on (#501).
      const left = existing && !existing.stillInDeck ? removalOpenCopies(existing) : 0;
      if (left) prism.removedCards = prism.removedCards.filter((rc) => rc !== existing);
      trackRemovedCard(prism, {
        cardName: card.name,
        deckId: deck.id,
        deckName: deck.name,
        deckColor: mark.color,
        stripePosition: mark.position,
        removedAt: now,
        previousQuantity: needed + stale + left,
        newQuantity: needed,
        isCommander: !!deckCard.isCommander,
        stillInDeck: true,
        ...(left && existing.generation && { generation: existing.generation }),
      });
    }
  }
  const painted = [];
  for (const rc of prism.removedCards) {
    if (!rc.stillInDeck || removalOpenCopies(rc) === 0) continue;
    const deck = prism.decks.find((d) => d.id === rc.deckId);
    if (!deck || rc.stripePosition !== getRemovalStripePosition(prism, deck) || rc.deckColor !== deck.color) continue;
    // Without splitGroup, unmarkCardsWithNewStripes reads the row as the deck's
    // own mark only: it says nothing about the parent stripe.
    painted.push({ ...rc, splitGroup: undefined });
    const needed = childMarkCopies(findCard(after, rc.cardName), deck.id);
    if (needed >= rc.previousQuantity) closeRemoval(rc);
    else rc.newQuantity = needed;
  }
  return painted;
}

// Copies per physical mark, per card name: the snapshot unmarkCardsWithNewStripes
// compares an edit against. 'membership' entries carry no paint and don't count.
export function markTallies(prism) {
  if (!prism?.decks?.length) return new Map();
  return new Map(processCards(prism).map((c) => [c.name, tallyMarks([c])]));
}

// Stale-mark rows for cards back in the deck they left, at their full
// quantity, with the deck still in the slot and color the row recorded: that
// mark is still on the sleeve and valid again (#307). Closes the rows (#501)
// and returns them.
export function clearReturnedRemovals(prism, deck) {
  const quantities = new Map(markingCards(deck.cards).map((c) => [normalizeCardName(c.name), c.quantity]));
  const position = getRemovalStripePosition(prism, deck);
  const cleared = [];
  for (const rc of prism.removedCards || []) {
    const quantity = quantities.get(normalizeCardName(rc.cardName));
    // A partly cleared row (#376) gave a copy's sleeve away, so its mark is
    // not all still painted; the quantity auto-clear takes it instead. So did
    // a row whose card's sleeve a Sleeve swap gave to another card (#401).
    // A stillInDeck row (#423) never left: trackStaleChildMarks closes it.
    const back = rc.deckId === deck.id
      && !rc.stillInDeck
      && !rc.clearedQuantity
      && !rc.sleeveSwappedQuantity
      && quantity != null
      && quantity >= (rc.previousQuantity || 1)
      && rc.stripePosition === position
      && rc.deckColor === deck.color;
    if (!back) continue;
    cleared.push(rc);
    closeRemoval(rc);
  }
  return cleared;
}

// Retire Done on cards an edit gave paint work (#422): a mark is needed on more
// copies than in `before` (markTallies), whether the mark is new or its deck now
// runs more copies. Drops the plain key and the pass key of each such mark;
// batch keys carry their own copy count and re-key themselves. A mark a
// stillPainted row accounts for is already on the sleeve, on the copies the
// row recorded: rows from clearReturnedRemovals and trackStaleChildMarks. Returns the removed keys for
// recordUnmarkedCards.
export function unmarkCardsWithNewStripes(prism, before, stillPainted = []) {
  if (!prism?.markedCards?.length) return [];
  const gained = new Map(); // card name -> deck names of the marks that gained copies
  for (const card of processCards(prism)) {
    const marks = new Map(); // markId -> { copies, stripe }
    for (const batch of card.batches) {
      for (const s of batch.stripes) {
        if (s.markType === 'membership') continue;
        const mark = marks.get(markId(s)) || { copies: 0, stripe: s };
        mark.copies += batch.copyCount;
        marks.set(markId(s), mark);
      }
    }
    const deckNames = new Set();
    for (const [id, { copies, stripe }] of marks) {
      // A returned row accounts for its deck's own mark and, for a split
      // variant, the parent stripe of the group as it was painted.
      const rows = stillPainted.filter((r) => sameName(r.cardName, card.name) && (stripe.deckId
        ? r.deckId === stripe.deckId
        : r.splitGroup?.id === stripe.groupId
          && r.splitGroup.sideAPosition === stripe.position
          && r.splitGroup.sideAColor === stripe.color));
      const painted = Math.max(before.get(card.name)?.get(id) || 0, ...rows.map((r) => r.previousQuantity || 1));
      if (copies > painted) deckNames.add(stripe.deckName);
    }
    if (deckNames.size) gained.set(card.name, deckNames);
  }
  const unmarkedKeys = [];
  prism.markedCards = prism.markedCards.filter((cardKey) => {
    const bar = cardKey.indexOf("|");
    const deckNames = gained.get(bar < 0 ? cardKey : cardKey.slice(0, bar));
    if (!deckNames || (bar >= 0 && !deckNames.has(cardKey.slice(bar + 1)))) return true;
    unmarkedKeys.push(cardKey);
    return false;
  });
  return unmarkedKeys;
}

/**
 * Whether swapping `outgoing` for `incoming` across one marking batch can be
 * a Sleeve swap: no deck in the batch has the outgoing card as its commander
 * or already runs the incoming card. An incoming card elsewhere in the PRISM
 * is fine — the Sleeve swap gives it a Separate sleeve (#309) — unless it is a
 * dedicated commander in a sibling split variant: dedication would fold the
 * new copy into that commander's sleeve. Color-identity fit is the caller's
 * check.
 */
export function canSleeveSwap(prism, batch, { outgoing, incoming }) {
  const dedicatedGroups = new Set(prism.useDedicatedCommanderCopies
    ? prism.decks
      .filter((d) => d.splitGroupId && d.cards.some((c) => c.isCommander && sameName(c.name, incoming)))
      .map((d) => d.splitGroupId)
    : []);
  return !prism.decks.some(
    (d) => batch.participantIds.includes(d.id)
      && (dedicatedGroups.has(d.splitGroupId)
        || d.cards.some((c) => sameName(c.name, incoming) || (c.isCommander && sameName(c.name, outgoing)))),
  );
}

// A physical mark's identity: side, slot, mark type, color. Sleeve reuse
// matches sleeves by it too.
export const markId = (s) => `${s.side}|${s.position}|${s.markType || 'stripe'}|${s.color}`;

// Copies per physical mark on a card: { markId: copies }.
function tallyMarks(cards, tally = new Map()) {
  for (const card of cards) {
    for (const batch of card?.batches || []) {
      for (const s of batch.stripes) {
        if (s.markType === 'membership') continue;
        tally.set(markId(s), (tally.get(markId(s)) || 0) + batch.copyCount);
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
    // A card's main and Sideboard rows (#29) are one card with one mark:
    // copies leave the main row first.
    const outRows = (deck?.cards || []).filter((c) => sameName(c.name, outgoing))
      .sort((a, b) => !!a.isSideboard - !!b.isSideboard);
    const out = outRows[0];
    const previousQuantity = outRows.reduce((sum, c) => sum + (c.quantity || 1), 0);
    if (!out || previousQuantity < copies) {
      throw new Error(`${deck?.name ?? deckId} doesn't run ${copies} ${outgoing}.`);
    }
    if (outRows.some((c) => c.isCommander)) throw new Error(`${outgoing} is ${deck.name}'s commander.`);

    let left = copies;
    const taken = []; // [isSideboard, copies]: the incoming card goes where the copies left
    for (const r of outRows) {
      const take = Math.min(left, r.quantity || 1);
      r.quantity = (r.quantity || 1) - take;
      left -= take;
      if (take) taken.push([!!r.isSideboard, take]);
    }
    const newQuantity = previousQuantity - copies;
    deck.cards = deck.cards.filter((c) => !outRows.includes(c) || c.quantity > 0);
    for (const [isSideboard, n] of taken) {
      const existing = deck.cards.find((c) => sameName(c.name, incoming) && !!c.isSideboard === isSideboard);
      if (existing) existing.quantity += n;
      else deck.cards.push({
        name: incoming, quantity: n, isCommander: false, isBasicLand: false,
        ...(isSideboard ? { isSideboard } : {}),
        ...(separateSleeve ? { sleeve: separateSleeve } : {}),
      });
    }
    deck.updatedAt = now;
    deck.cardsUpdatedAt = now;

    const mark = !sleeveBatch && removalMark(next, before, deck, out.name, previousQuantity, newQuantity);
    if (mark) {
      trackRemovedCard(next, {
        cardName: out.name,
        deckId: deck.id,
        ...mark,
        removedAt: now,
        previousQuantity,
        newQuantity,
        isCommander: false, // a commander throws above
      });
    }
    if (!sleeveBatch) returned.push(...clearReturnedRemovals(next, deck));
  }
  // The outgoing card's open rows rebuild its old sleeves in Sleeve reuse, but
  // this swap wrote none: they record the copies whose sleeve the incoming
  // card now holds, so those sleeves don't count as freed (#401).
  if (sleeveBatch) {
    for (const row of next.removedCards) {
      if (sameName(row.cardName, outgoing) && removalOpenCopies(row) > 0) {
        row.sleeveSwappedQuantity = (row.sleeveSwappedQuantity || 0) + copies;
      }
    }
  }
  next.updatedAt = now;

  const beforeTallies = markTallies(prism);
  // A Separate sleeve's marks are on the new sleeve, never the existing ones.
  if (separateSleeve) beforeTallies.set(incomingBefore.name, { get: () => Infinity });
  // A Sleeve swap moves the outgoing copies' marks with their sleeve: none goes stale.
  const stalePainted = sleeveBatch ? [] : trackStaleChildMarks(next, before, now);
  const unmarkedKeys = unmarkCardsWithNewStripes(next, beforeTallies, [...returned, ...stalePainted]);

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
      if (carriedKey === match.key) {
        if (!next.markedCards.includes(carriedKey)) next.markedCards.push(carriedKey);
      } else {
        const done = markSingleBatchDone(next.markedCards, carriedKey, match.key);
        next.markedCards = done.markedCards;
        unmarkedKeys.push(...done.unmarkedKeys);
      }
      next.markedCardsUpdatedAt = now;
    }
  }

  // A Separate sleeve can make the incoming card multi-batch, where only batch
  // keys count: each existing sleeve that was done stays done under its key.
  if (separateSleeve) {
    const wasDone = isCardDone(incomingBefore, markedSet);
    const doneBefore = (b) => wasDone || markedSet.has(incomingBefore.batches.length === 1 ? incomingBefore.name : b.key);
    for (const b of incomingBefore.batches.filter(doneBefore)) {
      const key = incomingAfter.batches.find((a) => a.key === b.key)?.key;
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
