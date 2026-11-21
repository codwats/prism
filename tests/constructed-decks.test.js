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

// Swaps and removal paths see a card's main + sideboard rows as one card.
const { applySwap, openRemovals, removalOpenCopies } = await import('../js/modules/swap.js');
const { createSplitGroup } = await import('../js/modules/processor.js');
const { markingCards } = await import('../js/modules/parser.js');
const totals = (deck) => Object.fromEntries(markingCards(deck.cards).map((c) => [c.name, c.quantity]));

test('a Swap on a Constructed deck takes copies from main and sideboard rows together', () => {
	const prism = twoDecks();
	const { prism: next } = applySwap(prism, { outgoing: 'Duress', incoming: 'Opt', deckIds: [prism.decks[0].id], copies: 3 });
	const burn = next.decks[0];
	assert.deepEqual(totals(burn), { Duress: 1, Pyroblast: 3, Opt: 3 });
	assert.deepEqual(openRemovals(next).map((r) => [r.cardName, r.previousQuantity, r.newQuantity]), [['Duress', 4, 1]]);
});

test('a Swap in brings copies into a card with main and sideboard rows without double rows', () => {
	const prism = twoDecks();
	const { prism: next } = applySwap(prism, { outgoing: 'Duress', incoming: 'Pyroblast', deckIds: [prism.decks[1].id], copies: 1 });
	assert.deepEqual(totals(next.decks[1]), { Duress: 2, Pyroblast: 2 });
	assert.equal(next.decks[1].cards.filter((c) => c.name === 'Pyroblast').length, 1);
});

test('a stale child mark counts a variant\'s main and sideboard copies', () => {
	const prism = createPrism('T');
	const g = createSplitGroup({ id: 'G', name: 'G', sideAPosition: 1, sideAColor: '#AAAAAA', splitStyle: 'stripes' });
	prism.decks = [
		createDeck({ id: 'G1', name: 'G1', bracket: 2, color: '#000001', stripePosition: 48, splitGroupId: 'G',
			cards: [row('Sol Ring', 1), row('Sol Ring', 1, true)] }),
		createDeck({ id: 'G2', name: 'G2', bracket: 2, color: '#000002', stripePosition: 47, splitGroupId: 'G',
			cards: [row('Opt', 2)] }),
	];
	g.childDeckIds = ['G1', 'G2'];
	prism.splitGroups.push(g);
	const { prism: next } = applySwap(prism, { outgoing: 'Opt', incoming: 'Sol Ring', deckIds: ['G2'], copies: 2 });
	assert.deepEqual(openRemovals(next).filter((r) => r.cardName === 'Sol Ring')
		.map((r) => [r.deckId, r.stillInDeck, removalOpenCopies(r)]), [['G1', true, 2]]);
});
