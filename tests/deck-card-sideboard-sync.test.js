/**
 * A card row's isSideboard (#29) round-trips through the real storage load
 * and save: a cloud deck_cards.is_sideboard lands on the local row, and an
 * upload writes it back through replace_deck_cards. Only the Supabase SDK is
 * faked, as in deck-source-url.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const T = '2026-10-01T00:00:00.000Z';
const EDITED = '2026-10-02T00:00:00.000Z';
const cardWrites = {};

const cloudRow = {
	id: 'p1', name: 'P', created_at: T, updated_at: T, split_groups: [], marked_cards: [], removed_cards: [], planned_swaps: [],
	decks: [{
		id: 'd2', name: 'B', color: '#00FF00', bracket: 3, stripe_position: 2, created_at: T, updated_at: T,
		deck_cards: [
			{ id: 'c1', card_name: 'Duress', quantity: 2, is_commander: false, is_basic_land: false, sleeve: null, is_sideboard: false },
			{ id: 'c2', card_name: 'Duress', quantity: 1, is_commander: false, is_basic_land: false, sleeve: null, is_sideboard: true }
		]
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
		return c;
	},
	rpc: (name, args) => {
		if (name === 'replace_deck_cards') cardWrites[args.p_deck_id] = args.p_cards;
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
				id: 'd1', name: 'A', color: '#FF0000', bracket: 2, stripePosition: 1, createdAt: T, updatedAt: EDITED,
				cards: [{ name: 'Pyroblast', quantity: 3, isCommander: false, isBasicLand: false, isSideboard: true }]
			}]
		}
	},
	preferences: {},
	syncState: { deletedPrisms: {}, prismBaselines: { p1: { updatedAt: T, deckUpdatedAts: { d2: T } } } }
}));

const { ensureAuthReady } = await import('../js/modules/auth.js');

test('isSideboard loads from the cloud card row and saves back on upload', async () => {
	await ensureAuthReady(); // login sync: merge cloud p1, upload the merged copy

	const local = JSON.parse(store.get('prism_data')).prisms.p1;
	const d2 = local.decks.find((d) => d.id === 'd2');
	assert.deepEqual(d2.cards.map((c) => [c.name, c.quantity, !!c.isSideboard]), [['Duress', 2, false], ['Duress', 1, true]]);
	assert.equal('isSideboard' in d2.cards[0], false, 'a main row carries no flag');

	assert.deepEqual(cardWrites.d1.map((c) => [c.card_name, c.is_sideboard]), [['Pyroblast', true]]);
});
