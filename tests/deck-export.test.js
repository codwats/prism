/**
 * Copy deck changes back to Moxfield/Archidekt (#377). Site responses are
 * fixtures run through the real import transforms, so the diff sees what the
 * live fetch would hand it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deckExport, exportDeck, changesText } from '../js/modules/deck-export.js';
import { transformMoxfieldDeck } from '../js/modules/moxfield.js';
import { transformArchidektDeck } from '../js/modules/archidekt.js';

const card = (name, quantity = 1, isCommander = false) => ({ name, quantity, isCommander, isBasicLand: false });

const prismDeck = {
	name: 'Ayula',
	cards: [card('Ayula, Queen Among Bears', 1, true), card('Cultivate'), card('Forest', 30), card('Sol Ring')]
};

const moxCard = (name, quantity = 1) => ({ quantity, card: { name, type_line: '' } });
function moxfield({ commanders, mainboard, maybeboard = [], sideboard = [] }) {
	const board = (list) => ({ cards: Object.fromEntries(list.map((c, i) => [`k${i}`, c])) });
	return {
		name: 'Ayula', publicId: 'abc', publicUrl: 'https://moxfield.com/decks/abc',
		boards: { commanders: board(commanders), mainboard: board(mainboard), maybeboard: board(maybeboard), sideboard: board(sideboard) }
	};
}

const archCard = (name, quantity, categories) => ({ quantity, categories, card: { oracleCard: { name, type: '' } } });
function archidekt(cards) {
	return {
		id: 42, name: 'Ayula',
		categories: [
			{ name: 'Commander', includedInDeck: true }, { name: 'Ramp', includedInDeck: true },
			{ name: 'Maybeboard', includedInDeck: false }, { name: 'Sideboard', includedInDeck: false }
		],
		cards
	};
}

test('Moxfield: additions, removals, quantity changes and a commander change, ignoring printings and maybeboard', () => {
	const site = transformMoxfieldDeck(moxfield({
		commanders: [moxCard('Old Commander')],
		mainboard: [moxCard("Kodama's Reach"), moxCard('Forest', 32), moxCard('Sol Ring (C21) 263'), moxCard('Ayula, Queen Among Bears')],
		maybeboard: [moxCard('Cultivate')]
	})).cards;

	const { changes } = deckExport(prismDeck, site, 'moxfield');

	assert.deepEqual(changes, {
		commander: [
			{ name: 'Ayula, Queen Among Bears', delta: 1 },
			{ name: 'Old Commander', delta: -1 }
		],
		deck: [
			{ name: 'Ayula, Queen Among Bears', delta: -1 },
			{ name: 'Cultivate', delta: 1 },
			{ name: 'Forest', delta: -2 },
			{ name: "Kodama's Reach", delta: -1 }
		],
		sideboard: []
	});
});

test('Archidekt: only included categories count, and a matching deck has no changes', () => {
	const site = transformArchidektDeck(archidekt([
		archCard('Ayula, Queen Among Bears', 1, ['Commander']),
		archCard('Cultivate', 1, ['Ramp']),
		archCard('Forest', 30, ['Land']),
		archCard('Sol Ring', 1, ['Ramp']),
		archCard('Rampant Growth', 1, ['Maybeboard']),
		archCard('Lightning Greaves', 1, ['Sideboard'])
	])).cards;

	assert.deepEqual(deckExport(prismDeck, site, 'archidekt').changes, { commander: [], deck: [], sideboard: [] });
});

test('the full list follows the site format; Moxfield Bulk Edit has no commander board, so commanders stay out (#381)', () => {
	assert.equal(deckExport(prismDeck, null, 'moxfield').fullList,
		'1 Cultivate\n30 Forest\n1 Sol Ring');
	assert.equal(deckExport(prismDeck, null, 'archidekt').fullList,
		'1x Ayula, Queen Among Bears [Commander]\n1x Cultivate\n30x Forest\n1x Sol Ring');
});

test('no site deck gives the full list only', () => {
	assert.equal(deckExport(prismDeck, null, 'moxfield').changes, null);
});

test('exportDeck diffs the live deck its sourceUrl names, and falls back to the full list when the fetch fails', async (t) => {
	const realFetch = globalThis.fetch;
	t.after(() => { globalThis.fetch = realFetch; });
	const requests = [];
	globalThis.fetch = async (url, init) => {
		requests.push([url, JSON.parse(init.body)]);
		if (url === '/api/archidekt-edge') {
			return new Response(JSON.stringify({ error: 'Deck not found. Make sure the deck is public.' }), { status: 404 });
		}
		return new Response(JSON.stringify(moxfield({
			commanders: [moxCard('Ayula, Queen Among Bears')],
			mainboard: [moxCard('Cultivate'), moxCard('Forest', 30)]
		})));
	};

	const live = await exportDeck({ ...prismDeck, sourceUrl: 'https://moxfield.com/decks/abc' });
	assert.equal(live.site, 'moxfield');
	assert.deepEqual(live.changes, { commander: [], deck: [{ name: 'Sol Ring', delta: 1 }], sideboard: [] });
	assert.equal(live.notice, null);

	const failed = await exportDeck({ ...prismDeck, sourceUrl: 'https://archidekt.com/decks/42/ayula' });
	assert.equal(failed.site, 'archidekt');
	assert.equal(failed.changes, null);
	assert.match(failed.notice, /Deck not found/);
	assert.match(failed.fullList, /^1x Ayula/);

	const picked = await exportDeck(prismDeck, 'archidekt');
	assert.equal(picked.site, 'archidekt');
	assert.equal(picked.changes, null);
	assert.deepEqual(requests.map(([url, body]) => [url, body]), [
		['/api/moxfield-edge', { publicId: 'abc' }],
		['/api/archidekt-edge', { deckId: '42' }]
	], 'a deck with no sourceUrl fetches nothing');
});

// #29: a deck with no commander is Constructed and keeps its Sideboard.
const side = (name, quantity) => ({ ...card(name, quantity), isSideboard: true });
const constructedDeck = { name: 'Burn', cards: [card('Lightning Bolt', 4), side('Pyroblast', 2)] };

test('imports keep the sideboard flagged for a deck with no commander, and drop it for a Commander deck', () => {
	const mox = (commanders) => transformMoxfieldDeck(moxfield({
		commanders, mainboard: [moxCard('Lightning Bolt', 4)], sideboard: [moxCard('Pyroblast', 2)], maybeboard: [moxCard('Opt')]
	})).cards;
	assert.deepEqual(mox([]), constructedDeck.cards);
	assert.ok(mox([moxCard('Ayula, Queen Among Bears')]).every((c) => !c.isSideboard && c.name !== 'Pyroblast'));

	const arch = (commander) => transformArchidektDeck(archidekt([
		...(commander ? [archCard('Ayula, Queen Among Bears', 1, ['Commander'])] : []),
		archCard('Lightning Bolt', 4, ['Removal']),
		archCard('Pyroblast', 2, ['Sideboard']),
		archCard('Opt', 1, ['Maybeboard'])
	])).cards;
	assert.deepEqual(arch(false), constructedDeck.cards);
	assert.ok(arch(true).every((c) => !c.isSideboard && c.name !== 'Pyroblast'));
});

test('the full list puts sideboard cards in the sideboard', () => {
	assert.equal(deckExport(constructedDeck, null, 'moxfield').fullList, '4 Lightning Bolt\n\nSIDEBOARD:\n2 Pyroblast');
	assert.equal(deckExport(constructedDeck, null, 'archidekt').fullList, '4x Lightning Bolt\n2x Pyroblast [Sideboard]');
});

test('changes diff the sideboard as its own zone', () => {
	const site = [card('Lightning Bolt', 4), side('Pyroblast', 1), side('Duress', 2)];
	const { changes } = deckExport(constructedDeck, site, 'moxfield');
	assert.deepEqual(changes, { commander: [], deck: [], sideboard: [{ name: 'Duress', delta: -2 }, { name: 'Pyroblast', delta: 1 }] });
	assert.equal(changesText(changes), 'Sideboard\n-2 Duress\n+1 Pyroblast');
});
