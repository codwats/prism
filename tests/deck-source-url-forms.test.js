/**
 * sourceUrl (#377) is set by a URL add and a URL re-import and kept by a
 * manual decklist edit — driven through the real build-page handlers. DOM
 * elements are permissive fakes; the network is a mocked fetch serving one
 * Moxfield deck (Scryfall requests fail, which canonicalization tolerates).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear()
};
// Any element: remembers what is assigned, answers everything else with itself.
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
		apply: () => el
	});
	return el;
}
const elements = new Proxy({}, { get: (t, k) => (t[k] ??= fakeElement()) });
globalThis.document = { getElementById: () => fakeElement(), querySelector: () => null, querySelectorAll: () => [], createElement: () => fakeElement(), body: fakeElement(), head: { querySelector: () => null } };
globalThis.window = { location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} };

const deckFrom = (publicId, cards) => ({
	name: `Deck ${publicId}`, publicId,
	boards: {
		commanders: { cards: { c: { quantity: 1, card: { name: 'Ayula, Queen Among Bears', type_line: '' } } } },
		mainboard: { cards: Object.fromEntries(cards.map((n) => [n, { quantity: 1, card: { name: n, type_line: '' } }])) }
	}
});
globalThis.fetch = async (url, init) => {
	if (url === '/api/moxfield-edge') {
		const { publicId } = JSON.parse(init.body);
		return new Response(JSON.stringify(deckFrom(publicId, publicId === 'first' ? ['Cultivate'] : ['Rampant Growth'])));
	}
	return new Response('{}', { status: 500 });
};

const { state } = await import('../js/core/state.js');
const { createPrism } = await import('../js/modules/processor.js');
const { handleMoxfieldImport, handleEditUrlImport } = await import('../js/features/deck-import.js');
const { handleDeckSubmit } = await import('../js/features/deck-form.js');
const { handleEditClick, handleEditConfirm } = await import('../js/features/deck-list.js');

state.elements = elements;
state.currentPrism = createPrism('T');

test('URL add sets sourceUrl, URL re-import repoints it, a manual edit keeps it', async () => {
	elements.moxfieldUrl.value = 'https://moxfield.com/decks/first';
	await handleMoxfieldImport();
	elements.deckColor.value = '#FF0000';
	await handleDeckSubmit();
	const [deck] = state.currentPrism.decks;
	assert.equal(deck.sourceUrl, 'https://moxfield.com/decks/first');

	handleEditClick(deck.id);
	elements.editImportUrl.value = 'https://moxfield.com/decks/second';
	await handleEditUrlImport();
	await handleEditConfirm();
	const reimported = state.currentPrism.decks[0];
	assert.ok(reimported.cards.some((c) => c.name === 'Rampant Growth'), 'the re-import was saved');
	assert.equal(reimported.sourceUrl, 'https://moxfield.com/decks/second');

	handleEditClick(deck.id);
	elements.editDeckList.value = 'Commander\n1 Ayula, Queen Among Bears\n\nDeck\n1 Sol Ring';
	await handleEditConfirm();
	const edited = state.currentPrism.decks[0];
	assert.ok(edited.cards.some((c) => c.name === 'Sol Ring'), 'the manual edit was saved');
	assert.equal(edited.sourceUrl, 'https://moxfield.com/decks/second');

	assert.equal(JSON.parse(store.get('prism_data')).prisms[state.currentPrism.id].decks[0].sourceUrl,
		'https://moxfield.com/decks/second', 'saved to storage');
});

test('an edit import still in flight when the dialog reopens is ignored', async () => {
	const [deck] = state.currentPrism.decks;
	handleEditClick(deck.id);
	const pending = handleEditUrlImport('https://moxfield.com/decks/first');
	handleEditClick(deck.id); // new edit session before the fetch resolves
	state.editSourceUrl = null;
	elements.editDeckList.value = 'unchanged';
	await pending;
	assert.equal(elements.editDeckList.value, 'unchanged', 'stale list not written');
	assert.equal(state.editSourceUrl, null, 'stale sourceUrl not pending');
});
