// Swap Queue sync (#364): Planned swaps merge by id on their own updatedAt,
// never on whole-PRISM last-write-wins, and a removed or applied one leaves a
// tombstone so a stale copy can't bring it back (it could be applied twice).
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { mergePrismVersions, savePrism, loadStorage } = await import('../js/modules/storage.js');

function swap(id, updatedAt = '2026-10-01T00:00:00Z', overrides = {}) {
	return { id, incoming: `Card ${id}`, deckId: 'd1', copies: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt, ...overrides };
}

function prism(plannedSwaps, updatedAt = '2026-10-01T00:00:00Z') {
	return { id: 'p1', name: 'P', createdAt: '2026-01-01T00:00:00Z', updatedAt, decks: [], splitGroups: [], markedCards: [], removedCards: [], plannedSwaps };
}

const ids = (p) => p.plannedSwaps.map((s) => s.id).sort();
const baseline = () => loadStorage().syncState.prismBaselines.p1;

test('two devices adding different Planned swaps keep both', () => {
	const merged = mergePrismVersions(prism([swap('s1')]), prism([swap('s2')], '2026-10-02T00:00:00Z'), null);
	assert.deepEqual(ids(merged), ['s1', 's2']);
});

test('the newer updatedAt wins, whichever side has the newer PRISM', () => {
	const local = prism([swap('s1', '2026-10-03T00:00:00Z', { note: 'local' })], '2026-10-01T00:00:00Z');
	const cloud = prism([swap('s1', '2026-10-02T00:00:00Z', { note: 'cloud' })], '2026-10-09T00:00:00Z');
	assert.equal(mergePrismVersions(local, cloud, null).plannedSwaps[0].note, 'local');
});

test('an applied Planned swap does not come back from the cloud copy', () => {
	store.clear();
	savePrism(prism([swap('s1'), swap('s2')]));
	savePrism(prism([swap('s2')], '2026-10-05T00:00:00Z')); // s1 applied
	assert.ok(baseline().deletedPlannedSwaps.s1, 'removing it writes a tombstone');

	const merged = mergePrismVersions(loadStorage().prisms.p1, prism([swap('s1'), swap('s2')]), baseline());
	assert.deepEqual(ids(merged), ['s2']);
});

test('a stale device drops a Planned swap another device applied', () => {
	// Synced baseline holds s1; the cloud no longer does.
	const synced = { updatedAt: '2026-10-01T00:00:00Z', plannedSwapUpdatedAts: { s1: '2026-10-01T00:00:00Z' } };
	const merged = mergePrismVersions(prism([swap('s1')]), prism([], '2026-10-05T00:00:00Z'), synced);
	assert.deepEqual(ids(merged), []);
});

test('a Planned swap applied elsewhere stays gone even if this device edited it since', () => {
	const synced = { updatedAt: '2026-10-01T00:00:00Z', plannedSwapUpdatedAts: { s1: '2026-10-01T00:00:00Z' } };
	const edited = swap('s1', '2026-10-04T00:00:00Z', { note: 'edited after A applied it' });
	const merged = mergePrismVersions(prism([edited]), prism([], '2026-10-03T00:00:00Z'), synced);
	assert.deepEqual(ids(merged), []);
});

test('with a baseline, the newer updatedAt still wins over a local edit', () => {
	const synced = { updatedAt: '2026-10-01T00:00:00Z', plannedSwapUpdatedAts: { s1: '2026-10-01T00:00:00Z' } };
	const local = prism([swap('s1', '2026-10-02T00:00:00Z', { note: 'local' })]);
	const cloud = prism([swap('s1', '2026-10-03T00:00:00Z', { note: 'cloud' })]);
	assert.equal(mergePrismVersions(local, cloud, synced).plannedSwaps[0].note, 'cloud');
});

test('a tombstoned Planned swap stays gone even if the cloud copy is newer', () => {
	const tombstoned = { updatedAt: '2026-10-01T00:00:00Z', deletedPlannedSwaps: { s1: '2026-10-02T00:00:00Z' } };
	const merged = mergePrismVersions(prism([]), prism([swap('s1', '2026-10-05T00:00:00Z')]), tombstoned);
	assert.deepEqual(ids(merged), []);
});
