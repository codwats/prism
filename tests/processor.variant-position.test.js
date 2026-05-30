import test from 'node:test';
import assert from 'node:assert/strict';
import {
	addSplitToGroup,
	createDeck,
	createSplitGroup,
	getNextVariantPosition,
	splitDeck,
} from '../js/modules/processor.js';

function fullPrism() {
	const decks = [];
	for (let pos = 1; pos <= 48; pos++) {
		decks.push(
			createDeck({
				name: `Deck ${pos}`,
				commander: 'Test Commander',
				bracket: 3,
				color: '#FF0000',
				stripePosition: pos,
				cards: [{ name: 'Sol Ring', quantity: 1, isCommander: false, isBasicLand: false }],
			})
		);
	}
	return { id: 'p1', name: 'Full', decks, splitGroups: [], markedCards: [], removedCards: [] };
}

test('getNextVariantPosition returns null when all 48 slots are occupied', () => {
	assert.equal(getNextVariantPosition(fullPrism()), null);
});

test('splitDeck throws when all 48 slots are occupied instead of assigning a bad position', () => {
	const prism = fullPrism();
	const deckId = prism.decks[0].id;
	assert.throws(() => splitDeck(prism, deckId, 2), /No available stripe positions/);
});

// All 48 slots occupied, but one slot belongs to a stripe split group with a
// child. addSplitToGroup must throw rather than assign a bad position, and must
// not mutate the prism it was handed.
function fullPrismWithGroup() {
	const decks = [];
	for (let pos = 1; pos <= 46; pos++) {
		decks.push(
			createDeck({
				name: `Deck ${pos}`,
				commander: 'Test Commander',
				bracket: 3,
				color: '#FF0000',
				stripePosition: pos,
				cards: [{ name: 'Sol Ring', quantity: 1, isCommander: false, isBasicLand: false }],
			})
		);
	}
	const group = createSplitGroup({
		name: 'Grouped',
		sideAPosition: 47,
		sideAColor: '#00FF00',
		splitStyle: 'stripes',
	});
	const child = createDeck({
		name: 'Grouped (1)',
		commander: 'Test Commander',
		bracket: 3,
		color: '#00FF00',
		stripePosition: 48,
		splitGroupId: group.id,
		cards: [{ name: 'Sol Ring', quantity: 1, isCommander: false, isBasicLand: false }],
	});
	group.childDeckIds = [child.id];
	decks.push(child);
	return { id: 'p1', name: 'Full', decks, splitGroups: [group], markedCards: [], removedCards: [] };
}

test('addSplitToGroup throws and does not mutate prism when all 48 slots are occupied', () => {
	const prism = fullPrismWithGroup();
	const groupId = prism.splitGroups[0].id;
	const before = structuredClone(prism);
	assert.throws(() => addSplitToGroup(prism, groupId), /No available stripe positions/);
	assert.deepEqual(prism, before);
});
