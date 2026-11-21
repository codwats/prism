import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDecklist, cardsToDecklistText } from '../js/modules/parser.js';
import { createPrism, createDeck, processCards, calculateRemovedCards } from '../js/modules/processor.js';

// #29: Constructed decks (no commander) keep their Sideboard.
const constructedText = [
	'4 Lightning Bolt',
	'2 Duress',
	'',
	'Sideboard',
	'2 Duress',
	'3 Pyroblast',
].join('\n');

test('parseDecklist keeps sideboard cards as isSideboard rows when keepSideboard is set', () => {
	const { cards, excludedLines } = parseDecklist(constructedText, { keepSideboard: true });
	assert.deepEqual(
		cards.map((c) => [c.name, c.quantity, !!c.isSideboard]),
		[['Lightning Bolt', 4, false], ['Duress', 2, false], ['Duress', 2, true], ['Pyroblast', 3, true]],
	);
	assert.deepEqual(excludedLines, []);
});

test('parseDecklist excludes the sideboard by default (Commander decks)', () => {
	const { cards, excludedLines } = parseDecklist(constructedText);
	assert.deepEqual(cards.map((c) => [c.name, c.quantity]), [['Lightning Bolt', 4], ['Duress', 2]]);
	assert.ok(cards.every((c) => !c.isSideboard));
	assert.deepEqual(excludedLines, ['Sideboard', '2 Duress', '3 Pyroblast']);
});

test('parseDecklist reads SB: prefixed sideboard lines', () => {
	const { cards } = parseDecklist('4 Lightning Bolt\nSB: 2 Duress', { keepSideboard: true });
	assert.deepEqual(cards.map((c) => [c.name, c.quantity, !!c.isSideboard]),
		[['Lightning Bolt', 4, false], ['Duress', 2, true]]);
});

test('a Constructed decklist round-trips through cardsToDecklistText unchanged', () => {
	const cards = parseDecklist(constructedText, { keepSideboard: true }).cards;
	const text = cardsToDecklistText(cards);
	assert.equal(text, constructedText);
	assert.deepEqual(parseDecklist(text, { keepSideboard: true }).cards, cards);
});

test('maybeboard stays excluded with keepSideboard', () => {
	const { cards } = parseDecklist('1 Opt\n\nMaybeboard\n1 Ponder', { keepSideboard: true });
	assert.deepEqual(cards.map((c) => c.name), ['Opt']);
});

const row = (name, quantity, isSideboard = false) =>
	({ name, quantity, isCommander: false, isBasicLand: false, ...(isSideboard ? { isSideboard } : {}) });

function twoDecks() {
	const prism = createPrism('Constructed');
	prism.decks.push(
		createDeck({ name: 'Burn', bracket: 2, color: '#FF0000', stripePosition: 1,
			cards: [row('Duress', 2), row('Duress', 2, true), row('Pyroblast', 3, true)] }),
		createDeck({ name: 'Rogues', bracket: 2, color: '#0000FF', stripePosition: 2,
			cards: [row('Duress', 3), row('Pyroblast', 1)] }),
	);
	return prism;
}

test('processCards sums main and sideboard copies of one card into one marking row', () => {
	const prism = twoDecks();
	const [burn, rogues] = prism.decks;
	const duress = processCards(prism).find((c) => c.name === 'Duress');
	assert.equal(duress.totalQuantity, 4); // Burn runs 2 + 2, Rogues 3
	assert.deepEqual(duress.stripes.map((s) => s.deckName), ['Burn', 'Rogues']);
	assert.deepEqual(
		duress.batches.map((b) => [b.copyCount, b.participantIds.join(), b.isPool]),
		[[3, [burn.id, rogues.id].sort().join(), true], [1, burn.id, false]],
	);
});

test('a sideboard card shares like any other card', () => {
	const pyro = processCards(twoDecks()).find((c) => c.name === 'Pyroblast');
	assert.equal(pyro.totalQuantity, 3);
	assert.equal(pyro.logicalDeckCount, 2);
});

test('moving copies between main and sideboard removes nothing', () => {
	const before = [row('Duress', 2), row('Duress', 2, true)];
	assert.deepEqual(calculateRemovedCards(before, [row('Duress', 1), row('Duress', 3, true)]), []);
	assert.deepEqual(
		calculateRemovedCards(before, [row('Duress', 3)]).map((c) => [c.name, c.previousQuantity, c.newQuantity]),
		[['Duress', 4, 3]],
	);
});

test('a 300-card decklist saves and processes', () => {
	const text = Array.from({ length: 300 }, (_, i) => `1 Card ${i}`).join('\n');
	const prism = createPrism('Big');
	prism.decks.push(createDeck({ name: 'Whtz', bracket: 2, color: '#FF0000', stripePosition: 1,
		cards: parseDecklist(text, { keepSideboard: true }).cards }));
	assert.equal(processCards(prism).length, 300);
});
