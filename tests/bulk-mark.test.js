// Bulk marks on the shown rows (#454) must write exactly what ticking each
// shown row one by one writes: the same markedCards keys (plain, `|#b|` batch,
// pass) and the same tombstones, with one save.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};
// renderResults reaches for the table header; no tbody, so it stops after filtering.
globalThis.document = { querySelector: () => null, getElementById: () => null };

const { createPrism, createDeck } = await import('../js/modules/processor.js');
const { isCardDone } = await import('../js/core/utils.js');
const { state } = await import('../js/core/state.js');
const { setCardMarked } = await import('../js/features/deck-list.js');
const { renderResults, shownMarkRows, toggleCardExpanded } = await import('../js/features/results.js');
const { bulkMarkTargets, applyBulkMark } = await import('../js/features/bulk-mark.js');

const card = (name, quantity = 1) => ({ name, quantity, isCommander: false, isBasicLand: false });

function basePrism() {
	const prism = createPrism('Bulk');
	prism.decks = [
		createDeck({ id: 'A', name: 'Alpha', bracket: 3, color: '#FF0000', stripePosition: 1, cards: [
			card('Sol Ring'), card('Lightning Bolt'), card('Forest', 5), card('Mountain', 4), card('Island', 3),
		] }),
		createDeck({ id: 'B', name: 'Beta', bracket: 3, color: '#0000FF', stripePosition: 2, cards: [
			card('Sol Ring'), card('Forest', 2), card('Mountain', 1), card('Island', 3),
		] }),
	];
	return prism;
}

// Forest is expanded (its batch rows show); Mountain stays collapsed.
toggleCardExpanded('Forest');

function setView({ search = '', oneMark = false }) {
	state.elements = {
		resultsFilter: { value: 'all' },
		oneMarkFilter: { checked: oneMark },
		resultsSearch: { value: search },
	};
}

function tombstones(prismId) {
	const data = JSON.parse(localStorage.getItem('prism_data'));
	return Object.keys(data.syncState.prismBaselines[prismId]?.unmarkedCards || {}).sort();
}

// Fresh PRISM with `premarked` row keys ticked, view applied and rendered.
function start(view, premarked) {
	store.clear();
	state.currentPrism = basePrism();
	setView(view);
	renderResults();
	for (const key of premarked) setCardMarked(key, true);
	renderResults();
}

// Tick (or untick) each shown row that differs, one checkbox at a time.
function rowByRow(marked) {
	const markedSet = new Set(state.currentPrism.markedCards);
	for (const key of shownMarkRows().keys) {
		if (markedSet.has(key) !== marked) {
			setCardMarked(key, marked);
			renderResults();
		}
	}
}

function bulk(marked) {
	applyBulkMark(bulkMarkTargets(marked).keys, marked);
}

function run(view, premarked, step) {
	start(view, premarked);
	step(true);
	const afterMark = [...state.currentPrism.markedCards];
	step(false);
	return {
		afterMark,
		afterClear: [...state.currentPrism.markedCards],
		tombstones: tombstones(state.currentPrism.id),
		stamped: state.currentPrism.markedCardsUpdatedAt === state.currentPrism.updatedAt,
	};
}

test('search view: single-batch, expanded multi-batch, collapsed multi-batch and a hidden row', () => {
	const view = { search: 'o' }; // hides Island
	start(view, []);
	const forest = state.processedCards.find((c) => c.name === 'Forest');
	const mountain = state.processedCards.find((c) => c.name === 'Mountain');
	const island = state.processedCards.find((c) => c.name === 'Island');
	assert.equal(forest.batches.length, 2);
	assert.equal(mountain.batches.length, 2);
	const premarked = ['Sol Ring', 'Island', mountain.batches[0].key];

	const { keys, collapsed } = shownMarkRows();
	assert.deepEqual([...keys].sort(), ['Lightning Bolt', 'Sol Ring', ...forest.batches.map((b) => b.key)].sort());
	assert.equal(collapsed, 1, 'collapsed Mountain is skipped, not marked as its batches');

	const bulkRun = run(view, premarked, bulk);
	const rowRun = run(view, premarked, rowByRow);
	assert.deepEqual(bulkRun, rowRun);
	assert.ok(bulkRun.stamped, 'markedCardsUpdatedAt bumped with updatedAt');

	// Mark: single-batch rows get plain + batch key, multi-batch rows only batch keys.
	for (const k of ['Sol Ring', 'Lightning Bolt', ...forest.batches.map((b) => b.key)]) {
		assert.ok(bulkRun.afterMark.includes(k), k);
	}
	assert.ok(!bulkRun.afterMark.includes('Forest'), 'no plain name for a multi-batch card');
	// Clear leaves rows the view hid, including the collapsed card's batch.
	assert.deepEqual([...bulkRun.afterClear].sort(), ['Island', island.batches[0].key, mountain.batches[0].key].sort());
	assert.ok(!bulkRun.tombstones.some((k) => k.startsWith('Island') || k.startsWith('Mountain')));
	assert.ok(bulkRun.tombstones.includes('Sol Ring') && bulkRun.tombstones.includes(forest.batches[1].key));
});

test('One Mark at a Time with a search: pass rows only', () => {
	const view = { search: 'island', oneMark: true };
	start(view, []);
	assert.deepEqual([...shownMarkRows().keys].sort(), ['Island|Alpha', 'Island|Beta']);

	const bulkRun = run(view, ['Sol Ring'], bulk);
	const rowRun = run(view, ['Sol Ring'], rowByRow);
	assert.deepEqual(bulkRun, rowRun);

	start(view, []);
	bulk(true);
	const island = state.processedCards.find((c) => c.name === 'Island');
	assert.ok(isCardDone(island, new Set(state.currentPrism.markedCards)), 'every pass key makes the card Done');
	assert.ok(!state.currentPrism.markedCards.includes('Island'), 'pass rows write pass keys, not the plain name');
	assert.deepEqual(bulkRun.tombstones, ['Island|Alpha', 'Island|Beta']);
	assert.deepEqual(bulkRun.afterClear, ['Sol Ring', state.processedCards.find((c) => c.name === 'Sol Ring').batches[0].key]);
});

test('Marks to Clear view offers no rows', () => {
	start({}, []);
	state.elements.resultsFilter.value = 'removed';
	renderResults();
	assert.deepEqual(shownMarkRows(), { keys: [], collapsed: 0 });
});
