/**
 * Deck sourceUrl (#377) round-trips through the real storage load and save:
 * a cloud deck's source_url lands on the local deck, and an upload writes
 * every deck's sourceUrl back. Only the Supabase SDK is faked, as in
 * planned-swap-save.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const T = '2026-10-01T00:00:00.000Z';
const EDITED = '2026-10-02T00:00:00.000Z';
const deckUpserts = [];

const cloudRow = {
	id: 'p1', name: 'P', created_at: T, updated_at: T, split_groups: [], marked_cards: [], removed_cards: [], planned_swaps: [],
	decks: [{
		id: 'd2', name: 'B', color: '#00FF00', bracket: 3, stripe_position: 2, created_at: T, updated_at: T,
		source_url: 'https://archidekt.com/decks/42', deck_cards: []
	}]
};

function chain(result) {
	return {
		select: () => chain(result),
		eq: () => chain(result),
		in: () => chain(result),
		not: () => chain(result),
		order: () => chain(result),
		maybeSingle: () => chain({ data: null, error: null }),
		upsert: () => chain(result),
		delete: () => chain(result),
		insert: () => chain(result),
		then: (onOk, onErr) => Promise.resolve(result).then(onOk, onErr)
	};
}

const fakeClient = {
	from: (table) => {
		if (table === 'prisms') return chain({ data: [cloudRow], error: null });
		const c = chain({ data: [], error: null });
		if (table === 'decks') c.upsert = (rows) => { deckUpserts.push(...rows); return chain({ data: [], error: null }); };
		return c;
	},
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

store.set('prism_data', JSON.stringify({
	version: 2,
	currentPrismId: 'p1',
	prisms: {
		p1: {
			id: 'p1', name: 'P', createdAt: T, updatedAt: EDITED, splitGroups: [], markedCards: [], removedCards: [], plannedSwaps: [],
			decks: [{
				id: 'd1', name: 'A', color: '#FF0000', bracket: 3, stripePosition: 1, cards: [], createdAt: T, updatedAt: EDITED,
				sourceUrl: 'https://moxfield.com/decks/abc'
			}]
		}
	},
	preferences: {},
	syncState: { deletedPrisms: {}, prismBaselines: { p1: { updatedAt: T, deckUpdatedAts: { d2: T } } } }
}));

const { ensureAuthReady } = await import('../js/modules/auth.js');

test('sourceUrl loads from the cloud deck row and saves back on upload', async () => {
	await ensureAuthReady(); // login sync: merge cloud p1, upload the merged copy

	const local = JSON.parse(store.get('prism_data')).prisms.p1;
	const byId = Object.fromEntries(local.decks.map((d) => [d.id, d.sourceUrl]));
	assert.deepEqual(byId, { d1: 'https://moxfield.com/decks/abc', d2: 'https://archidekt.com/decks/42' });

	const uploaded = Object.fromEntries(deckUpserts.map((r) => [r.id, r.source_url]));
	assert.deepEqual(uploaded, { d1: 'https://moxfield.com/decks/abc', d2: 'https://archidekt.com/decks/42' });
});
