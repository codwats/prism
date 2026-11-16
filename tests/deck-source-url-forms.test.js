/**
 * The one deck form (#450) and sourceUrl (#377), driven through the real
 * build-page handlers. sourceUrl is set by a URL add and a URL re-import and
 * kept by a manual decklist edit; the mode flag routes submit, and a pending
 * URL from one mode never reaches the other mode's save. DOM elements are
 * permissive fakes; the network is a mocked fetch serving Moxfield decks
 * (Scryfall requests fail, which canonicalization tolerates).
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
const { createPrism, createDeck } = await import('../js/modules/processor.js');
const { handleDeckUrlImport } = await import('../js/features/deck-import.js');
const { handleDeckFormSubmit, setDeckFormMode, openAddDeckDialog, closeDeckDialog, deckFormSlot } = await import('../js/features/deck-form.js');
const { handleEditClick } = await import('../js/features/deck-list.js');

state.elements = elements;
state.currentPrism = createPrism('T');

const list = (card) => `Commander\n1 Ayula, Queen Among Bears\n\nDeck\n1 ${card}`;

test('URL add sets sourceUrl, URL re-import repoints it, a manual edit keeps it', async () => {
	setDeckFormMode('add');
	elements.deckUrl.value = 'https://moxfield.com/decks/first';
	await handleDeckUrlImport();
	elements.deckColor.value = '#FF0000';
	await handleDeckFormSubmit();
	const [deck] = state.currentPrism.decks;
	assert.equal(deck.sourceUrl, 'https://moxfield.com/decks/first');

	handleEditClick(deck.id);
	elements.deckUrl.value = 'https://moxfield.com/decks/second';
	await handleDeckUrlImport();
	await handleDeckFormSubmit();
	const reimported = state.currentPrism.decks[0];
	assert.ok(reimported.cards.some((c) => c.name === 'Rampant Growth'), 'the re-import was saved');
	assert.equal(reimported.sourceUrl, 'https://moxfield.com/decks/second');

	handleEditClick(deck.id);
	elements.deckList.value = list('Sol Ring');
	await handleDeckFormSubmit();
	const edited = state.currentPrism.decks[0];
	assert.ok(edited.cards.some((c) => c.name === 'Sol Ring'), 'the manual edit was saved');
	assert.equal(edited.sourceUrl, 'https://moxfield.com/decks/second');

	assert.equal(JSON.parse(store.get('prism_data')).prisms[state.currentPrism.id].decks[0].sourceUrl,
		'https://moxfield.com/decks/second', 'saved to storage');
});

test('the mode flag routes submit: edit saves the deck, add adds one, and a save ends in add mode', async () => {
	const [deck] = state.currentPrism.decks;
	handleEditClick(deck.id);
	assert.equal(state.deckFormMode, 'edit');
	assert.equal(state.deckToEdit, deck.id);
	elements.deckName.value = 'Renamed';
	await handleDeckFormSubmit();
	assert.equal(state.currentPrism.decks.length, 1, 'an edit adds no deck');
	assert.equal(state.currentPrism.decks[0].name, 'Renamed');
	assert.equal(state.deckFormMode, 'add');
	assert.equal(state.deckToEdit, null);

	openAddDeckDialog();
	assert.equal(state.deckFormMode, 'add');
	elements.deckName.value = 'Second';
	elements.deckCommander.value = 'Ayula, Queen Among Bears';
	elements.deckList.value = list('Opt');
	elements.deckColor.value = '#00FF00';
	await handleDeckFormSubmit();
	assert.equal(state.currentPrism.decks.length, 2);
	assert.equal(state.currentPrism.decks[0].name, 'Renamed', 'the add leaves the edited deck alone');
});

test('an Add import cancelled before save never reaches an Edit save', async () => {
	openAddDeckDialog();
	elements.deckUrl.value = 'https://moxfield.com/decks/first';
	await handleDeckUrlImport();
	assert.equal(state.addSourceUrl, 'https://moxfield.com/decks/first');
	closeDeckDialog();
	assert.equal(state.addSourceUrl, null);
	assert.equal(state.editSourceUrl, null);

	const second = state.currentPrism.decks.find((d) => d.name === 'Second');
	handleEditClick(second.id);
	elements.deckList.value = list('Ponder');
	await handleDeckFormSubmit();
	assert.equal(state.currentPrism.decks.find((d) => d.id === second.id).sourceUrl, undefined);
});

test('an Edit import cancelled before save never reaches an Add save', async () => {
	const second = state.currentPrism.decks.find((d) => d.name === 'Second');
	handleEditClick(second.id);
	elements.deckUrl.value = 'https://moxfield.com/decks/second';
	await handleDeckUrlImport();
	assert.equal(state.editSourceUrl, 'https://moxfield.com/decks/second');
	closeDeckDialog();
	assert.equal(state.editSourceUrl, null);
	assert.equal(state.currentPrism.decks.find((d) => d.id === second.id).sourceUrl, undefined, 'nothing saved');

	openAddDeckDialog();
	elements.deckName.value = 'Third';
	elements.deckCommander.value = 'Ayula, Queen Among Bears';
	elements.deckList.value = list('Brainstorm');
	elements.deckColor.value = '#0000FF';
	await handleDeckFormSubmit();
	assert.equal(state.currentPrism.decks.find((d) => d.name === 'Third').sourceUrl, undefined);
});

test('an import still in flight when the form changes mode or reopens is ignored', async () => {
	const [deck] = state.currentPrism.decks;
	openAddDeckDialog();
	const addPending = handleDeckUrlImport('https://moxfield.com/decks/first');
	handleEditClick(deck.id); // the Add import resolves into an Edit session
	elements.deckList.value = 'unchanged';
	await addPending;
	assert.equal(elements.deckList.value, 'unchanged', 'stale list not written');
	assert.equal(state.addSourceUrl, null);
	assert.equal(state.editSourceUrl, null);

	const editPending = handleDeckUrlImport('https://moxfield.com/decks/first');
	handleEditClick(deck.id); // new edit session before the fetch resolves
	elements.deckList.value = 'unchanged';
	await editPending;
	assert.equal(elements.deckList.value, 'unchanged', 'stale list not written');
	assert.equal(state.editSourceUrl, null, 'stale sourceUrl not pending');
	closeDeckDialog();
});

test('slot row: Add shows the next free slot with Change off; Edit opens Move for the deck or its group', () => {
	const prism = createPrism('S');
	const a = createDeck({ name: 'A', bracket: 2, color: '#111111', stripePosition: 1, cards: [] });
	const v = createDeck({ name: 'V', bracket: 2, color: '#222222', stripePosition: 48, cards: [], splitGroupId: 'g' });
	prism.decks = [a, v];
	prism.splitGroups = [{ id: 'g', name: 'G', sideAPosition: 2, sideAColor: '#333333', childDeckIds: [v.id], splitStyle: 'dots' }];

	assert.deepEqual(deckFormSlot(prism, 'add', null).change, null);
	assert.equal(deckFormSlot(prism, 'add', null).label, 'Side A - Slot 3');
	assert.deepEqual(deckFormSlot(prism, 'edit', a.id), { label: 'Side A - Slot 1', hint: '', change: { deckId: a.id } });
	const dot = deckFormSlot(prism, 'edit', v.id);
	assert.equal(dot.label, 'Side A - Slot 2');
	assert.deepEqual(dot.change, { groupId: 'g' });
});
