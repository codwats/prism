import test from 'node:test';
import assert from 'node:assert/strict';

const { extractCubeCobraId, cubeTags, cubeToPacks, packsToPrismJson } = await import('../js/modules/cubecobra.js');
const { buildPrismFromJson } = await import('../js/modules/prism-import.js');

// Real response shape: name lives on details, one row per physical card
function row(name, tags) {
	return { tags, details: { name, type: 'Creature' } };
}

const cube = {
	name: 'Test Cube',
	cards: {
		mainboard: [
			row('Goblin Guide', ['Goblins']),
			row('Mountain', ['Goblins']),
			row('Mountain', ['Goblins']),
			row('Mountain', ['Elves']),
			row('Llanowar Elves', ['Elves']),
			row('Shared Spell', ['Goblins', 'Elves']),
			row('Flavor Card', ['Goblins', 'Rares']),
			row('Only Rare', ['Rares']),
			row('No Tag', []),
		],
	},
};

test('extractCubeCobraId: URLs, slugs and UUIDs', () => {
	assert.equal(extractCubeCobraId('https://cubecobra.com/cube/overview/jumpstart'), 'jumpstart');
	assert.equal(extractCubeCobraId('https://www.cubecobra.com/cube/list/jumpstart?view=table'), 'jumpstart');
	assert.equal(extractCubeCobraId('cubecobra.com/cube/about/abc-123'), 'abc-123');
	assert.equal(extractCubeCobraId(' jumpstart '), 'jumpstart');
	assert.equal(extractCubeCobraId('5f3c1a2b-0d4e-4a6f-9b1c-2d3e4f5a6b7c'), '5f3c1a2b-0d4e-4a6f-9b1c-2d3e4f5a6b7c');
	assert.equal(extractCubeCobraId('https://moxfield.com/decks/abc'), null);
	assert.equal(extractCubeCobraId(''), null);
});

test('cubeTags counts rows per tag in first-seen order', () => {
	assert.deepEqual(cubeTags(cube), [
		{ tag: 'Goblins', count: 5 },
		{ tag: 'Elves', count: 3 },
		{ tag: 'Rares', count: 2 },
	]);
});

test('cubeToPacks sums rows, splits multi-tagged cards, skips unticked', () => {
	const { packs, skipped } = cubeToPacks(cube, ['Goblins', 'Elves']);
	const goblins = packs.find(p => p.name === 'Goblins').cards;
	const elves = packs.find(p => p.name === 'Elves').cards;

	assert.deepEqual(goblins.find(c => c.name === 'Mountain'), { name: 'Mountain', quantity: 2, isCommander: false, isBasicLand: true });
	assert.equal(elves.find(c => c.name === 'Mountain').quantity, 1);
	assert.ok(goblins.some(c => c.name === 'Shared Spell'));
	assert.ok(elves.some(c => c.name === 'Shared Spell'));
	// Flavor Card's other tag is unticked, so it lands in Goblins only
	assert.ok(goblins.some(c => c.name === 'Flavor Card'));
	assert.equal(goblins.find(c => c.name === 'Goblin Guide').isBasicLand, false);
	// Only Rare (unticked tag) and No Tag
	assert.equal(skipped, 2);
});

test('packsToPrismJson builds a new PRISM via buildPrismFromJson', () => {
	const { packs } = cubeToPacks(cube, ['Goblins', 'Elves']);
	const prism = buildPrismFromJson(packsToPrismJson(cube.name, packs), { preserveId: false });
	assert.equal(prism.name, 'Test Cube');
	assert.deepEqual(prism.decks.map(d => [d.name, d.stripePosition, d.bracket]), [['Goblins', 1, 2], ['Elves', 2, 2]]);
	assert.notEqual(prism.decks[0].color, prism.decks[1].color);
	assert.ok(prism.decks.every(d => d.cards.every(c => !c.isCommander)));
});

test('packsToPrismJson refuses more than 48 packs and zero packs', () => {
	const packs = Array.from({ length: 49 }, (_, i) => ({ name: `P${i}`, cards: [] }));
	assert.throws(() => packsToPrismJson('Big', packs), /49 packs; a PRISM holds 48/);
	assert.doesNotThrow(() => packsToPrismJson('Full', packs.slice(0, 48)));
	assert.throws(() => packsToPrismJson('Empty', []), /at least one tag/);
});
