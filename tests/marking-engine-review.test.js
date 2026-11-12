// Adversarial review of the marking engine (#414). Passing tests pin what the
// review confirmed; `todo` tests reproduce the bugs it found, one issue each.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { createPrism, createDeck, createSplitGroup, processCards, splitDeck } =
	await import('../js/modules/processor.js');
const { isCardDone, passKeysForCard, markSingleBatchDone } = await import('../js/core/utils.js');
const { applySwap, markTallies, unmarkCardsWithNewStripes, openRemovals } =
	await import('../js/modules/swap.js');
const { state } = await import('../js/core/state.js');
const { getMarkTallies, unmarkCardsWithNewStripes: unmarkAfterAdd } = await import('../js/features/deck-list.js');

const card = (name, quantity = 1, extra = {}) =>
	({ name, quantity, isCommander: false, isBasicLand: name === 'Forest', ...extra });
const deck = (id, pos, cards, extra = {}) =>
	createDeck({ id, name: id, bracket: 3, color: `#0000${String(pos).padStart(2, '0')}`, stripePosition: pos, cards, ...extra });
const visible = (stripes) => stripes.filter((s) => s.markType !== 'membership');
const find = (prism, name) => processCards(prism).find((c) => c.name === name);
const copiesFor = (c, deckId) =>
	c.batches.filter((b) => b.participantIds.includes(deckId)).reduce((s, b) => s + b.copyCount, 0);

// A split group of variants with the given card lists; returns its decks.
function group(prism, id, pos, variantCards, splitStyle = 'stripes') {
	const g = createSplitGroup({ id, name: id, sideAPosition: pos, sideAColor: '#AAAAAA', splitStyle });
	const decks = variantCards.map((cards, i) => deck(`${id}${i + 1}`, splitStyle === 'dots' ? null : 48 - pos * 4 - i, cards, { splitGroupId: id }));
	g.childDeckIds = decks.map((d) => d.id);
	prism.splitGroups.push(g);
	prism.decks.push(...decks);
	return decks;
}

// --- Confirmed correct ------------------------------------------------------

test('quantity tiers: random PRISMs keep every copy correctly marked', () => {
	let seed = 7;
	const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
	for (let i = 0; i < 1500; i++) {
		const prism = createPrism('T');
		const cards = () => (rnd(4) ? [card('Forest', 1 + rnd(5))] : []);
		for (let l = 0, n = 1 + rnd(3); l < n; l++) {
			const kind = rnd(4);
			if (kind < 2) prism.decks.push(deck(`D${l}`, l + 1, cards()));
			else if (kind === 2) group(prism, `G${l}`, l + 1, [cards(), cards()], 'dots');
			else group(prism, `G${l}`, l + 1, [cards(), cards(), cards()]);
		}
		const forest = find(prism, 'Forest');
		if (!forest) continue;
		const ctx = JSON.stringify(prism.decks.map((d) => [d.id, d.cards[0]?.quantity || 0]));
		assert.equal(forest.batches.reduce((s, b) => s + b.copyCount, 0), forest.totalQuantity, ctx);
		assert.equal(new Set(forest.batches.map((b) => b.key)).size, forest.batches.length, ctx);
		// every deck gets exactly the copies it runs, never more
		for (const d of prism.decks) assert.equal(copiesFor(forest, d.id), d.cards[0]?.quantity || 0, ctx);
		for (const b of forest.batches) {
			const marks = visible(b.stripes);
			for (const g of prism.splitGroups) {
				const inBatch = g.childDeckIds.filter((id) => b.participantIds.includes(id));
				if (!inBatch.length) continue;
				assert.ok(marks.some((s) => s.side === 'a' && s.groupId === g.id), `parent mark ${ctx}`);
				const child = marks.filter((s) => s.side === 'b' && s.groupId === g.id);
				// shared by every variant → parent only; a subset → one child mark each
				assert.equal(child.length, inBatch.length === g.childDeckIds.length ? 0 : inBatch.length, ctx);
			}
			for (const d of prism.decks.filter((x) => !x.splitGroupId)) {
				assert.equal(marks.some((s) => s.deckId === d.id), b.participantIds.includes(d.id), ctx);
			}
		}
	}
});

test('dedication: a group flagged in one variant keeps the child mark of a subset card', () => {
	const prism = createPrism('T');
	prism.useDedicatedCommanderCopies = true;
	group(prism, 'G', 1, [[card('Krark', 1, { isCommander: true })], [card('Sol Ring')]]);
	prism.decks.push(deck('B', 2, [card('Krark')]));
	const krark = find(prism, 'Krark');
	assert.deepEqual(krark.batches.map((b) => [!!b.isDedicated, b.copyCount, visible(b.stripes).map((s) => s.deckName)]),
		[[true, 1, ['G', 'G1']], [false, 1, ['B']]]);
});

test('done-keying: turning dedication on retires a plain Done; a quantity change re-keys a batch', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Krark', 1, { isCommander: true }), card('Forest', 3)]), deck('B', 2, [card('Krark'), card('Forest', 5)])];
	const marked = new Set(['Krark', ...find(prism, 'Forest').batches.map((b) => b.key)]);
	assert.equal(isCardDone(find(prism, 'Krark'), marked), true);
	assert.equal(isCardDone(find(prism, 'Forest'), marked), true);

	prism.useDedicatedCommanderCopies = true;
	assert.equal(isCardDone(find(prism, 'Krark'), marked), false);
	prism.decks[1].cards[1].quantity = 6;
	assert.equal(isCardDone(find(prism, 'Forest'), marked), false);
	prism.decks[1].cards[1].quantity = 5; // reverted edit resurrects the mark
	assert.equal(isCardDone(find(prism, 'Forest'), marked), true);
});

// --- Bugs -------------------------------------------------------------------

const BUG = (issue) => ({ todo: `bug #${issue}` });

test('basic land: marking the Side A passes alone must not read Done while a child-mark pass is open', () => {
	const prism = createPrism('T');
	group(prism, 'G', 1, [[card('Forest', 5)], [card('Forest', 2)]]);
	prism.decks.push(deck('E', 2, [card('Forest', 3)]));
	const forest = find(prism, 'Forest');
	assert.deepEqual(passKeysForCard(forest).sort(), ['Forest|E', 'Forest|G', 'Forest|G1']);
	assert.equal(isCardDone(forest, new Set(['Forest|G', 'Forest|E'])), false);
});

test('pass keys: a split group and a deck that share a name are two passes', BUG(419), () => {
	let prism = createPrism('T');
	prism.decks = [createDeck({ name: 'Elves', bracket: 3, color: '#111111', stripePosition: 1, cards: [card('Forest', 2)] })];
	prism = splitDeck(prism, prism.decks[0].id, 2); // group "Elves", variants "Elves (1)", "Elves (2)"
	// the Add Deck name check only looks at deck names, so "Elves" is free again
	prism.decks.push(createDeck({ name: 'Elves', bracket: 3, color: '#222222', stripePosition: 2, cards: [card('Forest', 2)] }));
	const forest = find(prism, 'Forest');
	assert.equal(visible(forest.batches[0].stripes).length, 2);
	assert.equal(passKeysForCard(forest).length, 2);
});

test('a variant whose split group is missing still gets a mark on its batch (#420)', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring')], { splitGroupId: 'gone' })];
	const sol = find(prism, 'Sol Ring');
	assert.equal(visible(sol.stripes).length, 1);
	assert.deepEqual(visible(sol.batches[0].stripes), visible(sol.stripes));
});

test('a deck its split group does not list is standalone: own stripe on card and batch (#420)', () => {
	const prism = createPrism('T');
	group(prism, 'G', 1, [[card('Opt')], [card('Opt')]]);
	prism.decks.push(deck('A', 2, [card('Sol Ring')], { splitGroupId: 'G' }));
	const sol = find(prism, 'Sol Ring');
	assert.deepEqual(visible(sol.stripes).map((s) => s.deckId), ['A']);
	assert.deepEqual(visible(sol.batches[0].stripes), visible(sol.stripes));
});

// Add Deck: snapshot the tallies, add the deck, un-mark (deck-form.js handleAddDeck).
function addDeck(prism, newDeck) {
	state.currentPrism = prism;
	const before = getMarkTallies();
	prism.decks.push(newDeck);
	return unmarkAfterAdd(before);
}

test('add deck: a card that left the PRISM and comes back in a new deck is not Done (#421)', () => {
	// Sol Ring was Done in deck A; A was deleted (mark keys are never pruned).
	const prism = createPrism('T');
	prism.markedCards = ['Sol Ring', 'Sol Ring|#b|A|1'];
	addDeck(prism, deck('B', 2, [card('Sol Ring')]));
	assert.equal(isCardDone(find(prism, 'Sol Ring'), new Set(prism.markedCards)), false);
});

test('add deck: a pass key left by a deleted deck of the same name is un-marked (#421)', () => {
	const prism = createPrism('T');
	prism.decks = [deck('K', 1, [card('Forest', 2)])];
	prism.markedCards = ['Forest|K', 'Forest|A']; // A deleted, its pass key never pruned
	assert.deepEqual(addDeck(prism, deck('A', 2, [card('Forest', 3)])), ['Forest|A']);
	assert.deepEqual(prism.markedCards, ['Forest|K']);
});

test('add deck: a Done card now shared with the new deck is un-marked; its other pass keys stay', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Sol Ring')])];
	prism.markedCards = ['Sol Ring', 'Sol Ring|A'];
	assert.deepEqual(addDeck(prism, deck('B', 2, [card('Sol Ring')])), ['Sol Ring']);
	assert.deepEqual(prism.markedCards, ['Sol Ring|A']);
});

test('raising a quantity retires a single-batch or pass Done: the new copies have no marks (#422)', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Forest', 3)])];
	const forest = find(prism, 'Forest');
	for (const marked of [markSingleBatchDone([], 'Forest', forest.batches[0].key).markedCards, ['Forest|A']]) {
		const next = structuredClone(prism);
		next.markedCards = marked;
		const before = markTallies(next);
		next.decks[0].cards[0].quantity = 5;
		unmarkCardsWithNewStripes(next, before);
		assert.equal(isCardDone(find(next, 'Forest'), new Set(next.markedCards)), false, marked.join());
	}
});

test('a quantity change un-marks only the pass that needs more copies; a decrease un-marks nothing (#422)', () => {
	const prism = createPrism('T');
	prism.decks = [deck('A', 1, [card('Forest', 3)]), deck('K', 2, [card('Forest', 5)])];
	prism.markedCards = ['Forest', 'Forest|A', 'Forest|K'];
	let before = markTallies(prism);
	prism.decks[0].cards[0].quantity = 4; // total stays 5
	assert.deepEqual(unmarkCardsWithNewStripes(prism, before), ['Forest', 'Forest|A']);
	assert.deepEqual(prism.markedCards, ['Forest|K']);

	prism.markedCards = ['Forest', 'Forest|A', 'Forest|K'];
	before = markTallies(prism);
	prism.decks[1].cards[0].quantity = 2;
	assert.deepEqual(unmarkCardsWithNewStripes(prism, before), []);
});

test('a card back in its only variant keeps Done: parent and child marks are both still painted (#422)', () => {
	const prism = createPrism('T');
	group(prism, 'G', 1, [[card('Sol Ring')], [card('Opt')]]);
	prism.markedCards = ['Sol Ring'];
	const away = applySwap(prism, { outgoing: 'Sol Ring', incoming: 'Island', deckIds: ['G1'] }).prism;
	const back = applySwap(away, { outgoing: 'Island', incoming: 'Sol Ring', deckIds: ['G1'] }).prism;
	assert.deepEqual(visible(find(back, 'Sol Ring').stripes).map((s) => s.deckName), ['G', 'G1']);
	assert.ok(back.markedCards.includes('Sol Ring'));

	// the group has moved slot since: the parent stripe on the sleeve is in the old one
	away.splitGroups[0].sideAPosition = 9;
	const moved = applySwap(away, { outgoing: 'Island', incoming: 'Sol Ring', deckIds: ['G1'] }).prism;
	assert.ok(!moved.markedCards.includes('Sol Ring'));
});

test('a subset card that becomes shared by every variant has stale child marks to deal with', () => {
	const prism = createPrism('T');
	group(prism, 'G', 1, [[card('Sol Ring')], [card('Sol Ring')], [card('Opt')]]);
	prism.markedCards = ['Sol Ring'];
	const { prism: next, summary } = applySwap(prism, { outgoing: 'Opt', incoming: 'Sol Ring', deckIds: ['G3'] });
	assert.equal(summary.staleMarks, 4); // the Swap cost counts them: Opt's two marks plus the G1 and G2 child marks
	const sol = find(next, 'Sol Ring');
	assert.deepEqual(visible(sol.stripes).map((s) => s.deckName), ['G']);
	// ...but the sleeve still says "G1 and G2 only": it must be undone or listed to clear
	const listed = openRemovals(next).some((r) => r.cardName === 'Sol Ring');
	assert.ok(listed || !isCardDone(sol, new Set(next.markedCards)));
});

test('Separate sleeve and dedicated batches do not paint a deck mark on more copies than the deck runs', BUG(424), () => {
	const sleeved = createPrism('T');
	sleeved.decks = [deck('A', 1, [card('Forest', 2, { sleeve: 's1' })]), deck('B', 2, [card('Forest', 1, { sleeve: 's1' })])];
	assert.equal(copiesFor(find(sleeved, 'Forest'), 'B'), 1);

	const dedicated = createPrism('T');
	dedicated.useDedicatedCommanderCopies = true;
	group(dedicated, 'G', 1, [[card('Krark', 2, { isCommander: true })], [card('Krark', 1)]]);
	const krark = find(dedicated, 'Krark');
	assert.equal(copiesFor(krark, 'G2'), 1);
	// the copy only G1 runs needs G1's child mark, as it gets with dedication off
	assert.ok(krark.batches.some((b) => visible(b.stripes).some((s) => s.deckName === 'G1')));
});

test('backup import: malformed card rows do not reach the batch derivation', async () => {
	const { buildPrismFromJson } = await import('../js/modules/prism-import.js');
	const backupDeck = (id, pos, cards) => ({ id, name: id, bracket: 3, color: '#111111', stripePosition: pos, cards });
	const prism = buildPrismFromJson({ decks: [
		backupDeck('A', 1, [card('Forest', 2), card('Forest', 3), card('Island', '3')]),
		backupDeck('B', 2, [card('Island', 3)]),
	] });
	const forest = find(prism, 'Forest');
	assert.equal(forest.totalQuantity, 5); // repeated rows sum, as repeated decklist lines do (#413)
	assert.equal(visible(forest.stripes).length, 1);
	assert.deepEqual(find(prism, 'Island').batches.map((b) => b.copyCount), [3]); // no 0-copy batch
});

test('a card leaving one variant of a group that all shared it lists no child mark to clear: none was painted', () => {
	const prism = createPrism('T');
	group(prism, 'G', 1, [[card('Sol Ring')], [card('Sol Ring')], [card('Sol Ring')]]);
	assert.deepEqual(visible(find(prism, 'Sol Ring').stripes).map((s) => s.deckName), ['G']);
	const { prism: next } = applySwap(prism, { outgoing: 'Sol Ring', incoming: 'Opt', deckIds: ['G3'] });
	assert.deepEqual(openRemovals(next).filter((r) => r.cardName === 'Sol Ring'), []);
});
