// #415: Marks to Clear rows across two devices, through the real sync paths
// (the #416 harness). A Constructed deck's main and Sideboard copies are one
// card with one row (#29); each device cuts some and both must agree after sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { on, reset } from './helpers/two-devices.mjs';

const { ensureAuthReady } = await import('../js/modules/auth.js');
const S = await import('../js/modules/storage.js');
const P = await import('../js/modules/processor.js');
const { trackRemovedCard, removalMark, openRemovals, removalOpenCopies } = await import('../js/modules/swap.js');

await ensureAuthReady();

const T = (min) => new Date(Date.parse('2026-11-01T10:00:00.000Z') + min * 60000).toISOString();
const card = (name, quantity = 1, isSideboard = false) =>
	({ name, quantity, isCommander: false, isBasicLand: false, ...(isSideboard ? { isSideboard } : {}) });
const prism = () => S.getCurrentPrism();

// handleEditConfirm's bookkeeping: a row per card that lost copies, then the new list.
function editCards(deckName, cards) {
	const p = prism();
	const d = p.decks.find((x) => x.name === deckName);
	const now = new Date().toISOString();
	for (const r of P.calculateRemovedCards(d.cards, cards)) {
		const mark = removalMark(p, [], d, r.name, r.previousQuantity, r.newQuantity);
		trackRemovedCard(p, { cardName: r.name, deckId: d.id, ...mark, removedAt: now, previousQuantity: r.previousQuantity, newQuantity: r.newQuantity, isCommander: false });
	}
	S.savePrism(P.updateDeckInPrism(p, d.id, { cards }));
}

const solRows = () => openRemovals(prism()).filter((r) => r.cardName === 'Sol Ring')
	.map((r) => [r.previousQuantity, r.newQuantity, removalOpenCopies(r)]);

test('Constructed: a Sideboard cut on A then a main cut on B list both copies on both devices', async () => {
	reset();
	await on('A', T(0), async () => {
		let p = P.createPrism('Constructed');
		p = P.addDeckToPrism(p, P.createDeck({ name: 'Burn', bracket: 2, color: '#FF0000', stripePosition: 1, cards: [card('Sol Ring', 2), card('Sol Ring', 1, true)] }));
		p = P.addDeckToPrism(p, P.createDeck({ name: 'Rogues', bracket: 2, color: '#0000FF', stripePosition: 2, cards: [card('Sol Ring')] }));
		S.savePrism(p);
		S.setCurrentPrism(p.id);
		await S.forceSyncCurrentPrism();
	});
	await on('B', T(1), () => S.syncWithSupabase());

	await on('A', T(10), () => editCards('Burn', [card('Sol Ring', 2)]));
	await on('A', T(11), () => S.forceSyncCurrentPrism());
	await on('B', T(12), () => S.syncWithSupabase());
	await on('B', T(13), () => editCards('Burn', [card('Sol Ring', 1)]));
	await on('B', T(14), () => S.forceSyncCurrentPrism());
	await on('A', T(15), () => S.syncWithSupabase());

	for (const name of ['A', 'B']) {
		// 3 copies painted, 1 left in Burn: 2 to clear, on one row.
		await on(name, T(16), () => assert.deepEqual(solRows(), [[3, 1, 2]], name));
	}
});
