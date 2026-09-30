import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
let quotaFullFor = null;
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => {
		if (k === quotaFullFor) throw new Error('QuotaExceededError');
		store.set(k, String(v));
	},
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const CARDS = {
	'Delver of Secrets // Insectile Aberration': { color_identity: ['U'], type_line: 'Creature — Human Wizard // Creature — Human Insect', cmc: 1, oracle_id: 'o-delver', card_faces: [{ mana_cost: '{U}' }, { mana_cost: '' }] },
	'Branchloft Pathway // Boulderloft Pathway': { color_identity: ['G', 'W'], type_line: 'Land // Land', cmc: 0, oracle_id: 'o-pathway', card_faces: [{ mana_cost: '' }, { mana_cost: '' }] },
	'Meren of Clan Nel Toth': { color_identity: ['B', 'G'], type_line: 'Legendary Creature — Human Shaman', mana_cost: '{2}{B}{G}', cmc: 4, oracle_id: 'o-meren' },
	'Tymna the Weaver': { color_identity: ['W', 'B'], type_line: 'Legendary Creature — Human Cleric', cmc: 3, oracle_id: 'o-tymna' },
};

const requests = [];
let failWith = null; // an HTTP status, or 'network'
globalThis.fetch = async (url, options) => {
	const identifiers = JSON.parse(options.body).identifiers;
	requests.push(identifiers.map((i) => i.name));
	if (failWith === 'network') throw new TypeError('Failed to fetch');
	if (failWith) return { ok: false, status: failWith, json: async () => ({}) };
	const data = [];
	for (const { name } of identifiers) {
		const full = Object.keys(CARDS).find((n) => n.split(' // ')[0].toLowerCase() === name.toLowerCase());
		if (full) data.push({ name: full, ...CARDS[full] });
	}
	return { ok: true, status: 200, json: async () => ({ data, not_found: [] }) };
};

const { getCardAttributes, deckColorIdentity } = await import('../js/modules/scryfall.js');

function reset() {
	store.clear();
	requests.length = 0;
	quotaFullFor = null;
	failWith = null;
}

test('multi-face names go out as their front face and match either form, costed from the front face', async () => {
	reset();
	const attrs = await getCardAttributes(['Delver of Secrets // Insectile Aberration']);
	assert.deepEqual(requests, [['Delver of Secrets']]);
	assert.deepEqual(attrs.get('Delver of Secrets // Insectile Aberration'), {
		colorIdentity: ['U'], typeLine: 'Creature — Human Wizard // Creature — Human Insect', manaCost: '{U}', cmc: 1, oracleId: 'o-delver',
	});
});

test('an entry cached without manaCost is fetched again once', async () => {
	reset();
	store.set('prism_card_attributes', JSON.stringify({
		'meren of clan nel toth': { colorIdentity: ['B', 'G'], typeLine: 'Legendary Creature — Human Shaman', cmc: 4, oracleId: 'o-meren' },
	}));
	const attrs = await getCardAttributes(['Meren of Clan Nel Toth']);
	assert.equal(attrs.get('Meren of Clan Nel Toth').manaCost, '{2}{B}{G}');
	await getCardAttributes(['Meren of Clan Nel Toth']);
	assert.equal(requests.length, 1);
});

test('cached names make no request; only uncached ones are fetched', async () => {
	reset();
	await getCardAttributes(['Meren of Clan Nel Toth']);
	await getCardAttributes(['Meren of Clan Nel Toth', 'Tymna the Weaver']);
	assert.deepEqual(requests, [['Meren of Clan Nel Toth'], ['Tymna the Weaver']]);
	await getCardAttributes(['Meren of Clan Nel Toth', 'Tymna the Weaver']);
	assert.equal(requests.length, 2);
});

test('a miss comes back null and is not cached', async () => {
	reset();
	const attrs = await getCardAttributes(['Not A Real Card']);
	assert.equal(attrs.get('Not A Real Card'), null);
	await getCardAttributes(['Not A Real Card']);
	assert.equal(requests.length, 2, 'the miss is asked again');
});

test('out of space drops the attribute cache and leaves prism_data alone', async () => {
	reset();
	store.set('prism_data', '{"prisms":{}}');
	store.set('prism_card_attributes', '{}');
	quotaFullFor = 'prism_card_attributes';
	const attrs = await getCardAttributes(['Meren of Clan Nel Toth']);
	assert.equal(attrs.get('Meren of Clan Nel Toth').oracleId, 'o-meren', 'result still returned');
	assert.equal(store.has('prism_card_attributes'), false);
	assert.equal(store.get('prism_data'), '{"prisms":{}}');
});

test('deck identity is the union of its commanders, or null when unknown', async () => {
	reset();
	const cmd = (name) => ({ name, quantity: 1, isCommander: true, isBasicLand: false });
	const partners = { cards: [cmd('Tymna the Weaver'), cmd('Meren of Clan Nel Toth'), { name: 'Sol Ring', quantity: 1, isCommander: false }] };
	const attrs = await getCardAttributes(['Tymna the Weaver', 'Meren of Clan Nel Toth', 'Not A Real Card']);

	assert.deepEqual(deckColorIdentity(partners, attrs), ['W', 'B', 'G']);
	assert.equal(deckColorIdentity({ cards: [cmd('Not A Real Card')] }, attrs), null);
	assert.equal(deckColorIdentity({ cards: [] }, attrs), null);
});

test('a failed request throws instead of reading as a miss, and caches nothing', async () => {
	for (const status of [429, 503, 'network']) {
		reset();
		failWith = status;
		await assert.rejects(getCardAttributes(['Meren of Clan Nel Toth']));
		failWith = null;
		const attrs = await getCardAttributes(['Meren of Clan Nel Toth']);
		assert.equal(attrs.get('Meren of Clan Nel Toth').oracleId, 'o-meren', `${status}: asked again once Scryfall answers`);
	}
});

test('a multi-face entry cached with no cost is fetched again once; a multi-face land is not', async () => {
	reset();
	store.set('prism_card_attributes', JSON.stringify({
		'delver of secrets // insectile aberration': { colorIdentity: ['U'], typeLine: 'Creature — Human Wizard // Creature — Human Insect', manaCost: '', cmc: 1, oracleId: 'o-delver' },
		'branchloft pathway // boulderloft pathway': { colorIdentity: ['G', 'W'], typeLine: 'Land // Land', manaCost: '', cmc: 0, oracleId: 'o-pathway' },
	}));
	const names = ['Delver of Secrets // Insectile Aberration', 'Branchloft Pathway // Boulderloft Pathway'];
	const attrs = await getCardAttributes(names);
	assert.deepEqual(requests, [['Delver of Secrets']]);
	assert.equal(attrs.get(names[0]).manaCost, '{U}');
	await getCardAttributes(names);
	assert.equal(requests.length, 1);
});
