import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { createPrism, createDeck, createSplitGroup, processCards, calculateRemovedCards } =
	await import('../js/modules/processor.js');
const { isCardDone, passKeysForCard } = await import('../js/core/utils.js');
const { mergeRemovedCards } = await import('../js/modules/storage.js');
const { getDeckPoolCoreCounts } = await import('../js/features/deck-list.js');

function card(name, quantity = 1, isBasicLand = false) {
	return { name, quantity, isCommander: false, isBasicLand };
}

function standalone(name, pos, cards) {
	return createDeck({ name, bracket: 3, color: '#FF0000', stripePosition: pos, cards });
}

function visible(stripes) {
	return stripes.filter((s) => s.markType !== 'membership');
}

// --- #146 worked examples -------------------------------------------------

test('Rat Colony K5/E3 → 3 copies with 2 marks (pool), then 2 with 1 (core)', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('K', 1, [card('Rat Colony', 5)]),
		standalone('E', 2, [card('Rat Colony', 3)]),
	];
	const [rats] = processCards(prism);
	assert.equal(rats.batches.length, 2);
	const [b1, b2] = rats.batches;
	assert.equal(b1.copyCount, 3);
	assert.equal(visible(b1.stripes).length, 2);
	assert.equal(b1.isPool, true);
	assert.equal(b2.copyCount, 2);
	assert.equal(visible(b2.stripes).length, 1);
	assert.equal(b2.isPool, false);
	assert.equal(b1.copyCount + b2.copyCount, rats.totalQuantity);
});

test('Forest A8/K3/E3 → 3 copies/3 marks then 5 copies/1 mark', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('A', 1, [card('Forest', 8, true)]),
		standalone('K', 2, [card('Forest', 3, true)]),
		standalone('E', 3, [card('Forest', 3, true)]),
	];
	const [forest] = processCards(prism);
	assert.deepEqual(
		forest.batches.map((b) => [b.copyCount, visible(b.stripes).length]),
		[[3, 3], [5, 1]]
	);
});

function splitPlusStandalonePrism() {
	// Split group (stripes style) at Side A slot 1: variants B (qty 5, slot 48)
	// and U (qty 2, slot 47); standalone E (qty 3, slot 2). #146 combined example.
	const prism = createPrism('T');
	const group = createSplitGroup({ name: 'G', sideAPosition: 1, sideAColor: '#00FF00', splitStyle: 'stripes' });
	const b = createDeck({ name: 'B', bracket: 3, color: '#0000FF', stripePosition: 48, splitGroupId: group.id, cards: [card('Island', 5, true)] });
	const u = createDeck({ name: 'U', bracket: 3, color: '#00FFFF', stripePosition: 47, splitGroupId: group.id, cards: [card('Island', 2, true)] });
	const e = standalone('E', 2, [card('Island', 3, true)]);
	group.childDeckIds = [b.id, u.id];
	prism.decks = [b, u, e];
	prism.splitGroups = [group];
	return { prism, group, b, u, e };
}

test('split Island B5/U2 + standalone E3 → the #146 combined example', () => {
	const { prism, b } = splitPlusStandalonePrism();
	const [island] = processCards(prism);

	assert.equal(island.batches.length, 3);
	const [t2, t3, t5] = island.batches;

	// 2 copies: group parent + E — pool
	assert.equal(t2.copyCount, 2);
	assert.deepEqual(visible(t2.stripes).map((s) => s.deckName).sort(), ['E', 'G']);
	assert.equal(t2.isPool, true);

	// 1 copy: parent + B child indicator + E — pool. The child indicator exists
	// here even though processCards' whole-group view emits none (#149 finding).
	assert.equal(t3.copyCount, 1);
	assert.deepEqual(visible(t3.stripes).map((s) => s.deckName).sort(), ['B', 'E', 'G']);
	assert.ok(visible(t3.stripes).some((s) => s.deckId === b.id && s.side === 'b'));
	assert.equal(t3.isPool, true);

	// 2 copies: parent + B child indicator — core (group alone = 1 logical deck)
	assert.equal(t5.copyCount, 2);
	assert.deepEqual(visible(t5.stripes).map((s) => s.deckName).sort(), ['B', 'G']);
	assert.equal(t5.isPool, false);

	assert.equal(island.totalQuantity, 5);
	// pool 3, core 2
	assert.equal(island.batches.reduce((s, x) => s + (x.isPool ? x.copyCount : 0), 0), 3);
	assert.equal(island.batches.reduce((s, x) => s + (x.isPool ? 0 : x.copyCount), 0), 2);
});

test('three-variant group A5/B3/C0 never yields a parent-only batch', () => {
	const prism = createPrism('T');
	const group = createSplitGroup({ name: 'G', sideAPosition: 1, sideAColor: '#00FF00', splitStyle: 'stripes' });
	const a = createDeck({ name: 'A', bracket: 3, color: '#111111', stripePosition: 48, splitGroupId: group.id, cards: [card('Sol Ring', 5)] });
	const b = createDeck({ name: 'B', bracket: 3, color: '#222222', stripePosition: 47, splitGroupId: group.id, cards: [card('Sol Ring', 3)] });
	const c = createDeck({ name: 'C', bracket: 3, color: '#333333', stripePosition: 46, splitGroupId: group.id, cards: [card('Filler')] });
	group.childDeckIds = [a.id, b.id, c.id];
	prism.decks = [a, b, c];
	prism.splitGroups = [group];

	const solRing = processCards(prism).find((x) => x.name === 'Sol Ring');
	assert.deepEqual(
		solRing.batches.map((x) => [x.copyCount, visible(x.stripes).map((s) => s.deckName).sort()]),
		[[3, ['A', 'B', 'G']], [2, ['A', 'G']]]
	);
});

test('batch keys: name|#b|sorted ids|count; singleton = one batch, Σ = totalQuantity', () => {
	const prism = createPrism('T');
	const d1 = standalone('D1', 1, [card('Sol Ring'), card('Rat Colony', 4)]);
	const d2 = standalone('D2', 2, [card('Sol Ring'), card('Rat Colony', 2)]);
	prism.decks = [d1, d2];
	const cards = processCards(prism);

	const sol = cards.find((c) => c.name === 'Sol Ring');
	assert.equal(sol.batches.length, 1);
	assert.equal(sol.batches[0].key, `Sol Ring|#b|${[d1.id, d2.id].sort().join(',')}|1`);

	const rats = cards.find((c) => c.name === 'Rat Colony');
	const sortedIds = [d1.id, d2.id].sort();
	assert.equal(rats.batches[0].key, `Rat Colony|#b|${sortedIds.join(',')}|2`);
	assert.equal(rats.batches[1].key, `Rat Colony|#b|${d1.id}|2`);
	assert.equal(rats.batches.reduce((s, b) => s + b.copyCount, 0), rats.totalQuantity);
});

// --- #151 Done identity -----------------------------------------------------

test('isCardDone: batch keys, legacy plain key, pass keys, fail-safe crossing', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('A', 1, [card('Forest', 8, true), card('Sol Ring')]),
		standalone('K', 2, [card('Forest', 3, true), card('Sol Ring')]),
	];
	const cards = processCards(prism);
	const forest = cards.find((c) => c.name === 'Forest');
	const sol = cards.find((c) => c.name === 'Sol Ring');

	// single-batch: plain key
	assert.equal(isCardDone(sol, new Set(['Sol Ring'])), true);

	// multi-batch: legacy plain key deliberately NOT honored
	assert.equal(isCardDone(forest, new Set(['Forest'])), false);

	// multi-batch: every batch key marked
	assert.equal(isCardDone(forest, new Set(forest.batches.map((b) => b.key))), true);
	assert.equal(isCardDone(forest, new Set([forest.batches[0].key])), false);

	// pass keys (legacy per-deck basic marks) still count
	assert.deepEqual(passKeysForCard(forest).sort(), ['Forest|A', 'Forest|K']);
	assert.equal(isCardDone(forest, new Set(['Forest|A', 'Forest|K'])), true);
	assert.equal(isCardDone(forest, new Set(['Forest|A'])), false);

	// non-repeated card has no pass keys
	assert.deepEqual(passKeysForCard(sol), []);
});

// --- #151 removals -----------------------------------------------------------

test('calculateRemovedCards reports quantity decreases and full removals', () => {
	const oldCards = [card('Rat Colony', 5), card('Sol Ring'), card('Island', 4, true)];
	const newCards = [card('Rat Colony', 3), card('Island', 4, true)];

	const removed = calculateRemovedCards(oldCards, newCards);
	assert.deepEqual(
		removed.map((r) => [r.name, r.previousQuantity, r.newQuantity]),
		[['Rat Colony', 5, 3], ['Sol Ring', 1, 0]]
	);
});

test('mergeRemovedCards keeps max previousQuantity with the latest row', () => {
	const local = [{ cardName: 'Rat Colony', deckId: 'd1', previousQuantity: 5, newQuantity: 4, removedAt: '2026-01-01T00:00:00Z' }];
	const cloud = [{ cardName: 'Rat Colony', deckId: 'd1', previousQuantity: 4, newQuantity: 3, removedAt: '2026-01-02T00:00:00Z' }];

	const [row] = mergeRemovedCards(local, cloud);
	assert.equal(row.previousQuantity, 5);
	assert.equal(row.newQuantity, 3);
	assert.equal(row.removedAt, '2026-01-02T00:00:00Z');

	// legacy rows without quantities still merge on removedAt
	const [legacy] = mergeRemovedCards(
		[{ cardName: 'Sol Ring', deckId: 'd1', removedAt: '2026-01-01T00:00:00Z' }],
		[{ cardName: 'Sol Ring', deckId: 'd1', removedAt: '2026-01-03T00:00:00Z' }]
	);
	assert.equal(legacy.removedAt, '2026-01-03T00:00:00Z');

	// names match via normalizeCardName: back face, printing suffix, whitespace
	const merged = mergeRemovedCards(
		[{ cardName: 'Dusk // Dawn ', deckId: 'd1', removedAt: '2026-01-01T00:00:00Z' }],
		[{ cardName: 'dusk', deckId: 'd1', removedAt: '2026-01-02T00:00:00Z' }]
	);
	assert.equal(merged.length, 1);
	assert.equal(merged[0].removedAt, '2026-01-02T00:00:00Z');
});

// --- #146 per-deck counts ------------------------------------------------------

test('getDeckPoolCoreCounts matches the #146 combined example per deck', () => {
	const { prism, b, u, e } = splitPlusStandalonePrism();
	const cards = processCards(prism);

	assert.deepEqual(getDeckPoolCoreCounts(b, cards), { pool: 3, core: 2 });
	assert.deepEqual(getDeckPoolCoreCounts(u, cards), { pool: 2, core: 0 });
	assert.deepEqual(getDeckPoolCoreCounts(e, cards), { pool: 3, core: 0 });

	// per-deck pool + core equals the trusted decklist quantity
	for (const [deck, qty] of [[b, 5], [u, 2], [e, 3]]) {
		const { pool, core } = getDeckPoolCoreCounts(deck, cards);
		assert.equal(pool + core, qty);
	}
});
