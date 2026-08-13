import test from 'node:test';
import assert from 'node:assert/strict';

import {
	parseDecklist,
	cardsToDecklistText,
	rewriteDecklistCommanders,
} from '../js/modules/parser.js';
import {
	commanderNames,
	applyCommanderFallback,
	createDeck,
} from '../js/modules/processor.js';
import { transformArchidektDeck } from '../js/modules/archidekt.js';

test('parseDecklist flags every Commander-section line at stated quantity, no name union', () => {
	const text = [
		'Commander',
		'1 Krark, the Thumbless',
		'2 Sakashima of a Thousand Faces',
		'',
		'Deck',
		'1 Sol Ring',
		'1 Krark, the Thumbless', // duplicate — merges into the flagged entry
	].join('\n');

	const result = parseDecklist(text);
	const flagged = result.cards.filter((c) => c.isCommander);
	assert.equal(flagged.length, 2);
	assert.equal(flagged.find((c) => c.name.startsWith('Sakashima')).quantity, 2);
	assert.equal(result.cards.filter((c) => c.name === 'Sol Ring')[0].isCommander, false);
	// no second parameter: a name outside the section is never flagged
	assert.equal(result.cards.length, 3);
});

test('cardsToDecklistText round-trips N commander flags through parseDecklist', () => {
	const cards = [
		{ name: 'Krark, the Thumbless', quantity: 1, isCommander: true, isBasicLand: false },
		{ name: 'Sakashima of a Thousand Faces', quantity: 1, isCommander: true, isBasicLand: false },
		{ name: 'Sol Ring', quantity: 1, isCommander: false, isBasicLand: false },
		{ name: 'Island', quantity: 12, isCommander: false, isBasicLand: true },
	];

	const reparsed = parseDecklist(cardsToDecklistText(cards));
	assert.deepEqual(
		reparsed.cards.filter((c) => c.isCommander).map((c) => c.name).sort(),
		['Krark, the Thumbless', 'Sakashima of a Thousand Faces']
	);
	assert.equal(reparsed.cards.find((c) => c.name === 'Island').quantity, 12);
	// no flags → no Commander header
	assert.ok(!cardsToDecklistText(cards.slice(2)).includes('Commander'));
});

test('rewriteDecklistCommanders: add unmatched, move matched at quantity, unflag others', () => {
	const text = [
		'Commander',
		'1 Old Commander',
		'',
		'Deck',
		'3 Rat Colony',
		'1 Sol Ring',
	].join('\n');

	const out = rewriteDecklistCommanders(text, ['Rat Colony', 'Brand New Cmdr']);
	const reparsed = parseDecklist(out);
	const flagged = reparsed.cards.filter((c) => c.isCommander);

	assert.deepEqual(flagged.map((c) => c.name).sort(), ['Brand New Cmdr', 'Rat Colony']);
	assert.equal(flagged.find((c) => c.name === 'Rat Colony').quantity, 3, 'moved at existing quantity');
	assert.equal(flagged.find((c) => c.name === 'Brand New Cmdr').quantity, 1, 'unmatched added as qty 1');
	assert.equal(reparsed.cards.find((c) => c.name === 'Old Commander').isCommander, false, 'unflagged');
	assert.equal(reparsed.cards.filter((c) => c.name === 'Rat Colony').length, 1, 'never duplicated');
});

test('rewriteDecklistCommanders preserves unparseable lines and sideboard blocks', () => {
	const text = [
		'1 Sol Ring',
		'not a valid line',
		'Sideboard',
		'1 Swords to Plowshares',
	].join('\n');

	const out = rewriteDecklistCommanders(text, ['Sol Ring']);
	assert.ok(out.includes('not a valid line'), 'error line survives');
	assert.ok(out.includes('Sideboard'), 'sideboard header survives');
	assert.ok(out.includes('1 Swords to Plowshares'), 'sideboard card survives');
	// idempotent: rewriting again changes nothing
	assert.equal(rewriteDecklistCommanders(out, ['Sol Ring']), out);
});

test('commanderNames derives alphabetically from flags', () => {
	const deck = createDeck({
		name: 'D', bracket: 3, color: '#FF0000', stripePosition: 1,
		cards: [
			{ name: 'Zndrsplt, Eye of Wisdom', quantity: 1, isCommander: true, isBasicLand: false },
			{ name: 'Okaun, Eye of Chaos', quantity: 1, isCommander: true, isBasicLand: false },
			{ name: 'Sol Ring', quantity: 1, isCommander: false, isBasicLand: false },
		],
	});
	assert.deepEqual(commanderNames(deck), ['Okaun, Eye of Chaos', 'Zndrsplt, Eye of Wisdom']);
	assert.equal(deck.commander, undefined, 'createDeck no longer stores a scalar');
});

test('applyCommanderFallback flags a match, inserts a miss, no-ops when flagged', () => {
	const flagIt = { cards: [{ name: 'Krark, the Thumbless', quantity: 1, isCommander: false, isBasicLand: false }] };
	assert.equal(applyCommanderFallback(flagIt, 'krark, the thumbless'), true);
	assert.equal(flagIt.cards[0].isCommander, true);

	const insertIt = { cards: [{ name: 'Sol Ring', quantity: 1, isCommander: false, isBasicLand: false }] };
	assert.equal(applyCommanderFallback(insertIt, 'Krark, the Thumbless'), true);
	assert.deepEqual(insertIt.cards[0], { name: 'Krark, the Thumbless', quantity: 1, isCommander: true, isBasicLand: false });

	assert.equal(applyCommanderFallback(insertIt, 'Krark, the Thumbless'), false, 'idempotent');
	assert.equal(applyCommanderFallback(insertIt, null), false);
});

test('transformArchidektDeck flags only the exact Commander category', () => {
	const raw = {
		id: 1,
		name: 'Test',
		cards: [
			{ card: { name: 'Krark, the Thumbless' }, quantity: 1, categories: ['Commander'] },
			{ card: { name: 'Fiery Emancipation' }, quantity: 1, categories: ['Commander Damage'] },
			{ card: { name: 'Sakashima of a Thousand Faces' }, quantity: 1, categories: [' commander '] },
			{ card: { name: 'Thrasios, Triton Hero' }, quantity: 1, categories: ['Partner Package'] },
			{ card: { name: 'Sol Ring' }, quantity: 1, categories: ['Non-Commander'] },
		],
	};
	const flagged = transformArchidektDeck(raw).cards.filter((c) => c.isCommander).map((c) => c.name);
	assert.deepEqual(flagged.sort(), ['Krark, the Thumbless', 'Sakashima of a Thousand Faces']);
});
