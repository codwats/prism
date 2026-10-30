/**
 * DeckCheck URL import. The fixture is a trimmed copy of a real
 * /api/external/deck response (deckcheck.co/app/decklist/ECpYZAmPUepK).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDeckCheckUrl, transformDeckCheckDeck } from '../js/modules/deckcheck.js';
import { deckSourceSite, resolveDeckSource } from '../js/modules/deck-source.js';

const entry = (name, quantity, typeLine) => ({ quantity, board: 'mainboard', finish: 'nonFoil', isFoil: false, card: { name, typeLine } });
const sample = {
	id: 'x', publicId: 'ECpYZAmPUepK', name: 'WIP-Just a little guy', format: 'commander', bracket: 2,
	publicUrl: 'https://deckcheck.co/app/decklist/ECpYZAmPUepK',
	boards: {
		commanders: { count: 1, cards: { a: entry('Brigone, Soldier of Meletis', 1, 'Legendary Creature — Human Soldier') } },
		mainboard: { count: 31, cards: {
			b: entry('Plains', 29, 'Basic Land — Plains'),
			c: entry('Twinblade Geist // Twinblade Invocation', 1, 'Creature — Spirit Warrior // Enchantment — Aura'),
			d: entry('Sol Ring', 1, 'Artifact')
		} },
		considering: { count: 1, cards: { e: entry('Smothering Tithe', 1, 'Enchantment') } }
	}
};

test('extractDeckCheckUrl: every share URL form maps to the decklist URL; bare IDs are refused', () => {
	for (const kind of ['deckview', 'decklist', 'builder']) {
		assert.equal(extractDeckCheckUrl(`https://deckcheck.co/app/${kind}/ECpYZAmPUepK?x=1`), 'https://deckcheck.co/app/decklist/ECpYZAmPUepK');
	}
	assert.equal(extractDeckCheckUrl('ECpYZAmPUepK'), null);
	assert.equal(extractDeckCheckUrl('https://moxfield.com/decks/abc'), null);
});

test('transformDeckCheckDeck: commanders flagged, basics detected, considering skipped', () => {
	const deck = transformDeckCheckDeck(sample);
	assert.equal(deck.sourceUrl, 'https://deckcheck.co/app/decklist/ECpYZAmPUepK');
	assert.equal(deck.bracket, 2);
	assert.deepEqual(deck.cards, [
		{ name: 'Brigone, Soldier of Meletis', quantity: 1, isCommander: true, isBasicLand: false },
		{ name: 'Plains', quantity: 29, isCommander: false, isBasicLand: true },
		{ name: 'Twinblade Geist // Twinblade Invocation', quantity: 1, isCommander: false, isBasicLand: false },
		{ name: 'Sol Ring', quantity: 1, isCommander: false, isBasicLand: false }
	]);
});

test('resolveDeckSource fetches DeckCheck through its proxy; export treats it as unsourced', async () => {
	const realFetch = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		assert.equal(url, '/api/deckcheck-edge');
		assert.deepEqual(JSON.parse(init.body), { deckUrl: 'https://deckcheck.co/app/decklist/ECpYZAmPUepK' });
		return new Response(JSON.stringify(sample));
	};
	try {
		const { serviceName, deckData } = await resolveDeckSource('https://deckcheck.co/app/builder/ECpYZAmPUepK');
		assert.equal(serviceName, 'DeckCheck');
		assert.equal(deckData.cards.length, 4);
	} finally {
		globalThis.fetch = realFetch;
	}
	assert.equal(deckSourceSite('https://deckcheck.co/app/decklist/ECpYZAmPUepK'), null);
});
