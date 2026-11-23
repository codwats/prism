// #519: the Mark sleeves text search narrows the table and Audit, not SCRY's rows.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.document = { querySelector: () => null, getElementById: () => null };
globalThis.fetch = async () => { throw new TypeError('offline'); };

const { createPrism, createDeck } = await import('../js/modules/processor.js');
const { state } = await import('../js/core/state.js');
const { renderResults } = await import('../js/features/results.js');

const card = (name) => ({ name, quantity: 1, isCommander: false, isBasicLand: false });

test('SCRY rows ignore the table search; Audit rows keep it', () => {
	const prism = createPrism('Scry');
	prism.decks = [
		createDeck({ id: 'A', name: 'Alpha', bracket: 3, color: '#FF0000', stripePosition: 1, cards: [card('Sol Ring'), card('Crop Rotation')] }),
	];
	state.currentPrism = prism;
	state.elements = { resultsFilter: { value: 'all' }, oneMarkFilter: { checked: false }, resultsSearch: { value: 'sol' } };
	renderResults();
	assert.deepEqual(state.resultsView.map((c) => c.name), ['Sol Ring']);
	assert.deepEqual(state.scryView.map((c) => c.name).sort(), ['Crop Rotation', 'Sol Ring']);
});
