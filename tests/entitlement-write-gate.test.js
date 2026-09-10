/**
 * #212 — the entitlement verdict decides whether cloud writes are paused, and
 * auth publishes the signed-in user before that verdict lands. Anything that
 * writes immediately (Sync Now, a PRISM delete) must wait out the in-flight
 * read rather than race it, and must still write once the answer is "member".
 *
 * The whole module graph is real here; only the Supabase SDK is faked, with
 * the is_entitled RPC deliberately left unresolved so the window under test is
 * held open. node:test gives this file its own process, so installing globals
 * before the imports is safe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Every write the fake client is asked to perform, in order.
const writes = [];
let releaseEntitlement;
const entitlementRpc = new Promise(resolve => { releaseEntitlement = resolve; });

const RESULT_LIST = { data: [], error: null };
const RESULT_ONE = { data: null, error: null };

// A PostgREST-shaped builder: every step returns another builder, and awaiting
// any of them yields the canned result.
let upsertError = null;
function chain(result) {
  const record = (name) => () => { writes.push(name); return chain(result); };
  return {
    select: () => chain(result),
    eq: () => chain(result),
    order: () => chain(result),
    maybeSingle: () => chain(RESULT_ONE),
    single: () => chain(RESULT_ONE),
    insert: record('insert'),
    upsert: () => {
      writes.push('upsert');
      return chain(upsertError ? { data: null, error: upsertError } : result);
    },
    update: record('update'),
    delete: record('delete'),
    then: (onOk, onErr) => Promise.resolve(result).then(onOk, onErr)
  };
}

const fakeClient = {
  from: () => chain(RESULT_LIST),
  rpc: (name) => {
    if (name === 'is_entitled') return entitlementRpc;
    writes.push(`rpc:${name}`);
    return Promise.resolve({ data: null, error: null });
  },
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  }
};

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear()
};
// window.supabase already present => initAuth skips the CDN wait entirely.
globalThis.window = {
	supabase: { createClient: () => fakeClient },
	location: { hash: '' },
	addEventListener: () => {},
	removeEventListener: () => {}
};
globalThis.document = { head: { querySelector: () => null } };

const prism = (id) => ({
	id,
	name: id,
	decks: [{ id: `${id}-d1`, name: 'Deck', color: '#ff0000', bracket: 3, stripePosition: 1, cards: [], updatedAt: '2026-03-12T10:00:00.000Z' }],
	splitGroups: [],
	markedCards: [],
	removedCards: [],
	createdAt: '2026-03-12T10:00:00.000Z',
	updatedAt: '2026-03-12T10:00:00.000Z'
});

store.set('prism_data', JSON.stringify({
	version: 2,
	currentPrismId: 'p1',
	prisms: { p1: prism('p1'), p2: prism('p2') },
	preferences: {},
	syncState: { prismBaselines: {}, deletedPrisms: {} }
}));

const { ensureAuthReady } = await import('../js/modules/auth.js');
const {
	deletePrism,
	forceSyncCurrentPrism,
	isCloudWritePaused,
	importAllData,
	getLastCloudSyncDate
} = await import('../js/modules/storage.js');

// Let every already-queued microtask and timer-free continuation run.
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('no cloud write escapes while the is_entitled verdict is still in flight', async () => {
	const authReady = ensureAuthReady();
	await settle(); // auth resolves the session; syncWithSupabase reaches is_entitled

	// The verdict is pending. Both immediate write paths must stay silent.
	deletePrism('p2');
	const forced = forceSyncCurrentPrism();
	await settle();
	assert.deepEqual(writes, [], 'wrote to Supabase before entitlement was known');
	assert.equal(isCloudWritePaused(), false, 'a pending read is not a lapse verdict');

	// Verdict lands: a member. The waiting writes must now go through — the
	// guard defers them, it does not drop them.
	releaseEntitlement({ data: true, error: null });
	await authReady;
	await forced;
	await settle();

	assert.equal(isCloudWritePaused(), false);
	assert.ok(writes.includes('upsert'), `Sync Now never uploaded: ${JSON.stringify(writes)}`);
	assert.ok(writes.includes('delete'), `the deferred delete never ran: ${JSON.stringify(writes)}`);
});

test('an import records a baseline only once the upload succeeds', async () => {
	// A baseline is the local record of what the cloud holds, so it may only be
	// written after the upload that put it there returned success — otherwise a
	// failed import reads as already-synced and is never retried.
	const importOne = (id) => importAllData(JSON.stringify({ version: 2, prisms: { [id]: prism(id) } }));

	upsertError = { message: 'upstream rejected the prism' };
	assert.equal(importOne('p3'), true);
	await settle();
	assert.equal(getLastCloudSyncDate('p3'), null, 'failed upload still claimed a cloud copy');

	upsertError = null;
	assert.equal(importOne('p4'), true);
	await settle();
	assert.equal(getLastCloudSyncDate('p4'), '2026-03-12T10:00:00.000Z');
});
