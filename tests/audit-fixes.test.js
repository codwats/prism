import test from 'node:test';
import assert from 'node:assert/strict';
import {
	addSplitToGroup,
	createDeck,
	createPrism,
	createSplitGroup,
	processCards,
} from '../js/modules/processor.js';
import { parseLine, normalizeCardName, stripPrintingSuffix } from '../js/modules/parser.js';

// Minimal localStorage shim so storage.js functions run under node:test.
const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { importAllData } = await import('../js/modules/storage.js');

function card(name, quantity = 1, isBasicLand = false) {
	return { name, quantity, isCommander: false, isBasicLand };
}

// ---------------------------------------------------------------------------
// totalQuantity: "any number" cards (Rat Colony, Shadowborn Apostle, …) must
// report the max quantity across decks, like basics — not a hardcoded 1.
// ---------------------------------------------------------------------------

test('processCards reports max quantity across decks for any-number cards', () => {
	const prism = createPrism('T');
	prism.decks = [
		createDeck({
			name: 'Rats A', commander: 'C1', bracket: 3, color: '#FF0000',
			stripePosition: 1,
			cards: [card('Rat Colony', 30), card('Sol Ring')],
		}),
		createDeck({
			name: 'Rats B', commander: 'C2', bracket: 3, color: '#00FF00',
			stripePosition: 2,
			cards: [card('Rat Colony', 25), card('Sol Ring')],
		}),
	];

	const cards = processCards(prism);
	const rats = cards.find((c) => c.name === 'Rat Colony');
	const solRing = cards.find((c) => c.name === 'Sol Ring');
	assert.equal(rats.totalQuantity, 30);
	assert.equal(solRing.totalQuantity, 1);
});

// ---------------------------------------------------------------------------
// Printing suffixes: "1 Sol Ring (C21) 263" must dedup with "1 Sol Ring".
// ---------------------------------------------------------------------------

test('parseLine strips set-code/collector/foil suffixes', () => {
	assert.equal(parseLine('1 Sol Ring (C21) 263').name, 'Sol Ring');
	assert.equal(parseLine('1 Sol Ring (C21) 263 *F*').name, 'Sol Ring');
	assert.equal(parseLine('1 Sol Ring (C21)').name, 'Sol Ring');
	assert.equal(parseLine('1 Sol Ring').name, 'Sol Ring');
	// Basic land detection sees the cleaned name.
	assert.equal(parseLine('20 Island (ZNR) 381').isBasicLand, true);
});

test('stripPrintingSuffix leaves real parenthesized card names alone', () => {
	// Un-set names where the parenthetical is part of the card name.
	assert.equal(
		stripPrintingSuffix('B.F.M. (Big Furry Monster)'),
		'B.F.M. (Big Furry Monster)'
	);
	assert.equal(
		stripPrintingSuffix("Erase (Not the Urza's Legacy One)"),
		"Erase (Not the Urza's Legacy One)"
	);
});

test('normalizeCardName dedups suffixed names stored before the parser fix', () => {
	assert.equal(normalizeCardName('Sol Ring (C21) 263'), normalizeCardName('Sol Ring'));
	// DFC back-face stripping still applies.
	assert.equal(normalizeCardName('Malakir Rebirth // Malakir Mire (ZNR) 111'), 'malakir rebirth');
});

// ---------------------------------------------------------------------------
// Variant naming: after deleting a middle variant, a newly added variant must
// not reuse a surviving sibling's "(N)" suffix.
// ---------------------------------------------------------------------------

test('addSplitToGroup numbers past the highest surviving variant suffix', () => {
	const prism = createPrism('T');
	const group = createSplitGroup({
		name: 'G', sideAPosition: 1, sideAColor: '#FF0000', splitStyle: 'stripes',
	});
	const children = [1, 2, 3].map((n, i) =>
		createDeck({
			name: `G (${n})`, commander: 'Cmdr', bracket: 3, color: '#0000FF',
			stripePosition: 2 + i, splitGroupId: group.id,
			cards: [card('Sol Ring')],
		})
	);
	// Delete the middle variant "G (2)".
	const survivors = [children[0], children[2]];
	group.childDeckIds = survivors.map((d) => d.id);
	prism.decks = survivors;
	prism.splitGroups = [group];

	const next = addSplitToGroup(prism, group.id);
	const beforeIds = new Set(survivors.map((d) => d.id));
	const added = next.decks.find((d) => !beforeIds.has(d.id));
	assert.equal(added.name, 'G (4)');
	const names = next.decks.map((d) => d.name);
	assert.equal(new Set(names).size, names.length, 'variant names must be unique');
});

// ---------------------------------------------------------------------------
// Backup restore: untrusted colors must be clamped to strict hex before they
// reach style="background: ${color}" render/export sinks.
// ---------------------------------------------------------------------------

test('importAllData clamps non-hex colors from a restored backup', () => {
	store.clear();
	const payload = {
		version: 3,
		currentPrismId: 'p1',
		prisms: {
			p1: {
				id: 'p1', name: 'Evil', createdAt: '2026-01-01T00:00:00Z',
				updatedAt: '2026-01-01T00:00:00Z',
				markedCards: [],
				removedCards: [
					{
						cardName: 'Sol Ring', deckId: 'd1', deckName: 'Deck',
						deckColor: '#fff" onmouseover="alert(1)', stripePosition: 1,
						removedAt: '2026-01-01T00:00:00Z',
					},
				],
				decks: [
					{
						id: 'd1', name: 'Deck', commander: 'C', bracket: 3,
						color: '#fff" onmouseover="alert(1)', stripePosition: 1, cards: [],
					},
					{
						id: 'd2', name: 'Deck 2', commander: 'C', bracket: 3,
						color: '#00FF00', stripePosition: 2, cards: [],
					},
				],
				splitGroups: [
					{
						id: 'g1', name: 'G', sideAPosition: 3,
						sideAColor: 'red; background-image: url(x)', childDeckIds: ['d1'],
						splitStyle: 'stripes',
					},
				],
			},
		},
	};

	assert.equal(importAllData(JSON.stringify(payload)), true);
	const saved = JSON.parse(store.get('prism_data'));
	const prism = saved.prisms.p1;
	assert.equal(prism.decks[0].color, '#888888');
	assert.equal(prism.decks[1].color, '#00FF00');
	assert.equal(prism.splitGroups[0].sideAColor, '#888888');
	// removedCards[].deckColor renders unescaped in the Results "removed" tab
	// (style="background-color: ${removed.deckColor}") — must be clamped too.
	assert.equal(prism.removedCards[0].deckColor, '#888888');
});
