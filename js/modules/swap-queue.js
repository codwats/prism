/**
 * Swap Queue (#364): a PRISM's Planned swaps, applied one deck at a time.
 * Pure — takes a PRISM, returns a new one; the caller records unmark
 * tombstones and saves. Terms are defined in CONTEXT.md.
 *
 * Planned swap: { id, incoming, deckId, copies, outgoing?, note?, createdAt, updatedAt }.
 * Whether it goes in as a Sleeve swap is decided at apply time, never stored.
 */

import { normalizeCardName } from "./parser.js";
import { processCards } from "./processor.js";
import { applySwap, canSleeveSwap } from "./swap.js";

const sameName = (a, b) => normalizeCardName(a) === normalizeCardName(b);

/**
 * Queue `incoming` for one deck. The same incoming card for the same deck
 * updates the Planned swap already queued instead of adding a second one.
 */
export function queueSwap(prism, { incoming, deckId, outgoing, copies, note, now = new Date().toISOString() }) {
  const plannedSwaps = [...(prism.plannedSwaps || [])];
  const idx = plannedSwaps.findIndex((s) => s.deckId === deckId && sameName(s.incoming, incoming));
  const changes = Object.fromEntries(Object.entries({ outgoing, copies, note }).filter(([, v]) => v !== undefined));
  if (idx >= 0) {
    plannedSwaps[idx] = { ...plannedSwaps[idx], ...changes, updatedAt: now };
  } else {
    plannedSwaps.push({ id: crypto.randomUUID(), incoming, deckId, copies: 1, ...changes, createdAt: now, updatedAt: now });
  }
  return { ...prism, plannedSwaps };
}

/**
 * The queue grouped by target deck, in deck order, with each Planned swap's
 * stale state worked out against the PRISM as it is now:
 * - target deck deleted → removed
 * - outgoing card no longer in the deck → an idea again (`outgoing: null`,
 *   stored without its cut so the cut doesn't return with the card)
 * The returned `prism` holds those two changes. It is the input object when
 * there were none, so the caller saves only on change.
 * - incoming card already in the deck → `flag: 'in-deck'`
 * - a second Planned swap cutting the same card → `flag: 'duplicate-cut'`
 * Flagged swaps stay queued; the UI unticks them by default.
 */
export function queueByDeck(prism, now = new Date().toISOString()) {
  const decks = new Map(prism.decks.map((d) => [d.id, d]));
  const queued = prism.plannedSwaps || [];
  let changed = false;
  const kept = queued.filter((s) => decks.has(s.deckId)).map((s) => {
    if (!s.outgoing || decks.get(s.deckId).cards.some((c) => sameName(c.name, s.outgoing))) return s;
    const idea = { ...s, updatedAt: now };
    delete idea.outgoing;
    changed = true;
    return idea;
  });
  const next = !changed && kept.length === queued.length ? prism : { ...prism, plannedSwaps: kept };

  const groups = prism.decks
    .map((deck) => {
      const cuts = new Set();
      const swaps = kept.filter((s) => s.deckId === deck.id).map((s) => {
        const outgoing = s.outgoing || null;
        let flag = null;
        if (deck.cards.some((c) => sameName(c.name, s.incoming))) flag = 'in-deck';
        else if (outgoing && cuts.has(normalizeCardName(outgoing))) flag = 'duplicate-cut';
        if (outgoing) cuts.add(normalizeCardName(outgoing));
        return { ...s, outgoing, flag };
      });
      return { deck, swaps };
    })
    .filter((g) => g.swaps.length);
  return { prism: next, groups };
}

// Whether a Planned swap can go in as a Sleeve swap on this PRISM: 'available'
// when the outgoing card has a batch of exactly this deck and these copies,
// 'other-decks' when its batch also spans decks not being applied, else null.
function sleeveOption(prism, { outgoing, incoming, deckId, copies }) {
  const card = processCards(prism).find((c) => sameName(c.name, outgoing));
  const batches = (card?.batches || []).filter(
    (b) => b.participantIds.includes(deckId) && b.copyCount === copies && canSleeveSwap(prism, b, { outgoing, incoming }),
  );
  if (batches.some((b) => b.participantIds.length === 1)) return 'available';
  return batches.length ? 'other-decks' : null;
}

/**
 * Apply ticked Planned swaps of one deck, in order: each applySwap runs on the
 * result of the one before, so the preview and the confirm are the same call.
 * `ticked` is `[{ id, sleeve? }]`; a Sleeve swap is used only when the step
 * allows one at that point in the sequence. Throws when a ticked swap has no
 * outgoing card.
 *
 * @returns {{ prism, summary: { marksToAdd, staleMarks, copiesToBuy, unmarkedKeys },
 *   steps: { swap, sleeve: 'available'|'other-decks'|null, sleeveSwap: boolean }[], pullList: string[] }}
 *   The applied swaps are gone from prism.plannedSwaps. The caller calls
 *   recordUnmarkedCards(prism.id, summary.unmarkedKeys) before savePrism.
 */
export function applyDeck(prism, ticked, now = new Date().toISOString()) {
  const view = queueByDeck(prism, now);
  const queued = new Map(view.groups.flatMap((g) => g.swaps).map((s) => [s.id, s]));
  const swaps = ticked.map((t) => ({ ...queued.get(t.id), wantSleeve: !!t.sleeve })).filter((s) => s.id);
  const idea = swaps.find((s) => !s.outgoing);
  if (idea) throw new Error(`Choose a cut for ${idea.incoming} first.`);

  let next = view.prism;
  const summary = { marksToAdd: 0, staleMarks: 0, copiesToBuy: 0, unmarkedKeys: [] };
  const steps = [];
  for (const swap of swaps) {
    const sleeve = sleeveOption(next, swap);
    const result = applySwap(next, {
      outgoing: swap.outgoing, incoming: swap.incoming, deckIds: [swap.deckId], copies: swap.copies,
      sleeve: swap.wantSleeve && sleeve === 'available', now,
    });
    next = result.prism;
    summary.marksToAdd += result.summary.marksToAdd;
    summary.staleMarks += result.summary.staleMarks;
    summary.copiesToBuy += result.summary.copiesToBuy;
    summary.unmarkedKeys.push(...result.summary.unmarkedKeys);
    steps.push({ swap, sleeve, sleeveSwap: result.summary.sleeveSwap });
  }

  // A key a later step marked again (a carried Sleeve swap mark) is not un-marked.
  const marked = new Set(next.markedCards || []);
  summary.unmarkedKeys = [...new Set(summary.unmarkedKeys)].filter((k) => !marked.has(k));
  const applied = new Set(swaps.map((s) => s.id));
  next = { ...next, plannedSwaps: (next.plannedSwaps || []).filter((s) => !applied.has(s.id)) };
  const inPrism = (name) => next.decks.some((d) => d.cards.some((c) => sameName(c.name, name)));
  const pullList = [...new Set(swaps.map((s) => s.outgoing))].filter((name) => !inPrism(name));
  return { prism: next, summary, steps, pullList };
}

export function removeSwap(prism, id) {
  return { ...prism, plannedSwaps: (prism.plannedSwaps || []).filter((s) => s.id !== id) };
}
