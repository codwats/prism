import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrism, createDeck, createSplitGroup } from '../js/modules/processor.js';
import {
	buildSlotMap,
	freeSlotCounts,
	slotRows,
	decksHaveMarks,
} from '../js/features/stripe-reorder-dialog.js';

const card = (name) => ({ name, quantity: 1, isCommander: false, isBasicLand: false });
const deck = (name, pos, cards = []) =>
	createDeck({ name, bracket: 3, color: '#FF0000', stripePosition: pos, cards });

function prismWith(...decks) {
	const prism = createPrism('T');
	prism.decks = decks;
	return prism;
}

test('free counts are per side and exclude taken slots, the deck included', () => {
	const prism = prismWith(deck('A', 1), deck('B', 2), deck('C', 30));
	assert.deepEqual(freeSlotCounts(buildSlotMap(prism)), { a: 22, b: 23 });
});

test('a split group takes one slot', () => {
	const prism = prismWith(deck('A', 1));
	const group = createSplitGroup({ name: 'G', sideAPosition: 5, sideAColor: '#00FF00', splitStyle: 'dots' });
	prism.splitGroups = [group];
	assert.equal(freeSlotCounts(buildSlotMap(prism)).a, 22);
});

test('free-only hides taken slots but keeps the current one, disabled', () => {
	const prism = prismWith(deck('A', 1), deck('B', 2));
	const map = buildSlotMap(prism);
	const rows = slotRows(map, 'a', true, 1);
	assert.equal(rows.length, 23);
	assert.deepEqual(rows[0], { position: 1, info: map.get(1), isCurrent: true });
	assert.ok(!rows.some((r) => r.position === 2));
});

test('free-only off lists the whole side with who holds each slot', () => {
	const prism = prismWith(deck('A', 1), deck('B', 30));
	const rows = slotRows(buildSlotMap(prism), 'b', false, 1);
	assert.equal(rows.length, 24);
	assert.equal(rows[0].position, 25);
	assert.equal(rows.find((r) => r.position === 30).info.name, 'B');
	assert.ok(rows.every((r) => !r.isCurrent));
});

test('decksHaveMarks is true only for decks whose cards are marked', () => {
	const a = deck('A', 1, [card('Sol Ring')]);
	const b = deck('B', 2, [card('Island')]);
	const prism = prismWith(a, b);
	assert.equal(decksHaveMarks(prism, [a.id]), false);
	prism.markedCards = ['Island'];
	assert.equal(decksHaveMarks(prism, [a.id]), false);
	assert.equal(decksHaveMarks(prism, [b.id]), true);
});
