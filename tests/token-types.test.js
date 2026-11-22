// Token types from Scryfall (#412): a card's all_parts token entries, resolved
// to one identity per oracle_id through /cards/collection on the shared chain.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const part = (id, name, type_line) => ({ object: 'related_card', id, component: 'token', name, type_line });
const CARDS = {
	'Smothering Tithe': { all_parts: [
		{ object: 'related_card', id: 'p-tithe', component: 'combo_piece', name: 'Smothering Tithe', type_line: 'Enchantment' },
		part('p-treasure-1', 'Treasure', 'Token Artifact — Treasure'),
	] },
	'Dockside Extortionist': { all_parts: [part('p-treasure-2', 'Treasure', 'Token Artifact — Treasure')] },
	'Elspeth, Sun\'s Champion': { all_parts: [
		part('p-soldier', 'Soldier', 'Token Creature — Soldier'),
		part('p-emblem', 'Elspeth, Sun\'s Champion Emblem', 'Emblem — Elspeth'),
	] },
	'Sol Ring': {},
};
const TOKENS = {
	'p-treasure-1': { oracle_id: 'o-treasure', name: 'Treasure', colors: [], image_uris: { normal: 'https://img/treasure-1.jpg' } },
	'p-treasure-2': { oracle_id: 'o-treasure', name: 'Treasure', colors: [], image_uris: { normal: 'https://img/treasure-2.jpg' } },
	'p-soldier': { oracle_id: 'o-soldier', name: 'Soldier', power: '1', toughness: '1', colors: ['W'], image_uris: { normal: 'https://img/soldier.jpg' } },
	'p-clone': { oracle_id: 'o-clone', name: 'Spirit', power: '1', toughness: '1', colors: ['R', 'W'], image_uris: { normal: 'https://img/spirit.jpg' } },
};

const requests = [];
let offline = false;
globalThis.fetch = async (url, options) => {
	const identifiers = options?.body ? JSON.parse(options.body).identifiers : null;
	requests.push(identifiers || url);
	if (offline) throw new TypeError('Failed to fetch');
	const data = [];
	if (String(url).includes('/cards/search')) {
		data.push({ id: 'p-clone', ...TOKENS['p-clone'] });
	} else {
		for (const i of identifiers) {
			if (i.name && CARDS[i.name]) data.push({ name: i.name, oracle_id: `o-${i.name}`, type_line: 'Card', ...CARDS[i.name] });
			if (i.id && TOKENS[i.id]) data.push({ id: i.id, type_line: 'Token', ...TOKENS[i.id] });
			if (i.oracle_id) {
				const [id, t] = Object.entries(TOKENS).find(([, v]) => v.oracle_id === i.oracle_id) || [];
				if (t) data.push({ id, type_line: 'Token', ...t });
			}
		}
	}
	return { ok: true, status: 200, json: async () => ({ data, not_found: [] }) };
};

const { getTokenTypes, searchTokens, fetchCard } = await import('../js/modules/scryfall.js');

function reset() {
	store.clear();
	requests.length = 0;
	offline = false;
}

test('a card\'s token parts resolve to one Token type per oracle identity; emblems are left out', async () => {
	reset();
	const { byCard } = await getTokenTypes(['Smothering Tithe', 'Dockside Extortionist', 'Elspeth, Sun\'s Champion', 'Sol Ring']);
	assert.deepEqual(byCard.get('Smothering Tithe'), [{ oracleId: 'o-treasure', name: 'Treasure', detail: 'colorless', typeLine: 'Token', imageUri: 'https://img/treasure-1.jpg' }]);
	assert.equal(byCard.get('Dockside Extortionist')[0].oracleId, 'o-treasure', 'another printing, same type');
	assert.deepEqual(byCard.get('Elspeth, Sun\'s Champion').map((t) => [t.name, t.detail]), [['Soldier', '1/1 white']]);
	assert.deepEqual(byCard.get('Sol Ring'), []);
	assert.equal(requests.length, 2, 'one batch of cards, one batch of token printings');
	assert.deepEqual(requests[1].map((i) => i.id).sort(), ['p-soldier', 'p-treasure-1', 'p-treasure-2']);
});

test('once cached, the token list needs no network', async () => {
	reset();
	await getTokenTypes(['Smothering Tithe']);
	offline = true;
	requests.length = 0;
	const { byCard } = await getTokenTypes(['Smothering Tithe']);
	assert.equal(byCard.get('Smothering Tithe')[0].name, 'Treasure');
	assert.equal(requests.length, 0);
});

test('a Token type\'s image is cached under token:<oracleId> for the preview and SCRY', async () => {
	reset();
	await getTokenTypes(['Smothering Tithe']);
	offline = true;
	assert.equal((await fetchCard('token:o-treasure')).image_uri, 'https://img/treasure-1.jpg');
});

test('a token search lists Token types only, and a picked one resolves by oracle id from cache', async () => {
	reset();
	const found = await searchTokens('spirit');
	assert.match(decodeURIComponent(requests[0]), /t:token/);
	assert.deepEqual(found.map((t) => [t.oracleId, t.name, t.detail]), [['o-clone', 'Spirit', '1/1 white red']]);
	requests.length = 0;
	const { byOracle } = await getTokenTypes([], ['o-clone']);
	assert.equal(byOracle.get('o-clone').name, 'Spirit');
	assert.equal(requests.length, 0);
});

test('a hand-added Token type not cached here is fetched by oracle id', async () => {
	reset();
	const { byOracle } = await getTokenTypes([], ['o-soldier']);
	assert.equal(byOracle.get('o-soldier').detail, '1/1 white');
	assert.deepEqual(requests, [[{ oracle_id: 'o-soldier' }]]);
});

// Runs last: the network failure locks the chain out for 30 s.
test('offline with a card not cached yet, the cached tokens still list, flagged incomplete', async () => {
	reset();
	await getTokenTypes(['Smothering Tithe']);
	offline = true;
	const { byCard, incomplete } = await getTokenTypes(['Smothering Tithe', 'Dockside Extortionist']);
	assert.equal(byCard.get('Smothering Tithe')[0].name, 'Treasure');
	assert.equal(byCard.get('Dockside Extortionist'), null);
	assert.equal(incomplete, true);
});
