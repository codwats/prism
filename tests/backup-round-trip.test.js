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
		{ id: 's4', incoming: 'Arcane Signet', deckId: 'd1', copies: 'lots', outgoing: 5, note: {},
			createdAt: 'not-a-date', updatedAt: 'yesterday' },
	);
	const restored = buildPrismFromJson(json);
	assert.deepEqual(restored.plannedSwaps.map((s) => s.id), ['s1', 's4']);
	const s4 = restored.plannedSwaps[1];
	assert.equal(s4.copies, 1);
	assert.equal(s4.createdAt, restored.updatedAt);
	assert.equal(s4.updatedAt, restored.updatedAt);
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

// Untrusted ids and slots (#435): ids land in data-* attributes unescaped.
const SAFE_ID = /^[\w-]+$/;

test('ids with markup are regenerated and references follow them', () => {
	const bad = 'd"><img src=x onerror=alert(1)>';
	const badGroup = 'g <b>';
	const json = {
		id: 'p "x"', name: 'P',
		decks: [
			{ id: bad, name: 'V1', bracket: 3, color: '#FF0000', stripePosition: 25, splitGroupId: badGroup,
				cards: [{ name: 'Sol Ring', quantity: 1 }] },
			{ id: 'v2', name: 'V2', bracket: 3, color: '#00FF00', stripePosition: 26, splitGroupId: badGroup,
				cards: [{ name: 'Sol Ring', quantity: 1 }] },
		],
		splitGroups: [{ id: badGroup, name: 'G', sideAPosition: 1, sideAColor: '#0000FF', childDeckIds: [bad, 'v2'] }],
		plannedSwaps: [{ id: 's1', incoming: 'Mind Stone', deckId: bad, copies: 1 }],
		removedCards: [{ cardName: 'Arcane Signet', deckId: bad, deckColor: '#FF0000', previousQuantity: 1, newQuantity: 0,
			splitGroup: { id: badGroup, variants: [{ id: bad }, { id: 'v2' }] } }],
	};
	const restored = buildPrismFromJson(json);
	const [v1, v2] = restored.decks;
	const [group] = restored.splitGroups;
	assert.match(restored.id, SAFE_ID);
	assert.match(v1.id, SAFE_ID);
	assert.match(group.id, SAFE_ID);
	assert.equal(v2.id, 'v2');
	assert.equal(v1.splitGroupId, group.id);
	assert.equal(v2.splitGroupId, group.id);
	assert.deepEqual(group.childDeckIds, [v1.id, 'v2']);
	assert.equal(restored.plannedSwaps[0].deckId, v1.id);
	const [row] = restored.removedCards;
	assert.equal(row.deckId, v1.id);
	assert.equal(row.splitGroup.id, group.id);
	assert.deepEqual(row.splitGroup.variants.map((v) => v.id), [v1.id, 'v2']);
});

test('a normal backup keeps every id and every mark Done', async () => {
	const { processCards } = await import('../js/modules/processor.js');
	const { isCardDone } = await import('../js/core/utils.js');
	const p = prism();
	p.decks[1].cards[0].quantity = 2; // two batches: keys embed deck ids
	const before = processCards(p).find((c) => c.name === 'Mind Stone');
	p.markedCards = before.batches.map((b) => b.key);
	const restored = buildPrismFromJson(JSON.parse(exportToJSON(p)));
	assert.equal(restored.id, 'p1');
	assert.deepEqual(restored.decks.map((d) => d.id), ['d1', 'd2']);
	assert.equal(restored.plannedSwaps[0].deckId, 'd1');
	const after = processCards(restored).find((c) => c.name === 'Mind Stone');
	assert.equal(after.batches.length, 2);
	assert.equal(isCardDone(after, new Set(restored.markedCards)), true);
});

test('non-integer or out-of-range slots never reach the PRISM', () => {
	const deck = (id, stripePosition) => ({ id, name: id, bracket: 3, color: '#FF0000', stripePosition,
		cards: [{ name: 'Sol Ring', quantity: 1 }] });
	const restored = buildPrismFromJson({
		decks: [deck('a', '1" onmouseover="alert(1)'), deck('b', 49), deck('c', 2.5), deck('d', 0), deck('e', 48),
			{ ...deck('g', 30), splitGroupId: 'grp' }],
		splitGroups: [{ id: 'grp', name: 'G', sideAPosition: '3"><x', childDeckIds: ['g'] }],
	});
	assert.deepEqual(restored.decks.map((d) => d.stripePosition), [undefined, undefined, undefined, undefined, 48, 30]);
	assert.equal(restored.splitGroups[0].sideAPosition, undefined);
});

test('batch marks follow a deck whose unsafe id was replaced', async () => {
	const { processCards } = await import('../js/modules/processor.js');
	const { isCardDone } = await import('../js/core/utils.js');
	const p = prism();
	p.decks[1].cards[0].quantity = 2;
	p.decks[0].id = 'd"><x';
	const before = processCards(p).find((c) => c.name === 'Mind Stone');
	p.markedCards = before.batches.map((b) => b.key);
	const restored = buildPrismFromJson(JSON.parse(exportToJSON(p)));
	assert.notEqual(restored.decks[0].id, 'd"><x');
	const after = processCards(restored).find((c) => c.name === 'Mind Stone');
	assert.equal(isCardDone(after, new Set(restored.markedCards)), true);
});
