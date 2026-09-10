/**
 * #212 — a lapsed Membership pauses cloud writes and keeps cloud reads. The
 * state must be shown and dated, so the two pieces the dated notice is built
 * from are what's checked here: where the date comes from, and how it reads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage shim so storage.js functions run under node:test.
const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { getLastCloudSyncDate, importAllData } = await import('../js/modules/storage.js');
const { pausedSyncDetail } = await import('../js/core/utils.js');

function seedBaselines(baselines) {
	store.set('prism_data', JSON.stringify({
		version: 2,
		currentPrismId: null,
		prisms: {},
		preferences: {},
		syncState: { prismBaselines: baselines, deletedPrisms: {} },
	}));
}

test('getLastCloudSyncDate reads one prism baseline', () => {
	seedBaselines({ a: { updatedAt: '2026-03-12T10:00:00.000Z' } });
	assert.equal(getLastCloudSyncDate('a'), '2026-03-12T10:00:00.000Z');
});

test('getLastCloudSyncDate takes the newest baseline across prisms', () => {
	seedBaselines({
		a: { updatedAt: '2026-03-12T10:00:00.000Z' },
		b: { updatedAt: '2026-05-01T10:00:00.000Z' },
		c: { updatedAt: null },
	});
	assert.equal(getLastCloudSyncDate(), '2026-05-01T10:00:00.000Z');
});

test('getLastCloudSyncDate is null when nothing was ever synced', () => {
	// The notice must not date a sync that never happened.
	seedBaselines({});
	assert.equal(getLastCloudSyncDate(), null);
	seedBaselines({ a: { updatedAt: null } });
	assert.equal(getLastCloudSyncDate(), null);
	assert.equal(getLastCloudSyncDate('missing'), null);
});

test('a logged-out import records no baseline', () => {
	// A baseline claims "this is what the cloud holds". Recording one for an
	// import that never went to the cloud would date the paused notice off a
	// sync that never happened.
	store.clear();
	const ok = importAllData(JSON.stringify({
		version: 2,
		prisms: {
			p1: {
				id: 'p1',
				name: 'Imported',
				decks: [],
				splitGroups: [],
				markedCards: [],
				removedCards: [],
				createdAt: '2026-03-12T10:00:00.000Z',
				updatedAt: '2026-03-12T10:00:00.000Z',
			},
		},
	}));
	assert.equal(ok, true);
	assert.equal(getLastCloudSyncDate(), null);
});

test('pausedSyncDetail names the year only when it is not the current one', () => {
	// Month naming is the runtime locale's business; the year is ours.
	const thisYear = new Date().getFullYear();
	const current = pausedSyncDetail(`${thisYear}-03-12T10:00:00`);
	assert.match(current, /^Your collection is safe; the last synced copy is from .*12.*\.$/);
	assert.doesNotMatch(current, new RegExp(String(thisYear)));
	assert.match(pausedSyncDetail('2019-03-12T10:00:00'), /2019/);
});
