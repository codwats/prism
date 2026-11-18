import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrism, createDeck, createSplitGroup, processCards } from '../js/modules/processor.js';
import { savedCopiesByCard, savedDollars } from '../js/modules/savings.js';

const card = (name, quantity = 1, extra = {}) => ({ name, quantity, isCommander: false, isBasicLand: false, ...extra });
const deck = (name, pos, cards, extra = {}) =>
  ({ ...createDeck({ name, bracket: 3, color: '#FF0000', stripePosition: pos, cards }), ...extra });
const saved = (prism) => savedCopiesByCard(prism, processCards(prism));

test('a card in three decks saves two copies; quantities save the gap', () => {
  const prism = createPrism('T');
  prism.decks = [
    deck('A', 1, [card('Sol Ring'), card('Relentless Rats', 5), card('Forest', 10, { isBasicLand: true })]),
    deck('B', 2, [card('Sol Ring'), card('Relentless Rats', 3), card('Forest', 10, { isBasicLand: true })]),
    deck('C', 3, [card('Sol Ring'), card('Only Here')]),
  ];
  assert.deepEqual(Object.fromEntries(saved(prism)), { 'Sol Ring': 2, 'Relentless Rats': 3 });
});

test('a split group is one deck: cards shared only by its variants save nothing', () => {
  const prism = createPrism('T');
  const group = createSplitGroup({ name: 'G', sideAPosition: 1, sideAColor: '#00FF00', splitStyle: 'stripes' });
  prism.splitGroups = [group];
  prism.decks = [
    deck('V1', 48, [card('Arcane Signet'), card('Sol Ring')], { splitGroupId: group.id }),
    deck('V2', 47, [card('Arcane Signet'), card('Sol Ring')], { splitGroupId: group.id }),
    deck('B', 2, [card('Sol Ring')]),
  ];
  assert.deepEqual(Object.fromEntries(saved(prism)), { 'Sol Ring': 1 });
});

test('dedicated commander copies are not counted as saved', () => {
  const prism = createPrism('T');
  prism.decks = [
    deck('A', 1, [card('Krark, the Thumbless', 1, { isCommander: true })]),
    deck('B', 2, [card('Krark, the Thumbless')]),
    deck('C', 3, [card('Krark, the Thumbless')]),
  ];
  assert.equal(saved(prism).get('Krark, the Thumbless'), 2);
  prism.useDedicatedCommanderCopies = true;
  assert.equal(saved(prism).get('Krark, the Thumbless'), 1); // A keeps its own; B and C share
});

test('dollars multiply copies by price and skip unpriced cards', () => {
  const prices = { 'Sol Ring': 1.5, 'Relentless Rats': null };
  assert.equal(savedDollars(new Map([['Sol Ring', 2], ['Relentless Rats', 3]]), (n) => prices[n]), 3);
});
