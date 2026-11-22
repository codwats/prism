// Token pack (#412): Token types derived from each card's Scryfall token
// parts, marked by the card rules, with pairing, hiding and hand-added tokens.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { createPrism, createDeck, splitDeck, processCards } = await import('../js/modules/processor.js');
const { tokenRows, pairTokens, unpairToken, setTokenHidden, setAddedToken } = await import('../js/modules/tokens.js');
const { isCardDone } = await import('../js/core/utils.js');

const card = (name, quantity = 1) => ({ name, quantity, isCommander: false, isBasicLand: false });
const deck = (name, pos, color, cards) => createDeck({ name, bracket: 3, color, stripePosition: pos, cards });

const TREASURE = { oracleId: 'o-treasure', name: 'Treasure', detail: 'colorless' };
const DINOSAUR = { oracleId: 'o-dino', name: 'Dinosaur', detail: '3/3 green' };
const SOLDIER_W = { oracleId: 'o-soldier-w', name: 'Soldier', detail: '1/1 white' };
const SOLDIER_RW = { oracleId: 'o-soldier-rw', name: 'Soldier', detail: '1/1 red white' };
const PARTS = {
	'Smothering Tithe': [TREASURE],
	'Gishath, Sun\'s Avatar': [DINOSAUR],
	'Raise the Alarm': [SOLDIER_W],
	'Assemble the Legion': [SOLDIER_RW],
	'Sol Ring': [],
};
const tokensOf = (name) => PARTS[name];

const marks = (row) => row.stripes.filter((s) => s.markType !== 'membership').map((s) => `${s.deckName}:${s.side}${s.markType ? `:${s.markType}` : ''}`);

function twoDecks(alphaCards, betaCards) {
	const prism = createPrism('T');
	prism.decks = [deck('Alpha', 1, '#FF0000', alphaCards), deck('Beta', 2, '#00FF00', betaCards)];
	return prism;
}

test('Smothering Tithe in two decks lists one Treasure marked for both', () => {
	const prism = twoDecks([card('Smothering Tithe'), card('Sol Ring')], [card('Smothering Tithe')]);
	const rows = tokenRows(prism, tokensOf);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].name, 'Treasure');
	assert.deepEqual(marks(rows[0]), ['Alpha:a', 'Beta:a']);
	assert.equal(rows[0].batches.length, 1, 'no quantity tiers');
	assert.equal(rows[0].totalQuantity, 1);
});

test('a Token type is its oracle identity: two Soldiers are two rows, one per identity', () => {
	const prism = twoDecks([card('Raise the Alarm')], [card('Assemble the Legion'), card('Raise the Alarm')]);
	const rows = tokenRows(prism, tokensOf).sort((a, b) => a.detail.localeCompare(b.detail));
	assert.deepEqual(rows.map((r) => [r.name, r.detail, marks(r)]), [
		['Soldier', '1/1 red white', ['Beta:a']],
		['Soldier', '1/1 white', ['Alpha:a', 'Beta:a']],
	]);
});

test('two printings of one Token type make one row', () => {
	const reprint = { ...TREASURE, name: 'Treasure' };
	const prism = twoDecks([card('Smothering Tithe')], [card('Dockside Extortionist')]);
	const rows = tokenRows(prism, (n) => (n === 'Dockside Extortionist' ? [reprint] : tokensOf(n)));
	assert.deepEqual(rows.map((r) => [r.name, marks(r)]), [['Treasure', ['Alpha:a', 'Beta:a']]]);
});

test('a token every variant of a split group needs shows only the parent Side A stripe', () => {
	let prism = twoDecks([card('Smothering Tithe')], []);
	prism = splitDeck(prism, prism.decks[0].id, 2);
	const [row] = tokenRows(prism, tokensOf);
	assert.deepEqual(marks(row), ['Alpha:a']);
});

test('a token some variants need gets their child mark, stripes or dot, as a card would', () => {
	for (const [style, childMark] of [['stripes', 'b:stripe'], ['dots', 'b:dot']]) {
		let prism = twoDecks([card('Smothering Tithe')], []);
		prism = splitDeck(prism, prism.decks[0].id, 2, style);
		const [firstId, secondId] = prism.splitGroups[0].childDeckIds;
		prism.decks.find((d) => d.id === secondId).cards = [card('Sol Ring')];
		const first = prism.decks.find((d) => d.id === firstId);
		const [row] = tokenRows(prism, tokensOf);
		assert.deepEqual(marks(row), ['Alpha:a', `${first.name}:${childMark}`], style);
	}
});

test('a paired Dinosaur and Treasure are one row with the union of their decks; unpairing gives two rows', () => {
	const prism = twoDecks([card('Smothering Tithe')], [card('Gishath, Sun\'s Avatar')]);
	const paired = pairTokens(prism, 'o-treasure', 'o-dino');
	const rows = tokenRows(paired, tokensOf);
	assert.deepEqual(rows.map((r) => [r.name, marks(r)]), [['Dinosaur // Treasure', ['Alpha:a', 'Beta:a']]]);

	const unpaired = tokenRows(unpairToken(paired, 'o-dino'), tokensOf);
	assert.deepEqual(unpaired.map((r) => [r.name, marks(r)]).sort(), [['Dinosaur', ['Beta:a']], ['Treasure', ['Alpha:a']]]);
});

test('a pairing stands only while both sides point at each other', () => {
	const prism = twoDecks([card('Smothering Tithe'), card('Raise the Alarm')], [card('Gishath, Sun\'s Avatar')]);
	// Another device paired Treasure with the Soldier after this one paired it with the Dinosaur.
	const both = pairTokens(pairTokens(prism, 'o-treasure', 'o-dino'), 'o-treasure', 'o-soldier-w');
	assert.deepEqual(tokenRows(both, tokensOf).map((r) => r.name).sort(), ['Dinosaur', 'Soldier // Treasure']);
});

test('a hidden token leaves the list and its marks; unhiding brings it back', () => {
	const prism = twoDecks([card('Smothering Tithe'), card('Raise the Alarm')], []);
	const hidden = setTokenHidden(prism, 'o-treasure', true);
	assert.deepEqual(tokenRows(hidden, tokensOf).map((r) => r.name), ['Soldier']);
	assert.deepEqual(tokenRows(setTokenHidden(hidden, 'o-treasure', false), tokensOf).map((r) => r.name).sort(), ['Soldier', 'Treasure']);
});

test('a hand-added token gets the chosen decks\' marks and keeps them through decklist edits', () => {
	const prism = twoDecks([card('Sol Ring')], [card('Sol Ring')]);
	const clone = { oracleId: 'o-clone', name: 'Copy', detail: '' };
	let added = setAddedToken(prism, clone, [prism.decks[1].id]);
	assert.deepEqual(tokenRows(added, tokensOf).map((r) => [r.name, marks(r)]), [['Copy', ['Beta:a']]]);

	added = { ...added, decks: added.decks.map((d) => ({ ...d, cards: [card('Smothering Tithe')] })) };
	const rows = tokenRows(added, tokensOf);
	assert.deepEqual(rows.map((r) => [r.name, marks(r)]).sort(), [['Copy', ['Beta:a']], ['Treasure', ['Alpha:a', 'Beta:a']]]);

	assert.deepEqual(tokenRows(setAddedToken(added, clone, []), tokensOf).map((r) => r.name), ['Treasure'], 'no decks removes it');
});

test('a token Done, then needed by another deck, reads undone with the new marks', () => {
	const prism = twoDecks([card('Smothering Tithe')], [card('Sol Ring')]);
	const [before] = tokenRows(prism, tokensOf);
	assert.match(before.doneKey, /^token:/);
	const marked = new Set([before.doneKey]);
	assert.equal(isCardDone(before, marked), true);

	prism.decks[1].cards.push(card('Smothering Tithe'));
	const [after] = tokenRows(prism, tokensOf);
	assert.deepEqual(marks(after), ['Alpha:a', 'Beta:a']);
	assert.equal(isCardDone(after, marked), false);
});

// Total, Pool, Core, deck Pool/Core and the savings counters all read processCards.
test('tokens stay out of the card counts: processCards never sees them', () => {
	const prism = twoDecks([card('Smothering Tithe')], [card('Smothering Tithe')]);
	const withTokens = setAddedToken(prism, { oracleId: 'o-clone', name: 'Copy' }, [prism.decks[0].id]);
	assert.deepEqual(processCards(withTokens), processCards(prism));
});

test('pairing re-keys both sides, so a Done token reads undone once paired', () => {
	const prism = twoDecks([card('Smothering Tithe'), card('Gishath, Sun\'s Avatar')], []);
	const marked = new Set(tokenRows(prism, tokensOf).map((r) => r.doneKey));
	const [pair] = tokenRows(pairTokens(prism, 'o-dino', 'o-treasure'), tokensOf);
	assert.equal(isCardDone(pair, marked), false);
	assert.equal(pair.doneKey, tokenRows(pairTokens(prism, 'o-treasure', 'o-dino'), tokensOf)[0].doneKey, 'side order does not matter');
});
