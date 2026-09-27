import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { createPrism, createDeck, createSplitGroup, processCards } = await import('../js/modules/processor.js');
const { isCardDone } = await import('../js/core/utils.js');
const { applySwap, canSleeveSwap } = await import('../js/modules/swap.js');

const NOW = '2026-09-27T12:00:00.000Z';

function card(name, quantity = 1, isCommander = false) {
	return { name, quantity, isCommander, isBasicLand: false };
}

function deck(name, pos, cards, color = `#0000${String(pos).padStart(2, '0')}`) {
	return createDeck({ name, bracket: 3, color, stripePosition: pos, cards });
}

// Three decks sharing Cultivate in one single-copy batch, plus a filler card each.
function threeDecks() {
	const prism = createPrism('T');
	prism.decks = [
		deck('A', 1, [card('Cultivate'), card('Ayula')]),
		deck('B', 2, [card('Cultivate'), card('Bear')]),
		deck('C', 3, [card('Cultivate'), card('Cat')]),
	];
	return prism;
}

const ids = (prism) => prism.decks.map((d) => d.id);
const find = (prism, name) => processCards(prism).find((c) => c.name === name);

test('Sleeve swap: whole batch, no new marks, no stale rows, done state carries', () => {
	const prism = threeDecks();
	prism.markedCards = ['Cultivate'];
	const { prism: next, summary } = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism), now: NOW,
	});

	assert.equal(summary.sleeveSwap, true);
	assert.equal(summary.marksToAdd, 0);
	assert.equal(summary.staleMarks, 0);
	assert.equal(summary.copiesToBuy, 1);
	assert.deepEqual(next.removedCards, []);
	assert.equal(summary.carriedKey, 'Skyshroud Claim');
	assert.ok(isCardDone(find(next, 'Skyshroud Claim'), new Set(next.markedCards)));
	assert.ok(next.markedCards.includes('Cultivate'), 'outgoing key is never pruned');
	assert.equal(next.markedCardsUpdatedAt, NOW);
	assert.ok(next.decks.every((d) => d.cardsUpdatedAt === NOW && d.updatedAt === NOW));
	assert.equal(next.updatedAt, NOW);
	assert.deepEqual(prism.markedCards, ['Cultivate'], 'input PRISM is untouched');
});

test('Sleeve swap of an unmarked batch carries nothing', () => {
	const prism = threeDecks();
	const { summary } = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism), now: NOW,
	});
	assert.equal(summary.sleeveSwap, true);
	assert.equal(summary.carriedKey, null);
});

test('Plain Swap in one deck: 1 mark to add, 1 stale mark, a removed-card row', () => {
	const prism = threeDecks();
	const [a] = prism.decks;
	const { prism: next, summary } = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [a.id], now: NOW,
	});

	assert.equal(summary.sleeveSwap, false);
	assert.equal(summary.marksToAdd, 1);
	assert.equal(summary.staleMarks, 1);
	assert.equal(summary.copiesToBuy, 1);
	assert.equal(summary.carriedKey, null);
	assert.equal(next.removedCards.length, 1);
	assert.deepEqual(
		{ ...next.removedCards[0], removedAt: undefined },
		{
			cardName: 'Cultivate', deckId: a.id, deckName: 'A', deckColor: a.color,
			stripePosition: 1, removedAt: undefined, previousQuantity: 1, newQuantity: 0,
		},
	);
	assert.equal(next.decks[1].cardsUpdatedAt, prism.decks[1].cardsUpdatedAt, 'untouched deck keeps its timestamp');
});

test('Incoming card already in the PRISM is "add a mark", never a Sleeve swap', () => {
	const prism = threeDecks();
	prism.decks.push(deck('D', 4, [card('Skyshroud Claim')]));
	prism.markedCards = ['Skyshroud Claim'];
	const { prism: next, summary } = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism).slice(0, 3), now: NOW,
	});

	assert.equal(summary.sleeveSwap, false);
	assert.equal(summary.copiesToBuy, 0);
	assert.equal(summary.marksToAdd, 3);
	assert.equal(summary.staleMarks, 3);
	assert.deepEqual(summary.unmarkedKeys, ['Skyshroud Claim'], 'existing sleeve gains marks → undone');
	assert.ok(!next.markedCards.includes('Skyshroud Claim'));
	assert.equal(next.removedCards.length, 3);
});

test('A batch holding a deck\'s commander has no Sleeve swap', () => {
	const prism = createPrism('T');
	prism.decks = [
		deck('A', 1, [card('Meren of Clan Nel Toth', 1, true)]),
		deck('B', 2, [card('Meren of Clan Nel Toth'), card('Bear')]),
	];
	const [batch] = find(prism, 'Meren of Clan Nel Toth').batches;
	assert.equal(batch.participantIds.length, 2, 'dedication off → one shared batch');
	assert.equal(canSleeveSwap(prism, batch, { outgoing: 'Meren of Clan Nel Toth', incoming: 'Other' }), false);

	assert.throws(
		() => applySwap(prism, { outgoing: 'Meren of Clan Nel Toth', incoming: 'Other', deckIds: ids(prism) }),
		/commander/,
	);
	const { summary } = applySwap(prism, {
		outgoing: 'Meren of Clan Nel Toth', incoming: 'Other', deckIds: [prism.decks[1].id], now: NOW,
	});
	assert.equal(summary.sleeveSwap, false);
});

test('Swapping back resurrects the marks', () => {
	const prism = threeDecks();
	prism.markedCards = ['Cultivate'];
	const there = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism), now: NOW,
	}).prism;
	const back = applySwap(there, {
		outgoing: 'Skyshroud Claim', incoming: 'Cultivate', deckIds: ids(prism), now: NOW,
	});
	assert.equal(back.summary.sleeveSwap, true);
	assert.ok(isCardDone(find(back.prism, 'Cultivate'), new Set(back.prism.markedCards)));
});

test('Multi-batch outgoing: the Sleeve swap follows the batch, not the name', () => {
	const prism = createPrism('T');
	prism.decks = [
		deck('A', 1, [card('Rat Colony', 1)]),
		deck('B', 2, [card('Rat Colony', 1)]),
		deck('C', 3, [card('Rat Colony', 2)]),
	];
	const rats = find(prism, 'Rat Colony');
	const shared = rats.batches.find((b) => b.participantIds.length === 3);
	prism.markedCards = [shared.key];

	const { prism: next, summary } = applySwap(prism, {
		outgoing: 'Rat Colony', incoming: 'Relentless Rats', deckIds: shared.participantIds, now: NOW,
	});
	assert.equal(summary.sleeveSwap, true);
	assert.equal(summary.marksToAdd, 0);
	assert.equal(summary.staleMarks, 0);
	assert.equal(summary.carriedKey, 'Relentless Rats');
	assert.equal(find(next, 'Rat Colony').totalQuantity, 1, 'C keeps its second copy');
});

for (const splitStyle of ['stripes', 'dots']) {
	test(`Split group (${splitStyle}): Sleeve swap across both variants gives identical marks`, () => {
		const prism = createPrism('T');
		const v1 = deck('V1', 25, [card('Cultivate'), card('X1')], '#110000');
		const v2 = deck('V2', 26, [card('Cultivate'), card('X2')], '#220000');
		const group = createSplitGroup({
			name: 'G', sideAPosition: 1, sideAColor: '#000000', splitStyle,
		});
		group.childDeckIds = [v1.id, v2.id];
		v1.splitGroupId = group.id;
		v2.splitGroupId = group.id;
		if (splitStyle === 'dots') v1.stripePosition = v2.stripePosition = null;
		prism.decks = [v1, v2];
		prism.splitGroups = [group];

		const { summary } = applySwap(prism, {
			outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [v1.id, v2.id], now: NOW,
		});
		assert.equal(summary.sleeveSwap, true);
		assert.equal(summary.marksToAdd, 0);
		assert.equal(summary.staleMarks, 0);

		// One variant only: Cultivate leaves "all variants" and gains V2's own mark.
		const one = applySwap(prism, {
			outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [v1.id], now: NOW,
		});
		assert.equal(one.summary.sleeveSwap, false);
		assert.ok(one.summary.marksToAdd >= 1);
		assert.equal(one.prism.removedCards[0].stripePosition, splitStyle === 'dots' ? 1 : 25);
	});
}
