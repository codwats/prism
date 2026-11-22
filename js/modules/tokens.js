/**
 * Token pack (#412): the Token types a PRISM's decks need, marked by the card
 * rules. A deck needs a Token type when one of its cards creates it (Scryfall
 * token parts) or the player hand-added it for that deck.
 *
 * The player's choices live in `prism.tokenChoices`, one entry per
 * (kind, oracleId, deckId), each with its own `updatedAt`:
 *   { kind: 'added',  oracleId, deckId, name, included }  hand-added for one deck; false = unticked
 *   { kind: 'paired', oracleId, pairedWith }              null = unpaired
 *   { kind: 'hidden', oracleId, hidden }                  false = shown again
 * Nothing is ever deleted: undoing a choice writes a newer entry, so the sync
 * merge is a plain newer-wins per entry and needs no tombstones (storage.js).
 * One entry per deck, so ticks for two decks on two devices both survive.
 * Details: docs/agents/token-pack.md.
 */

import { processCards } from './processor.js';

/**
 * Each kind's own fields and their token_choices columns. Shared by the sync
 * (storage.js) and the backup import (prism-import.js), so the three agree.
 */
export const TOKEN_CHOICE_FIELDS = {
  added: { deckId: 'deck_id', name: 'name', included: 'included' },
  paired: { pairedWith: 'paired_with' },
  hidden: { hidden: 'hidden' },
};

/** A choice's identity: the merge keeps the newest entry per key. */
export const tokenChoiceKey = (c) => `${c.kind}|${c.oracleId}|${c.deckId || ''}`;

const findChoice = (prism, kind, oracleId) =>
  (prism.tokenChoices || []).find((c) => tokenChoiceKey(c) === tokenChoiceKey({ kind, oracleId }));

function setChoice(prism, kind, oracleId, fields) {
  const choice = { kind, oracleId, ...fields, updatedAt: new Date().toISOString() };
  const rest = (prism.tokenChoices || []).filter((c) => tokenChoiceKey(c) !== tokenChoiceKey(choice));
  return { ...prism, tokenChoices: [...rest, choice] };
}

/** The other side of a Token type's pair, only while both sides point at each other. */
export function tokenPartner(prism, oracleId) {
  const other = findChoice(prism, 'paired', oracleId)?.pairedWith;
  return other && findChoice(prism, 'paired', other)?.pairedWith === oracleId ? other : null;
}

/** Pair two Token types into one double-sided token. A side's old pair breaks, as its partner no longer points back. */
export function pairTokens(prism, a, b) {
  return setChoice(setChoice(prism, 'paired', a, { pairedWith: b }), 'paired', b, { pairedWith: a });
}

export function unpairToken(prism, oracleId) {
  const other = tokenPartner(prism, oracleId);
  const next = setChoice(prism, 'paired', oracleId, { pairedWith: null });
  return other ? setChoice(next, 'paired', other, { pairedWith: null }) : next;
}

export function setTokenHidden(prism, oracleId, hidden) {
  return setChoice(prism, 'hidden', oracleId, { hidden });
}

const addedEntries = (prism) => (prism.tokenChoices || []).filter((c) => c.kind === 'added' && c.included);

/** Decks the player ticked for a hand-added token, or [] */
export const addedTokenDecks = (prism, oracleId) =>
  addedEntries(prism).filter((c) => c.oracleId === oracleId).map((c) => c.deckId);

/**
 * The decks a hand-added token is needed by, exactly; [] removes it. Writes
 * only the decks whose tick changed, so another device's tick for another
 * deck is left alone.
 */
export function setAddedToken(prism, type, deckIds) {
  const had = new Set(addedTokenDecks(prism, type.oracleId));
  const want = new Set(deckIds);
  let next = prism;
  for (const deckId of new Set([...had, ...want])) {
    if (had.has(deckId) !== want.has(deckId)) {
      next = setChoice(next, 'added', type.oracleId, { deckId, name: type.name, included: want.has(deckId) });
    }
  }
  return next;
}

/** Oracle ids the player hid. */
export const hiddenTokenIds = (prism) =>
  (prism.tokenChoices || []).filter((c) => c.kind === 'hidden' && c.hidden).map((c) => c.oracleId);

/** Oracle ids hand-added to at least one deck. */
export const addedTokenIds = (prism) => [...new Set(addedEntries(prism).map((c) => c.oracleId))];

/**
 * Every Token type some deck needs, hidden ones included: oracleId -> { type, deckIds }.
 * @param {(cardName: string) => Array<{oracleId, name, detail}>|null|undefined} tokensOf
 * @param {(oracleId: string) => Object|null|undefined} typeOf - identity of a hand-added type
 */
export function tokenNeeds(prism, tokensOf, typeOf = () => null) {
  const needs = new Map();
  const need = (type, deckId) => {
    if (!needs.has(type.oracleId)) needs.set(type.oracleId, { type, deckIds: new Set() });
    needs.get(type.oracleId).deckIds.add(deckId);
  };
  const liveDecks = new Set((prism.decks || []).map((d) => d.id));
  for (const deck of prism.decks || []) {
    for (const card of deck.cards || []) {
      for (const type of tokensOf(card.name) || []) need(type, deck.id);
    }
  }
  for (const c of addedEntries(prism)) {
    if (liveDecks.has(c.deckId)) need(typeOf(c.oracleId) || { oracleId: c.oracleId, name: c.name, detail: '' }, c.deckId);
  }
  return needs;
}

/**
 * The Choose decks list for one Token type: every deck, ticked when it needs
 * the type, and locked only when a card of its own makes it and the player
 * did not also add it, so a hand-added deck stays the player's to untick.
 * @returns {Array<{ deck: Object, checked: boolean, locked: boolean }>}
 */
export function tokenDeckOptions(prism, oracleId, tokensOf) {
  const derived = tokenNeeds({ ...prism, tokenChoices: [] }, tokensOf).get(oracleId)?.deckIds || new Set();
  const added = new Set(addedTokenDecks(prism, oracleId));
  return [...(prism.decks || [])]
    .sort((a, b) => (a.stripePosition ?? 99) - (b.stripePosition ?? 99))
    .map((deck) => ({ deck, checked: derived.has(deck.id) || added.has(deck.id), locked: derived.has(deck.id) && !added.has(deck.id) }));
}

/**
 * Token rows in the ProcessedCard shape the Mark sleeves table and SCRY read.
 * Each row is processed as one card, one copy, in the decks that need it, so
 * split groups, child marks, slots and colors follow the card rules and there
 * is one batch. `doneKey` is that batch's key, `token:<ids>|#b|<deck ids>|1`:
 * a change in the decks that need the token, or in its pairing, re-keys it.
 * Hidden types drop out before pairing.
 * @returns {Array<Object>} rows with `isToken: true`
 */
export function tokenRows(prism, tokensOf, typeOf) {
  const needs = tokenNeeds(prism, tokensOf, typeOf);
  for (const id of hiddenTokenIds(prism)) needs.delete(id);

  const rows = new Map(); // synthetic card name -> sides
  const seen = new Set();
  for (const [id, entry] of needs) {
    if (seen.has(id)) continue;
    const partner = needs.get(tokenPartner(prism, id));
    const sides = (partner ? [entry, partner] : [entry]).sort((a, b) => a.type.name.localeCompare(b.type.name));
    sides.forEach((s) => seen.add(s.type.oracleId));
    rows.set(`token:${sides.map((s) => s.type.oracleId).sort().join('+')}`, sides);
  }

  const decks = (prism.decks || []).map((d) => ({
    ...d,
    cards: [...rows].filter(([, sides]) => sides.some((s) => s.deckIds.has(d.id)))
      .map(([name]) => ({ name, quantity: 1, isCommander: false, isBasicLand: false })),
  }));

  return processCards({ ...prism, decks, useDedicatedCommanderCopies: false }).map((row) => {
    const sides = rows.get(row.name);
    return {
      ...row,
      name: sides.map((s) => s.type.name).join(' // '),
      isToken: true,
      doneKey: row.batches[0].key,
      oracleIds: sides.map((s) => s.type.oracleId),
      detail: sides.map((s) => s.type.detail).filter(Boolean).join(' // '),
      imageName: `token:${sides[0].type.oracleId}`,
    };
  });
}
