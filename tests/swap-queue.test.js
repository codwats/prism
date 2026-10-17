import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
	clear: () => store.clear(),
};

const { createPrism, createDeck } = await import('../js/modules/processor.js');
const { queueSwap, queueByDeck, applyDeck } = await import('../js/modules/swap-queue.js');
const { applySwap } = await import('../js/modules/swap.js');

const NOW = '2026-10-17T12:00:00.000Z';
const LATER = '2026-10-17T13:00:00.000Z';

function card(name, quantity = 1, isCommander = false) {
	return { name, quantity, isCommander, isBasicLand: false };
}

function twoDecks() {
	const prism = createPrism('T');
	prism.decks = [
		createDeck({ name: 'A', bracket: 3, color: '#000001', stripePosition: 1, cards: [card('Atraxa', 1, true), card('Cultivate'), card('Ayula')] }),
		createDeck({ name: 'B', bracket: 3, color: '#000002', stripePosition: 2, cards: [card('Bello', 1, true), card('Cultivate'), card('Bear')] }),
	];
	return prism;
}

test('queueing the same incoming card for the same deck again updates the one Planned swap', () => {
	const prism = twoDecks();
	const [a] = prism.decks;
	const first = queueSwap(prism, { incoming: 'Rampant Growth', deckId: a.id, now: NOW });
	const second = queueSwap(first, { incoming: 'Rampant Growth', deckId: a.id, outgoing: 'Ayula', now: LATER });

	assert.equal(prism.plannedSwaps, undefined, 'pure: the input PRISM is untouched');
	assert.equal(second.plannedSwaps.length, 1);
	const [swap] = second.plannedSwaps;
	assert.equal(swap.id, first.plannedSwaps[0].id);
	assert.equal(swap.outgoing, 'Ayula');
	assert.equal(swap.copies, 1);
	assert.equal(swap.createdAt, NOW);
	assert.equal(swap.updatedAt, LATER);
});

test('the same incoming card for another deck is a second Planned swap', () => {
	const prism = twoDecks();
	const [a, b] = prism.decks;
	const next = queueSwap(queueSwap(prism, { incoming: 'Rampant Growth', deckId: a.id, now: NOW }), { incoming: 'Rampant Growth', deckId: b.id, now: NOW });
	assert.deepEqual(next.plannedSwaps.map((s) => s.deckId), [a.id, b.id]);
});

test('queueByDeck groups Planned swaps by target deck, in deck order', () => {
	const prism = twoDecks();
	const [a, b] = prism.decks;
	let next = queueSwap(prism, { incoming: 'Farseek', deckId: b.id, outgoing: 'Bear', now: NOW });
	next = queueSwap(next, { incoming: 'Rampant Growth', deckId: a.id, outgoing: 'Ayula', now: NOW });
	const { groups } = queueByDeck(next);
	assert.deepEqual(groups.map((g) => [g.deck.name, g.swaps.map((s) => s.incoming)]), [['A', ['Rampant Growth']], ['B', ['Farseek']]]);
	assert.equal(groups[0].swaps[0].flag, null);
});

test('stale: a deleted target deck removes its Planned swaps', () => {
	const prism = twoDecks();
	const [a, b] = prism.decks;
	let next = queueSwap(prism, { incoming: 'Farseek', deckId: b.id, now: NOW });
	next = queueSwap(next, { incoming: 'Rampant Growth', deckId: a.id, now: NOW });
	next = { ...next, decks: [a] };
	const result = queueByDeck(next);
	assert.deepEqual(result.prism.plannedSwaps.map((s) => s.incoming), ['Rampant Growth']);
	assert.deepEqual(result.groups.map((g) => g.deck.id), [a.id]);
	assert.equal(queueByDeck(result.prism).prism, result.prism, 'nothing to drop returns the same PRISM, so the caller skips the save');
});

test('stale: an outgoing card no longer in the deck makes the swap an idea again', () => {
	const prism = twoDecks();
	const [a] = prism.decks;
	const next = queueSwap(prism, { incoming: 'Rampant Growth', deckId: a.id, outgoing: 'Sol Ring', now: NOW });
	const result = queueByDeck(next, LATER);
	const [swap] = result.groups[0].swaps;
	assert.equal(swap.outgoing, null);
	assert.equal(swap.flag, null);
	assert.equal(result.prism.plannedSwaps[0].outgoing, undefined, 'stored as an idea, so the cut does not come back with the card');
	assert.equal(result.prism.plannedSwaps[0].updatedAt, LATER, 'and the change syncs');
});

test('stale: an incoming card already in the deck is flagged', () => {
	const prism = twoDecks();
	const [a] = prism.decks;
	const next = queueSwap(prism, { incoming: 'Cultivate', deckId: a.id, outgoing: 'Ayula', now: NOW });
	assert.equal(queueByDeck(next).groups[0].swaps[0].flag, 'in-deck');
});

test('stale: a second Planned swap cutting the same outgoing card is flagged, the first is not', () => {
	const prism = twoDecks();
	const [a] = prism.decks;
	let next = queueSwap(prism, { incoming: 'Rampant Growth', deckId: a.id, outgoing: 'Ayula', now: NOW });
	next = queueSwap(next, { incoming: 'Farseek', deckId: a.id, outgoing: 'Ayula', now: NOW });
	assert.deepEqual(queueByDeck(next).groups[0].swaps.map((s) => s.flag), [null, 'duplicate-cut']);
});

const names = (deck) => deck.cards.map((c) => `${c.quantity} ${c.name}`).sort();

test('applying a deck with a ticked idea is blocked until a cut is chosen', () => {
	const prism = twoDecks();
	const [a] = prism.decks;
	const next = queueSwap(prism, { incoming: 'Rampant Growth', deckId: a.id, now: NOW });
	assert.throws(() => applyDeck(next, [{ id: next.plannedSwaps[0].id }], NOW), /Choose a cut for Rampant Growth/);
});

test('the combined preview is the ticked Planned swaps run in sequence, each on the result of the one before', () => {
	// Both swaps touch Cultivate, the card A shares with B: the first cuts it,
	// the second brings in Bear, which B already runs.
	const prism = twoDecks();
	const [a, b] = prism.decks;
	let queued = queueSwap(prism, { incoming: 'Farseek', deckId: a.id, outgoing: 'Cultivate', now: NOW });
	queued = queueSwap(queued, { incoming: 'Bear', deckId: a.id, outgoing: 'Ayula', now: NOW });
	const [first, second] = queued.plannedSwaps;

	const result = applyDeck(queued, [{ id: first.id }, { id: second.id }], NOW);

	const step1 = applySwap(queued, { outgoing: 'Cultivate', incoming: 'Farseek', deckIds: [a.id], copies: 1, now: NOW });
	const step2 = applySwap(step1.prism, { outgoing: 'Ayula', incoming: 'Bear', deckIds: [a.id], copies: 1, now: NOW });
	assert.deepEqual(result.prism.decks, step2.prism.decks);
	assert.deepEqual(result.prism.removedCards, step2.prism.removedCards);
	assert.deepEqual(names(result.prism.decks[0]), ['1 Atraxa', '1 Bear', '1 Farseek']);
	assert.equal(result.summary.marksToAdd, step1.summary.marksToAdd + step2.summary.marksToAdd);
	assert.equal(result.summary.staleMarks, step1.summary.staleMarks + step2.summary.staleMarks);
	assert.equal(result.summary.copiesToBuy, step1.summary.copiesToBuy + step2.summary.copiesToBuy);
	assert.deepEqual(result.prism.decks[1].cards, b.cards, 'B is untouched');
});

test('after apply: applied Planned swaps leave the queue, unticked ones stay', () => {
	const prism = twoDecks();
	const [a, b] = prism.decks;
	let queued = queueSwap(prism, { incoming: 'Farseek', deckId: a.id, outgoing: 'Ayula', now: NOW });
	queued = queueSwap(queued, { incoming: 'Rampant Growth', deckId: a.id, now: NOW });
	queued = queueSwap(queued, { incoming: 'Kodama', deckId: b.id, outgoing: 'Bear', now: NOW });
	const result = applyDeck(queued, [{ id: queued.plannedSwaps[0].id }], NOW);
	assert.deepEqual(result.prism.plannedSwaps.map((s) => s.incoming), ['Rampant Growth', 'Kodama']);
});

test('Pull list: the outgoing cards just applied that are now in no deck', () => {
	const prism = twoDecks();
	const [a] = prism.decks;
	let queued = queueSwap(prism, { incoming: 'Farseek', deckId: a.id, outgoing: 'Cultivate', now: NOW });
	queued = queueSwap(queued, { incoming: 'Bear', deckId: a.id, outgoing: 'Ayula', now: NOW });
	const result = applyDeck(queued, queued.plannedSwaps.map((s) => ({ id: s.id })), NOW);
	assert.deepEqual(result.pullList, ['Ayula'], 'Cultivate is still in B');
});

test('Sleeve swap is offered per step, against the state at that point in the sequence', () => {
	// Ayula is A's alone: one single-deck batch, so a Sleeve swap fits.
	// Cultivate spans A and B: only the plain Swap, and the step says why.
	const prism = twoDecks();
	const [a] = prism.decks;
	let queued = queueSwap(prism, { incoming: 'Farseek', deckId: a.id, outgoing: 'Ayula', now: NOW });
	queued = queueSwap(queued, { incoming: 'Kodama', deckId: a.id, outgoing: 'Cultivate', now: NOW });
	const [ayula, cultivate] = queued.plannedSwaps;

	const plain = applyDeck(queued, [{ id: ayula.id }, { id: cultivate.id }], NOW);
	assert.deepEqual(plain.steps.map((s) => [s.sleeve, s.sleeveSwap]), [['available', false], ['other-decks', false]]);

	const sleeved = applyDeck(queued, [{ id: ayula.id, sleeve: true }, { id: cultivate.id, sleeve: true }], NOW);
	assert.deepEqual(sleeved.steps.map((s) => s.sleeveSwap), [true, false], 'a Sleeve swap the batch does not allow falls back to the plain Swap');
	assert.equal(sleeved.prism.removedCards.some((r) => r.cardName === 'Ayula'), false, 'a Sleeve swap leaves no stale mark');
});
