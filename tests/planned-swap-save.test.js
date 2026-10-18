/**
 * Swap Queue (#364): saving a PRISM deletes only the Planned swap rows this
 * device has evidence it removed — a tombstone, or a swap the baseline shows
 * as synced that is no longer queued here. A row absent only because another
 * device queued it after this device's merge must survive the save.
 *
 * The module graph is real; only the Supabase SDK is faked, as in
 * entitlement-write-gate.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Every planned_swaps write: [operation, ...filters].
const swapWrites = [];

function chain(result, log = null) {
  const step = (name) => (...args) => { log?.push([name, ...args]); return chain(result, log); };
  return {
    select: () => chain(result, log),
    eq: step('eq'),
    in: step('in'),
    not: step('not'),
    order: () => chain(result, log),
    maybeSingle: () => chain({ data: null, error: null }, log),
    upsert: (rows) => { log?.push(['upsert', rows.map(r => r.id)]); return chain(result, log); },
    delete: () => { log?.push(['delete']); return chain(result, log); },
    then: (onOk, onErr) => Promise.resolve(result).then(onOk, onErr)
  };
}

const fakeClient = {
  from: (table) => chain({ data: [], error: null }, table === 'planned_swaps' ? swapWrites : null),
  rpc: (name) => {
    if (name === 'is_entitled') return Promise.resolve({ data: true, error: null });
    if (name === 'claim_backer_membership') {
      const result = Promise.resolve({ data: false, error: null });
      result.abortSignal = () => result;
      return result;
    }
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
globalThis.window = {
  supabase: { createClient: () => fakeClient },
  location: { hash: '' },
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.document = { head: { querySelector: () => null } };

const T = '2026-10-01T00:00:00.000Z';
// Edited since the last sync, so the login sync uploads it.
const EDITED = '2026-10-02T00:00:00.000Z';
const swap = (id) => ({ id, incoming: `Card ${id}`, deckId: 'd1', copies: 1, createdAt: T, updatedAt: T });

store.set('prism_data', JSON.stringify({
  version: 2,
  currentPrismId: 'p1',
  prisms: {
    p1: {
      id: 'p1', name: 'P', createdAt: T, updatedAt: EDITED, splitGroups: [], markedCards: [], removedCards: [],
      decks: [{ id: 'd1', name: 'A', color: '#ff0000', bracket: 3, stripePosition: 1, cards: [], updatedAt: T }],
      // s1 synced and still queued; s4 queued here, never synced.
      plannedSwaps: [swap('s1'), swap('s4')]
    }
  },
  preferences: {},
  syncState: {
    deletedPrisms: {},
    prismBaselines: {
      p1: {
        updatedAt: T,
        // s3 was synced and is no longer queued here (applied elsewhere).
        plannedSwapUpdatedAts: { s1: T, s3: T },
        // s2 was removed on this device.
        deletedPlannedSwaps: { s2: T }
      }
    }
  }
}));

const { ensureAuthReady } = await import('../js/modules/auth.js');

test('a save deletes only the Planned swaps this device removed, never a row it has not seen', async () => {
  await ensureAuthReady(); // the login sync uploads p1

  assert.deepEqual(swapWrites.find(w => w[0] === 'upsert'), ['upsert', ['s1', 's4']]);
  const deleteAt = swapWrites.findIndex(w => w[0] === 'delete');
  assert.ok(deleteAt >= 0, 'the removed swaps were never deleted');
  const filters = swapWrites.slice(deleteAt + 1);
  assert.deepEqual(filters, [['eq', 'prism_id', 'p1'], ['in', 'id', ['s2', 's3']]],
    'the delete must name its rows, not sweep everything not queued here');
});
