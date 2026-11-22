/**
 * Commander Template URL import (#493). The fixture is a trimmed copy of the
 * real page https://commandertemplate.com/decks/6491b290-a75f-4668-bf4d-2af564d15258
 * (Next.js RSC payload split over three self.__next_f chunks, deck JSON cut mid-way).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDeckPage } from '../netlify/edge-functions/lib/commandertemplate-page.js';
import { extractCommanderTemplateUrl } from '../js/modules/commandertemplate.js';
import { deckSourceSite, resolveDeckSource } from '../js/modules/deck-source.js';

const ID = '6491b290-a75f-4668-bf4d-2af564d15258';
const URL_ = `https://commandertemplate.com/decks/${ID}`;
const page = readFileSync(new URL('./fixtures/commandertemplate-deck.html', import.meta.url), 'utf8');
const total = (deck) => deck.cards.reduce((n, c) => n + c.quantity, 0);

test('readDeckPage: name, bracket, flagged commander and 100 cards; maybeboard left out', () => {
	const deck = readDeckPage(page);
	assert.equal(deck.id, ID);
	assert.equal(deck.name, 'Sushi smackdown');
	assert.equal(deck.bracket, 3);
	assert.equal(total(deck), 100);
	assert.deepEqual(deck.cards.filter((c) => c.isCommander), [
		{ name: 'Jin Sakai, Ghost of Tsushima', quantity: 1, isCommander: true, isBasicLand: false }
	]);
	assert.deepEqual(deck.cards.find((c) => c.name === 'Swamp'), { name: 'Swamp', quantity: 6, isCommander: false, isBasicLand: true });
	assert.equal(deck.cards.find((c) => c.name === 'Sol Ring').quantity, 1);
	assert.ok(!deck.cards.some((c) => c.name === 'Rapid Hybridization'));
});

test('readDeckPage: a page it cannot read throws instead of importing part of the deck', () => {
	const unreadable = /Couldn't read this deck/;
	assert.throws(() => readDeckPage('<html>Cloudflare challenge</html>'), unreadable);
	assert.throws(() => readDeckPage(page.replaceAll('deckInstances', 'cards')), unreadable);
	assert.throws(() => readDeckPage(page.replaceAll('selectedCommanders', 'commanders')), unreadable);
	// a card missing: the list no longer adds up to the page's own mainCount (quotes are escaped in the payload)
	assert.ok(page.includes('mainCount\\":100'));
	assert.throws(() => readDeckPage(page.replace('mainCount\\":100', 'mainCount\\":101')), unreadable);
});

test('extractCommanderTemplateUrl: URL forms map to the canonical deck URL; bare IDs are refused', () => {
	assert.equal(extractCommanderTemplateUrl(`  https://www.commandertemplate.com/decks/${ID.toUpperCase()}?x=1#y `), URL_);
	assert.equal(extractCommanderTemplateUrl(ID), null);
	assert.equal(extractCommanderTemplateUrl('https://commandertemplate.com/decks/not-a-uuid'), null);
	assert.equal(extractCommanderTemplateUrl('https://moxfield.com/decks/abc'), null);
});

test('resolveDeckSource fetches Commander Template through its proxy; export treats it as unsourced', async () => {
	const realFetch = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		assert.equal(url, '/api/commandertemplate-edge');
		assert.deepEqual(JSON.parse(init.body), { deckUrl: URL_ });
		return new Response(JSON.stringify(readDeckPage(page)));
	};
	try {
		const { serviceName, deckData } = await resolveDeckSource(URL_);
		assert.equal(serviceName, 'Commander Template');
		assert.equal(deckData.sourceUrl, URL_);
		assert.equal(deckData.name, 'Sushi smackdown');
		assert.equal(total(deckData), 100);
	} finally {
		globalThis.fetch = realFetch;
	}
	assert.equal(deckSourceSite(URL_), null);
});

const canRun = process.features.typescript;
test('commandertemplate-edge: validates the URL, maps upstream failures, never passes a partial deck', { skip: !canRun && 'Needs Node with native TypeScript support' }, async (t) => {
	const handler = (await import('../netlify/edge-functions/commandertemplate-edge.ts')).default;
	const previousDeno = globalThis.Deno;
	const realFetch = globalThis.fetch;
	t.after(() => { globalThis.Deno = previousDeno; globalThis.fetch = realFetch; });
	globalThis.Deno = { env: { get: () => undefined } };
	const call = (deckUrl) => handler(new Request('https://prism.example/api/commandertemplate-edge', { method: 'POST', body: JSON.stringify({ deckUrl }) }));
	const fetched = [];
	const upstream = (status, body) => { globalThis.fetch = async (url) => { fetched.push(url); return new Response(body, { status }); }; };

	upstream(200, page);
	assert.equal((await call('https://evil.example/decks/' + ID)).status, 400);
	assert.equal((await call(`https://commandertemplate.com/decks/${ID}/../x`)).status, 400);
	assert.deepEqual(fetched, []);

	const ok = await call(URL_);
	assert.equal(ok.status, 200);
	assert.equal((await ok.json()).name, 'Sushi smackdown');
	assert.deepEqual(fetched, [URL_]);

	upstream(404, 'nope');
	const missing = await call(URL_);
	assert.equal(missing.status, 404);
	assert.match((await missing.json()).error, /not found or not public/i);

	upstream(200, '<html>new markup</html>');
	const broken = await call(URL_);
	assert.equal(broken.status, 502);
	assert.match((await broken.json()).error, /Couldn't read this deck/);
});
