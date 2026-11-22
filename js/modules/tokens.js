/**
 * Token pack (#412): the Token types a PRISM's decks need, marked by the card
 * rules. A deck needs a Token type when one of its cards creates it (Scryfall
 * token parts) or the player hand-added it for that deck.
 *
 * The player's choices live in `prism.tokenChoices`, one entry per
 * (kind, oracleId), each with its own `updatedAt`:
 *   { kind: 'added',  oracleId, name, deckIds: [] }  hand-added; [] = removed
 *   { kind: 'paired', oracleId, pairedWith }         null = unpaired
 *   { kind: 'hidden', oracleId, hidden }             false = shown again
 * Nothing is ever deleted: undoing a choice writes a newer entry, so the sync
 * merge is a plain newer-wins per entry and needs no tombstones (storage.js).
 */

import { processCards } from './processor.js';

const findChoice = (prism, kind, oracleId) =>
  (prism.tokenChoices || []).find((c) => c.kind === kind && c.oracleId === oracleId);

function setChoice(prism, kind, oracleId, fields) {
  const rest = (prism.tokenChoices || []).filter((c) => !(c.kind === kind && c.oracleId === oracleId));
  return { ...prism, tokenChoices: [...rest, { kind, oracleId, ...fields, updatedAt: new Date().toISOString() }] };
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

/** The decks a hand-added token is needed by, exactly; [] removes it. */
export function setAddedToken(prism, type, deckIds) {
  return setChoice(prism, 'added', type.oracleId, { name: type.name, deckIds: [...deckIds] });
}

/** Decks the player ticked for a hand-added token, or [] */
export const addedTokenDecks = (prism, oracleId) => findChoice(prism, 'added', oracleId)?.deckIds || [];

/** Oracle ids the player hid. */
export const hiddenTokenIds = (prism) =>
  (prism.tokenChoices || []).filter((c) => c.kind === 'hidden' && c.hidden).map((c) => c.oracleId);

/** Oracle ids hand-added to at least one deck. */
export const addedTokenIds = (prism) =>
  (prism.tokenChoices || []).filter((c) => c.kind === 'added' && c.deckIds?.length).map((c) => c.oracleId);

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
  for (const c of prism.tokenChoices || []) {
    if (c.kind !== 'added') continue;
    const type = typeOf(c.oracleId) || { oracleId: c.oracleId, name: c.name, detail: '' };
    for (const deckId of c.deckIds || []) if (liveDecks.has(deckId)) need(type, deckId);
  }
  return needs;
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
