// The Tokens view on Mark sleeves (#412): its rows are what SCRY-Mode, Audit
// and the bulk marks walk, under their token: Done keys, and the card counts
// never see them. Scryfall data comes from the caches, as on a device offline.
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
globalThis.fetch = async () => { throw new TypeError('offline'); };

const attrs = (tokens) => ({ colorIdentity: [], typeLine: 'Artifact', manaCost: '{1}', cmc: 1, oracleId: 'o', usd: null, tokens });
store.set('prism_card_attributes', JSON.stringify({
	'smothering tithe': attrs([{ id: 'p-treasure', name: 'Treasure' }]),
	'sol ring': attrs([]),
}));
store.set('prism_token_types', JSON.stringify({
	'id:p-treasure': { oracleId: 'o-treasure', name: 'Treasure', detail: 'colorless', typeLine: 'Token Artifact — Treasure', scryfallId: 'p-treasure' },
}));

const { createPrism, createDeck } = await import('../js/modules/processor.js');
const { state } = await import('../js/core/state.js');
const { setCardMarked } = await import('../js/features/deck-list.js');
const { renderResults, shownMarkRows } = await import('../js/features/results.js');
const { getScryCardKey } = await import('../js/features/scry-mode.js');
const { auditRows } = await import('../js/features/audit.js');

const card = (name) => ({ name, quantity: 1, isCommander: false, isBasicLand: false });
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

test('the Tokens view lists cached tokens offline, and SCRY, Audit and bulk marks walk its rows', async () => {
	const prism = createPrism('Tokens');
	prism.decks = [
		createDeck({ id: 'A', name: 'Alpha', bracket: 3, color: '#FF0000', stripePosition: 1, cards: [card('Smothering Tithe'), card('Sol Ring')] }),
		createDeck({ id: 'B', name: 'Beta', bracket: 3, color: '#0000FF', stripePosition: 2, cards: [card('Smothering Tithe')] }),
	];
	state.currentPrism = prism;
	state.elements = { resultsFilter: { value: 'tokens' }, oneMarkFilter: { checked: false }, resultsSearch: { value: '' } };
	renderResults();
	await settle(); // the cached lookup resolves and renders again

	const [row] = state.resultsView;
	assert.equal(state.resultsView.length, 1);
	assert.equal(row.name, 'Treasure');
	assert.deepEqual(row.stripes.map((s) => s.deckName), ['Alpha', 'Beta']);
	assert.ok(!state.processedCards.some((c) => c.isToken), 'Total, Pool and Core read cards only');

	const key = getScryCardKey(row);
	assert.match(key, /^token:o-treasure\|#b\|A,B\|1$/);
	assert.deepEqual(shownMarkRows().keys, [key], 'bulk marks act on the token key');
	setCardMarked(key, true); // SCRY-Mode's Done
	assert.deepEqual(auditRows(state.resultsView, prism.markedCards), [row], 'Audit walks the Done token');
});
