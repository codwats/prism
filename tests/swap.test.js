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
const { applySwap, canSleeveSwap, clearReturnedRemovals, keepSeparateSleeves, unmarkCardsWithNewStripes, stripeCountMap, trackRemovedCard } = await import('../js/modules/swap.js');

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
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism), sleeve: true, now: NOW,
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
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism), sleeve: true, now: NOW,
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

test('Incoming card already in the PRISM, plain Swap: "add a mark"', () => {
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
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism), sleeve: true, now: NOW,
	}).prism;
	const back = applySwap(there, {
		outgoing: 'Skyshroud Claim', incoming: 'Cultivate', deckIds: ids(prism), sleeve: true, now: NOW,
	});
	assert.equal(back.summary.sleeveSwap, true);
	assert.ok(isCardDone(find(back.prism, 'Cultivate'), new Set(back.prism.markedCards)));
});

// #307: a card swapped out and straight back, stale mark not yet cleared.
test('Plain Swap back while the stale mark is still on the sleeve keeps the card done', () => {
	const prism = threeDecks();
	const a = prism.decks[0].id;
	prism.markedCards = ['Cultivate'];
	const there = applySwap(prism, { outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [a], now: NOW }).prism;
	assert.equal(there.removedCards.length, 1, 'Cultivate/A is a stale mark');

	const back = applySwap(there, { outgoing: 'Skyshroud Claim', incoming: 'Cultivate', deckIds: [a], now: NOW });
	assert.deepEqual(back.summary.unmarkedKeys, [], 'Cultivate is not un-marked');
	assert.ok(isCardDone(find(back.prism, 'Cultivate'), new Set(back.prism.markedCards)));
	assert.equal(back.summary.marksToAdd, 0, 'the A mark is still painted');
	assert.equal(back.summary.copiesToBuy, 0);
	assert.deepEqual(back.prism.removedCards.map((r) => r.cardName), ['Skyshroud Claim'], 'Cultivate/A clears; Claim/A is the new stale mark');
});

test('A card that comes back after its stale mark was cleared is un-marked', () => {
	const prism = threeDecks();
	const a = prism.decks[0].id;
	prism.markedCards = ['Cultivate'];
	const there = applySwap(prism, { outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [a], now: NOW }).prism;
	there.removedCards = []; // the user cleared the sleeve

	const back = applySwap(there, { outgoing: 'Skyshroud Claim', incoming: 'Cultivate', deckIds: [a], now: NOW });
	assert.deepEqual(back.summary.unmarkedKeys, ['Cultivate']);
	assert.equal(back.summary.marksToAdd, 1);
});

test('A stale mark at a slot the deck has since left does not count as painted', () => {
	const prism = threeDecks();
	const a = prism.decks[0].id;
	prism.markedCards = ['Cultivate'];
	const there = applySwap(prism, { outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [a], now: NOW }).prism;
	there.decks[0].stripePosition = 9; // deck A moved slots

	const back = applySwap(there, { outgoing: 'Skyshroud Claim', incoming: 'Cultivate', deckIds: [a], now: NOW });
	assert.deepEqual(back.summary.unmarkedKeys, ['Cultivate']);
	assert.equal(back.prism.removedCards.filter((r) => r.cardName === 'Cultivate').length, 1, 'the old-slot row stays');
});

test('Deck edit: re-adding a card with its stale mark still painted keeps it done', () => {
	const prism = threeDecks();
	const a = prism.decks[0];
	prism.markedCards = ['Cultivate'];
	// Edit 1: Cultivate leaves A.
	a.cards = a.cards.filter((c) => c.name !== 'Cultivate');
	trackRemovedCard(prism, {
		cardName: 'Cultivate', deckId: a.id, deckName: 'A', deckColor: a.color,
		stripePosition: 1, removedAt: NOW, previousQuantity: 1, newQuantity: 0,
	});
	// Edit 2: Cultivate comes back, the way handleEditConfirm runs it.
	const beforeCounts = stripeCountMap(prism);
	a.cards.push(card('Cultivate'));
	const stillPainted = clearReturnedRemovals(prism, a);
	assert.equal(stillPainted.length, 1);
	assert.deepEqual(unmarkCardsWithNewStripes(prism, beforeCounts, stillPainted), []);
	assert.deepEqual(prism.markedCards, ['Cultivate']);
	assert.equal(prism.removedCards.length, 0);
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
		outgoing: 'Rat Colony', incoming: 'Relentless Rats', deckIds: shared.participantIds, sleeve: true, now: NOW,
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
			outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [v1.id, v2.id], sleeve: true, now: NOW,
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

// #309: a Sleeve swap into a card the PRISM already has gives it a Separate sleeve.
function claimElsewhere() {
	const prism = threeDecks();
	prism.decks.push(deck('D', 4, [card('Skyshroud Claim')]), deck('E', 5, [card('Skyshroud Claim')]));
	return prism;
}

test('Separate sleeve: no new marks, one copy, existing sleeve untouched and still done', () => {
	const prism = claimElsewhere();
	prism.markedCards = ['Cultivate', 'Skyshroud Claim'];
	const cultivateDecks = ids(prism).slice(0, 3);
	const existing = find(prism, 'Skyshroud Claim').batches[0];

	const { prism: next, summary } = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: cultivateDecks, sleeve: true, now: NOW,
	});
	assert.equal(summary.sleeveSwap, true);
	assert.equal(summary.marksToAdd, 0);
	assert.equal(summary.staleMarks, 0);
	assert.equal(summary.copiesToBuy, 1);
	assert.deepEqual(summary.unmarkedKeys, []);
	assert.deepEqual(next.removedCards, []);

	const claim = find(next, 'Skyshroud Claim');
	assert.equal(claim.totalQuantity, 2, 'two physical sleeves');
	const kept = claim.batches.find((b) => !b.isSeparateSleeve);
	assert.deepEqual(kept.participantIds, existing.participantIds);
	assert.deepEqual(kept.stripes, existing.stripes, 'existing sleeve gets no new marks');
	const separate = claim.batches.find((b) => b.isSeparateSleeve);
	assert.deepEqual(separate.participantIds, [...cultivateDecks].sort());
	assert.equal(separate.copyCount, 1);
	assert.ok(isCardDone(claim, new Set(next.markedCards)), 'both sleeves done');

	const tags = next.decks.flatMap((d) => d.cards).filter((c) => c.name === 'Skyshroud Claim').map((c) => c.sleeve);
	assert.equal(new Set(tags.filter(Boolean)).size, 1, 'the three new rows share one id');
	assert.equal(tags.filter(Boolean).length, 3, 'existing rows stay untagged');
});

test('Separate sleeve: preview equals apply for both options', () => {
	const prism = claimElsewhere();
	const [a] = prism.decks;
	const options = [
		{ deckIds: ids(prism).slice(0, 3), sleeve: true },
		{ deckIds: [a.id], sleeve: false },
	];
	for (const o of options) {
		const run = () => applySwap(prism, { outgoing: 'Cultivate', incoming: 'Skyshroud Claim', now: NOW, ...o });
		const preview = run();
		const applied = run();
		const { carriedKey, ...previewSummary } = preview.summary;
		assert.deepEqual({ ...applied.summary, carriedKey }, { ...previewSummary, carriedKey });
		assert.deepEqual(
			processCards(applied.prism).map((c) => [c.name, c.totalQuantity, c.stripes.length]),
			processCards(preview.prism).map((c) => [c.name, c.totalQuantity, c.stripes.length]),
		);
	}
});

test('Separate sleeve: an unmarked existing sleeve stays unmarked, nothing carried', () => {
	const prism = claimElsewhere();
	const { prism: next, summary } = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: ids(prism).slice(0, 3), sleeve: true, now: NOW,
	});
	assert.equal(summary.carriedKey, null);
	assert.deepEqual(next.markedCards, []);
});

test('Two Sleeve swaps into the same card stay two Separate sleeves', () => {
	const prism = createPrism('T');
	prism.decks = [
		deck('A', 1, [card('Cultivate')]),
		deck('B', 2, [card('Rampant Growth')]),
		deck('D', 4, [card('Skyshroud Claim')]),
	];
	const [a, b] = prism.decks;
	const one = applySwap(prism, { outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [a.id], sleeve: true, now: NOW }).prism;
	const two = applySwap(one, { outgoing: 'Rampant Growth', incoming: 'Skyshroud Claim', deckIds: [b.id], sleeve: true, now: NOW }).prism;
	const claim = find(two, 'Skyshroud Claim');
	assert.equal(claim.totalQuantity, 3);
	assert.equal(claim.batches.filter((x) => x.isSeparateSleeve).length, 2);
});

test('sleeve: true throws when the decks are not one whole batch or already run the card', () => {
	const prism = claimElsewhere();
	assert.throws(
		() => applySwap(prism, { outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [prism.decks[0].id], sleeve: true }),
		/No Sleeve swap/,
	);
	prism.decks[0].cards.push(card('Skyshroud Claim'));
	const [batch] = find(prism, 'Cultivate').batches;
	assert.equal(canSleeveSwap(prism, batch, { outgoing: 'Cultivate', incoming: 'Skyshroud Claim' }), false);
});

test('keepSeparateSleeves carries the id by name onto rebuilt rows', () => {
	const old = [{ ...card('Beast Within'), sleeve: 's1' }, card('Cultivate')];
	const rebuilt = [card('beast within', 2), card('Cultivate'), card('Harrow')];
	keepSeparateSleeves(old, rebuilt);
	assert.deepEqual(rebuilt.map((c) => c.sleeve), ['s1', undefined, undefined]);
});

test('A second Sleeve swap keeps an existing Separate sleeve done', () => {
	const prism = createPrism('T');
	prism.decks = [
		deck('A', 1, [card('Cultivate')]),
		deck('B', 2, [card('Rampant Growth')]),
		deck('D', 4, [{ ...card('Skyshroud Claim'), sleeve: 's1' }]),
	];
	prism.markedCards = ['Skyshroud Claim'];
	const [a] = prism.decks;
	const { prism: next } = applySwap(prism, {
		outgoing: 'Cultivate', incoming: 'Skyshroud Claim', deckIds: [a.id], sleeve: true, now: NOW,
	});
	const claim = find(next, 'Skyshroud Claim');
	const old = claim.batches.find((b) => b.participantIds.includes(prism.decks[2].id));
	assert.ok(next.markedCards.includes(old.key), 'the existing sleeve stays done under its batch key');
});
