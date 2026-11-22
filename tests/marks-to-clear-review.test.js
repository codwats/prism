// #415: adversarial review of Marks to Clear and swap accounting. Each test is
// one scenario: a sequence of deck edits, Swaps, deletes or Unsplits, then the
// marks Marks to Clear lists against the marks really left on sleeves.
// Skipped tests reproduce open bugs; the skip names the issue.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};
// Permissive DOM fakes for the build-page handlers (as in stale-child-marks.test.js).
function fakeElement() {
	const own = { value: '', querySelectorAll: () => [], querySelector: () => null, closest: () => null };
	const el = new Proxy(function () {}, {
		get: (_, key) => {
			if (key in own) return own[key];
			if (key === Symbol.toPrimitive) return () => '';
			if (typeof key === 'symbol') return undefined;
			return el;
		},
		set: (_, key, v) => { own[key] = v; return true; },
		apply: () => el,
	});
	return el;
}
globalThis.document = { getElementById: () => fakeElement(), querySelector: () => null, querySelectorAll: () => [], createElement: () => fakeElement(), createTextNode: () => fakeElement(), body: fakeElement(), head: { querySelector: () => null } };
globalThis.window = { location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.fetch = async () => new Response('{}', { status: 500 });

const { createPrism, createDeck, createSplitGroup, processCards } = await import('../js/modules/processor.js');
const { isCardDone } = await import('../js/core/utils.js');
const { applySwap, openRemovals, removalOpenCopies } = await import('../js/modules/swap.js');
const { planSleeveReuse } = await import('../js/modules/sleeve-reuse.js');
const { mergeRemovedCards } = await import('../js/modules/storage.js');
const { state } = await import('../js/core/state.js');
const { handleEditClick, handleEditConfirm, handleDeleteConfirm, handleUnsplit } = await import('../js/features/deck-list.js');
state.elements = new Proxy({}, { get: (t, k) => (t[k] ??= fakeElement()) });

const card = (name, quantity = 1, isSideboard = false) =>
	({ name, quantity, isCommander: false, isBasicLand: false, ...(isSideboard ? { isSideboard } : {}) });
const solRows = (prism) => openRemovals(prism).filter((r) => r.cardName === 'Sol Ring');
// The marks Marks to Clear lists for Sol Ring: [slot, color, open copies].
const solMarks = (prism) => solRows(prism)
	.map((r) => [r.stripePosition, r.deckColor, removalOpenCopies(r)])
	.sort((a, b) => a[0] - b[0]);
// Every batch of every card Done, the way marking each sleeve leaves it.
function markAll(prism) {
	prism.markedCards = processCards(prism).flatMap((c) => (c.batches.length === 1 ? [c.name] : c.batches.map((b) => b.key)));
	return prism;
}
const solDone = (prism) => isCardDone(processCards(prism).find((c) => c.name === 'Sol Ring'), new Set(prism.markedCards));
// Sleeves Sleeve reuse counts as freed for Sol Ring, marked or blank.
const solFreed = (prism) => {
	const plan = planSleeveReuse(prism);
	return [...plan.freedSleeves, ...plan.spareSleeves].filter((s) => s.cardName === 'Sol Ring').reduce((n, s) => n + s.copies, 0);
};
const swap = (prism, outgoing, incoming, deckIds, copies = 1) =>
	applySwap(prism, { outgoing, incoming, deckIds, copies }).prism;

// Split group G (Side A slot 1, #AAAAAA): variants G1, G2... on Side B 48, 47...
function group(variantCards) {
	const prism = createPrism('T');
	const g = createSplitGroup({ id: 'G', name: 'G', sideAPosition: 1, sideAColor: '#AAAAAA' });
	prism.decks = variantCards.map((cards, i) => createDeck({
		id: `G${i + 1}`, name: `G${i + 1}`, bracket: 3, color: `#00000${i + 1}`,
		stripePosition: 48 - i, cards, splitGroupId: 'G',
	}));
	g.childDeckIds = prism.decks.map((d) => d.id);
	prism.splitGroups.push(g);
	return prism;
}

// Two Constructed decks (no commander): Burn (slot 1) runs Sol Ring main 2 +
// Sideboard 1, Rogues (slot 2) runs 1, so 1 copy is pooled and 2 are Burn's own.
function constructed() {
	const prism = createPrism('C');
	prism.decks = [
		createDeck({ id: 'B', name: 'Burn', bracket: 2, color: '#FF0000', stripePosition: 1,
			cards: [card('Sol Ring', 2), card('Sol Ring', 1, true), card('Opt', 3)] }),
		createDeck({ id: 'R', name: 'Rogues', bracket: 2, color: '#0000FF', stripePosition: 2,
			cards: [card('Sol Ring'), card('Ponder')] }),
	];
	return prism;
}

// A decklist edit through the real Edit dialog handler.
async function editDeck(prism, deckId, list, commander = 'Ayula, Queen Among Bears') {
	state.currentPrism = prism;
	handleEditClick(deckId);
	if (commander) {
		state.elements.deckCommander.value = commander;
		state.elements.deckList.value = `Commander\n1 ${commander}\n\n${list}`;
	} else {
		state.elements.deckList.value = list;
	}
	await handleEditConfirm();
	return state.currentPrism;
}

// ---------------------------------------------------------------------------
// Split groups: the parent Side A stripe (leads 1 and 3 from #415)
// ---------------------------------------------------------------------------

test('a card leaving the only variant that held it lists the parent stripe too', { skip: '#509' }, () => {
	// Sol Ring is painted with G's Side A stripe (1) and G1's Side B stripe (48).
	const prism = group([[card('Sol Ring')], [card('Opt')]]);
	const next = swap(prism, 'Sol Ring', 'Island', ['G1']);
	assert.deepEqual(solMarks(next), [[1, '#AAAAAA', 1], [48, '#000001', 1]]);
});

test('a card leaving every variant that held it (some, not all) lists the parent stripe too', { skip: '#509' }, () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Opt')]]);
	const next = swap(prism, 'Sol Ring', 'Island', ['G1', 'G2']);
	// One copy per variant, each painted with the parent stripe and its own child stripe.
	assert.deepEqual(solMarks(next), [[1, '#AAAAAA', 2], [47, '#000002', 1], [48, '#000001', 1]]);
});

test('Unsplit: a card only a dropped variant held lists the parent stripe too', { skip: '#509' }, () => {
	state.currentPrism = group([[card('Opt')], [card('Sol Ring')]]);
	handleUnsplit('G');
	assert.deepEqual(solMarks(state.currentPrism), [[1, '#AAAAAA', 1], [47, '#000002', 1]]);
});

test('Unsplit: a card the kept variant still runs lists no parent stripe', () => {
	state.currentPrism = group([[card('Sol Ring')], [card('Sol Ring')]]);
	handleUnsplit('G');
	// Shared by both: no child stripe painted, and the kept deck takes slot 1 in G's color.
	assert.deepEqual(solMarks(state.currentPrism), []);
});

test('a card leaving one variant while another still runs it lists only the child stripe', () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Opt')]]);
	const next = swap(prism, 'Sol Ring', 'Island', ['G1']);
	assert.deepEqual(solMarks(next), [[48, '#000001', 1]]);
});

// ---------------------------------------------------------------------------
// Unsplit then edit (lead 2 from #415)
// ---------------------------------------------------------------------------

test('after Unsplit, the kept deck dropping the card keeps its old child stripe listed', { skip: '#510' }, async () => {
	state.currentPrism = group([[card('Sol Ring'), card('Opt')], [card('Opt')]]);
	handleUnsplit('G');
	// G1 is now standalone at slot 1 in #AAAAAA; its old Side B stripe at 48 is stale.
	assert.deepEqual(solMarks(state.currentPrism), [[48, '#000001', 1]]);
	const next = await editDeck(state.currentPrism, 'G1', 'Deck\n1 Opt');
	// The sleeve still has both: the slot 1 stripe and the stale slot 48 stripe.
	assert.deepEqual(solMarks(next), [[1, '#AAAAAA', 1], [48, '#000001', 1]]);
});

// ---------------------------------------------------------------------------
// Constructed decks: main + Sideboard copies are one card with one mark (#29)
// ---------------------------------------------------------------------------

test('Constructed: a plain Swap of every copy writes one row for main + Sideboard', () => {
	const next = swap(constructed(), 'Sol Ring', 'Island', ['B'], 3);
	assert.deepEqual(solRows(next).map((r) => [r.deckId, r.previousQuantity, r.newQuantity]), [['B', 3, 0]]);
	// Island takes the zones the copies left: 2 main, 1 Sideboard.
	const islands = next.decks[0].cards.filter((c) => c.name === 'Island').map((c) => [c.quantity, !!c.isSideboard]);
	assert.deepEqual(islands.sort(), [[1, true], [2, false]]);
});

test('Constructed: swapping every copy back clears the row and keeps the card Done', () => {
	const prism = markAll(constructed());
	const out = swap(prism, 'Sol Ring', 'Island', ['B'], 3);
	const back = swap(out, 'Island', 'Sol Ring', ['B'], 3);
	assert.deepEqual(solRows(back), []);
	assert.ok(solDone(back));
});

test('Constructed edit: moving a copy from main to Sideboard writes no row and keeps Done', async () => {
	const prism = markAll(constructed());
	const next = await editDeck(prism, 'B', '1 Sol Ring\n3 Opt\n\nSideboard\n2 Sol Ring', null);
	assert.deepEqual(solRows(next), []);
	assert.ok(solDone(next));
});

test('Constructed edit: cutting the Sideboard copy lists 1 of 3; adding it back clears the row', async () => {
	const prism = markAll(constructed());
	const cut = await editDeck(prism, 'B', '2 Sol Ring\n3 Opt', null);
	assert.deepEqual(solRows(cut).map((r) => [r.previousQuantity, r.newQuantity, removalOpenCopies(r)]), [[3, 2, 1]]);
	const back = await editDeck(cut, 'B', '2 Sol Ring\n3 Opt\n\nSideboard\n1 Sol Ring', null);
	assert.deepEqual(solRows(back), []);
});

test('Constructed delete: one row for main + Sideboard copies', () => {
	state.currentPrism = constructed();
	state.deckToDelete = 'B';
	handleDeleteConfirm();
	assert.deepEqual(solRows(state.currentPrism).map((r) => [r.deckId, r.previousQuantity, r.newQuantity]), [['B', 3, 0]]);
});

test('Constructed: Sleeve reuse frees the cut Sideboard copy once, not per zone', async () => {
	const cut = await editDeck(markAll(constructed()), 'B', '2 Sol Ring\n3 Opt', null);
	assert.equal(solFreed(cut), 1);
});

// ---------------------------------------------------------------------------
// Quantity sequences on one deck
// ---------------------------------------------------------------------------

function twoDecks(solCopies) {
	const prism = createPrism('Q');
	prism.decks = [
		createDeck({ id: 'A', name: 'Alpha', bracket: 3, color: '#FF0000', stripePosition: 1, cards: [card('Sol Ring', solCopies), card('Opt', 4)] }),
		createDeck({ id: 'Z', name: 'Zeta', bracket: 3, color: '#00FF00', stripePosition: 2, cards: [card('Ponder')] }),
	];
	prism.markedCards = ['Sol Ring'];
	return prism;
}

test('successive cuts 5 -> 4 -> 3 list 2 copies on one row', () => {
	const a = swap(twoDecks(5), 'Sol Ring', 'Opt', ['A']);
	const b = swap(a, 'Sol Ring', 'Opt', ['A']);
	assert.deepEqual(solRows(b).map((r) => [r.previousQuantity, r.newQuantity, removalOpenCopies(r)]), [[5, 3, 2]]);
});

test('a partial return lowers the open copies the way Sleeve reuse counts them', { skip: '#511' }, () => {
	const cut = swap(twoDecks(4), 'Sol Ring', 'Opt', ['A'], 2); // 4 -> 2: 2 stale sleeves
	const partial = swap(cut, 'Opt', 'Sol Ring', ['A']); // 2 -> 3: one copy comes back
	assert.equal(solFreed(partial), 1); // Sleeve reuse: 4 sleeves painted, 3 copies in the deck
	assert.deepEqual(solRows(partial).map(removalOpenCopies), [1]); // Marks to Clear must agree
});

test('a full return after a partial one clears the row', () => {
	const cut = swap(twoDecks(4), 'Sol Ring', 'Opt', ['A'], 2);
	const partial = swap(cut, 'Opt', 'Sol Ring', ['A']);
	const full = swap(partial, 'Opt', 'Sol Ring', ['A']);
	assert.deepEqual(solRows(full), []);
});

// ---------------------------------------------------------------------------
// Cross-device merge (mergeRemovedCards), row by row
// ---------------------------------------------------------------------------

test('merge: a cut on A and a deeper cut on B list the deeper cut, in either order', () => {
	const a = { cardName: 'Sol Ring', deckId: 'A', removedAt: '2026-11-01T10:10:00Z', previousQuantity: 4, newQuantity: 3 };
	const b = { cardName: 'Sol Ring', deckId: 'A', removedAt: '2026-11-01T10:11:00Z', previousQuantity: 3, newQuantity: 1 };
	for (const merged of [mergeRemovedCards([a], [b]), mergeRemovedCards([b], [a])]) {
		assert.equal(merged.length, 1);
		assert.equal(removalOpenCopies(merged[0]), 3);
	}
});

test('merge: a Sleeve reuse clear on one device and a further cut on the other both count', () => {
	const cleared = { cardName: 'Sol Ring', deckId: 'A', removedAt: '2026-11-01T10:10:00Z', previousQuantity: 4, newQuantity: 2, clearedQuantity: 1 };
	const cutMore = { cardName: 'Sol Ring', deckId: 'A', removedAt: '2026-11-01T10:12:00Z', previousQuantity: 4, newQuantity: 1 };
	for (const merged of [mergeRemovedCards([cleared], [cutMore]), mergeRemovedCards([cutMore], [cleared])]) {
		assert.equal(removalOpenCopies(merged[0]), 2); // 4 painted, 1 in the deck, 1 reused
	}
});

test('merge: Constructed rows from two devices key on card + deck, not zone', () => {
	const a = { cardName: 'Sol Ring', deckId: 'B', removedAt: '2026-11-01T10:10:00Z', previousQuantity: 3, newQuantity: 2 };
	const b = { cardName: 'sol ring', deckId: 'B', removedAt: '2026-11-01T10:11:00Z', previousQuantity: 3, newQuantity: 0 };
	const merged = mergeRemovedCards([a], [b]);
	assert.equal(merged.length, 1);
	assert.equal(removalOpenCopies(merged[0]), 3);
});
