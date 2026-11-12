// Marks to Clear for split-variant child marks (#423): a child mark an edit no
// longer needs while the variant keeps the card is listed (a stillInDeck row);
// a variant that painted no child mark lists nothing when the card leaves it.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};
// Permissive DOM fakes for the build-page handlers (as in deck-source-url-forms.test.js).
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
const { autoClearRemovedCards, handleEditClick, handleEditConfirm, handleDeleteConfirm } = await import('../js/features/deck-list.js');
state.elements = new Proxy({}, { get: (t, k) => (t[k] ??= fakeElement()) });

const card = (name, quantity = 1) => ({ name, quantity, isCommander: false, isBasicLand: false });
const find = (prism, name) => processCards(prism).find((c) => c.name === name);
const solRows = (prism) => openRemovals(prism).filter((r) => r.cardName === 'Sol Ring');

function group(variantCards, splitStyle = 'stripes') {
	const prism = createPrism('T');
	const g = createSplitGroup({ id: 'G', name: 'G', sideAPosition: 1, sideAColor: '#AAAAAA', splitStyle });
	prism.decks = variantCards.map((cards, i) => createDeck({
		id: `G${i + 1}`, name: `G${i + 1}`, bracket: 3, color: `#00000${i + 1}`,
		stripePosition: splitStyle === 'dots' ? null : 48 - i, cards, splitGroupId: 'G',
	}));
	g.childDeckIds = prism.decks.map((d) => d.id);
	prism.splitGroups.push(g);
	return prism;
}
const swap = (prism, outgoing, incoming, deckIds) => applySwap(prism, { outgoing, incoming, deckIds }).prism;

test('stripes: a gained variant lists the stale child stripes as stillInDeck rows; the card stays Done', () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Opt')]]);
	prism.markedCards = ['Sol Ring'];
	const next = swap(prism, 'Opt', 'Sol Ring', ['G3']);
	assert.deepEqual(solRows(next).map((r) => [r.deckId, r.stripePosition, r.stillInDeck, removalOpenCopies(r)]),
		[['G1', 48, true, 1], ['G2', 47, true, 1]]);
	assert.ok(isCardDone(find(next, 'Sol Ring'), new Set(next.markedCards)));
});

test('dots: the second variant gaining the card lists the first variant\'s dot at the group slot', () => {
	const prism = group([[card('Sol Ring')], [card('Opt')]], 'dots');
	prism.markedCards = ['Sol Ring'];
	const next = swap(prism, 'Opt', 'Sol Ring', ['G2']);
	assert.deepEqual(solRows(next).map((r) => [r.deckId, r.stripePosition, r.stillInDeck]), [['G1', 1, true]]);
	assert.ok(next.markedCards.includes('Sol Ring'));
});

test('dots: leaving one variant of a card both shared lists nothing (no dot was painted)', () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')]], 'dots');
	prism.markedCards = ['Sol Ring'];
	const next = swap(prism, 'Sol Ring', 'Opt', ['G2']);
	assert.deepEqual(solRows(next), []);
	assert.ok(!next.markedCards.includes('Sol Ring')); // G1 now needs its dot
});

test('a card leaving every variant at once still lists a row for the parent stripe', () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Sol Ring')]]);
	const next = swap(prism, 'Sol Ring', 'Opt', ['G1', 'G2', 'G3']);
	// No child stripe was painted: the row points at the group's own stripe.
	assert.deepEqual(solRows(next).map((r) => [r.deckName, r.stripePosition, r.deckColor]), [['G', 1, '#AAAAAA']]);
});

test('a stillInDeck row closes when the variant needs its child mark again, and Done holds', () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Opt')]]);
	prism.markedCards = ['Sol Ring'];
	const shared = swap(prism, 'Opt', 'Sol Ring', ['G3']);
	const back = swap(shared, 'Sol Ring', 'Opt', ['G3']);
	assert.deepEqual(solRows(back), []);
	assert.ok(back.markedCards.includes('Sol Ring')); // G1 and G2 stripes are still painted
});

test('row identity: a stillInDeck row the card then leaves becomes a plain removal row', () => {
	const prism = group([[card('Sol Ring', 2)], [card('Sol Ring', 2)], [card('Opt', 2)]]);
	const shared = applySwap(prism, { outgoing: 'Opt', incoming: 'Sol Ring', deckIds: ['G3'], copies: 2 }).prism;
	assert.equal(solRows(shared).find((r) => r.deckId === 'G1').stillInDeck, true);
	const left = applySwap(shared, { outgoing: 'Sol Ring', incoming: 'Opt', deckIds: ['G1'], copies: 2 }).prism;
	const row = solRows(left).find((r) => r.deckId === 'G1');
	// Every G1 copy left: clear G1's mark from both, and the sleeves count as left.
	assert.equal(row.stillInDeck, undefined);
	assert.equal(removalOpenCopies(row), 2);
	assert.equal(row.newQuantity, 0);
});

test('a copy leaving a variant with a stillInDeck row keeps every stale copy listed', () => {
	const prism = group([[card('Sol Ring', 2)], [card('Sol Ring', 2)], [card('Opt', 2)]]);
	const shared = applySwap(prism, { outgoing: 'Opt', incoming: 'Sol Ring', deckIds: ['G3'], copies: 2 }).prism;
	const one = swap(shared, 'Sol Ring', 'Opt', ['G1']); // G1 keeps 1: both copies still carry the G1 stripe
	const row = solRows(one).find((r) => r.deckId === 'G1');
	assert.equal(row.stillInDeck, true);
	assert.equal(removalOpenCopies(row), 2);
});

test('an open plain row folds into the stillInDeck row: the copy that left and the one that stayed', () => {
	const prism = group([[card('Sol Ring', 2)], [card('Sol Ring', 2)], [card('Opt', 2)]]);
	const oneLeft = swap(prism, 'Sol Ring', 'Opt', ['G1']); // plain row: 1 copy left G1
	assert.equal(removalOpenCopies(solRows(oneLeft).find((r) => r.deckId === 'G1')), 1);
	const shared = applySwap(oneLeft, { outgoing: 'Opt', incoming: 'Sol Ring', deckIds: ['G3'], copies: 2 }).prism;
	const row = solRows(shared).find((r) => r.deckId === 'G1');
	assert.equal(row.stillInDeck, true);
	assert.equal(removalOpenCopies(row), 2);
});

test('a stillInDeck row survives a later edit of the same deck', () => {
	const prism = group([[card('Sol Ring'), card('Opt')], [card('Sol Ring')], [card('Opt')]]);
	const shared = swap(prism, 'Opt', 'Sol Ring', ['G3']);
	const edited = swap(shared, 'Opt', 'Island', ['G1']); // runs clearReturnedRemovals on G1
	assert.deepEqual(solRows(edited).map((r) => r.deckId), ['G1', 'G2']);
	state.currentPrism = edited;
	assert.equal(autoClearRemovedCards(edited.decks[0].cards), 0);
	assert.equal(solRows(state.currentPrism).length, 2);
});

test('Sleeve reuse counts no freed or spare sleeve from a stillInDeck row', () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Opt')]]);
	const next = swap(prism, 'Opt', 'Sol Ring', ['G3']);
	const plan = planSleeveReuse(next);
	assert.ok(!plan.freedSleeves.some((s) => s.cardName === 'Sol Ring'));
	assert.ok(!plan.spareSleeves.some((s) => s.cardName === 'Sol Ring'));
	assert.equal(plan.prep.stayClears ?? 0, 0);
});

test('sync merge carries stillInDeck on the newer row and drops it when a removal is newer', () => {
	const flagged = { cardName: 'Sol Ring', deckId: 'G1', removedAt: '2026-01-02', previousQuantity: 1, newQuantity: 0, stillInDeck: true };
	const older = { cardName: 'Sol Ring', deckId: 'G1', removedAt: '2026-01-01', previousQuantity: 1, newQuantity: 0 };
	assert.equal(mergeRemovedCards([flagged], [older])[0].stillInDeck, true);
	const newer = { ...older, removedAt: '2026-01-03' };
	assert.equal(mergeRemovedCards([flagged], [newer])[0].stillInDeck, undefined);
	// An old closed plain row on the other device does not zero the newer stillInDeck row.
	const closed = { ...older, previousQuantity: 2, clearedQuantity: 2 };
	assert.equal(removalOpenCopies(mergeRemovedCards([flagged], [closed])[0]), 1);
	assert.equal(removalOpenCopies(mergeRemovedCards([closed], [flagged])[0]), 1);
});

// Through the real build-page handlers: a decklist edit and a variant delete.
async function editDeck(prism, deckId, list) {
	state.currentPrism = prism;
	handleEditClick(deckId);
	state.elements.editDeckCommander.value = 'Ayula, Queen Among Bears';
	state.elements.editDeckList.value = `Commander\n1 Ayula, Queen Among Bears\n\n${list}`;
	await handleEditConfirm();
	return state.currentPrism;
}

test('deck edit: gaining the card lists the stale child stripes; leaving a shared variant lists none', async () => {
	const prism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Opt')]]);
	prism.markedCards = ['Sol Ring'];
	const shared = await editDeck(prism, 'G3', 'Deck\n1 Opt\n1 Sol Ring');
	assert.deepEqual(solRows(shared).map((r) => [r.deckId, r.stillInDeck]), [['G1', true], ['G2', true]]);
	assert.ok(shared.markedCards.includes('Sol Ring'));

	const all = group([[card('Sol Ring')], [card('Sol Ring')], [card('Sol Ring')]]);
	const left = await editDeck(all, 'G3', 'Deck\n1 Opt');
	assert.deepEqual(solRows(left), []);
});

test('deck delete: a variant that painted no child mark lists none', () => {
	state.currentPrism = group([[card('Sol Ring')], [card('Sol Ring')], [card('Sol Ring')]]);
	state.deckToDelete = 'G3';
	handleDeleteConfirm();
	assert.deepEqual(solRows(state.currentPrism), []);
});
