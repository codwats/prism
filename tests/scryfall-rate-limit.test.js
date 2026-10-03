import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage shim (scryfall.js caches through it).
const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const calls = [];
const collectionNames = [];

function jsonResponse(body) {
	return { ok: true, status: 200, json: async () => body };
}

let rateLimited = false;
globalThis.fetch = async (url, options) => {
	const href = String(url);
	calls.push(Date.now());
	if (rateLimited) return { ok: false, status: 429, json: async () => ({}) };
	if (href.includes('/cards/collection')) {
		const identifiers = JSON.parse(options.body).identifiers;
		collectionNames.push(...identifiers.map((i) => i.name));
		// Like Scryfall, name identifiers match a face name, never "A // B".
		const oracle = { fire: 'Fire // Ice', 'lightning bolt': 'Lightning Bolt', counterspell: 'Counterspell' };
		const found = identifiers.filter((i) => oracle[i.name.toLowerCase()]);
		return jsonResponse({
			data: found.map((i) => ({ name: oracle[i.name.toLowerCase()] })),
			not_found: identifiers.filter((i) => !found.includes(i)),
		});
	}
	const name = decodeURIComponent(href.split('=').pop());
	return jsonResponse({
		name,
		image_uris: { normal: `https://img/${name}` },
		scryfall_uri: `https://scryfall/${name}`,
		type_line: 'Artifact',
		mana_cost: '{1}',
	});
};

const { fetchCard, prefetchCards, canonicalizeCards, getCardAttributes } = await import('../js/modules/scryfall.js');

// A request that owes nothing (the very first one, or one long after the
// previous) must fire immediately — the gate paces requests, it does not tax
// every one of them.
test('the first request is not delayed', async () => {
	store.clear();
	calls.length = 0;

	const start = Date.now();
	await fetchCard('Sol Ring');

	assert.equal(calls.length, 1);
	assert.ok(calls[0] - start < 50, `first request waited ${calls[0] - start}ms`);
});

// Both request paths (the single-card queue and the batched collection POST)
// must share one rate limiter. Before the fix they gated on the same mutable
// timestamp, so concurrent loops read it, slept to the same deadline, and
// fired in the same tick — roughly double Scryfall's 2 req/s ceiling for these endpoints.
test('single-card queue and canonicalizeCards never fire in the same tick', async () => {
	store.clear();
	calls.length = 0;

	await Promise.all([
		Promise.all(['Sol Ring', 'Arcane Signet', 'Command Tower'].map((n) => fetchCard(n))),
		canonicalizeCards([{ name: 'Lightning Bolt' }, { name: 'Counterspell' }]),
	]);

	assert.equal(calls.length, 4, 'expected 3 named lookups + 1 collection POST');
	const sorted = [...calls].sort((a, b) => a - b);
	for (let i = 1; i < sorted.length; i++) {
		const gap = sorted[i] - sorted[i - 1];
		assert.ok(gap >= 490, `requests ${i - 1}→${i} were ${gap}ms apart, under the 500ms floor`);
	}
});

// /cards/collection never matches a full multi-face name, so canonicalizeCards
// must ask by front face and still store the Oracle name.
test('canonicalizeCards resolves multi-face names by front face', async () => {
	store.clear();
	collectionNames.length = 0;

	const cards = await canonicalizeCards([{ name: 'fire // ice' }]);

	assert.deepEqual(collectionNames, ['fire']);
	assert.equal(cards[0].name, 'Fire // Ice');
});

// Each save re-serializes the whole cache, so saving per card is O(N²) over a
// prefetch (#282). The queue saves once when it drains.
test('a prefetch writes the card cache once, keeping every card', async () => {
	store.clear();
	const setItem = globalThis.localStorage.setItem;
	let writes = 0;
	globalThis.localStorage.setItem = (k, v) => {
		if (k === 'scryfall_card_cache') writes++;
		setItem(k, v);
	};
	try {
		await prefetchCards(['Prefetch A', 'Prefetch B', 'Prefetch C']);
	} finally {
		globalThis.localStorage.setItem = setItem;
	}
	assert.equal(writes, 1);
	assert.deepEqual(Object.keys(JSON.parse(store.get('scryfall_card_cache'))).sort(), ['prefetch a', 'prefetch b', 'prefetch c']);
});

// A 429 locks the client out for 30 s, so retrying inside the window only
// fails again (#280). Runs last: the lockout outlives the test.
test('a 429 fails without a retry, and every path then fails without a request', async () => {
	store.clear();
	calls.length = 0;
	rateLimited = true;

	await assert.rejects(fetchCard('Sol Ring'), /Rate limited/);
	assert.equal(calls.length, 1, 'no retry after the 429');

	rateLimited = false; // Scryfall would still answer 429 inside the window
	const start = Date.now();
	await assert.rejects(fetchCard('Arcane Signet'), /Rate limited/);
	await assert.rejects(getCardAttributes(['Counterspell']), /Rate limited/);
	const cards = await canonicalizeCards([{ name: 'lightning bolt' }]);
	assert.equal(cards[0].name, 'lightning bolt', 'canonicalization leaves the name as it was');
	assert.equal(calls.length, 1, 'nothing reached Scryfall during the lockout');
	assert.ok(Date.now() - start < 100, 'locked-out requests fail without waiting on the rate gate');
});
