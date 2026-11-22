import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrism, createDeck, createSplitGroup, processCards } from '../js/modules/processor.js';
import { isCardDone } from '../js/core/utils.js';
import { comparePrisms, carryDone } from '../js/modules/compare-prisms.js';

const RED = '#FF0000';
const BLUE = '#0000FF';
const GREEN = '#00FF00';

const card = (name, quantity = 1, isCommander = false) => ({ name, quantity, isCommander, isBasicLand: false });
const deck = (name, pos, color, cards) => createDeck({ name, bracket: 3, color, stripePosition: pos, cards });
function prism(decks, extra = {}) {
  const p = createPrism('T');
  p.decks = decks;
  return Object.assign(p, extra);
}
const stripe = (position, color, side = 'a', markType = 'stripe') => ({ position, side, color, markType });

test('same card, same slot and color, under different deck names: unchanged, not listed', () => {
  const from = prism([deck('Krenko', 3, RED, [card('Sol Ring')])]);
  const to = prism([deck('Goblins Renamed', 3, RED, [card('Sol Ring')])]);
  const result = comparePrisms(from, to);
  assert.deepEqual(result.add, []);
  assert.deepEqual(result.remove, []);
  assert.deepEqual(result.remark, []);
  assert.equal(result.unchangedCount, 1);
  assert.deepEqual(result.unchanged, ['Sol Ring']);
});

test('a card only in To is To add with its marks; only in From is To remove with its marks', () => {
  const from = prism([deck('A', 3, RED, [card('Sol Ring'), card('Mana Crypt')])]);
  const to = prism([deck('A', 3, RED, [card('Sol Ring'), card('Arcane Signet')])]);
  const { add, remove, remark, unchangedCount } = comparePrisms(from, to);
  assert.deepEqual(add, [{ name: 'Arcane Signet', copies: 1, batches: [{ copies: 1, marks: [stripe(3, RED)] }] }]);
  assert.deepEqual(remove, [{ name: 'Mana Crypt', copies: 1, batches: [{ copies: 1, marks: [stripe(3, RED)] }] }]);
  assert.deepEqual(remark, []);
  assert.equal(unchangedCount, 1);
});

test('more copies in To with the same paint: only the extra copies are To add', () => {
  const from = prism([deck('A', 3, RED, [card('Forest', 2)])]);
  const to = prism([deck('A', 3, RED, [card('Forest', 5)])]);
  const { add, remove, remark } = comparePrisms(from, to);
  assert.deepEqual(add, [{ name: 'Forest', copies: 3, batches: [{ copies: 3, marks: [stripe(3, RED)] }] }]);
  assert.deepEqual(remove, []);
  assert.deepEqual(remark, []);
});

test('3 copies in From, 2 in To with different marks: 1 copy to remove, the card to re-mark with both sides', () => {
  const from = prism([deck('A', 3, RED, [card('Forest', 3)])]);
  const to = prism([deck('B', 7, BLUE, [card('Forest', 2)])]);
  const { add, remove, remark } = comparePrisms(from, to);
  assert.deepEqual(add, []);
  assert.deepEqual(remove, [{ name: 'Forest', copies: 1, batches: [{ copies: 1, marks: [stripe(3, RED)] }] }]);
  assert.deepEqual(remark, [{
    name: 'Forest', copies: 2,
    from: [{ copies: 3, marks: [stripe(3, RED)] }],
    to: [{ copies: 2, marks: [stripe(7, BLUE)] }],
  }]);
});

test('a card leaving one of its two decks: the shared sleeve is re-marked', () => {
  const from = prism([deck('A', 3, RED, [card('Sol Ring')]), deck('B', 7, BLUE, [card('Sol Ring')])]);
  const to = prism([deck('A', 3, RED, [card('Sol Ring')])]);
  const { remark } = comparePrisms(from, to);
  assert.deepEqual(remark, [{
    name: 'Sol Ring', copies: 1,
    from: [{ copies: 1, marks: [stripe(3, RED), stripe(7, BLUE)] }],
    to: [{ copies: 1, marks: [stripe(3, RED)] }],
  }]);
});

test('hex color case does not count as different paint', () => {
  const from = prism([deck('A', 3, '#ff0000', [card('Sol Ring')])]);
  const to = prism([deck('A', 3, RED, [card('Sol Ring')])]);
  assert.equal(comparePrisms(from, to).unchangedCount, 1);
});

test('dedication off in From and on in To: the commander shows in To re-mark', () => {
  const decks = () => [deck('A', 3, RED, [card('Krark', 1, true)]), deck('B', 7, BLUE, [card('Krark')])];
  const from = prism(decks());
  const to = prism(decks(), { useDedicatedCommanderCopies: true });
  const { add, remark } = comparePrisms(from, to);
  assert.deepEqual(remark.map((r) => [r.name, r.copies]), [['Krark', 1]]);
  assert.deepEqual(remark[0].from, [{ copies: 1, marks: [stripe(3, RED), stripe(7, BLUE)] }]);
  assert.deepEqual(add.map((r) => [r.name, r.copies]), [['Krark', 1]]);
});

test("From's open Marks to Clear rows show under To remove as still painted", () => {
  const from = prism([deck('A', 3, RED, [card('Sol Ring')])], {
    removedCards: [
      { cardName: 'Mana Vault', deckId: 'x', deckName: 'A', deckColor: RED, stripePosition: 3, previousQuantity: 2, newQuantity: 0 },
      { cardName: 'Done Row', deckId: 'x', deckName: 'A', deckColor: RED, stripePosition: 3, previousQuantity: 1, newQuantity: 0, clearedQuantity: 1 },
    ],
  });
  const to = prism([deck('A', 3, RED, [card('Sol Ring')])]);
  const { remove } = comparePrisms(from, to);
  assert.deepEqual(remove, [{
    name: 'Mana Vault', copies: 2, batches: [{ copies: 2, marks: [stripe(3, RED)] }], stillPainted: true, deckName: 'A',
  }]);
});

test('2 copies in From, 3 in To with different marks: the add row lists only the 1 extra copy', () => {
  const from = prism([deck('A', 3, RED, [card('Forest', 2)])]);
  const to = prism([deck('B', 7, BLUE, [card('Forest', 3)])]);
  const { add, remove, remark } = comparePrisms(from, to);
  assert.deepEqual(add, [{ name: 'Forest', copies: 1, batches: [{ copies: 1, marks: [stripe(7, BLUE)] }] }]);
  assert.deepEqual(remove, []);
  assert.deepEqual(remark.map((r) => [r.name, r.copies]), [['Forest', 2]]);
});

function splitPrism(splitStyle, variants) {
  const group = createSplitGroup({ name: 'G', sideAPosition: 5, sideAColor: RED, splitStyle });
  const decks = variants.map(([name, pos, color, cards]) => Object.assign(deck(name, pos, color, cards), { splitGroupId: group.id }));
  group.childDeckIds = decks.map((d) => d.id);
  return prism(decks, { splitGroups: [group] });
}

test('split groups: a card moving from shared to one variant gains its Side B child stripe', () => {
  const from = splitPrism('stripes', [['G1', 30, BLUE, [card('Sol Ring')]], ['G2', 31, GREEN, [card('Sol Ring')]]]);
  const to = splitPrism('stripes', [['G1', 30, BLUE, [card('Sol Ring')]], ['G2', 31, GREEN, []]]);
  const { remark, unchangedCount } = comparePrisms(from, to);
  assert.equal(unchangedCount, 0);
  assert.deepEqual(remark[0].from, [{ copies: 1, marks: [stripe(5, RED)] }]);
  assert.deepEqual(remark[0].to, [{ copies: 1, marks: [stripe(5, RED), stripe(30, BLUE, 'b')] }]);
});

test('split groups: membership anchors are not marks, so renaming variants changes nothing', () => {
  const from = splitPrism('stripes', [['G1', 30, BLUE, [card('Sol Ring')]], ['G2', 31, GREEN, [card('Sol Ring')]]]);
  const to = splitPrism('stripes', [['Other 1', 30, BLUE, [card('Sol Ring')]], ['Other 2', 31, GREEN, [card('Sol Ring')]]]);
  assert.equal(comparePrisms(from, to).unchangedCount, 1);
});

test('dots: a dot in a different variant color is a re-mark', () => {
  const from = splitPrism('dots', [['G1', undefined, BLUE, [card('Sol Ring')]], ['G2', undefined, GREEN, []]]);
  const to = splitPrism('dots', [['G1', undefined, BLUE, []], ['G2', undefined, GREEN, [card('Sol Ring')]]]);
  const { remark } = comparePrisms(from, to);
  assert.deepEqual(remark[0].from, [{ copies: 1, marks: [stripe(5, RED), stripe(5, BLUE, 'b', 'dot')] }]);
  assert.deepEqual(remark[0].to, [{ copies: 1, marks: [stripe(5, RED), stripe(5, GREEN, 'b', 'dot')] }]);
});

test("a dots variant's open Marks to Clear row is a still-painted dot, not a Side A stripe", () => {
  const from = splitPrism('dots', [['G1', undefined, BLUE, []], ['G2', undefined, GREEN, []]]);
  const [g1] = from.decks;
  from.removedCards = [{
    cardName: 'Mana Vault', deckId: g1.id, deckName: 'G1', deckColor: BLUE, stripePosition: 5,
    previousQuantity: 1, newQuantity: 0,
    splitGroup: { id: from.splitGroups[0].id, name: 'G', sideAPosition: 5, sideAColor: RED, splitStyle: 'dots', variants: [] },
  }];
  const { remove } = comparePrisms(from, prism([]));
  assert.deepEqual(remove[0].batches, [{ copies: 1, marks: [stripe(5, BLUE, 'b', 'dot')] }]);
});

test("a dots group's parent-stripe Marks to Clear row stays a Side A stripe", () => {
  const from = splitPrism('dots', [['G1', undefined, BLUE, []], ['G2', undefined, GREEN, []]]);
  from.removedCards = [{
    cardName: 'Mana Vault', deckId: from.decks[0].id, deckName: 'G', deckColor: RED, stripePosition: 5,
    previousQuantity: 1, newQuantity: 0,
    splitGroup: { id: from.splitGroups[0].id, name: 'G', sideAPosition: 5, sideAColor: RED, splitStyle: 'dots', variants: [] },
  }];
  const { remove } = comparePrisms(from, prism([]));
  assert.deepEqual(remove[0].batches, [{ copies: 1, marks: [stripe(5, RED)] }]);
});

test('carryDone ticks the named cards in To with the keys Mark sleeves reads, and never un-ticks', () => {
  const to = prism([
    deck('A', 3, RED, [card('Sol Ring'), card('Forest', 3), card('Island')]),
    deck('B', 7, BLUE, [card('Forest', 1)]),
  ], { markedCards: ['Island'] });
  const processed = processCards(to);
  const { markedCards, count } = carryDone(to, ['Sol Ring', 'Forest', 'Island']);
  const marked = new Set(markedCards);
  assert.equal(count, 2, 'Island was already Done');
  for (const name of ['Sol Ring', 'Forest', 'Island']) {
    assert.ok(isCardDone(processed.find((c) => c.name === name), marked), `${name} reads Done`);
  }
});

test('carryDone leaves cards it was not given', () => {
  const to = prism([deck('A', 3, RED, [card('Sol Ring'), card('Mana Crypt')])]);
  const { markedCards } = carryDone(to, ['Sol Ring']);
  assert.ok(!isCardDone(processCards(to).find((c) => c.name === 'Mana Crypt'), new Set(markedCards)));
});

test('markLabel keeps the mark side: Side B stripe reads Side B, dot reads Side A', async () => {
  const { markLabel } = await import('../js/modules/compare-prisms.js');
  assert.match(markLabel(stripe(30, RED, 'b')), /Side B - Slot 30/);
  assert.match(markLabel(stripe(3, RED, 'a')), /Side A - Slot 3/);
  assert.match(markLabel(stripe(3, RED, 'b', 'dot')), /Side A - Slot 3.*dot/);
});

test('rowFingerprint changes when copies or marks change, not otherwise', async () => {
  const { rowFingerprint } = await import('../js/modules/compare-prisms.js');
  const rows = (color, copies = 1) => [{ copies, marks: [stripe(3, color)] }];
  assert.equal(rowFingerprint(rows(BLUE)), rowFingerprint(rows(BLUE)));
  assert.notEqual(rowFingerprint(rows(BLUE)), rowFingerprint(rows(GREEN)));
  assert.notEqual(rowFingerprint(rows(BLUE)), rowFingerprint(rows(BLUE, 2)));
});
