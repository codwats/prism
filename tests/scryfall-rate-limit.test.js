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

function jsonResponse(body) {
	return { ok: true, status: 200, json: async () => body };
}

globalThis.fetch = async (url, options) => {
	const href = String(url);
	calls.push(Date.now());
	if (href.includes('/cards/collection')) {
		const identifiers = JSON.parse(options.body).identifiers;
		return jsonResponse({ data: identifiers.map((i) => ({ name: i.name })), not_found: [] });
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

const { fetchCard, canonicalizeCards } = await import('../js/modules/scryfall.js');

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
// fired in the same tick — roughly double Scryfall's 10 req/s ceiling.
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
		assert.ok(gap >= 90, `requests ${i - 1}→${i} were ${gap}ms apart, under the 100ms floor`);
	}
});
