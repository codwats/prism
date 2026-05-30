import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, getNextVariantPosition, splitDeck } from '../js/modules/processor.js';

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
