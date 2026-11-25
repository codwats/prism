import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { mainType, compareByMainType, matchesMainTypes } = await import('../js/modules/comparables.js');

const TYPE_LINES = {
	'Sol Ring': 'Artifact',
	'Solemn Simulacrum': 'Artifact Creature — Golem',
	'Llanowar Elves': 'Creature — Elf Druid',
	'Ancient Den': 'Artifact Land',
	'Command Tower': 'Land',
	'Counterspell': 'Instant',
	'Cultivate': 'Sorcery',
	'Rhystic Study': 'Enchantment',
	'Karn Liberated': 'Legendary Planeswalker — Karn',
	'Invasion of Ikoria': 'Battle — Siege',
	'Delver of Secrets // Insectile Aberration': 'Creature — Human Wizard // Creature — Human Insect',
	'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki': 'Enchantment — Saga // Enchantment Creature — Goblin Shaman',
};
const typeOf = (card) => (card.name in TYPE_LINES ? mainType(TYPE_LINES[card.name]) : null);
const sorted = (names, direction) =>
	names.map((name) => ({ name })).sort(compareByMainType(typeOf, direction)).map((c) => c.name);

test('Type sort: Creature, Planeswalker, Battle, Instant, Sorcery, Artifact, Enchantment, Land; name A→Z inside', () => {
	assert.deepEqual(
		sorted(['Command Tower', 'Sol Ring', 'Rhystic Study', 'Cultivate', 'Counterspell', 'Invasion of Ikoria',
			'Karn Liberated', 'Llanowar Elves', 'Ancient Den', 'Solemn Simulacrum']),
		['Llanowar Elves', 'Solemn Simulacrum', 'Karn Liberated', 'Invasion of Ikoria', 'Counterspell', 'Cultivate',
			'Sol Ring', 'Rhystic Study', 'Ancient Den', 'Command Tower'],
	);
});

test('Type sort: Artifact Creature is a Creature, Artifact Land a Land, a DFC its front face', () => {
	assert.equal(typeOf({ name: 'Solemn Simulacrum' }), 'Creature');
	assert.equal(typeOf({ name: 'Ancient Den' }), 'Land');
	assert.equal(typeOf({ name: 'Delver of Secrets // Insectile Aberration' }), 'Creature');
	assert.equal(typeOf({ name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki' }), 'Enchantment');
});

test('Type sort: toggling flips the type order, keeps names A→Z, unknown stays last', () => {
	const names = ['Unknown Card', 'Command Tower', 'Llanowar Elves', 'Ancient Den', 'Counterspell', 'Another Unknown'];
	assert.deepEqual(sorted(names, 'asc'),
		['Llanowar Elves', 'Counterspell', 'Ancient Den', 'Command Tower', 'Another Unknown', 'Unknown Card']);
	assert.deepEqual(sorted(names, 'desc'),
		['Ancient Den', 'Command Tower', 'Counterspell', 'Llanowar Elves', 'Another Unknown', 'Unknown Card']);
});

test('Type filter: no ticked type keeps all; ticked types are OR; unknown matches none', () => {
	assert.equal(matchesMainTypes(null, new Set()), true);
	assert.equal(matchesMainTypes('Land', new Set()), true);
	const ticked = new Set(['Creature', 'Instant']);
	assert.equal(matchesMainTypes('Creature', ticked), true);
	assert.equal(matchesMainTypes('Instant', ticked), true);
	assert.equal(matchesMainTypes('Land', ticked), false);
	assert.equal(matchesMainTypes(null, ticked), false);
});
