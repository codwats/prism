import test from 'node:test';
import assert from 'node:assert/strict';

// storage.js touches localStorage inside functions; shim it like audit-fixes.test.js
const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { mergePrismVersions } = await import('../js/modules/storage.js');
const { createPrism } = await import('../js/modules/processor.js');
const { buildPrismFromJson } = await import('../js/modules/prism-import.js');

function prism(overrides = {}) {
	return {
		id: 'p1',
		name: 'P',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		decks: [],
		splitGroups: [],
		markedCards: [],
		removedCards: [],
		markedCardsUpdatedAt: null,
		useDedicatedCommanderCopies: false,
		useDedicatedCommanderCopiesUpdatedAt: null,
		...overrides,
	};
}

test('local toggle survives merge when cloud prism.updatedAt is newer', () => {
	// Desktop toggled the setting offline; phone marked cards after, so the
	// phone (cloud) copy has the newer prism.updatedAt and is basePrism.
	const local = prism({
		useDedicatedCommanderCopies: true,
		useDedicatedCommanderCopiesUpdatedAt: '2026-02-01T00:00:00Z',
		updatedAt: '2026-01-15T00:00:00Z',
	});
	const cloud = prism({
		updatedAt: '2026-02-02T00:00:00Z', // mark-toggle bumped it
	});

	const merged = mergePrismVersions(local, cloud, null);
	assert.equal(merged.useDedicatedCommanderCopies, true);
	assert.equal(merged.useDedicatedCommanderCopiesUpdatedAt, '2026-02-01T00:00:00Z');
});

test('newer cloud timestamp wins (stale tab self-heals)', () => {
	const local = prism(); // stale: flag false, timestamp null
	const cloud = prism({
		useDedicatedCommanderCopies: true,
		useDedicatedCommanderCopiesUpdatedAt: '2026-02-01T00:00:00Z',
	});

	const merged = mergePrismVersions(local, cloud, null);
	assert.equal(merged.useDedicatedCommanderCopies, true);
});

test('legacy null timestamps: first device to toggle wins', () => {
	const local = prism({
		useDedicatedCommanderCopies: true,
		useDedicatedCommanderCopiesUpdatedAt: '2026-02-01T00:00:00Z',
	});
	const cloud = prism(); // legacy row: false, null timestamp

	const merged = mergePrismVersions(local, cloud, null);
	assert.equal(merged.useDedicatedCommanderCopies, true);

	// and the field never rides basePrism: tie (both null) resolves local
	const tie = mergePrismVersions(prism({ useDedicatedCommanderCopies: true }), prism(), null);
	assert.equal(tie.useDedicatedCommanderCopies, true);
});

test('createPrism seeds false plus a timestamp', () => {
	const p = createPrism('T');
	assert.equal(p.useDedicatedCommanderCopies, false);
	assert.ok(p.useDedicatedCommanderCopiesUpdatedAt);
});

test('backup round-trip: flag restored, pre-feature backup restores as off', () => {
	const deck = { id: 'd1', name: 'D', bracket: 3, color: '#FF0000', stripePosition: 1, cards: [] };

	const restored = buildPrismFromJson({ prism: { name: 'B', decks: [deck], useDedicatedCommanderCopies: true } });
	assert.equal(restored.useDedicatedCommanderCopies, true);
	assert.ok(restored.useDedicatedCommanderCopiesUpdatedAt, 'restore stamps a fresh timestamp');

	const legacy = buildPrismFromJson({ prism: { name: 'B', decks: [deck] } });
	assert.equal(legacy.useDedicatedCommanderCopies, false);
});
