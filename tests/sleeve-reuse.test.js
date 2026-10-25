import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { createPrism, createDeck, createSplitGroup, processCards, removeSplitChild, DEFAULT_COLORS } = await import('../js/modules/processor.js');
const { trackRemovedCard, getRemovalStripePosition, removalOpenCopies, applySwap, clearReturnedRemovals } = await import('../js/modules/swap.js');
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
	assert.deepEqual(match.freedSleeves.map((s) => s.cardName), ['Tatyova']);
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
	assert.ok(next.markedCards.includes(match.incomingBatch.batchKey), 'the batch key rides beside the plain name');
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

// A Sleeve swap of the card's only batch: the incoming card takes its sleeve.
function sleeveSwapOut(prism, outgoing, incoming) {
	const [batch] = processCards(prism).find((c) => c.name === outgoing).batches;
	return applySwap(prism, { outgoing, incoming, deckIds: batch.participantIds, copies: batch.copyCount, sleeve: true, now: NOW }).prism;
}

test('a Sleeve swap of the copies left after a cut frees nothing: the incoming card holds that sleeve (#401)', () => {
	const prism = fiveDecks();
	setQuantity(prism, 'E', "Kodama's Reach", 0);
	setQuantity(prism, 'E', 'Cultivate', 1);

	const next = sleeveSwapOut(prism, "Kodama's Reach", 'Rampant Growth');
	const plan = planSleeveReuse(next);
	assert.deepEqual([plan.freedSleeves, plan.spareSleeves, plan.matches], [[], [], []]);
	assert.deepEqual(plan.needsFreshSleeve.map((n) => n.cardName), ['Cultivate']);
	const [row] = next.removedCards;
	assert.equal(removalOpenCopies(row), 1, 'the E mark is still on the sleeve, now under Rampant Growth');
	assert.equal(row.sleeveSwappedQuantity, 1);
});

test('a Sleeve swap after a quantity cut leaves only the cut copy freed (#401)', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Forest', 2)])];
	prism.markedCards = ['Forest'];
	setQuantity(prism, 'A', 'Forest', 1);

	const next = sleeveSwapOut(prism, 'Forest', 'Cultivate');
	assert.deepEqual(planSleeveReuse(next).freedSleeves.map((s) => s.copies), [1]);
});

test('a card back in the deck after a Sleeve swap took its sleeve is not still painted (#401)', () => {
	const next = sleeveSwapOut((() => {
		const prism = fiveDecks();
		setQuantity(prism, 'E', "Kodama's Reach", 0);
		return prism;
	})(), "Kodama's Reach", 'Rampant Growth');
	setQuantity(next, 'E', "Kodama's Reach", 1);
	assert.deepEqual(clearReturnedRemovals(next, byName(next, 'E')), []);
});

test('sleeveSwappedQuantity merges by max on both sides and survives re-removal (#401)', () => {
	const swapped = { cardName: 'Forest', deckId: 'd1', previousQuantity: 3, newQuantity: 1, sleeveSwappedQuantity: 1, removedAt: '2026-01-01T00:00:00Z' };
	const newer = { cardName: 'Forest', deckId: 'd1', previousQuantity: 3, newQuantity: 1, removedAt: '2026-01-02T00:00:00Z' };
	assert.equal(mergeRemovedCards([swapped], [newer])[0].sleeveSwappedQuantity, 1);
	assert.equal(mergeRemovedCards([newer], [swapped])[0].sleeveSwappedQuantity, 1);

	const prism = createPrism('T');
	prism.removedCards = [swapped];
	trackRemovedCard(prism, { cardName: 'Forest', deckId: 'd1', previousQuantity: 1, newQuantity: 0, removedAt: NOW });
	assert.equal(prism.removedCards[0].sleeveSwappedQuantity, 1);
});

// Six decks in palette colors: A Yellow, B Blue, C Purple, D Red, E Green, F White.
function prepFixture() {
	const prism = createPrism('T');
	prism.decks = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => createDeck({
		name: n, bracket: 3, color: DEFAULT_COLORS[i], stripePosition: i + 1,
		cards: n === 'F' ? [] : [card("Kodama's Reach"), card('Rampant Growth')],
	}));
	byName(prism, 'A').cards.push(card('Mind Stone'), card('Sol Ring'));
	byName(prism, 'B').cards.push(card('Sol Ring'));
	prism.markedCards = ["Kodama's Reach", 'Rampant Growth', 'Sol Ring'];
	for (const n of ['A', 'B', 'C', 'D', 'E']) {
		setQuantity(prism, n, "Kodama's Reach", 0);
		setQuantity(prism, n, 'Rampant Growth', 0);
		setQuantity(prism, n, 'Cultivate', 1); // exact: 0 clears
	}
	for (const n of ['A', 'B', 'C', 'D', 'F']) setQuantity(prism, n, 'Farseek', 1); // partial: clear E, add F
	setQuantity(prism, 'A', 'Mind Stone', 0); // never marked: a spare blank sleeve
	setQuantity(prism, 'B', 'Sol Ring', 0); // still in A: clear B on the sleeve that stays
	for (const n of ['A', 'B']) setQuantity(prism, n, 'Arcane Signet', 1); // fresh sleeve
	setQuantity(prism, 'C', 'Fellwar Stone', 2); // fresh sleeves, 2 copies
	return prism;
}

test('the prep totals: sleeves to gather, pens by color name, marks to clear, pull list', () => {
	const { prep } = planSleeveReuse(prepFixture());
	assert.equal(prep.sleevesToGather, 2, '3 fresh-sleeve copies minus 1 spare');
	assert.deepEqual(prep.pens, [
		{ name: 'Purple', color: DEFAULT_COLORS[2], count: 2 },
		{ name: 'Blue', color: DEFAULT_COLORS[1], count: 1 },
		{ name: 'White', color: DEFAULT_COLORS[5], count: 1 },
		{ name: 'Yellow', color: DEFAULT_COLORS[0], count: 1 },
	]);
	assert.equal(prep.marksToClear, 2, 'E on the reused sleeve, B on the Sol Ring that stays');
	assert.deepEqual(prep.pullList, [
		{ cardName: "Kodama's Reach", copies: 1 },
		{ cardName: 'Mind Stone', copies: 1 },
		{ cardName: 'Rampant Growth', copies: 1 },
	]);
});

test('completing every reuse leaves the prep with the fresh sleeves and the stay-behind clear', () => {
	let prism = prepFixture();
	for (const { id } of planSleeveReuse(prism).matches) prism = completeReuse(prism, id, { now: NOW }).prism;
	const { matches, prep } = planSleeveReuse(prism);
	assert.deepEqual(matches, []);
	assert.equal(prep.sleevesToGather, 2);
	assert.equal(prep.marksToClear, 1);
	assert.deepEqual(prep.pullList.map((p) => p.cardName), ['Mind Stone']);
});

test('copies already in a marked sleeve under an older batch key need marks, not a sleeve', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring', 2)]), deck('B', 2, [card('Sol Ring')]), deck('C', 3, [card('Arcane Signet', 2)])];
	prism.markedCards = [...processCards(prism).find((c) => c.name === 'Sol Ring').batches.map((b) => b.key), 'Arcane Signet'];
	setQuantity(prism, 'C', 'Arcane Signet', 0); // two Freed sleeves marked C
	setQuantity(prism, 'B', 'Sol Ring', 2); // a new batch key, but both copies are already sleeved

	const plan = planSleeveReuse(prism);
	assert.deepEqual(plan.needsFreshSleeve, []);
	assert.deepEqual(plan.matches, []);
	assert.equal(plan.prep.sleevesToGather, 0);
});

test('a legacy plain mark on a card now multi-batch counts every copy as sleeved', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring', 2)]), deck('B', 2, [card('Sol Ring')])];
	prism.markedCards = ['Sol Ring']; // from before batch keys: no copy count

	const plan = planSleeveReuse(prism);
	assert.deepEqual(plan.needsFreshSleeve, []);
	assert.equal(plan.prep.sleevesToGather, 0);
});

// A single-batch Done as setCardMarked writes it: plain name plus batch key.
const markSingle = (prism, name) => {
	const c = processCards(prism).find((x) => x.name === name);
	prism.markedCards = [...(prism.markedCards || []), name, c.batches[0].key];
};

test('a single-batch Done card that gains copies needs a sleeve for the new copy only', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring')])];
	markSingle(prism, 'Sol Ring');
	setQuantity(prism, 'A', 'Sol Ring', 2);

	const plan = planSleeveReuse(prism);
	assert.deepEqual(plan.needsFreshSleeve.map((n) => [n.cardName, n.copyCount]), [['Sol Ring', 1]]);
	assert.equal(plan.prep.sleevesToGather, 1);
});

test('a single-batch Done card that gains a deck with more copies needs a sleeve for the new copy only', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring')]), deck('B', 2, [])];
	markSingle(prism, 'Sol Ring');
	setQuantity(prism, 'B', 'Sol Ring', 2);

	const plan = planSleeveReuse(prism);
	assert.equal(plan.needsFreshSleeve.reduce((n, x) => n + x.copyCount, 0), 1);
	assert.equal(plan.prep.sleevesToGather, 1);
});

test('completing a reuse into a single-batch card replaces its stale batch key', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card("Kodama's Reach"), card('Cultivate')])];
	prism.markedCards = ["Kodama's Reach"];
	markSingle(prism, 'Cultivate');
	const [staleKey] = prism.markedCards.filter((k) => k.startsWith('Cultivate|#b|'));
	setQuantity(prism, 'A', "Kodama's Reach", 0); // a Freed sleeve marked A
	setQuantity(prism, 'A', 'Cultivate', 2); // one new copy needs a sleeve

	const [match] = planSleeveReuse(prism).matches;
	assert.equal(match.incomingBatch.cardName, 'Cultivate');
	const { prism: next, unmarkedKeys } = completeReuse(prism, match.id, { now: NOW });
	assert.deepEqual(unmarkedKeys, [staleKey]);
	assert.ok(!next.markedCards.includes(staleKey));
	assert.ok(next.markedCards.includes('Cultivate') && next.markedCards.includes(match.incomingBatch.batchKey));
	assert.ok(next.markedCards.includes("Kodama's Reach"), 'other cards keep their marks');
});

test('a single-batch Done card that did not change needs nothing', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring', 2)])];
	markSingle(prism, 'Sol Ring');
	assert.deepEqual(planSleeveReuse(prism).needsFreshSleeve, []);
});

test('a 2-copy need pools two 1-copy Freed sleeves with identical marks', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card("Kodama's Reach"), card('Rampant Growth')])];
	prism.markedCards = ["Kodama's Reach", 'Rampant Growth'];
	setQuantity(prism, 'A', "Kodama's Reach", 0);
	setQuantity(prism, 'A', 'Rampant Growth', 0);
	setQuantity(prism, 'A', 'Cultivate', 2);

	const plan = planSleeveReuse(prism);
	assert.deepEqual(plan.needsFreshSleeve, []);
	assert.equal(plan.prep.sleevesToGather, 0);
	const [match] = plan.matches;
	assert.equal(match.copies, 2);
	assert.deepEqual(match.freedSleeves.map((s) => [s.cardName, s.copies]), [["Kodama's Reach", 1], ['Rampant Growth', 1]]);

	const { prism: next } = completeReuse(prism, match.id, { now: NOW });
	assert.ok(next.removedCards.every((r) => removalOpenCopies(r) === 0));
	assert.ok(next.markedCards.includes('Cultivate'));
	assert.deepEqual(planSleeveReuse(next).freedSleeves, []);
});

test('a pen for a custom color is labeled, never shown as hex', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring')])]; // #000001, not a palette color
	const [pen] = planSleeveReuse(prism).prep.pens;
	assert.deepEqual(pen, { name: 'Custom color', color: '#000001', count: 1 });
});

// A split group G at Side A slot 2 whose variants hold the given cards.
function splitFixture(splitStyle, variants) {
	const prism = createPrism('T');
	const group = createSplitGroup({ name: 'G', sideAPosition: 2, sideAColor: '#AA0000', splitStyle });
	prism.decks = variants.map(([name, slot, cards], i) => ({
		...createDeck({ name, bracket: 3, color: `#00${i}0AA`, stripePosition: slot, cards }),
		splitGroupId: group.id,
	}));
	group.childDeckIds = prism.decks.map((d) => d.id);
	prism.splitGroups = [group];
	return prism;
}

// Deleting a variant as the delete path does: a row per card, then the deck goes.
function deleteVariant(prism, name) {
	const d = byName(prism, name);
	for (const c of d.cards) {
		trackRemovedCard(prism, {
			cardName: c.name, deckId: d.id, deckName: d.name, deckColor: d.color,
			stripePosition: getRemovalStripePosition(prism, d), removedAt: NOW,
			previousQuantity: c.quantity, newQuantity: 0, isCommander: !!c.isCommander,
		});
	}
	return removeSplitChild(prism, d.id);
}

const markShape = (marks) => marks.map((m) => [m.side, m.position, m.markType, m.deckName]);

test('a deleted dot variant frees its sleeve with the dot it was painted with', () => {
	let prism = splitFixture('dots', [['X', null, [card("Kodama's Reach")]], ['Y', null, [card('Forest')]]]);
	prism.markedCards = ["Kodama's Reach", 'Forest'];
	prism = deleteVariant(prism, 'X'); // the group dissolves; Y stands alone at slot 2
	setQuantity(prism, 'G', 'Cultivate', 1);

	const [match] = planSleeveReuse(prism).matches;
	assert.deepEqual(markShape(match.marksToClear), [['b', 2, 'dot', 'X']]);
	assert.deepEqual(match.marksToAdd, []);
});

test('a deleted Side B variant frees its sleeve with its Side B stripe', () => {
	let prism = splitFixture('stripes', [['X', 48, [card("Kodama's Reach")]], ['Y', 47, []], ['W', 46, []]]);
	prism.markedCards = ["Kodama's Reach"];
	prism = deleteVariant(prism, 'X');
	setQuantity(prism, 'Y', 'Cultivate', 1);

	const [match] = planSleeveReuse(prism).matches;
	assert.deepEqual(markShape(match.marksToClear), [['b', 48, 'stripe', 'X']]);
	assert.deepEqual(markShape(match.marksToAdd), [['b', 47, 'stripe', 'Y']]);
});
