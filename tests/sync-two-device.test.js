// #416: scripted two-device interleavings through the real sync paths
// (forceSyncCurrentPrism = the debounced save sync, syncWithSupabase = page
// load) against an in-memory cloud. Each scenario asks whether an edit made on
// one device is lost, or a removed thing comes back, once both have synced.
// Skipped tests reproduce open bugs; the skip names the issue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { on, reset, cloudRow, failCardsOnce } from './helpers/two-devices.mjs';

const { ensureAuthReady } = await import('../js/modules/auth.js');
const S = await import('../js/modules/storage.js');
const P = await import('../js/modules/processor.js');
const { trackRemovedCard, removalMark, openRemovals, closeRemoval, applySwap } = await import('../js/modules/swap.js');
const { planSleeveReuse, completeReuse } = await import('../js/modules/sleeve-reuse.js');
const { queueSwap, removeSwap } = await import('../js/modules/swap-queue.js');
const Tk = await import('../js/modules/tokens.js');
const { exportToJSON } = await import('../js/modules/export.js');
const { buildPrismFromJson } = await import('../js/modules/prism-import.js');

await ensureAuthReady();

const T = (min) => new Date(Date.parse('2026-11-01T10:00:00.000Z') + min * 60000).toISOString();
const card = (name, quantity = 1) => ({ name, quantity, isCommander: false, isBasicLand: false });
const sync = () => S.forceSyncCurrentPrism();
const load = () => S.syncWithSupabase();
const prism = () => S.getCurrentPrism();
const deck = (p, name) => p.decks.find((d) => d.name === name);
const cardNames = (d) => d.cards.map((c) => c.name).sort();
const flush = () => new Promise((resolve) => setImmediate(resolve));

// User actions, written the way build.html writes them, on the active device.
function editCards(name, cards) {
	const p = prism();
	S.savePrism(P.updateDeckInPrism(p, deck(p, name).id, { cards }));
}

function addDeck(name, cards) {
	const p = prism();
	S.savePrism(P.addDeckToPrism(p, P.createDeck({
		name, bracket: 3, color: P.getNextColor(p), stripePosition: P.getNextStripePosition(p), cards,
	})));
}

// handleDeleteConfirm: a removal row per card, then the deck goes.
function deleteDeck(name) {
	let p = prism();
	const d = deck(p, name);
	const before = d.splitGroupId ? P.processCards(p) : [];
	const now = new Date().toISOString();
	for (const c of d.cards) {
		const mark = removalMark(p, before, d, c.name, c.quantity, 0);
		if (mark) trackRemovedCard(p, { cardName: c.name, deckId: d.id, ...mark, removedAt: now, previousQuantity: c.quantity, newQuantity: 0, isCommander: false });
	}
	p = d.splitGroupId ? P.removeSplitChild(p, d.id) : P.removeDeckFromPrism(p, d.id);
	S.savePrism(p);
}

// setCardsMarked: the marks, then both timestamps.
function setMarked(keys, marked) {
	const p = prism();
	if (marked) {
		p.markedCards = [...new Set([...p.markedCards, ...keys])];
	} else {
		p.markedCards = p.markedCards.filter((k) => !keys.includes(k));
	}
	const now = new Date().toISOString();
	p.updatedAt = now;
	p.markedCardsUpdatedAt = now;
	S.savePrism(p);
}

// The PRISM menu's Dedicated commander copies checkbox.
function setDedicated(value) {
	const p = prism();
	const now = new Date().toISOString();
	p.useDedicatedCommanderCopies = value;
	p.useDedicatedCommanderCopiesUpdatedAt = now;
	p.updatedAt = now;
	S.savePrism(p);
}

function rename(name) {
	const p = prism();
	p.name = name;
	p.updatedAt = new Date().toISOString();
	S.savePrism(p);
}

// Shared PRISM synced to both devices: Alpha (slot 1) and Beta (slot 2) both
// run Sol Ring. A uploads it at T(0), B pulls it at T(1).
async function seed({ marked = [], split = 0 } = {}) {
	reset();
	await on('A', T(0), async () => {
		let p = P.createPrism('Shared');
		p = P.addDeckToPrism(p, P.createDeck({ name: 'Alpha', bracket: 3, color: '#FF0000', stripePosition: 1, cards: [card('Sol Ring'), card('Alpha Card')] }));
		p = P.addDeckToPrism(p, P.createDeck({ name: 'Beta', bracket: 3, color: '#00FF00', stripePosition: 2, cards: [card('Sol Ring'), card('Beta Card')] }));
		if (split) p = P.splitDeck(p, deck(p, 'Alpha').id, split);
		p.markedCards = marked;
		S.savePrism(p);
		S.setCurrentPrism(p.id);
		await sync();
	});
	await on('B', T(1), load);
	return prism().id;
}

// Slot invariants a merge must keep: one occupant per Side A slot, and no
// split group left with a single variant (removeSplitChild unsplits at 1).
function assertStructure(p) {
	const sideA = [
		...p.decks.filter((d) => !d.splitGroupId).map((d) => d.stripePosition),
		...p.splitGroups.map((g) => g.sideAPosition),
	];
	assert.equal(new Set(sideA).size, sideA.length, `two occupants share a Side A slot: ${sideA}`);
	for (const g of p.splitGroups) {
		assert.ok(g.childDeckIds.length >= 2, `split group "${g.name}" was left with ${g.childDeckIds.length} variant`);
	}
	for (const d of p.decks) {
		if (d.splitGroupId) assert.ok(p.splitGroups.some((g) => g.id === d.splitGroupId), `"${d.name}" points at a deleted split group`);
	}
}

// ---------------------------------------------------------------------------
// Offline edits on both devices
// ---------------------------------------------------------------------------

test('offline edits to different decks on each device both survive', async () => {
	const id = await seed();
	await on('A', T(10), () => editCards('Alpha', [card('Sol Ring'), card('Alpha New')]));
	await on('B', T(11), () => editCards('Beta', [card('Sol Ring'), card('Beta New')]));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => {
			assert.deepEqual(cardNames(deck(prism(), 'Alpha')), ['Alpha New', 'Sol Ring'], name);
			assert.deepEqual(cardNames(deck(prism(), 'Beta')), ['Beta New', 'Sol Ring'], name);
		});
	}
	assert.equal(cloudRow(id).decks.length, 2);
});

test('the same deck edited on both devices converges on the later edit', async () => {
	await seed();
	await on('A', T(10), () => editCards('Alpha', [card('From A')]));
	await on('B', T(11), () => editCards('Alpha', [card('From B')]));
	// The earlier edit syncs last, so it holds the cloud for a round.
	await on('B', T(12), sync);
	await on('A', T(13), sync);
	await on('B', T(14), load);
	await on('A', T(15), load);

	for (const name of ['A', 'B']) {
		await on(name, T(16), () => assert.deepEqual(cardNames(deck(prism(), 'Alpha')), ['From B'], name));
	}
});

test('a deck added on each device while offline keeps both decks', async () => {
	await seed();
	await on('A', T(10), () => addDeck('Gamma', [card('Gamma Card')]));
	await on('B', T(11), () => addDeck('Delta', [card('Delta Card')]));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	await on('A', T(15), () => assert.deepEqual(prism().decks.map((d) => d.name).sort(), ['Alpha', 'Beta', 'Delta', 'Gamma']));
});

test('decks added on each device while offline get different slots', { skip: '#505' }, async () => {
	await seed();
	await on('A', T(10), () => addDeck('Gamma', [card('Gamma Card')]));
	await on('B', T(11), () => addDeck('Delta', [card('Delta Card')]));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	// Both took slot 3, the next free one on each device.
	await on('A', T(15), () => assertStructure(prism()));
});

test('a PRISM rename on one device survives a later mark on the other', { skip: '#506' }, async () => {
	await seed();
	await on('A', T(10), () => rename('Renamed on A'));
	await on('B', T(11), () => setMarked(['Sol Ring'], true));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => assert.equal(prism().name, 'Renamed on A', name));
	}
});

// ---------------------------------------------------------------------------
// Deletions vs edits
// ---------------------------------------------------------------------------

test('a deck deleted on A and edited later on B comes back with the edit', async () => {
	const id = await seed();
	await on('A', T(10), () => deleteDeck('Beta'));
	await on('A', T(11), sync);
	await on('B', T(12), () => editCards('Beta', [card('Sol Ring'), card('Beta New')]));
	await on('B', T(13), sync);
	await on('A', T(14), load);

	await on('A', T(15), () => assert.deepEqual(cardNames(deck(prism(), 'Beta')), ['Beta New', 'Sol Ring']));
	assert.ok(cloudRow(id).decks.some((d) => d.name === 'Beta'));
});

test('a deck that comes back from the other device does not keep its delete-time Marks to Clear', { skip: '#507' }, async () => {
	await seed();
	await on('A', T(10), () => deleteDeck('Beta'));
	await on('A', T(11), sync);
	await on('B', T(12), () => editCards('Beta', [card('Sol Ring'), card('Beta New')]));
	await on('B', T(13), sync);
	await on('A', T(14), load);

	await on('A', T(15), () => {
		const p = prism();
		const beta = deck(p, 'Beta');
		assert.ok(beta, 'Beta came back');
		// Marks to Clear would have the user strip Beta's stripe off sleeves Beta still uses.
		assert.deepEqual(openRemovals(p).filter((r) => r.deckId === beta.id).map((r) => r.cardName), []);
	});
});

test('a deck edited on B and deleted later on A stays deleted once both have synced', async () => {
	const id = await seed();
	await on('B', T(10), () => editCards('Beta', [card('Sol Ring'), card('Beta New')]));
	await on('A', T(11), () => deleteDeck('Beta'));
	// The delete syncs first; B's older edit puts the deck back for a round.
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);
	await on('B', T(15), load);

	for (const name of ['A', 'B']) {
		await on(name, T(16), () => assert.equal(deck(prism(), 'Beta'), undefined, name));
	}
	assert.ok(!cloudRow(id).decks.some((d) => d.name === 'Beta'));
});

test('a PRISM deleted on A after an edit on B stays deleted once both have synced', async () => {
	const id = await seed();
	await on('B', T(10), () => editCards('Beta', [card('Beta New')]));
	await on('A', T(11), async () => { S.deletePrism(id); await flush(); });
	assert.equal(cloudRow(id), null, 'the delete reached the cloud');
	await on('B', T(12), sync); // the debounced sync finds no cloud copy and re-uploads
	await on('A', T(13), async () => { await load(); await flush(); });
	await on('B', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => assert.equal(S.getPrism(id), null, name));
	}
	assert.equal(cloudRow(id), null);
});

// ---------------------------------------------------------------------------
// markedCards and un-mark tombstones
// ---------------------------------------------------------------------------

test('a mark on each device while offline keeps both marks', async () => {
	await seed();
	await on('A', T(10), () => setMarked(['Alpha Card'], true));
	await on('B', T(11), () => setMarked(['Beta Card'], true));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => assert.deepEqual([...prism().markedCards].sort(), ['Alpha Card', 'Beta Card'], name));
	}
});

test('an un-mark on A is not undone by B, which still holds the mark', async () => {
	const id = await seed({ marked: ['Sol Ring'] });
	await on('A', T(10), () => setMarked(['Sol Ring'], false));
	await on('A', T(11), sync);
	await on('B', T(12), load); // B only opens the app

	await on('B', T(13), () => assert.deepEqual(prism().markedCards, [], 'B'));
	assert.deepEqual(cloudRow(id).marked_cards, [], 'cloud');
});

test('un-marking then re-marking before the sync keeps the mark', async () => {
	await seed({ marked: ['Sol Ring'] });
	await on('A', T(10), () => setMarked(['Sol Ring'], false));
	await on('A', T(10.5), () => setMarked(['Sol Ring'], true)); // misclick, re-checked inside the debounce
	await on('A', T(11), sync);

	await on('A', T(12), () => assert.deepEqual(prism().markedCards, ['Sol Ring']));
});

test('a re-mark on B newer than an un-mark on A wins', async () => {
	const id = await seed({ marked: ['Sol Ring'] });
	await on('A', T(10), () => setMarked(['Sol Ring'], false));
	await on('B', T(11), () => setMarked(['Sol Ring'], false));
	await on('B', T(12), () => setMarked(['Sol Ring'], true));
	await on('B', T(13), sync);
	await on('A', T(14), sync); // A's older tombstone drops B's newer re-mark

	await on('A', T(15), () => assert.deepEqual(prism().markedCards, ['Sol Ring'], 'A'));
	assert.deepEqual(cloudRow(id).marked_cards, ['Sol Ring'], 'cloud');
});

test('an automatic un-mark on A (a Swap gives a Done card a new stripe) reaches B', async () => {
	const id = await seed({ marked: ['Beta Card'] });
	await on('A', T(10), () => {
		const p = prism();
		const { prism: next, summary } = applySwap(p, { outgoing: 'Alpha Card', incoming: 'Beta Card', deckIds: [deck(p, 'Alpha').id] });
		assert.deepEqual(summary.unmarkedKeys, ['Beta Card']);
		S.savePrism(next);
	});
	await on('A', T(11), sync);
	await on('B', T(12), load);

	// B would call the sleeve Done while it lacks Alpha's new stripe.
	await on('B', T(13), () => assert.deepEqual(prism().markedCards, [], 'B'));
	assert.deepEqual(cloudRow(id).marked_cards, [], 'cloud');
});

test('restoring a backup over the PRISM keeps an unsynced un-mark the backup also lacks', async () => {
	const id = await seed({ marked: ['Sol Ring', 'Beta Card'] });
	await on('A', T(10), () => setMarked(['Sol Ring'], false));
	await on('A', T(11), () => S.savePrism(buildPrismFromJson(JSON.parse(exportToJSON(prism()))))); // build.html's JSON import
	await on('A', T(12), sync);
	await on('B', T(13), load);

	await on('B', T(14), () => assert.deepEqual(prism().markedCards, ['Beta Card'], 'B'));
	assert.deepEqual(cloudRow(id).marked_cards, ['Beta Card'], 'cloud');
});

test('a mark and an un-mark the old client left unsynced both reach the other device', async () => {
	const id = await seed({ marked: ['Sol Ring'] });
	// As the client before #500 stored them: no mark times, the un-mark a local tombstone.
	await on('A', T(10), () => {
		const data = JSON.parse(localStorage.getItem('prism_data'));
		const p = data.prisms[id];
		p.markedCards = ['Alpha Card'];
		delete p.markTimes;
		data.syncState.prismBaselines[id].unmarkedCards = { 'Sol Ring': T(10) };
		localStorage.setItem('prism_data', JSON.stringify(data));
	});
	await on('A', T(11), sync);
	await on('B', T(12), load);

	await on('B', T(13), () => assert.deepEqual(prism().markedCards, ['Alpha Card'], 'B'));
	assert.deepEqual(cloudRow(id).marked_cards, ['Alpha Card'], 'cloud');
});

// ---------------------------------------------------------------------------
// Clock skew: B's clock runs an hour fast
// ---------------------------------------------------------------------------

// Marks merge per key (#500), so B's fast clock on another key no longer counts.
test('clock skew: an un-mark on the device whose clock is behind sticks', async () => {
	const id = await seed({ marked: ['Sol Ring'] });
	await on('B', T(65), () => setMarked(['Beta Card'], true)); // real T(5)
	await on('B', T(66), sync);
	await on('A', T(7), load);
	await on('A', T(10), () => setMarked(['Sol Ring'], false));
	await on('A', T(11), sync);

	await on('A', T(12), () => assert.deepEqual(prism().markedCards, ['Beta Card']));
	assert.deepEqual(cloudRow(id).marked_cards, ['Beta Card']);
});

test('clock skew: a re-mark on the device whose clock is behind beats an earlier un-mark of that card', async () => {
	const id = await seed({ marked: ['Sol Ring'] });
	await on('B', T(65), () => setMarked(['Sol Ring'], false)); // real T(5)
	await on('B', T(66), sync);
	await on('A', T(7), load);
	await on('A', T(10), () => setMarked(['Sol Ring'], true));
	await on('A', T(11), sync);

	await on('A', T(12), () => assert.deepEqual(prism().markedCards, ['Sol Ring']));
	assert.deepEqual(cloudRow(id).marked_cards, ['Sol Ring']);
});

test('clock skew: a deck edit on the device whose clock is behind sticks', async () => {
	await seed();
	await on('B', T(65), () => editCards('Alpha', [card('From B')])); // real T(5)
	await on('B', T(66), sync);
	await on('A', T(7), load);
	await on('A', T(10), () => editCards('Alpha', [card('From A')]));
	await on('A', T(11), sync);

	await on('A', T(12), () => assert.deepEqual(cardNames(deck(prism(), 'Alpha')), ['From A']));
});

test('clock skew: a deck delete on the device whose clock is behind sticks', async () => {
	await seed();
	await on('B', T(65), () => editCards('Alpha', [card('From B')])); // real T(5)
	await on('B', T(66), sync);
	await on('A', T(7), load);
	await on('A', T(10), () => deleteDeck('Alpha'));
	await on('A', T(11), sync);
	await on('A', T(12), load);

	await on('A', T(13), () => assert.equal(deck(prism(), 'Alpha'), undefined));
});

// ---------------------------------------------------------------------------
// useDedicatedCommanderCopies: own timestamp, not prism.updatedAt
// ---------------------------------------------------------------------------

test('Dedicated commander copies turned on at A survives a later mark on B', async () => {
	await seed();
	await on('A', T(10), () => setDedicated(true));
	await on('B', T(11), () => setMarked(['Sol Ring'], true));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => assert.equal(prism().useDedicatedCommanderCopies, true, name));
	}
});

test('Dedicated commander copies toggled on both devices takes the later toggle', async () => {
	await seed();
	await on('A', T(10), () => setDedicated(true));
	await on('B', T(11), () => setDedicated(true));
	await on('B', T(12), () => setDedicated(false));
	await on('B', T(13), sync);
	await on('A', T(14), sync);
	await on('B', T(15), load);

	for (const name of ['A', 'B']) {
		await on(name, T(16), () => assert.equal(prism().useDedicatedCommanderCopies, false, name));
	}
});

// ---------------------------------------------------------------------------
// removedCards
// ---------------------------------------------------------------------------

test('copies a Sleeve reuse cleared on A stay cleared when B re-tracks the row', async () => {
	await seed();
	await on('A', T(10), () => deleteDeck('Beta'));
	await on('A', T(11), sync);
	await on('B', T(12), load);
	await on('A', T(13), () => {
		const p = prism();
		p.removedCards.find((r) => r.cardName === 'Beta Card').clearedQuantity = 1;
		p.updatedAt = new Date().toISOString();
		S.savePrism(p);
	});
	await on('B', T(14), () => {
		const p = prism();
		const row = p.removedCards.find((r) => r.cardName === 'Beta Card');
		trackRemovedCard(p, { ...row, removedAt: new Date().toISOString(), previousQuantity: 1, newQuantity: 0 });
		p.updatedAt = new Date().toISOString();
		S.savePrism(p);
	});
	await on('B', T(15), sync);
	await on('A', T(16), sync);

	await on('A', T(17), () => assert.equal(openRemovals(prism()).some((r) => r.cardName === 'Beta Card'), false));
});

test('Marks to Clear rows cleared on A stay cleared after sync', async () => {
	const id = await seed();
	await on('A', T(10), () => deleteDeck('Beta'));
	await on('A', T(11), sync);
	await on('B', T(12), load);
	// handleClearAllRemoved: rows close, never go (#501)
	await on('A', T(13), () => {
		const p = prism();
		openRemovals(p).forEach(closeRemoval);
		p.updatedAt = new Date().toISOString();
		S.savePrism(p);
	});
	await on('A', T(14), sync);
	await on('B', T(15), load);
	await on('A', T(16), load);

	for (const name of ['A', 'B']) {
		await on(name, T(17), () => assert.deepEqual(openRemovals(prism()), [], name));
	}
	assert.deepEqual(openRemovals({ removedCards: cloudRow(id).removed_cards }), []);
});

test('a cleared row the card is removed again from opens again on both devices', async () => {
	await seed();
	await on('A', T(10), () => deleteDeck('Beta'));
	await on('A', T(11), sync);
	await on('B', T(12), load);
	await on('A', T(13), () => {
		const p = prism();
		openRemovals(p).forEach(closeRemoval);
		p.updatedAt = new Date().toISOString();
		S.savePrism(p);
	});
	await on('A', T(14), sync);
	await on('B', T(15), load);
	// The card went back on a sleeve with the mark and left again: a new removal.
	await on('B', T(16), () => {
		const p = prism();
		const row = p.removedCards.find((r) => r.cardName === 'Beta Card');
		trackRemovedCard(p, { ...row, clearedQuantity: undefined, removedAt: new Date().toISOString(), previousQuantity: 1, newQuantity: 0 });
		p.updatedAt = new Date().toISOString();
		S.savePrism(p);
	});
	await on('B', T(17), sync);
	await on('A', T(18), load);

	for (const name of ['A', 'B']) {
		await on(name, T(19), () => assert.deepEqual(openRemovals(prism()).map((r) => r.cardName), ['Beta Card'], name));
	}
});

// ---------------------------------------------------------------------------
// Planned swaps
// ---------------------------------------------------------------------------

test('a Planned swap removed on A stays gone while one queued on B arrives', async () => {
	await seed();
	await on('A', T(5), () => S.savePrism(queueSwap(prism(), { incoming: 'Arcane Signet', deckId: deck(prism(), 'Alpha').id })));
	await on('A', T(6), sync);
	await on('B', T(7), load);
	await on('A', T(10), () => S.savePrism(removeSwap(prism(), prism().plannedSwaps[0].id)));
	await on('B', T(11), () => S.savePrism(queueSwap(prism(), { incoming: 'Mind Stone', deckId: deck(prism(), 'Beta').id })));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => assert.deepEqual(prism().plannedSwaps.map((s) => s.incoming), ['Mind Stone'], name));
	}
});

// ---------------------------------------------------------------------------
// Token pack (#412): choices merge per entry, newest wins, nothing deleted
// ---------------------------------------------------------------------------

const TREASURE = { oracleId: 'o-treasure', name: 'Treasure' };
const DINOSAUR = { oracleId: 'o-dino', name: 'Dinosaur' };
const tokensOf = (name) => ({ 'Alpha Card': [TREASURE], 'Beta Card': [DINOSAUR] })[name];
const tokenNames = () => Tk.tokenRows(prism(), tokensOf).map((r) => r.name).sort();
const choose = (fn) => S.savePrism(fn(prism()));

// A deck edit as the build page saves one (a new deck object, new updatedAt).
function bracketUp(p, name) {
	const now = new Date().toISOString();
	return { ...p, updatedAt: now, decks: p.decks.map((d) => (d.name === name ? { ...d, bracket: d.bracket + 1, updatedAt: now } : d)) };
}

test('a token hidden on A survives a later deck edit and mark on B', async () => {
	const id = await seed();
	await on('A', T(10), () => choose((p) => Tk.setTokenHidden(p, 'o-treasure', true)));
	await on('B', T(11), () => S.savePrism(bracketUp(prism(), 'Beta')));
	await on('B', T(11.5), () => setMarked(['Sol Ring'], true));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => {
			assert.deepEqual(tokenNames(), ['Dinosaur'], name);
			assert.equal(deck(prism(), 'Beta').bracket, 4, name);
		});
	}
	assert.deepEqual(cloudRow(id).token_choices.map((c) => [c.kind, c.oracle_id, c.hidden]), [['hidden', 'o-treasure', true]]);
});

test('a token hand-added on A and a pairing made on B both arrive on both devices', async () => {
	await seed();
	const alphaId = await on('A', T(2), () => deck(prism(), 'Alpha').id);
	await on('A', T(10), () => choose((p) => Tk.setAddedToken(p, { oracleId: 'o-copy', name: 'Copy' }, [alphaId])));
	await on('B', T(11), () => choose((p) => Tk.pairTokens(p, 'o-treasure', 'o-dino')));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => assert.deepEqual(tokenNames(), ['Copy', 'Dinosaur // Treasure'], name));
	}
});

test('a token hand-added for one deck on A and another deck on B keeps both decks', async () => {
	const id = await seed();
	const copy = { oracleId: 'o-copy', name: 'Copy' };
	const [alphaId, betaId] = await on('A', T(2), () => [deck(prism(), 'Alpha').id, deck(prism(), 'Beta').id]);
	await on('A', T(10), () => choose((p) => Tk.setAddedToken(p, copy, [alphaId])));
	await on('B', T(11), () => choose((p) => Tk.setAddedToken(p, copy, [betaId])));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	for (const name of ['A', 'B']) {
		await on(name, T(15), () => assert.deepEqual(Tk.addedTokenDecks(prism(), 'o-copy').sort(), [alphaId, betaId].sort(), name));
	}
	assert.equal(cloudRow(id).token_choices.filter((c) => c.included).length, 2);
});

test('a later unhide on B beats an earlier hide on A that syncs last', async () => {
	const id = await seed();
	await on('A', T(10), () => choose((p) => Tk.setTokenHidden(p, 'o-treasure', true)));
	await on('B', T(11), () => choose((p) => Tk.setTokenHidden(p, 'o-treasure', true)));
	await on('B', T(12), () => choose((p) => Tk.setTokenHidden(p, 'o-treasure', false)));
	await on('B', T(13), sync);
	await on('A', T(14), sync);
	await on('B', T(15), load);

	for (const name of ['A', 'B']) {
		await on(name, T(16), () => assert.deepEqual(tokenNames(), ['Dinosaur', 'Treasure'], name));
	}
	assert.equal(cloudRow(id).token_choices[0].hidden, false);
});

test('a pairing B made survives the next saves from A\'s open build page', async () => {
	const id = await seed();
	// A has build.html open: state.currentPrism is read once at load (#499).
	let page = await on('A', T(2), prism);
	await on('B', T(3), () => choose((p) => Tk.pairTokens(p, 'o-treasure', 'o-dino')));
	await on('B', T(4), sync);
	await on('A', T(5), () => { page = bracketUp(page, 'Alpha'); S.savePrism(page); });
	await on('A', T(6), sync); // merges the pairing into storage, not into the page
	await on('A', T(7), () => { page = bracketUp(page, 'Beta'); S.savePrism(page); });
	await on('A', T(8), sync);
	await on('B', T(9), load);
	await on('A', T(10), load);

	for (const name of ['A', 'B']) {
		await on(name, T(11), () => assert.deepEqual(tokenNames(), ['Dinosaur // Treasure'], name));
	}
	assert.equal(cloudRow(id).token_choices.length, 2);
});

// ---------------------------------------------------------------------------
// Split groups vs variant edits
// ---------------------------------------------------------------------------

test('a split on A and a card edit to that deck on B leave a whole split group', { skip: '#504' }, async () => {
	await seed();
	await on('A', T(10), () => S.savePrism(P.splitDeck(prism(), deck(prism(), 'Alpha').id, 2)));
	await on('B', T(11), () => editCards('Alpha', [card('Sol Ring'), card('Alpha New')]));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	await on('A', T(15), () => assertStructure(prism()));
});

test('different variants removed on each device leave no one-variant group', { skip: '#504' }, async () => {
	await seed({ split: 3 });
	const variants = await on('A', T(2), () => prism().splitGroups[0].childDeckIds.map((cid) => prism().decks.find((d) => d.id === cid).name));
	await on('A', T(10), () => deleteDeck(variants[1]));
	await on('B', T(11), () => deleteDeck(variants[2]));
	await on('A', T(12), sync);
	await on('B', T(13), sync);
	await on('A', T(14), load);

	await on('A', T(15), () => assertStructure(prism()));
});

test('a variant edited on B after A removed it comes back into the group', async () => {
	await seed({ split: 3 });
	const variants = await on('A', T(2), () => prism().splitGroups[0].childDeckIds.map((cid) => prism().decks.find((d) => d.id === cid).name));
	await on('A', T(10), () => deleteDeck(variants[2]));
	await on('A', T(11), sync);
	await on('B', T(12), () => editCards(variants[2], [card('Sol Ring'), card('Variant New')]));
	await on('B', T(13), sync);
	await on('A', T(14), load);

	await on('A', T(15), () => {
		const p = prism();
		assert.deepEqual(cardNames(deck(p, variants[2])), ['Sol Ring', 'Variant New']);
		assert.equal(p.splitGroups[0].childDeckIds.length, 3);
		assertStructure(p);
	});
});

// ---------------------------------------------------------------------------
// Deck cards ride the deck's updatedAt
// ---------------------------------------------------------------------------

test('a card upload that failed once still converges both devices on the edit', async () => {
	await seed();
	const alphaId = await on('A', T(2), () => deck(prism(), 'Alpha').id);
	await on('A', T(10), () => editCards('Alpha', [card('Sol Ring'), card('Alpha New')]));
	failCardsOnce.add(alphaId);
	await on('A', T(11), sync); // deck row written, its cards not
	await on('B', T(12), load);
	await on('A', T(13), sync); // retry succeeds
	await on('B', T(14), load);
	await on('A', T(15), load);

	for (const name of ['A', 'B']) {
		await on(name, T(16), () => assert.deepEqual(cardNames(deck(prism(), 'Alpha')), ['Alpha New', 'Sol Ring'], name));
	}
});

// ---------------------------------------------------------------------------
// The open build page holds state.currentPrism across background syncs
// ---------------------------------------------------------------------------

test('a deck B added survives the next edit on A\'s open build page', async () => {
	const id = await seed();
	// A has build.html open: state.currentPrism is read once at load.
	let page = await on('A', T(2), prism);
	await on('B', T(3), () => addDeck('Gamma', [card('Gamma Card')]));
	await on('B', T(4), sync);
	await on('A', T(5), () => {
		page = P.updateDeckInPrism(page, deck(page, 'Alpha').id, { bracket: 4 });
		S.savePrism(page);
	});
	await on('A', T(6), sync); // the debounced sync merges Gamma into storage, not into the page
	await on('A', T(7), () => {
		page = P.updateDeckInPrism(page, deck(page, 'Beta').id, { bracket: 4 });
		S.savePrism(page);
	});
	await on('A', T(8), sync);
	await on('B', T(9), load);

	await on('B', T(10), () => assert.ok(deck(prism(), 'Gamma'), 'Gamma is gone from B'));
	assert.ok(cloudRow(id).decks.some((d) => d.name === 'Gamma'), 'Gamma is gone from the cloud');
});

test('a deck B deleted stays deleted after the next edits on A\'s open build page', async () => {
	const id = await seed();
	let page = await on('A', T(2), prism);
	await on('B', T(3), () => deleteDeck('Beta'));
	await on('B', T(4), sync);
	await on('A', T(5), () => { page = bracketUp(page, 'Alpha'); S.savePrism(page); });
	await on('A', T(6), sync); // drops Beta from storage, not from the page
	await on('A', T(7), () => { page = bracketUp(page, 'Alpha'); S.savePrism(page); });
	await on('A', T(8), sync);
	await on('B', T(9), load);

	for (const name of ['A', 'B']) {
		await on(name, T(10), () => assert.equal(deck(prism(), 'Beta'), undefined, `Beta is back on ${name}`));
	}
	assert.ok(!cloudRow(id).decks.some((d) => d.name === 'Beta'), 'Beta is back in the cloud');
});

test('a split group and a Planned swap B added survive the next edits on A\'s open build page', async () => {
	const id = await seed();
	let page = await on('A', T(2), prism);
	await on('B', T(3), () => S.savePrism(P.splitDeck(prism(), deck(prism(), 'Beta').id, 2)));
	await on('B', T(3.5), () => S.savePrism(queueSwap(prism(), { incoming: 'Arcane Signet', deckId: deck(prism(), 'Alpha').id })));
	await on('B', T(4), sync);
	await on('A', T(5), () => { page = bracketUp(page, 'Alpha'); S.savePrism(page); });
	await on('A', T(6), sync);
	await on('A', T(7), () => { page = bracketUp(page, 'Alpha'); S.savePrism(page); });
	await on('A', T(8), sync);
	await on('B', T(9), load);

	for (const name of ['A', 'B']) {
		await on(name, T(10), () => {
			const p = prism();
			assert.equal(p.splitGroups.length, 1, `the split group is gone from ${name}`);
			assert.deepEqual(p.plannedSwaps.map((s) => s.incoming), ['Arcane Signet'], name);
			assert.equal(deck(p, 'Alpha').bracket, 5, name);
			assertStructure(p);
		});
	}
	assert.equal(cloudRow(id).planned_swaps.length, 1);
});

test('a deck A\'s open build page deletes stays deleted, and the deck B added stays', async () => {
	const id = await seed();
	let page = await on('A', T(2), prism);
	await on('B', T(3), () => addDeck('Gamma', [card('Gamma Card')]));
	await on('B', T(4), sync);
	await on('A', T(5), () => { page = bracketUp(page, 'Alpha'); S.savePrism(page); });
	await on('A', T(6), sync);
	await on('A', T(7), () => { page = P.removeDeckFromPrism(page, deck(page, 'Beta').id); S.savePrism(page); });
	await on('A', T(8), sync);
	await on('B', T(9), load);

	for (const name of ['A', 'B']) {
		await on(name, T(10), () => assert.deepEqual(prism().decks.map((d) => d.name).sort(), ['Alpha', 'Gamma'], name));
	}
	assert.deepEqual(cloudRow(id).decks.map((d) => d.name).sort(), ['Alpha', 'Gamma']);
});

test('two tabs on A: a rename, a deck and a mark from one tab survive the next edit in the other', async () => {
	const id = await seed();
	let tab = await on('A', T(2), prism);
	await on('A', T(3), () => rename('Renamed in the other tab'));
	await on('A', T(4), () => addDeck('Gamma', [card('Gamma Card')]));
	await on('A', T(4.5), () => setMarked(['Gamma Card'], true));
	await on('A', T(5), () => { tab = bracketUp(tab, 'Alpha'); S.savePrism(tab); });
	await on('A', T(6), sync);
	await on('B', T(7), load);

	for (const name of ['A', 'B']) {
		await on(name, T(8), () => {
			const p = prism();
			assert.equal(p.name, 'Renamed in the other tab', name);
			assert.ok(deck(p, 'Gamma'), `Gamma is gone from ${name}`);
			assert.deepEqual(p.markedCards, ['Gamma Card'], name);
			assert.equal(deck(p, 'Alpha').bracket, 4, name);
		});
	}
	assert.equal(cloudRow(id).name, 'Renamed in the other tab');
});

// A save can land after a later one from another tab: an edit stamps `now`,
// awaits (Scryfall), then saves. The newer timestamps and toggle stand.
test('two tabs on A: an edit stamped before the other tab\'s toggle never rolls it back', async () => {
	await seed();
	let tab = await on('A', T(2), prism);
	await on('A', T(3), () => setDedicated(true));
	await on('A', T(5), () => setDedicated(false));
	await on('A', T(6), () => {
		tab = { ...tab, useDedicatedCommanderCopies: true, useDedicatedCommanderCopiesUpdatedAt: T(4), updatedAt: T(4) };
		S.savePrism(tab);
	});

	await on('A', T(7), () => {
		const p = prism();
		assert.equal(p.useDedicatedCommanderCopies, false);
		assert.equal(p.useDedicatedCommanderCopiesUpdatedAt, T(5));
		assert.equal(p.updatedAt, T(5), 'updatedAt went backwards');
	});
});

test('two tabs on A: the dedicated-copies flag and its timestamp move together', async () => {
	await seed();
	let tab = await on('A', T(2), prism);
	await on('A', T(3), () => setDedicated(true));
	await on('A', T(6), () => {
		// Only the timestamp differs from what this tab read; the flag must still follow it.
		tab = { ...tab, useDedicatedCommanderCopiesUpdatedAt: T(5), updatedAt: T(5) };
		S.savePrism(tab);
	});
	await on('A', T(7), () => {
		const p = prism();
		assert.equal(p.useDedicatedCommanderCopiesUpdatedAt, T(5));
		assert.equal(p.useDedicatedCommanderCopies, !!tab.useDedicatedCommanderCopies);
	});
});

test('two tabs on A: a deck edited in both takes the later edit, as a sync merge does', async () => {
	await seed();
	let tab = await on('A', T(2), prism);
	await on('A', T(5), () => S.savePrism(bracketUp(bracketUp(prism(), 'Alpha'), 'Beta')));
	await on('A', T(6), () => {
		const edit = (name, at) => (d) => (d.name === name ? { ...d, bracket: 1, updatedAt: at } : d);
		tab = { ...tab, updatedAt: T(6), decks: tab.decks.map(edit('Alpha', T(4))).map(edit('Beta', T(6))) };
		S.savePrism(tab);
	});

	await on('A', T(7), () => {
		assert.equal(deck(prism(), 'Alpha').bracket, 4, 'the other tab\'s later Alpha edit is lost');
		assert.equal(deck(prism(), 'Beta').bracket, 1, 'this tab\'s later Beta edit is lost');
	});
});

// applySwap and completeReuse return a structuredClone of the PRISM they get.
test('two tabs on A: a Swap and a Sleeve reuse from one tab keep the decks the other tab added', async () => {
	await seed({ marked: ['Beta Card'] });
	let tab = await on('A', T(2), prism);
	await on('A', T(3), () => addDeck('Gamma', [card('Gamma Card')]));
	await on('A', T(4), () => {
		tab = applySwap(tab, { outgoing: 'Beta Card', incoming: 'Cultivate', deckIds: [deck(tab, 'Beta').id] }).prism;
		S.savePrism(tab);
	});
	await on('A', T(5), () => assert.ok(deck(prism(), 'Gamma'), 'the Swap dropped Gamma'));

	await on('A', T(6), () => addDeck('Delta', [card('Delta Card')]));
	await on('A', T(7), () => {
		const [match] = planSleeveReuse(tab).matches;
		S.savePrism(completeReuse(tab, match.id).prism);
	});
	await on('A', T(8), () => {
		assert.ok(deck(prism(), 'Gamma') && deck(prism(), 'Delta'), 'the Sleeve reuse dropped a deck');
		assert.deepEqual(openRemovals(prism()), [], 'the reuse cleared the Beta Card row');
	});
});
