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
const { trackRemovedCard, getRemovalStripePosition, removalOpenCopies } = await import('../js/modules/swap.js');
const { planSleeveReuse, completeReuse } = await import('../js/modules/sleeve-reuse.js');
const { mergeRemovedCards } = await import('../js/modules/storage.js');

const NOW = '2026-10-24T12:00:00.000Z';

function card(name, quantity = 1, isCommander = false) {
	return { name, quantity, isCommander, isBasicLand: false };
}

function deck(name, pos, cards) {
	return createDeck({ name, bracket: 3, color: `#0000${String(pos).padStart(2, '0')}`, stripePosition: pos, cards });
}

const byName = (prism, name) => prism.decks.find((d) => d.name === name);

// A deck edit as the edit path records it: the row, then the new quantity.
function setQuantity(prism, deckName, cardName, quantity) {
	const d = byName(prism, deckName);
	const row = d.cards.find((c) => c.name === cardName);
	const previousQuantity = row?.quantity || 0;
	if (quantity < previousQuantity) {
		trackRemovedCard(prism, {
			cardName, deckId: d.id, deckName: d.name, deckColor: d.color,
			stripePosition: getRemovalStripePosition(prism, d), removedAt: NOW,
			previousQuantity, newQuantity: quantity, isCommander: !!row?.isCommander,
		});
	}
	if (row) row.quantity = quantity;
	else d.cards.push(card(cardName, quantity));
	d.cards = d.cards.filter((c) => c.quantity > 0);
}

// Five decks A–E sharing a marked Kodama's Reach.
function fiveDecks() {
	const prism = createPrism('T');
	prism.decks = ['A', 'B', 'C', 'D', 'E'].map((n, i) => deck(n, i + 1, [card("Kodama's Reach")]));
	prism.markedCards = ["Kodama's Reach"];
	return prism;
}

const slots = (marks) => marks.map((m) => m.position).sort((a, b) => a - b);

test('a card cut from every deck frees one sleeve that fits its replacement exactly', () => {
	const prism = fiveDecks();
	for (const n of ['A', 'B', 'C', 'D', 'E']) {
		setQuantity(prism, n, "Kodama's Reach", 0);
		setQuantity(prism, n, 'Cultivate', 1);
	}

	const plan = planSleeveReuse(prism);
	assert.equal(plan.freedSleeves.length, 1);
	assert.equal(plan.freedSleeves[0].cardName, "Kodama's Reach");
	assert.deepEqual(slots(plan.freedSleeves[0].marks), [1, 2, 3, 4, 5]);
	assert.equal(plan.matches.length, 1);
	const [match] = plan.matches;
	assert.equal(match.incomingBatch.cardName, 'Cultivate');
	assert.deepEqual(match.marksToClear, []);
	assert.deepEqual(match.marksToAdd, []);
	assert.deepEqual(plan.needsFreshSleeve, []);
});

test('a card cut from one deck only frees nothing: its sleeve is still in use', () => {
	const prism = fiveDecks();
	setQuantity(prism, 'E', "Kodama's Reach", 0);
	setQuantity(prism, 'E', 'Cultivate', 1);

	const plan = planSleeveReuse(prism);
	assert.deepEqual(plan.freedSleeves, []);
	assert.deepEqual(plan.matches, []);
	assert.deepEqual(plan.needsFreshSleeve.map((n) => n.cardName), ['Cultivate']);
});

test('a 5-mark Freed sleeve fits a 4-mark need with 1 clear, and a 2-mark need is not offered', () => {
	const prism = fiveDecks();
	for (const n of ['A', 'B', 'C', 'D', 'E']) setQuantity(prism, n, "Kodama's Reach", 0);
	for (const n of ['A', 'B', 'C', 'D']) setQuantity(prism, n, 'Cultivate', 1);

	const [match] = planSleeveReuse(prism).matches;
	assert.equal(match.incomingBatch.cardName, 'Cultivate');
	assert.deepEqual(slots(match.marksToClear), [5]);
	assert.deepEqual(match.marksToAdd, []);

	for (const n of ['C', 'D']) setQuantity(prism, n, 'Cultivate', 0);
	const plan = planSleeveReuse(prism);
	assert.deepEqual(plan.matches, [], '3 marks to clear is a fresh sleeve');
	assert.deepEqual(plan.needsFreshSleeve.map((n) => n.cardName), ['Cultivate']);
});

test('a freed copy that was never marked is a spare blank sleeve, not a match', () => {
	const prism = fiveDecks();
	prism.markedCards = [];
	for (const n of ['A', 'B', 'C', 'D', 'E']) {
		setQuantity(prism, n, "Kodama's Reach", 0);
		setQuantity(prism, n, 'Cultivate', 1);
	}

	const plan = planSleeveReuse(prism);
	assert.deepEqual(plan.freedSleeves, []);
	assert.deepEqual(plan.matches, []);
	assert.deepEqual(plan.spareSleeves.map((s) => [s.cardName, s.copies]), [["Kodama's Reach", 1]]);
});

test('an ambiguous multi-batch loss frees the sleeve with the fewest clears, and names it', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring', 2)]), deck('B', 2, [card('Sol Ring')])];
	prism.markedCards = processCards(prism)[0].batches.map((b) => b.key);
	setQuantity(prism, 'A', 'Sol Ring', 1);
	setQuantity(prism, 'A', 'Arcane Signet', 1);

	const plan = planSleeveReuse(prism);
	assert.equal(plan.freedSleeves.length, 1);
	assert.equal(plan.freedSleeves[0].label, 'the A-only sleeve');
	assert.deepEqual(slots(plan.freedSleeves[0].marks), [1]);
	assert.deepEqual(plan.matches.map((m) => [m.incomingBatch.cardName, m.marksToClear.length]), [['Arcane Signet', 0]]);
});

test('the same edits in any order give the same plan', () => {
	const run = (order) => {
		const prism = fiveDecks();
		prism.decks.forEach((d, i) => { d.id = `deck-${i}`; });
		for (const n of order) {
			setQuantity(prism, n, "Kodama's Reach", 0);
			if (n !== 'E') setQuantity(prism, n, 'Cultivate', 1);
		}
		return planSleeveReuse(prism);
	};
	const first = run(['A', 'B', 'C', 'D', 'E']);
	assert.equal(first.matches.length, 1);
	assert.deepEqual(run(['E', 'C', 'A', 'D', 'B']), first);
	assert.deepEqual(run(['D', 'E', 'B', 'A', 'C']), first);
});

test('split-group dots match only on identical mark identity', () => {
	const prism = createPrism('T');
	const group = createSplitGroup({ name: 'G', sideAPosition: 2, sideAColor: '#AA0000', splitStyle: 'dots' });
	const x = createDeck({ name: 'X', bracket: 3, color: '#00AA00', stripePosition: null, cards: [card("Kodama's Reach")] });
	const y = createDeck({ name: 'Y', bracket: 3, color: '#0000AA', stripePosition: null, cards: [card('Forest')] });
	x.splitGroupId = group.id;
	y.splitGroupId = group.id;
	group.childDeckIds = [x.id, y.id];
	prism.splitGroups = [group];
	prism.decks = [deck('A', 1, [card("Kodama's Reach")]), x, y];
	prism.markedCards = ["Kodama's Reach", 'Forest'];
	setQuantity(prism, 'A', "Kodama's Reach", 0);
	setQuantity(prism, 'X', "Kodama's Reach", 0);
	setQuantity(prism, 'A', 'Cultivate', 1);
	setQuantity(prism, 'Y', 'Cultivate', 1);

	const [match] = planSleeveReuse(prism).matches;
	assert.deepEqual(match.marksToClear.map((m) => [m.markType, m.deckName]), [['dot', 'X']]);
	assert.deepEqual(match.marksToAdd.map((m) => [m.markType, m.deckName]), [['dot', 'Y']]);
});

test('a dedicated commander sleeve is reused like any other', () => {
	const prism = createPrism('T');
	prism.useDedicatedCommanderCopies = true;
	prism.decks = [deck('A', 1, [card('Tatyova', 1, true)]), deck('B', 2, [card('Tatyova')])];
	prism.markedCards = processCards(prism)[0].batches.map((b) => b.key);
	setQuantity(prism, 'A', 'Tatyova', 0);
	byName(prism, 'A').cards.push(card('Aesi', 1, true));

	const [match] = planSleeveReuse(prism).matches;
	assert.equal(match.freedSleeve.cardName, 'Tatyova');
	assert.equal(match.incomingBatch.cardName, 'Aesi');
	assert.deepEqual(match.marksToClear, []);
});

test('completing a reuse clears the rows, marks the incoming batch Done, and the match is gone', () => {
	const prism = fiveDecks();
	for (const n of ['A', 'B', 'C', 'D', 'E']) {
		setQuantity(prism, n, "Kodama's Reach", 0);
		setQuantity(prism, n, 'Cultivate', 1);
	}
	const [match] = planSleeveReuse(prism).matches;

	const { prism: next, unmarkedKeys } = completeReuse(prism, match.id, { now: NOW });
	assert.deepEqual(unmarkedKeys, []);
	assert.ok(next.markedCards.includes('Cultivate'));
	assert.equal(next.markedCardsUpdatedAt, NOW);
	assert.ok(next.removedCards.every((r) => r.clearedQuantity === 1 && removalOpenCopies(r) === 0));
	const after = planSleeveReuse(next);
	assert.deepEqual([after.matches, after.freedSleeves, after.needsFreshSleeve], [[], [], []]);
	assert.equal(prism.removedCards[0].clearedQuantity, undefined, 'input PRISM is untouched');
});

test('a partly cleared row stays listed with the copy that is left', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Forest', 2)])];
	prism.markedCards = ['Forest'];
	setQuantity(prism, 'A', 'Forest', 0);
	setQuantity(prism, 'A', 'Cultivate', 1);
	const [match] = planSleeveReuse(prism).matches;
	assert.equal(match.copies, 1);

	const { prism: next } = completeReuse(prism, match.id, { now: NOW });
	const [row] = next.removedCards;
	assert.equal(row.clearedQuantity, 1);
	assert.equal(removalOpenCopies(row), 1);
	assert.deepEqual(planSleeveReuse(next).freedSleeves.map((s) => s.copies), [1]);
});

test('clearedQuantity merges by max on both sides and survives re-removal', () => {
	const cleared = { cardName: 'Forest', deckId: 'd1', previousQuantity: 3, newQuantity: 0, clearedQuantity: 2, removedAt: '2026-01-01T00:00:00Z' };
	const newer = { cardName: 'Forest', deckId: 'd1', previousQuantity: 3, newQuantity: 0, removedAt: '2026-01-02T00:00:00Z' };
	assert.equal(mergeRemovedCards([cleared], [newer])[0].clearedQuantity, 2);
	assert.equal(mergeRemovedCards([newer], [cleared])[0].clearedQuantity, 2);
	assert.equal(removalOpenCopies(mergeRemovedCards([newer], [cleared])[0]), 1);

	const prism = createPrism('T');
	prism.removedCards = [{ ...cleared, newQuantity: 1, clearedQuantity: 2 }];
	trackRemovedCard(prism, { cardName: 'Forest', deckId: 'd1', previousQuantity: 1, newQuantity: 0, removedAt: NOW });
	assert.deepEqual([prism.removedCards[0].previousQuantity, prism.removedCards[0].clearedQuantity], [3, 2]);
	assert.equal(removalOpenCopies(prism.removedCards[0]), 1);
});
