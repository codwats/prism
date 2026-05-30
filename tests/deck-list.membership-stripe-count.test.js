import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/core/state.js';
import {
	createDeck,
	createSplitGroup,
	createPrism,
	addSplitToGroup,
} from '../js/modules/processor.js';
import {
	getStripeCountMap,
	unmarkCardsWithNewStripes,
	unmarkSharedCards,
} from '../js/features/deck-list.js';

// markType === 'membership' entries are invisible filter anchors emitted for
// dot-style split groups when a card is in ALL child variants. They carry a
// deckId for filtering but correspond to NO physical paint mark — the card is
// identified by the single Side A stripe alone. The unmark-on-new-stripe system
// must not count them, or Done cards get spuriously unchecked.

function card(name, quantity = 1) {
	return { name, quantity, isCommander: false, isBasicLand: false };
}

// Dot-style split group with `variantCardLists` per child. Returns the prism.
function dotGroupPrism(variantCardLists) {
	const prism = createPrism('T');
	const group = createSplitGroup({
		name: 'G',
		sideAPosition: 1,
		sideAColor: '#FF0000',
		splitStyle: 'dots',
	});
	const decks = variantCardLists.map((cards, i) =>
		createDeck({
			name: `G (${i + 1})`,
			commander: 'Cmdr',
			bracket: 3,
			color: i === 0 ? '#FF0000' : '#00FF00',
			stripePosition: null,
			splitGroupId: group.id,
			cards,
		})
	);
	group.childDeckIds = decks.map((d) => d.id);
	prism.decks = decks;
	prism.splitGroups = [group];
	return { prism, group };
}

// 1. Dot group, card in ALL variants → Side A stripe + membership entries only.
//    Adding another variant that also contains the card keeps it shared across
//    ALL variants (no new physical mark). The card must STAY marked.
//    NOTE: the original spec said "add a new standalone deck". A standalone deck
//    that shares the card genuinely adds a real second stripe (visible 1 -> 2),
//    so both old and fixed code correctly unmark it — that does not isolate the
//    membership bug. Adding a same-group variant is the scenario where the old
//    raw-length count (3 -> 4) spuriously unmarked while no mark was added.
test('membership entries do not trigger unmark (card shared across all dot variants)', () => {
	const { prism, group } = dotGroupPrism([[card('Shared')], [card('Shared')]]);
	state.currentPrism = prism;

	// Card in all variants: exactly ONE visible mark (the Side A stripe).
	assert.equal(getStripeCountMap().get('Shared'), 1);

	prism.markedCards = ['Shared'];
	const beforeCounts = getStripeCountMap(); // visible = 1

	// Add another variant to the same group (template copies the Shared card),
	// so the card is still in ALL variants → still just membership + Side A.
	state.currentPrism = addSplitToGroup(prism, group.id);

	// Visible count is still 1; old raw-length count would have grown 3 -> 4.
	assert.equal(getStripeCountMap().get('Shared'), 1);

	const unmarked = unmarkCardsWithNewStripes(beforeCounts);
	assert.deepEqual(unmarked, []);
	assert.deepEqual(state.currentPrism.markedCards, ['Shared']);
});

// 2. Standalone card gains a real second visible stripe → IS correctly unmarked.
test('a real new visible stripe still unmarks a Done card', () => {
	const prism = createPrism('T');
	const d1 = createDeck({
		name: 'Deck 1',
		commander: 'Cmdr',
		bracket: 3,
		color: '#FF0000',
		stripePosition: 1,
		cards: [card('Lightning Bolt')],
	});
	prism.decks = [d1];
	state.currentPrism = prism;

	prism.markedCards = ['Lightning Bolt'];
	const beforeCounts = getStripeCountMap(); // visible = 1 (single standalone stripe)

	// Edit: a second standalone deck now shares the card → real new stripe.
	const d2 = createDeck({
		name: 'Deck 2',
		commander: 'Cmdr',
		bracket: 3,
		color: '#00FF00',
		stripePosition: 2,
		cards: [card('Lightning Bolt')],
	});
	prism.decks.push(d2);

	assert.equal(getStripeCountMap().get('Lightning Bolt'), 2); // genuinely 2 marks

	const unmarked = unmarkCardsWithNewStripes(beforeCounts);
	assert.deepEqual(unmarked, ['Lightning Bolt']);
	assert.deepEqual(state.currentPrism.markedCards, []);

	// The add-deck path (unmarkSharedCards) reaches the same conclusion.
	prism.markedCards = ['Lightning Bolt'];
	const removed = unmarkSharedCards(new Set(['lightning bolt']));
	assert.deepEqual(removed, ['Lightning Bolt']);
});

// 3. Dot group, card in a SUBSET of variants → markType='dot' entries are real
//    physical marks and DO count. When a genuine dot appears, unmark fires.
test('dot entries count as visible marks (subset of dot variants unmarks)', () => {
	// Card starts shared across both variants (visible = 1: Side A only).
	const { prism } = dotGroupPrism([[card('Swords')], [card('Swords')]]);
	state.currentPrism = prism;

	prism.markedCards = ['Swords'];
	const beforeCounts = getStripeCountMap(); // visible = 1
	assert.equal(beforeCounts.get('Swords'), 1);

	// Edit variant 2 to drop the card → now in a strict SUBSET (1 of 2),
	// which emits a real Side B dot in addition to the Side A stripe.
	prism.decks[1].cards = [card('Filler')];

	const after = getStripeCountMap();
	assert.equal(after.get('Swords'), 2); // Side A stripe + one dot, both visible

	const unmarked = unmarkCardsWithNewStripes(beforeCounts);
	assert.deepEqual(unmarked, ['Swords']);
	assert.deepEqual(state.currentPrism.markedCards, []);
});
