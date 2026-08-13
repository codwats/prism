import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrism, createDeck, createSplitGroup, processCards } from '../js/modules/processor.js';

function card(name, quantity = 1, isCommander = false) {
	return { name, quantity, isCommander, isBasicLand: false };
}

function standalone(name, pos, cards) {
	return createDeck({ name, bracket: 3, color: '#FF0000', stripePosition: pos, cards });
}

function visible(stripes) {
	return stripes.filter((s) => s.markType !== 'membership');
}

function findCard(prism, name) {
	return processCards(prism).find((c) => c.name === name);
}

const KRARK = 'Krark, the Thumbless';

test('commander of A, also regular in B and C: dedicated A + shared B+C', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('A', 1, [card(KRARK, 1, true)]),
		standalone('B', 2, [card(KRARK)]),
		standalone('C', 3, [card(KRARK)]),
	];

	// off: one shared batch, total 1
	const off = findCard(prism, KRARK);
	assert.equal(off.batches.length, 1);
	assert.equal(off.totalQuantity, 1);

	// on: replace, not add on top
	prism.useDedicatedCommanderCopies = true;
	const on = findCard(prism, KRARK);
	assert.equal(on.batches.length, 2);
	const [ded, sharedBatch] = on.batches;
	assert.equal(ded.isDedicated, true);
	assert.equal(ded.isPool, false);
	assert.deepEqual(visible(ded.stripes).map((s) => s.deckName), ['A']);
	assert.equal(sharedBatch.isDedicated, undefined);
	assert.deepEqual(visible(sharedBatch.stripes).map((s) => s.deckName).sort(), ['B', 'C']);
	assert.equal(on.totalQuantity, 2);
	// pool 1 (B+C batch), core 1 (dedicated)
	assert.equal(on.batches.reduce((s, b) => s + (b.isPool ? b.copyCount : 0), 0), 1);
});

test('commander of A only: still exactly one copy (replace removes the double-count)', () => {
	const prism = createPrism('T');
	prism.decks = [standalone('A', 1, [card(KRARK, 1, true), card('Sol Ring')])];
	prism.useDedicatedCommanderCopies = true;

	const krark = findCard(prism, KRARK);
	assert.equal(krark.batches.length, 1);
	assert.equal(krark.batches[0].isDedicated, true);
	assert.equal(krark.totalQuantity, 1);
});

test('commands two standalone decks: two dedicated copies, both core', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('A', 1, [card(KRARK, 1, true)]),
		standalone('B', 2, [card(KRARK, 1, true)]),
	];
	prism.useDedicatedCommanderCopies = true;

	const krark = findCard(prism, KRARK);
	assert.equal(krark.batches.length, 2);
	assert.ok(krark.batches.every((b) => b.isDedicated && !b.isPool));
	assert.equal(krark.totalQuantity, 2);
	// distinct keys, distinct single participants
	assert.notEqual(krark.batches[0].key, krark.batches[1].key);
});

function groupPrism({ flagInBoth }) {
	const prism = createPrism('T');
	const group = createSplitGroup({ name: 'G', sideAPosition: 1, sideAColor: '#00FF00', splitStyle: 'stripes' });
	const v1 = createDeck({ name: 'G (1)', bracket: 3, color: '#111111', stripePosition: 48, splitGroupId: group.id, cards: [card(KRARK, 1, true)] });
	const v2 = createDeck({ name: 'G (2)', bracket: 3, color: '#222222', stripePosition: 47, splitGroupId: group.id, cards: [card(KRARK, 1, flagInBoth)] });
	group.childDeckIds = [v1.id, v2.id];
	prism.decks = [v1, v2];
	prism.splitGroups = [group];
	prism.useDedicatedCommanderCopies = true;
	return prism;
}

test('2-variant group, flagged in both children: ONE dedicated batch, parent marks, total 1', () => {
	const krark = findCard(groupPrism({ flagInBoth: true }), KRARK);
	assert.equal(krark.batches.length, 1);
	const [b] = krark.batches;
	assert.equal(b.isDedicated, true);
	assert.equal(b.copyCount, 1);
	// shared by every child at this quantity → parent Side A mark only
	assert.deepEqual(visible(b.stripes).map((s) => s.deckName), ['G']);
	assert.equal(krark.totalQuantity, 1);
});

test('at-least-one rule: flagged in a single child variant still dedicates the whole group', () => {
	const krark = findCard(groupPrism({ flagInBoth: false }), KRARK);
	assert.equal(krark.batches.length, 1);
	assert.equal(krark.batches[0].isDedicated, true);
	assert.equal(krark.totalQuantity, 1);
});

test('multi-commander deck: one dedicated batch per flagged card, each marked A alone', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('A', 1, [card('Okaun, Eye of Chaos', 1, true), card('Zndrsplt, Eye of Wisdom', 1, true), card('Sol Ring')]),
	];
	prism.useDedicatedCommanderCopies = true;

	const cards = processCards(prism);
	for (const name of ['Okaun, Eye of Chaos', 'Zndrsplt, Eye of Wisdom']) {
		const c = cards.find((x) => x.name === name);
		assert.equal(c.batches.length, 1);
		assert.equal(c.batches[0].isDedicated, true);
		assert.deepEqual(visible(c.batches[0].stripes).map((s) => s.deckName), ['A']);
		assert.equal(c.totalQuantity, 1);
	}
});

test('dedicated batch takes the full decklist quantity, not a fixed 1', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('A', 1, [card(KRARK, 2, true)]),
		standalone('B', 2, [card(KRARK, 1)]),
	];
	prism.useDedicatedCommanderCopies = true;

	const krark = findCard(prism, KRARK);
	assert.deepEqual(
		krark.batches.map((b) => [b.copyCount, !!b.isDedicated]),
		[[2, true], [1, false]]
	);
	assert.equal(krark.totalQuantity, 3); // dedicated 2 + max of remaining 1
});

test('flag off leaves derivation untouched (slice-3 behavior)', () => {
	const prism = createPrism('T');
	prism.decks = [
		standalone('A', 1, [card(KRARK, 1, true)]),
		standalone('B', 2, [card(KRARK)]),
	];
	const krark = findCard(prism, KRARK);
	assert.equal(krark.batches.length, 1);
	assert.equal(krark.batches[0].isDedicated, undefined);
	assert.equal(krark.totalQuantity, 1);
});
