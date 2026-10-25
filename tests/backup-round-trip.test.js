// JSON backup round-trip (#390): a restored PRISM keeps each deck's sourceUrl
// and cardsUpdatedAt and the PRISM's Planned swaps; old backups still import.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { exportToJSON } = await import('../js/modules/export.js');
const { buildPrismFromJson } = await import('../js/modules/prism-import.js');

const swap = {
	id: 's1',
	incoming: 'Sol Ring',
	deckId: 'd1',
	copies: 2,
	outgoing: 'Mind Stone',
	note: 'faster',
	createdAt: '2026-10-01T00:00:00Z',
	updatedAt: '2026-10-02T00:00:00Z',
};

function prism() {
	return {
		id: 'p1',
		name: 'P',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		splitGroups: [],
		markedCards: [],
		removedCards: [],
		plannedSwaps: [swap],
		decks: [
			{
				id: 'd1', name: 'Linked', bracket: 3, color: '#FF0000', stripePosition: 1, splitGroupId: null,
				cards: [{ name: 'Mind Stone', quantity: 1, isCommander: false, isBasicLand: false }],
				createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
				cardsUpdatedAt: '2026-03-01T00:00:00Z', sourceUrl: 'https://moxfield.com/decks/abc',
			},
			{
				id: 'd2', name: 'Pasted', bracket: 2, color: '#00FF00', stripePosition: 2, splitGroupId: null,
				cards: [{ name: 'Mind Stone', quantity: 1, isCommander: false, isBasicLand: false }],
				createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
				cardsUpdatedAt: '2026-03-05T00:00:00Z',
			},
		],
	};
}

for (const preserveId of [true, false]) {
	test(`backup restores sourceUrl, cardsUpdatedAt and Planned swaps (preserveId ${preserveId})`, () => {
		const restored = buildPrismFromJson(JSON.parse(exportToJSON(prism())), { preserveId });
		const [linked, pasted] = restored.decks;
		assert.equal(linked.sourceUrl, 'https://moxfield.com/decks/abc');
		assert.equal(linked.cardsUpdatedAt, '2026-03-01T00:00:00Z');
		assert.equal(pasted.sourceUrl ?? null, null);
		assert.equal(pasted.cardsUpdatedAt, '2026-03-05T00:00:00Z');
		assert.deepEqual(restored.plannedSwaps, [swap]);
	});
}

test('malformed Planned swaps are dropped on import', () => {
	const json = JSON.parse(exportToJSON(prism()));
	json.prism.plannedSwaps.push(
		null,
		'Sol Ring',
		{ id: 's2', deckId: 'd1' }, // no incoming
		{ id: 's3', incoming: 'Arcane Signet', deckId: 'gone' }, // deck not in backup
		{ id: 's4', incoming: 'Arcane Signet', deckId: 'd1', copies: 'lots', outgoing: 5, note: {} },
	);
	const restored = buildPrismFromJson(json);
	assert.deepEqual(restored.plannedSwaps.map((s) => s.id), ['s1', 's4']);
	const s4 = restored.plannedSwaps[1];
	assert.equal(s4.copies, 1);
	assert.equal('outgoing' in s4, false);
	assert.equal('note' in s4, false);
});

test('a backup in the old format, without these fields, still imports', () => {
	const restored = buildPrismFromJson({
		prism: {
			id: 'old', name: 'Old',
			decks: [{ id: 'd1', name: 'A', commander: 'Atraxa', bracket: 3, color: '#FF0000', stripePosition: 1,
				cards: [{ name: 'Atraxa', quantity: 1 }], createdAt: '2025-01-01T00:00:00Z' }],
		},
	});
	assert.equal(restored.decks[0].sourceUrl ?? null, null);
	assert.equal(restored.decks[0].cardsUpdatedAt, '2025-01-01T00:00:00Z');
	assert.deepEqual(restored.plannedSwaps, []);
});

test('the backup keeps its derived fields', () => {
	const json = JSON.parse(exportToJSON(prism()));
	const deck = json.prism.decks[0];
	assert.equal(typeof deck.commander, 'string');
	assert.equal(typeof deck.colorName, 'string');
	assert.equal(json.prism.cards[0].name, 'Mind Stone');
	assert.equal(json.prism.cards[0].copiesNeeded, 1);
});
